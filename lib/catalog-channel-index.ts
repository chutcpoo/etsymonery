/**
 * Derived, read-only channel identifier projection from the canonical Catalog.
 *
 * AUTHORITY: DIGITAL_PRODUCT_CATALOG_MASTER.xlsx on Google Drive.
 * This file is NOT Product Truth and must never be used to override the Catalog.
 * It intentionally contains only Product_ID <-> Etsy Listing_ID identifiers needed
 * for runtime reconciliation. Refresh it only from the exact canonical Drive object.
 */
export const CANONICAL_CATALOG_SOURCE = {
  driveId: "1XoIRHCVGGG81ddMhLfyP4TBE9mCgbOft",
  title: "DIGITAL_PRODUCT_CATALOG_MASTER.xlsx",
  snapshotModifiedAt: "2026-09-03T04:38:31.308Z",
  authority: "IDENTIFIER_PROJECTION_ONLY"
} as const;

export const ETSY_CHANNEL_INDEX = [
  { productId: "PDT-HBOP-001", listingId: 4566738686 },
  { productId: "PDT-BOBA-001", listingId: 4560696421 },
  { productId: "PD-REST-003", listingId: 4561819638 },
  { productId: "PD-COFFEE-002", listingId: 4561793463 },
  { productId: "PD-CLEAN-004", listingId: 4561795303 },
  { productId: "PD-STOCK-005", listingId: 4561821192 }
] as const;
