import { neon } from "@neondatabase/serverless";
import { CONTROL_CENTER_ETSY_CHANNEL_INDEX } from "./control-center-etsy-channel-index";
import {
  NeonCanonicalProductRegistryRepository,
  type CanonicalProductRegistryRepository
} from "./product-registry-repository";
import type { CanonicalProductRecord } from "./product-registry";

export type ControlCenterEtsyMappingSource =
  | "DRIVE_BOOTSTRAP"
  | "CANONICAL_PRODUCT_REGISTRY"
  | "VERIFIED_PUBLISH_LEDGER";

export type ControlCenterEtsyMapping = {
  productId: string;
  listingId: number;
  source: ControlCenterEtsyMappingSource;
};

export type ControlCenterEtsyProjection = {
  status: "PASS" | "FALLBACK" | "BLOCKED";
  source: "DYNAMIC_REGISTRY" | "DRIVE_BOOTSTRAP_ONLY" | "BLOCKED_CONFLICT";
  mappings: ControlCenterEtsyMapping[];
  errors: string[];
};

export type PublishLedgerRow = {
  operation_id?: unknown;
  receipt?: unknown;
  updated_at?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedProductId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").trim();
  return /^PDT-[A-Z0-9]+-\d+$/.test(normalized) ? normalized : null;
}

function numericListingId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function addMapping(
  byListingId: Map<number, ControlCenterEtsyMapping>,
  candidate: ControlCenterEtsyMapping
) {
  const existing = byListingId.get(candidate.listingId);
  if (existing && existing.productId !== candidate.productId) {
    throw new Error(
      `CONTROL_CENTER_ETSY_LISTING_CONFLICT:${candidate.listingId}:${existing.productId}:${candidate.productId}`
    );
  }

  // Prefer canonical Product Registry evidence over verified ledger/bootstrap
  // when the product/listing identity itself agrees.
  const rank: Record<ControlCenterEtsyMappingSource, number> = {
    DRIVE_BOOTSTRAP: 1,
    VERIFIED_PUBLISH_LEDGER: 2,
    CANONICAL_PRODUCT_REGISTRY: 3
  };
  if (!existing || rank[candidate.source] >= rank[existing.source]) {
    byListingId.set(candidate.listingId, candidate);
  }
}

export function projectCanonicalRegistryEtsyMappings(
  records: readonly CanonicalProductRecord[]
): ControlCenterEtsyMapping[] {
  const byListingId = new Map<number, ControlCenterEtsyMapping>();
  for (const record of records) {
    const productId = normalizedProductId(record.productId);
    // The canonical registry can hold records outside the Poonthai PDT namespace.
    // Those records are out of scope for this Control Center and are ignored.
    if (!productId) continue;

    for (const listing of record.references.listings) {
      if (listing.channel.normalize("NFC").trim().toLowerCase() !== "etsy") continue;
      const listingId = numericListingId(listing.listingId);
      if (!listingId) {
        throw new Error(
          `CONTROL_CENTER_INVALID_REGISTRY_ETSY_LISTING_ID:${productId}:${listing.listingId}`
        );
      }
      addMapping(byListingId, {
        productId,
        listingId,
        source: "CANONICAL_PRODUCT_REGISTRY"
      });
    }
  }
  return [...byListingId.values()].sort((a, b) => a.listingId - b.listingId);
}

export function projectVerifiedPublishLedgerMappings(
  rows: readonly PublishLedgerRow[]
): ControlCenterEtsyMapping[] {
  const byListingId = new Map<number, ControlCenterEtsyMapping>();
  for (const row of rows) {
    const receipt = isRecord(row.receipt) ? row.receipt : {};
    const productId = normalizedProductId(receipt.productId);
    const listingId = numericListingId(receipt.listingId);
    const candidateId =
      typeof receipt.candidateId === "string"
        ? receipt.candidateId.normalize("NFC").trim()
        : "";
    const authorizationState =
      typeof receipt.authorizationState === "string"
        ? receipt.authorizationState.normalize("NFC").trim().toUpperCase()
        : "";
    const state =
      typeof receipt.state === "string"
        ? receipt.state.normalize("NFC").trim().toLowerCase()
        : "";

    // Only a successful post-reset publish receipt with consumed exact-operation
    // authorization and active/published readback may create a future mapping.
    if (
      !productId ||
      !listingId ||
      !candidateId.startsWith(`POSTRESET-${productId}-`) ||
      authorizationState !== "CONSUMED" ||
      (state !== "active" && state !== "published")
    ) {
      continue;
    }

    addMapping(byListingId, {
      productId,
      listingId,
      source: "VERIFIED_PUBLISH_LEDGER"
    });
  }
  return [...byListingId.values()].sort((a, b) => a.listingId - b.listingId);
}

export function mergeControlCenterEtsyMappings(
  registryMappings: readonly ControlCenterEtsyMapping[],
  ledgerMappings: readonly ControlCenterEtsyMapping[]
): ControlCenterEtsyMapping[] {
  const byListingId = new Map<number, ControlCenterEtsyMapping>();
  for (const bootstrap of CONTROL_CENTER_ETSY_CHANNEL_INDEX) {
    addMapping(byListingId, {
      productId: bootstrap.productId,
      listingId: bootstrap.listingId,
      source: "DRIVE_BOOTSTRAP"
    });
  }
  for (const mapping of ledgerMappings) addMapping(byListingId, mapping);
  for (const mapping of registryMappings) addMapping(byListingId, mapping);
  return [...byListingId.values()].sort((a, b) => a.listingId - b.listingId);
}

export function productIdForEtsyListing(
  mappings: readonly ControlCenterEtsyMapping[],
  listingId: number
) {
  return mappings.find((mapping) => mapping.listingId === listingId)?.productId ?? null;
}

async function readVerifiedPublishLedgerRows(databaseUrl: string) {
  const sql = neon(databaseUrl);
  const rows = await sql`
    SELECT operation_id, receipt, updated_at
    FROM channel_operation_ledger
    WHERE status = 'SUCCEEDED'
      AND receipt->>'productId' IS NOT NULL
      AND receipt->>'authorizationState' = 'CONSUMED'
      AND receipt->>'candidateId' LIKE ${"POSTRESET-%"}
      AND lower(receipt->>'state') IN ('active', 'published')
    ORDER BY updated_at DESC
    LIMIT 200
  `;
  return rows as PublishLedgerRow[];
}

function blockedProjection(errors: string[]): ControlCenterEtsyProjection {
  return {
    status: "BLOCKED",
    source: "BLOCKED_CONFLICT",
    mappings: [],
    errors
  };
}

export async function readControlCenterEtsyProjection(options?: {
  repository?: CanonicalProductRegistryRepository;
  ledgerRows?: readonly PublishLedgerRow[];
}): Promise<ControlCenterEtsyProjection> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const hasInjectedSources = Boolean(options?.repository || options?.ledgerRows);

  if (!databaseUrl && !hasInjectedSources) {
    return {
      status: "FALLBACK",
      source: "DRIVE_BOOTSTRAP_ONLY",
      mappings: mergeControlCenterEtsyMappings([], []),
      errors: ["DATABASE_URL_NOT_CONFIGURED"]
    };
  }

  const errors: string[] = [];
  let registryMappings: ControlCenterEtsyMapping[] = [];
  let ledgerMappings: ControlCenterEtsyMapping[] = [];

  try {
    const repository =
      options?.repository ?? new NeonCanonicalProductRegistryRepository();
    const records = await repository.list();
    try {
      registryMappings = projectCanonicalRegistryEtsyMappings(records);
    } catch (error) {
      return blockedProjection([
        `REGISTRY_MAPPING_INTEGRITY_FAILED:${error instanceof Error ? error.message : "UNKNOWN"}`
      ]);
    }
  } catch (error) {
    errors.push(
      `REGISTRY_READ_FAILED:${error instanceof Error ? error.message : "UNKNOWN"}`
    );
  }

  try {
    const rows =
      options?.ledgerRows ??
      (databaseUrl ? await readVerifiedPublishLedgerRows(databaseUrl) : []);
    try {
      ledgerMappings = projectVerifiedPublishLedgerMappings(rows);
    } catch (error) {
      return blockedProjection([
        ...errors,
        `PUBLISH_LEDGER_MAPPING_INTEGRITY_FAILED:${error instanceof Error ? error.message : "UNKNOWN"}`
      ]);
    }
  } catch (error) {
    errors.push(
      `PUBLISH_LEDGER_READ_FAILED:${error instanceof Error ? error.message : "UNKNOWN"}`
    );
  }

  try {
    const mappings = mergeControlCenterEtsyMappings(
      registryMappings,
      ledgerMappings
    );
    const hasDynamicEvidence = registryMappings.length > 0 || ledgerMappings.length > 0;
    return {
      status: hasDynamicEvidence ? "PASS" : "FALLBACK",
      source: hasDynamicEvidence ? "DYNAMIC_REGISTRY" : "DRIVE_BOOTSTRAP_ONLY",
      mappings,
      errors
    };
  } catch (error) {
    return blockedProjection([
      ...errors,
      error instanceof Error ? error.message : "CONTROL_CENTER_ETSY_MAPPING_CONFLICT"
    ]);
  }
}
