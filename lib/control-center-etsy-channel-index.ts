/**
 * Read-only migration bootstrap used only by Control Center.
 *
 * AUTHORITY: latest Google Drive `00 - Master Project Brief` plus canonical
 * Product Truth for the three ACTIVE & PROTECTED products that predate the
 * dynamic post-reset registry evidence flow.
 *
 * IMPORTANT: do NOT append future products here. Product 04+ Etsy identities
 * must enter Control Center through verified canonical-registry evidence or a
 * successful exact-authorized publish + authenticated readback receipt.
 * This bootstrap does not authorize Etsy mutation and must not replace the
 * broader public/catalog projection in `catalog-channel-index.ts`.
 */
export const CONTROL_CENTER_ETSY_SOURCE = {
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

export type ControlCenterEtsyChannelEntry = {
  productId: string;
  listingId: number;
};

export const CONTROL_CENTER_ETSY_CHANNEL_INDEX: readonly ControlCenterEtsyChannelEntry[] = [
  { productId: "PDT-CSCH-001", listingId: 4587646332 },
  { productId: "PDT-PCL-002", listingId: 4588681044 },
  { productId: "PDT-CPR-003", listingId: 4588738623 }
] as const;
