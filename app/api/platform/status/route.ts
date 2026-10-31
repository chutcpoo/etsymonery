import { NextResponse } from "next/server";
import { POST_RESET_PLATFORM_STATE } from "../../../../lib/post-reset-platform";
import { CANONICAL_CATALOG_SOURCE, ETSY_CHANNEL_INDEX } from "../../../../lib/catalog-channel-index";

export const dynamic = "force-dynamic";

/**
 * A registry ID is not evidence that the corresponding Etsy listing is active.
 * Only the authenticated Etsy seller-state API can establish live counts.
 */
export async function GET() {
  const registryListingCount = ETSY_CHANNEL_INDEX.length;
  return NextResponse.json({
    ...POST_RESET_PLATFORM_STATE,
    catalogState: "LIVE_STATUS_UNVERIFIED",
    liveCatalogCount: null,
    registeredLiveListings: null,
    liveCatalogVerification: "NOT_TESTED",
    liveCatalogSource: "ETSY_API_NOT_QUERIED",
    liveSellerStateEndpoint: "/api/etsy/seller-state",
    registryListingCount,
    registrySnapshotModifiedAt: CANONICAL_CATALOG_SOURCE.snapshotModifiedAt,
    registryAuthority: CANONICAL_CATALOG_SOURCE.authority,
    newProductPreparationEndpoint: "/api/products/prepare",
    etsyWrites: "DISABLED_UNTIL_NEW_EXACT_OPERATION",
    productPlanStore: {
      repository: process.env.DATABASE_URL?.trim() ? "NEON_POSTGRES" : "MEMORY_FALLBACK",
      durable: Boolean(process.env.DATABASE_URL?.trim()),
      databaseConfigured: Boolean(process.env.DATABASE_URL?.trim())
    }
  }, {headers: {"cache-control": "no-store"}});
}
