/**
 * Derived, read-only Etsy channel identifier projection from the canonical
 * POONTHAIDIGITAL_PRODUCT_REGISTRY Google Drive document.
 *
 * AUTHORITY: Google Drive Product Registry only.
 * This file is NOT Product Truth and must never be used to override the Registry.
 * It contains only Product_ID <-> Etsy Listing_ID identifiers needed for runtime
 * reconciliation. Refresh it only from a fresh read of the exact canonical Drive
 * object recorded below.
 */
export const CANONICAL_CATALOG_SOURCE = {
  driveId: "1WGL_VFGW0DdqxGUdQAzZnjshGEEVCr0ZMeOdAU-KMWQ",
  title: "POONTHAIDIGITAL_PRODUCT_REGISTRY",
  snapshotModifiedAt: "2026-09-27T10:58:42.116Z",
  snapshotRevisionId:
    "ANLCKQnMbncF0UrEz2QBRwRwxQSCEuNxq5BYkkjSMgpB1F3nahcQbVaRmjsRl6hIRCkaFQhUBxD9PqW3l_Tosk8hAy1ZxoaNSohePDb-QFM",
  authority: "IDENTIFIER_PROJECTION_ONLY",
  projectionScope: "PRODUCT_ID_ETSY_LISTING_ID_ONLY"
} as const;

export type EtsyChannelIndexEntry = {
  productId: string;
  listingId: number;
};

/**
 * Freshly derived from the canonical Google Drive registry on 2026-09-23.
 *
 * Do not add a listing because it merely appears live on Etsy. The Product_ID
 * <-> Listing_ID pair must exist in the canonical Drive registry first.
 */
export const ETSY_CHANNEL_INDEX: readonly EtsyChannelIndexEntry[] = [
  { productId: "PDT-CBEO-004", listingId: 4580126260 },
  { productId: "PDT-FCMP-002", listingId: 4579068925 },
  { productId: "PDT-HBOP-001", listingId: 4581821318 },
  { productId: "PDT-IPT-001", listingId: 4578945050 },
  { productId: "PDT-RPT-003", listingId: 4580303015 }
] as const;
