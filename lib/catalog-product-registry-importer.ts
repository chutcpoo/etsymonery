import {
  CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION,
  normalizeCanonicalRegistrySnapshot,
  type CanonicalCatalogSourceIdentity,
  type CanonicalProductRecord,
  type CanonicalProductRegistrySnapshot,
  type CanonicalRegistryReferences,
  type EvidencedLifecyclePointer,
  type ExistingListingReference
} from "./product-registry";

export const CANONICAL_CATALOG_DRIVE_FILE_ID = "1XoIRHCVGGG81ddMhLfyP4TBE9mCgbOft";
export const CANONICAL_CATALOG_FILE_NAME = "DIGITAL_PRODUCT_CATALOG_MASTER.xlsx";
export const CANONICAL_CATALOG_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type CatalogProductSeedRow = {
  productId: string;
  productName?: string;
  productVersion?: string;
  rawStatus?: string;
  legacyEvidenceSnapshot?: string;
  currentState?: string;
  currentStateEvidenceReference?: string;
  lastCompletedStage?: string;
  lastCompletedStageEvidenceReference?: string;
  nextExecutableStage?: string;
  nextExecutableStageEvidenceReference?: string;
  candidateIds?: string[];
  candidateFingerprints?: string[];
  passRecordIds?: string[];
  authorizationIds?: string[];
  evidenceIds?: string[];
};

export type CatalogChannelSeedRow = {
  productId: string;
  channel: string;
  listingId: string;
  listingUrl?: string;
};

export type CatalogRegistrySeedInput = {
  source: CanonicalCatalogSourceIdentity;
  products: readonly CatalogProductSeedRow[];
  channels?: readonly CatalogChannelSeedRow[];
};

export function assertCanonicalCatalogSource(source: CanonicalCatalogSourceIdentity) {
  if (
    source.driveFileId !== CANONICAL_CATALOG_DRIVE_FILE_ID ||
    source.fileName !== CANONICAL_CATALOG_FILE_NAME ||
    source.mimeType !== CANONICAL_CATALOG_MIME_TYPE
  ) {
    throw new Error("CATALOG_SOURCE_IDENTITY_MISMATCH");
  }
  if (source.accessMode !== "READ_ONLY") throw new Error("CATALOG_SOURCE_NOT_READ_ONLY");
}

function optionalTrimmed(value: string | undefined) {
  return value?.normalize("NFC").trim() || undefined;
}

function explicitPointer(
  value: string | undefined,
  evidenceReference: string | undefined,
  field: string,
  reviewReasons: string[]
): EvidencedLifecyclePointer | undefined {
  const normalizedValue = optionalTrimmed(value);
  const normalizedEvidence = optionalTrimmed(evidenceReference);
  if (!normalizedValue && !normalizedEvidence) return undefined;
  if (!normalizedValue || !normalizedEvidence) {
    reviewReasons.push(`${field}_EVIDENCE_INCOMPLETE`);
    return undefined;
  }
  return { value: normalizedValue, evidenceReference: normalizedEvidence };
}

function referencesFor(
  product: CatalogProductSeedRow,
  listings: ExistingListingReference[]
): CanonicalRegistryReferences {
  return {
    listings,
    candidateIds: [...(product.candidateIds ?? [])],
    candidateFingerprints: [...(product.candidateFingerprints ?? [])],
    passRecordIds: [...(product.passRecordIds ?? [])],
    authorizationIds: [...(product.authorizationIds ?? [])],
    evidenceIds: [...(product.evidenceIds ?? [])]
  };
}

/**
 * Projects already-read Catalog rows into the IMP-001 registry seed.
 * It never opens, writes, updates, or calculates fields in the Catalog.
 */
export function importCanonicalCatalogSeed(
  input: CatalogRegistrySeedInput
): CanonicalProductRegistrySnapshot {
  assertCanonicalCatalogSource(input.source);

  const products = new Map<string, CatalogProductSeedRow>();
  for (const row of input.products) {
    const productId = optionalTrimmed(row.productId);
    if (!productId) throw new Error("AMBIGUOUS_PRODUCT_ID:EMPTY");
    if (products.has(productId)) throw new Error(`DUPLICATE_PRODUCT_ID:${productId}`);
    products.set(productId, row);
  }

  const listingsByProduct = new Map<string, ExistingListingReference[]>();
  for (const row of input.channels ?? []) {
    const productId = optionalTrimmed(row.productId);
    if (!productId || !products.has(productId)) {
      throw new Error(`AMBIGUOUS_PRODUCT_ID:${productId ?? "EMPTY"}`);
    }
    const listings = listingsByProduct.get(productId) ?? [];
    listings.push({ channel: row.channel, listingId: row.listingId, listingUrl: row.listingUrl });
    listingsByProduct.set(productId, listings);
  }

  const records: CanonicalProductRecord[] = [...products.entries()].map(([productId, product]) => {
    const reviewReasons: string[] = [];
    const productVersion = optionalTrimmed(product.productVersion) ?? null;
    if (!productVersion || productVersion.toUpperCase() === "UNKNOWN") {
      reviewReasons.push("PRODUCT_VERSION_UNKNOWN");
    }

    const currentState = explicitPointer(
      product.currentState,
      product.currentStateEvidenceReference,
      "CURRENT_STATE",
      reviewReasons
    );
    const lastCompletedStage = explicitPointer(
      product.lastCompletedStage,
      product.lastCompletedStageEvidenceReference,
      "LAST_COMPLETED_STAGE",
      reviewReasons
    );
    const nextExecutableStage = explicitPointer(
      product.nextExecutableStage,
      product.nextExecutableStageEvidenceReference,
      "NEXT_EXECUTABLE_STAGE",
      reviewReasons
    );

    if (optionalTrimmed(product.rawStatus) && (!currentState || !lastCompletedStage || !nextExecutableStage)) {
      reviewReasons.push("UNKNOWN_LIFECYCLE_MAPPING");
    }

    return {
      schemaVersion: CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION,
      productId,
      productName: product.productName,
      productVersion,
      registryRevision: 1,
      importedSource: input.source,
      rawLegacyCatalogStatus: product.rawStatus,
      currentState,
      lastCompletedStage,
      nextExecutableStage,
      references: referencesFor(product, listingsByProduct.get(productId) ?? []),
      legacyEvidenceSnapshot: product.legacyEvidenceSnapshot,
      migrationReview: {
        status: reviewReasons.length ? "MIGRATION_REVIEW_REQUIRED" : "CLEAR",
        reasons: reviewReasons
      }
    };
  });

  return normalizeCanonicalRegistrySnapshot({
    schemaVersion: CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION,
    source: input.source,
    records
  });
}
