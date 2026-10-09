/**
 * Derived, read-only Etsy channel identifier projection for the current
 * ACTIVE & PROTECTED PoonthaiDigital listings.
 *
 * AUTHORITY: latest Google Drive `00 - Master Project Brief` plus the
 * canonical Product Truth records for Products 01-03.
 * This file is NOT Product Truth and must never override Google Drive.
 * It contains only Product_ID <-> Etsy Listing_ID identifiers required for
 * runtime reconciliation.
 */
export const CANONICAL_CATALOG_SOURCE = {
  driveId: "108WmUQjOQ4BR_PkTJUznGXzDHaFwIwIkDJOCdjnl7QM",
  title: "00 - Master Project Brief",
  snapshotModifiedAt: "2026-10-09T05:24:41.885Z",
  snapshotRevisionId: "27",
  authority: "MASTER_PLUS_PRODUCT_TRUTH_IDENTIFIER_PROJECTION",
  projectionScope: "ACTIVE_PROTECTED_PRODUCT_ID_ETSY_LISTING_ID_ONLY",
  productTruthDriveIds: {
    "PDT-CSCH-001": "1dCdQ8kvRDVH_qynLljAynLKxOp_a5WH-9aUva5oitCc",
    "PDT-PCL-002": "1G_zXzW1e1MIfAKdIf618VXMZKUWWR0Hq7qRFBoUj1tU",
    "PDT-CPR-003": "18xSNFCFmFzLveI54ELCjrZLABOPQ0lLe"
  }
} as const;

export type EtsyChannelIndexEntry = {
  productId: string;
  listingId: number;
};

/**
 * Refreshed from Google Drive authority on 2026-10-09 after authenticated
 * Etsy seller-state readback confirmed exactly three ACTIVE listings.
 *
 * Products 01-03 are ACTIVE & PROTECTED / NO CHANGES. This projection does
 * not authorize Etsy mutation; it only binds current Product IDs to current
 * live listing IDs for read-only Control Center reconciliation.
 */
export const ETSY_CHANNEL_INDEX: readonly EtsyChannelIndexEntry[] = [
  { productId: "PDT-CSCH-001", listingId: 4587646332 },
  { productId: "PDT-PCL-002", listingId: 4588681044 },
  { productId: "PDT-CPR-003", listingId: 4588738623 }
] as const;
