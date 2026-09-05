import { neon } from "@neondatabase/serverless";
import {
  normalizeCanonicalProductRecord,
  stableSerialize,
  type CanonicalProductRecord,
  type CanonicalProductRegistrySnapshot
} from "./product-registry";

export type RegistryWriteResult =
  | { status: "APPLIED" | "UNCHANGED"; record: CanonicalProductRecord }
  | { status: "STATE_CONFLICT"; current: CanonicalProductRecord | null };

/** Projection boundary reserved for IMP-103's future append-only event projection. */
export interface CanonicalProductRegistryRepository {
  load(productId: string): Promise<CanonicalProductRecord | null>;
  list(): Promise<CanonicalProductRecord[]>;
  save(record: CanonicalProductRecord, expectedRevision: number): Promise<RegistryWriteResult>;
}

function validateExpectedRevision(expectedRevision: number) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("INVALID_EXPECTED_REGISTRY_REVISION");
  }
}

function cloneRecord(record: CanonicalProductRecord) {
  return structuredClone(record);
}

export class MemoryCanonicalProductRegistryRepository
  implements CanonicalProductRegistryRepository
{
  private readonly records = new Map<string, CanonicalProductRecord>();

  async load(productId: string) {
    const record = this.records.get(productId);
    return record ? cloneRecord(record) : null;
  }

  async list() {
    return [...this.records.values()]
      .sort((a, b) => a.productId.localeCompare(b.productId, "en"))
      .map(cloneRecord);
  }

  async save(record: CanonicalProductRecord, expectedRevision: number): Promise<RegistryWriteResult> {
    validateExpectedRevision(expectedRevision);
    const normalized = normalizeCanonicalProductRecord(record);
    const existing = this.records.get(normalized.productId);

    if (!existing) {
      if (expectedRevision !== 0 || normalized.registryRevision !== 1) {
        return { status: "STATE_CONFLICT", current: null };
      }
      this.records.set(normalized.productId, cloneRecord(normalized));
      return { status: "APPLIED", record: cloneRecord(normalized) };
    }

    if (existing.registryRevision !== expectedRevision) {
      return { status: "STATE_CONFLICT", current: cloneRecord(existing) };
    }
    if (stableSerialize(existing) === stableSerialize(normalized)) {
      return { status: "UNCHANGED", record: cloneRecord(existing) };
    }
    if (normalized.registryRevision !== expectedRevision + 1) {
      throw new Error("INVALID_NEXT_REGISTRY_REVISION");
    }

    this.records.set(normalized.productId, cloneRecord(normalized));
    return { status: "APPLIED", record: cloneRecord(normalized) };
  }
}

function getSql() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL_NOT_CONFIGURED");
  return neon(databaseUrl);
}

export class NeonCanonicalProductRegistryRepository
  implements CanonicalProductRegistryRepository
{
  async load(productId: string) {
    const sql = getSql();
    const rows = await sql`
      SELECT record_json
      FROM canonical_product_registry
      WHERE product_id = ${productId}
      LIMIT 1
    `;
    const row = rows[0] as { record_json: CanonicalProductRecord } | undefined;
    return row ? normalizeCanonicalProductRecord(row.record_json) : null;
  }

  async list() {
    const sql = getSql();
    const rows = await sql`
      SELECT record_json
      FROM canonical_product_registry
      ORDER BY product_id ASC
    `;
    return rows.map((row) =>
      normalizeCanonicalProductRecord((row as { record_json: CanonicalProductRecord }).record_json)
    );
  }

  async save(record: CanonicalProductRecord, expectedRevision: number): Promise<RegistryWriteResult> {
    validateExpectedRevision(expectedRevision);
    const normalized = normalizeCanonicalProductRecord(record);
    const serialized = stableSerialize(normalized);
    const sql = getSql();

    if (expectedRevision === 0 && normalized.registryRevision === 1) {
      const inserted = await sql`
        INSERT INTO canonical_product_registry (
          product_id, schema_version, registry_revision, source_drive_file_id, record_json
        ) VALUES (
          ${normalized.productId}, ${normalized.schemaVersion}, ${normalized.registryRevision},
          ${normalized.importedSource.driveFileId}, ${serialized}::jsonb
        )
        ON CONFLICT (product_id) DO NOTHING
        RETURNING record_json
      `;
      if (inserted.length === 1) return { status: "APPLIED", record: normalized };
    } else if (normalized.registryRevision === expectedRevision + 1) {
      const updated = await sql`
        UPDATE canonical_product_registry
        SET schema_version = ${normalized.schemaVersion},
            registry_revision = ${normalized.registryRevision},
            source_drive_file_id = ${normalized.importedSource.driveFileId},
            record_json = ${serialized}::jsonb,
            updated_at = now()
        WHERE product_id = ${normalized.productId}
          AND registry_revision = ${expectedRevision}
        RETURNING record_json
      `;
      if (updated.length === 1) return { status: "APPLIED", record: normalized };
    }

    const current = await this.load(normalized.productId);
    if (
      current &&
      current.registryRevision === expectedRevision &&
      stableSerialize(current) === serialized
    ) {
      return { status: "UNCHANGED", record: current };
    }
    return { status: "STATE_CONFLICT", current };
  }
}

export async function seedCanonicalProductRegistry(
  repository: CanonicalProductRegistryRepository,
  snapshot: CanonicalProductRegistrySnapshot
) {
  const results: RegistryWriteResult[] = [];
  for (const record of snapshot.records) {
    const existing = await repository.load(record.productId);
    if (existing && stableSerialize(existing) !== stableSerialize(record)) {
      results.push({ status: "STATE_CONFLICT", current: existing });
      continue;
    }
    results.push(await repository.save(record, existing?.registryRevision ?? 0));
  }
  return results;
}
