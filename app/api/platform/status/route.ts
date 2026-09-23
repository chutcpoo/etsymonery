import { NextResponse } from "next/server";
import { POST_RESET_PLATFORM_STATE } from "../../../../lib/post-reset-platform";
import { ETSY_CHANNEL_INDEX } from "../../../../lib/catalog-channel-index";

export const dynamic = "force-dynamic";

export async function GET() {
  const trackedCatalogCount = ETSY_CHANNEL_INDEX.length;
  const catalogState = trackedCatalogCount > 0 ? "ACTIVE_CATALOG" : "EMPTY_CATALOG";

  return NextResponse.json({
    ...POST_RESET_PLATFORM_STATE,
    catalogState,
    liveCatalogCount: trackedCatalogCount,
    registeredLiveListings: trackedCatalogCount,
    newProductPreparationEndpoint: "/api/products/prepare",
    etsyWrites: "DISABLED_UNTIL_NEW_EXACT_OPERATION"
  });
}
