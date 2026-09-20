import { NextResponse } from "next/server";
import { POST_RESET_PLATFORM_STATE } from "../../../lib/post-reset-platform";
import { ETSY_CHANNEL_INDEX } from "../../../lib/catalog-channel-index";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ...POST_RESET_PLATFORM_STATE,
    liveCatalogCount: ETSY_CHANNEL_INDEX.length,
    registeredLiveListings: ETSY_CHANNEL_INDEX.length,
    newProductPreparationEndpoint: "/api/products/prepare",
    etsyWrites: "DISABLED_UNTIL_NEW_EXACT_OPERATION"
  });
}
