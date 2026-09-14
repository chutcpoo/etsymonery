import { NextResponse } from "next/server";
import { getValidEtsyAccessToken } from "../../../../../lib/etsy-auth";
import { getEtsyDraftListingSummaries } from "../../../../../lib/etsy-draft-reconciliation";
import { getStoredEtsyShopId } from "../../../../../lib/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const shopId = await getStoredEtsyShopId();
    if (!shopId) {
      return NextResponse.json(
        {
          status: "BLOCKED",
          mode: "READ_ONLY",
          ETSY_WRITE_COUNT: 0,
          error: "ETSY_SHOP_ID_NOT_CONFIGURED"
        },
        { status: 409 }
      );
    }

    const accessToken = await getValidEtsyAccessToken();
    const result = await getEtsyDraftListingSummaries({ shopId, accessToken });
    return NextResponse.json(result, {
      status: 200,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "BLOCKED",
        mode: "READ_ONLY",
        ETSY_WRITE_COUNT: 0,
        error: error instanceof Error ? error.message : "UNKNOWN"
      },
      {
        status: 503,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
