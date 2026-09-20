/**
 * Post-reset Etsy channel projection.
 *
 * The pre-reset Etsy catalog was deleted on 2026-09-20. This module is
 * intentionally empty until a NEW listing created after that reset is
 * independently verified and promoted into the live channel index.
 */
export const CANONICAL_CATALOG_SOURCE = {
  driveId: "POST_RESET_NO_LEGACY_CATALOG_SOURCE",
  title: "POST_RESET_EMPTY_CATALOG",
  snapshotModifiedAt: "2026-09-20T08:19:30Z",
  authority: "POST_RESET_ONLY"
} as const;

export type EtsyChannelIndexEntry = {
  productId: string;
  listingId: number;
};

/**
 * Only post-reset, live, independently verified Etsy listings may appear here.
 * Current state: zero live products.
 */
export const ETSY_CHANNEL_INDEX: readonly EtsyChannelIndexEntry[] = [];
