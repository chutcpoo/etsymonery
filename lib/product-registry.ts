export const CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION = "1.0.0" as const;

export type CanonicalCatalogSourceIdentity = {
  driveFileId: string;
  fileName: string;
  mimeType: string;
  accessMode: "READ_ONLY";
  modifiedTime?: string;
  sizeBytes?: number;
  sha256?: string;
};

export type EvidencedLifecyclePointer = {
  value: string;
  evidenceReference: string;
};

export type ExistingListingReference = {
  channel: string;
  listingId: string;
  listingUrl?: string;
};

export type CanonicalRegistryReferences = {
  listings: ExistingListingReference[];
  candidateIds: string[];
  candidateFingerprints: string[];
  passRecordIds: string[];
  authorizationIds: string[];
  evidenceIds: string[];
};

export type MigrationReview = {
  status: "CLEAR" | "MIGRATION_REVIEW_REQUIRED";
  reasons: string[];
};

/**
 * IMP-001's single canonical Product Registry contract.
 *
 * Lifecycle pointers are observations with explicit evidence only. This type
 * does not define, calculate, validate, or execute lifecycle transitions.
 */
export type CanonicalProductRecord = {
  schemaVersion: typeof CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION;
  productId: string;
  productName?: string;
  productVersion: string | null;
  registryRevision: number;
  importedSource: CanonicalCatalogSourceIdentity;
  rawLegacyCatalogStatus?: string;
  currentState?: EvidencedLifecyclePointer;
  lastCompletedStage?: EvidencedLifecyclePointer;
  nextExecutableStage?: EvidencedLifecyclePointer;
  references: CanonicalRegistryReferences;
  legacyEvidenceSnapshot?: string;
  migrationReview: MigrationReview;
};

export type CanonicalProductRegistrySnapshot = {
  schemaVersion: typeof CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION;
  source: CanonicalCatalogSourceIdentity;
  records: CanonicalProductRecord[];
};

function requiredString(value: string, field: string) {
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw new Error(`INVALID_${field.toUpperCase()}`);
  return normalized;
}

function optionalString(value: string | undefined) {
  const normalized = value?.normalize("NFC").trim();
  return normalized || undefined;
}

function sortedUnique(values: readonly string[]) {
  return [...new Set(values.map((value) => requiredString(value, "REFERENCE")))].sort((a, b) =>
    a.localeCompare(b, "en")
  );
}

function normalizeLifecyclePointer(pointer: EvidencedLifecyclePointer | undefined) {
  if (!pointer) return undefined;
  return {
    value: requiredString(pointer.value, "LIFECYCLE_POINTER"),
    evidenceReference: requiredString(pointer.evidenceReference, "LIFECYCLE_EVIDENCE_REFERENCE")
  };
}

export function normalizeCatalogSourceIdentity(
  source: CanonicalCatalogSourceIdentity
): CanonicalCatalogSourceIdentity {
  if (source.accessMode !== "READ_ONLY") throw new Error("CATALOG_SOURCE_NOT_READ_ONLY");
  if (source.sizeBytes !== undefined && (!Number.isSafeInteger(source.sizeBytes) || source.sizeBytes < 0)) {
    throw new Error("INVALID_CATALOG_SOURCE_SIZE");
  }

  const normalized: CanonicalCatalogSourceIdentity = {
    driveFileId: requiredString(source.driveFileId, "CATALOG_DRIVE_FILE_ID"),
    fileName: requiredString(source.fileName, "CATALOG_FILE_NAME"),
    mimeType: requiredString(source.mimeType, "CATALOG_MIME_TYPE"),
    accessMode: "READ_ONLY"
  };
  const modifiedTime = optionalString(source.modifiedTime);
  const sha256 = optionalString(source.sha256)?.toLowerCase();
  if (modifiedTime) normalized.modifiedTime = modifiedTime;
  if (source.sizeBytes !== undefined) normalized.sizeBytes = source.sizeBytes;
  if (sha256) normalized.sha256 = sha256;
  return normalized;
}

export function normalizeCanonicalProductRecord(record: CanonicalProductRecord): CanonicalProductRecord {
  if (record.schemaVersion !== CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION) {
    throw new Error("UNSUPPORTED_PRODUCT_REGISTRY_SCHEMA_VERSION");
  }
  if (!Number.isSafeInteger(record.registryRevision) || record.registryRevision < 1) {
    throw new Error("INVALID_REGISTRY_REVISION");
  }

  const productId = requiredString(record.productId, "PRODUCT_ID");
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(productId)) throw new Error("INVALID_PRODUCT_ID");

  const listings = record.references.listings
    .map((listing) => {
      const normalized: ExistingListingReference = {
        channel: requiredString(listing.channel, "LISTING_CHANNEL").toLowerCase(),
        listingId: requiredString(listing.listingId, "LISTING_ID")
      };
      const listingUrl = optionalString(listing.listingUrl);
      if (listingUrl) normalized.listingUrl = listingUrl;
      return normalized;
    })
    .sort((a, b) =>
      `${a.channel}\u0000${a.listingId}\u0000${a.listingUrl ?? ""}`.localeCompare(
        `${b.channel}\u0000${b.listingId}\u0000${b.listingUrl ?? ""}`,
        "en"
      )
    );

  const normalized: CanonicalProductRecord = {
    schemaVersion: CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION,
    productId,
    productVersion: optionalString(record.productVersion ?? undefined) ?? null,
    registryRevision: record.registryRevision,
    importedSource: normalizeCatalogSourceIdentity(record.importedSource),
    references: {
      listings: listings.filter(
        (listing, index) =>
          index === 0 || stableSerialize(listing) !== stableSerialize(listings[index - 1])
      ),
      candidateIds: sortedUnique(record.references.candidateIds),
      candidateFingerprints: sortedUnique(record.references.candidateFingerprints).map((value) =>
        value.toLowerCase()
      ),
      passRecordIds: sortedUnique(record.references.passRecordIds),
      authorizationIds: sortedUnique(record.references.authorizationIds),
      evidenceIds: sortedUnique(record.references.evidenceIds)
    },
    migrationReview: {
      status: record.migrationReview.reasons.length ? "MIGRATION_REVIEW_REQUIRED" : "CLEAR",
      reasons: sortedUnique(record.migrationReview.reasons)
    }
  };

  const productName = optionalString(record.productName);
  const rawLegacyCatalogStatus = optionalString(record.rawLegacyCatalogStatus);
  const legacyEvidenceSnapshot = optionalString(record.legacyEvidenceSnapshot);
  const currentState = normalizeLifecyclePointer(record.currentState);
  const lastCompletedStage = normalizeLifecyclePointer(record.lastCompletedStage);
  const nextExecutableStage = normalizeLifecyclePointer(record.nextExecutableStage);

  if (productName) normalized.productName = productName;
  if (rawLegacyCatalogStatus) normalized.rawLegacyCatalogStatus = rawLegacyCatalogStatus;
  if (currentState) normalized.currentState = currentState;
  if (lastCompletedStage) normalized.lastCompletedStage = lastCompletedStage;
  if (nextExecutableStage) normalized.nextExecutableStage = nextExecutableStage;
  if (legacyEvidenceSnapshot) normalized.legacyEvidenceSnapshot = legacyEvidenceSnapshot;
  return normalized;
}

export function normalizeCanonicalRegistrySnapshot(
  snapshot: CanonicalProductRegistrySnapshot
): CanonicalProductRegistrySnapshot {
  if (snapshot.schemaVersion !== CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION) {
    throw new Error("UNSUPPORTED_PRODUCT_REGISTRY_SCHEMA_VERSION");
  }
  const source = normalizeCatalogSourceIdentity(snapshot.source);
  const records = snapshot.records.map(normalizeCanonicalProductRecord).sort((a, b) =>
    a.productId.localeCompare(b.productId, "en")
  );
  const productIds = new Set<string>();
  for (const record of records) {
    if (stableSerialize(record.importedSource) !== stableSerialize(source)) {
      throw new Error("REGISTRY_SOURCE_IDENTITY_MISMATCH");
    }
    if (productIds.has(record.productId)) throw new Error(`DUPLICATE_PRODUCT_ID:${record.productId}`);
    productIds.add(record.productId);
  }
  return { schemaVersion: CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION, source, records };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, stableValue(child)])
    );
  }
  return value;
}

export function stableSerialize(value: unknown) {
  return JSON.stringify(stableValue(value));
}

export function serializeCanonicalRegistrySnapshot(snapshot: CanonicalProductRegistrySnapshot) {
  return stableSerialize(normalizeCanonicalRegistrySnapshot(snapshot));
}
