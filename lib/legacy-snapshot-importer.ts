import {
  importCanonicalCatalogSeed,
  type CatalogRegistrySeedInput
} from "./catalog-product-registry-importer";
import {
  normalizeCanonicalRegistrySnapshot,
  type CanonicalProductRecord,
  type CanonicalProductRegistrySnapshot,
  type EvidencedLifecyclePointer,
  type ExistingListingReference
} from "./product-registry";

export const LEGACY_MIGRATION_INPUT_SCHEMA_VERSION = "1.0.0" as const;

export type LegacyLifecycleObservation = {
  value?: string;
  evidenceReference?: string;
};

export type LegacyEvidenceRecord = {
  productId: string;
  evidenceReference: string;
  listingReferences?: readonly ExistingListingReference[];
  candidateIds?: readonly string[];
  candidateFingerprints?: readonly string[];
  passRecordIds?: readonly string[];
  authorizationIds?: readonly string[];
  evidenceIds?: readonly string[];
  currentState?: LegacyLifecycleObservation;
  lastCompletedStage?: LegacyLifecycleObservation;
  nextExecutableStage?: LegacyLifecycleObservation;
  rawLegacyText?: string;
};

export type LegacyMigrationInput = {
  schemaVersion: typeof LEGACY_MIGRATION_INPUT_SCHEMA_VERSION;
  catalogSeed: CatalogRegistrySeedInput;
  legacyEvidence?: readonly LegacyEvidenceRecord[];
};

type LifecycleField = "currentState" | "lastCompletedStage" | "nextExecutableStage";

type ReviewPrefix = "CURRENT_STATE" | "LAST_COMPLETED_STAGE" | "NEXT_EXECUTABLE_STAGE";

function normalized(value: string | undefined) {
  return value?.normalize("NFC").trim() || undefined;
}

function required(value: string, code: string) {
  const result = normalized(value);
  if (!result) throw new Error(code);
  return result;
}

function mergeLifecyclePointer(
  existing: EvidencedLifecyclePointer | undefined,
  evidence: readonly LegacyEvidenceRecord[],
  field: LifecycleField,
  prefix: ReviewPrefix,
  reviewReasons: string[]
): EvidencedLifecyclePointer | undefined {
  const values = new Map<string, Set<string>>();

  for (const item of evidence) {
    const observation = item[field];
    if (!observation) continue;
    const value = normalized(observation.value);
    const evidenceReference = normalized(observation.evidenceReference);
    if (!value || !evidenceReference) {
      reviewReasons.push(`${prefix}_EVIDENCE_INCOMPLETE`);
      continue;
    }
    const references = values.get(value) ?? new Set<string>();
    references.add(evidenceReference);
    values.set(value, references);
  }

  const observedValues = [...values.keys()].sort((a, b) => a.localeCompare(b, "en"));
  if (observedValues.length > 1) {
    reviewReasons.push(`${prefix}_CONFLICT`);
    return existing;
  }
  if (observedValues.length === 0) return existing;

  const value = observedValues[0];
  if (existing && existing.value !== value) {
    reviewReasons.push(`${prefix}_CONFLICT`);
    return existing;
  }
  if (existing) return existing;

  const evidenceReference = [...(values.get(value) ?? [])].sort((a, b) => a.localeCompare(b, "en"))[0];
  return { value, evidenceReference };
}

function mergeLegacySnapshotText(record: CanonicalProductRecord, evidence: readonly LegacyEvidenceRecord[]) {
  const values = [record.legacyEvidenceSnapshot, ...evidence.map((item) => item.rawLegacyText)]
    .map(normalized)
    .filter((value): value is string => Boolean(value));
  const unique = [...new Set(values)].sort((a, b) => a.localeCompare(b, "en"));
  return unique.length ? unique.join("\n\n") : undefined;
}

function enrichRecord(record: CanonicalProductRecord, evidence: readonly LegacyEvidenceRecord[]): CanonicalProductRecord {
  const reviewReasons = [...record.migrationReview.reasons];
  const references = {
    listings: [...record.references.listings],
    candidateIds: [...record.references.candidateIds],
    candidateFingerprints: [...record.references.candidateFingerprints],
    passRecordIds: [...record.references.passRecordIds],
    authorizationIds: [...record.references.authorizationIds],
    evidenceIds: [...record.references.evidenceIds]
  };

  for (const item of evidence) {
    references.listings.push(...(item.listingReferences ?? []).map((listing) => ({ ...listing })));
    references.candidateIds.push(...(item.candidateIds ?? []));
    references.candidateFingerprints.push(...(item.candidateFingerprints ?? []));
    references.passRecordIds.push(...(item.passRecordIds ?? []));
    references.authorizationIds.push(...(item.authorizationIds ?? []));
    references.evidenceIds.push(...(item.evidenceIds ?? []));
  }

  const currentState = mergeLifecyclePointer(record.currentState, evidence, "currentState", "CURRENT_STATE", reviewReasons);
  const lastCompletedStage = mergeLifecyclePointer(
    record.lastCompletedStage,
    evidence,
    "lastCompletedStage",
    "LAST_COMPLETED_STAGE",
    reviewReasons
  );
  const nextExecutableStage = mergeLifecyclePointer(
    record.nextExecutableStage,
    evidence,
    "nextExecutableStage",
    "NEXT_EXECUTABLE_STAGE",
    reviewReasons
  );

  return {
    ...record,
    references,
    currentState,
    lastCompletedStage,
    nextExecutableStage,
    legacyEvidenceSnapshot: mergeLegacySnapshotText(record, evidence),
    migrationReview: {
      status: reviewReasons.length ? "MIGRATION_REVIEW_REQUIRED" : "CLEAR",
      reasons: reviewReasons
    }
  };
}

/**
 * IMP-105 projects already-read legacy evidence onto the canonical IMP-001 snapshot.
 * It performs no I/O, lifecycle transitions, persistence, event logging, or fingerprint calculation.
 */
export function importLegacyMigrationSnapshot(input: LegacyMigrationInput): CanonicalProductRegistrySnapshot {
  if (input.schemaVersion !== LEGACY_MIGRATION_INPUT_SCHEMA_VERSION) {
    throw new Error("UNSUPPORTED_LEGACY_MIGRATION_INPUT_SCHEMA_VERSION");
  }

  const baseSnapshot = importCanonicalCatalogSeed(input.catalogSeed);
  const legacyEvidence = input.legacyEvidence ?? [];
  if (!legacyEvidence.length) return baseSnapshot;

  const recordsByProduct = new Map(baseSnapshot.records.map((record) => [record.productId, record]));
  const evidenceByProduct = new Map<string, LegacyEvidenceRecord[]>();

  for (const item of legacyEvidence) {
    const productId = required(item.productId, "UNKNOWN_PRODUCT_ID");
    required(item.evidenceReference, "INVALID_EVIDENCE_REFERENCE");
    if (!recordsByProduct.has(productId)) throw new Error(`UNKNOWN_PRODUCT_ID:${productId}`);
    const group = evidenceByProduct.get(productId) ?? [];
    group.push(item);
    evidenceByProduct.set(productId, group);
  }

  return normalizeCanonicalRegistrySnapshot({
    ...baseSnapshot,
    records: baseSnapshot.records.map((record) =>
      enrichRecord(record, evidenceByProduct.get(record.productId) ?? [])
    )
  });
}
