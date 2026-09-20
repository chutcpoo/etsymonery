import { NextResponse } from "next/server";
import { getValidEtsyAccessToken } from "../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../lib/etsy-seller-state-reconciliation";
import { getStoredEtsyShopId } from "../../../../lib/token-store";

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
          error: "ETSY_SHOP_ID_NOT_AVAILABLE",
          ETSY_WRITE_COUNT: 0
        },
        { status: 503, headers: { "cache-control": "no-store" } }
      );
    }

    const accessToken = await getValidEtsyAccessToken();
    const snapshot = await getEtsySellerStateSnapshot({
      shopId,
      accessToken
    });

    return NextResponse.json(
      {
        status: "PASS",
        mode: "READ_ONLY",
        generatedAt: new Date().toISOString(),
        shopId: snapshot.shopId,
        counts: snapshot.counts,
        total: snapshot.total,
        listings: snapshot.listings,
        ETSY_WRITE_COUNT: 0
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "BLOCKED",
        mode: "READ_ONLY",
        error: error instanceof Error ? error.message : "UNKNOWN",
        ETSY_WRITE_COUNT: 0
      },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}
