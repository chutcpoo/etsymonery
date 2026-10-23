/**
 * Read-only reconciliation between a DATED Drive-derived identifier projection
 * and a complete, freshly read Etsy seller-state snapshot.
 *
 * Never infer Product Truth, draft readiness or permission to publish from a
 * matching listing ID. Mismatches are review signals only: NO WRITES.
 */
export const CATALOG_INTEGRITY_VERSION = "1.0.0" as const;

const SELLER_STATES = ["active", "inactive", "sold_out", "draft", "expired"] as const;
type SellerState = (typeof SELLER_STATES)[number];
type Projection = { productId: string; listingId: number };
type SellerListing = { listingId: number; shopId: number | null; state: string };
type Counts = Record<SellerState, number>;

export type CatalogIntegrityInput = {
  shopId: number;
  generatedAt: string;
  source: {
    driveId: string;
    snapshotModifiedAt: string;
    snapshotRevisionId: string;
  };
  projection: readonly Projection[];
  counts: Counts;
  listings: readonly SellerListing[];
};

function validId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function inspectCatalogIntegrity(input: CatalogIntegrityInput) {
  if (!validId(input.shopId)) throw new Error("INVALID_SHOP_ID");
  if (!input.source.driveId.trim() || !input.source.snapshotModifiedAt.trim() ||
    !input.source.snapshotRevisionId.trim() || !Number.isFinite(Date.parse(input.generatedAt))) {
    throw new Error("INVALID_SOURCE_OR_SNAPSHOT_IDENTITY");
  }

  const projectionByListing = new Map<number, string>();
  const projectionByProduct = new Set<string>();
  for (const item of input.projection) {
    if (!validId(item.listingId) || !item.productId.trim()) throw new Error("INVALID_PROJECTION");
    if (projectionByListing.has(item.listingId) || projectionByProduct.has(item.productId)) {
      throw new Error("AMBIGUOUS_PROJECTION");
    }
    projectionByListing.set(item.listingId, item.productId);
    projectionByProduct.add(item.productId);
  }

  const etsyByListing = new Map<number, SellerState>();
  for (const item of input.listings) {
    if (!validId(item.listingId) || item.shopId !== input.shopId ||
      !SELLER_STATES.some((state) => state === item.state)) {
      throw new Error("INVALID_ETSY_LISTING_IDENTITY");
    }
    if (etsyByListing.has(item.listingId)) throw new Error("DUPLICATE_ETSY_LISTING_IDENTITY");
    etsyByListing.set(item.listingId, item.state as SellerState);
  }

  const observedTotal = SELLER_STATES.reduce((total, state) => {
    const count = input.counts[state];
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("INVALID_ETSY_STATE_COUNT");
    const real = [...etsyByListing.values()].filter((itemState) => itemState === state).length;
    if (count !== real) throw new Error("INCOMPLETE_ETSY_STATE_SNAPSHOT");
    return total + count;
  }, 0);
  if (observedTotal !== etsyByListing.size) throw new Error("INCOMPLETE_ETSY_STATE_SNAPSHOT");

  const observedPointers = [...projectionByListing.entries()]
    .filter(([listingId]) => etsyByListing.has(listingId))
    .map(([listingId, productId]) => ({
      productId, listingId, state: etsyByListing.get(listingId)!
    }))
    .sort((a, b) => a.productId.localeCompare(b.productId, "en"));
  const projectionNotObserved = [...projectionByListing.entries()]
    .filter(([listingId]) => !etsyByListing.has(listingId))
    .map(([listingId, productId]) => ({ productId, listingId }))
    .sort((a, b) => a.productId.localeCompare(b.productId, "en"));
  const etsyNotInProjection = [...etsyByListing.entries()]
    .filter(([listingId]) => !projectionByListing.has(listingId))
    .map(([listingId, state]) => ({ listingId, state }))
    .sort((a, b) => a.listingId - b.listingId);

  const warnings = ["DATED_PROJECTION_NOT_CURRENT_PRODUCT_TRUTH"];
  if (projectionNotObserved.length) warnings.push("PROJECTION_LISTINGS_NOT_OBSERVED_ON_ETSY");
  if (etsyNotInProjection.length) warnings.push("ETSY_LISTINGS_NOT_IN_DATED_PROJECTION");

  return {
    status: warnings.length > 1 ? "REVIEW_REQUIRED" as const : "PROJECTION_ONLY" as const,
    mode: "READ_ONLY" as const,
    generatedAt: input.generatedAt,
    shopId: input.shopId,
    source: {
      kind: "DATED_DRIVE_DERIVED_IDENTIFIER_PROJECTION" as const,
      driveId: input.source.driveId,
      snapshotModifiedAt: input.source.snapshotModifiedAt,
      snapshotRevisionId: input.source.snapshotRevisionId,
      currentDriveTruthVerified: false
    },
    etsy: {
      source: "FRESH_FIVE_STATE_SELLER_READBACK" as const,
      counts: { ...input.counts },
      total: observedTotal
    },
    summary: {
      datedProjectionCount: input.projection.length,
      listingIdsObservedInBoth: observedPointers.length,
      projectionNotObservedCount: projectionNotObserved.length,
      etsyOutsideProjectionCount: etsyNotInProjection.length
    },
    observedPointers,
    projectionNotObserved,
    etsyNotInProjection,
    warnings,
    productTruthUpdated: false,
    publishAuthorized: false,
    etsyMutationPerformed: false,
    ETSY_WRITE_COUNT: 0 as const
  };
}
