import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../lib/etsy-auth";
import { getEtsyListingDetailEvidence } from "../../../../../../lib/etsy-listing-detail";
import { getStoredEtsyShopId } from "../../../../../../lib/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { listingId: rawListingId } = await context.params;
  const listingId = Number(rawListingId);

  if (!Number.isSafeInteger(listingId) || listingId <= 0) {
    return NextResponse.json(
      {
        status: "BLOCKED",
        mode: "READ_ONLY",
        ETSY_WRITE_COUNT: 0,
        generatedAt: new Date().toISOString(),
        error: "INVALID_ETSY_LISTING_ID",
        evidenceGaps: ["VALID_LISTING_ID_REQUIRED"]
      },
      { status: 400 }
    );
  }

  try {
    const shopId = await getStoredEtsyShopId();
    if (!shopId) {
      return NextResponse.json(
        {
          status: "BLOCKED",
          mode: "READ_ONLY",
          ETSY_WRITE_COUNT: 0,
          generatedAt: new Date().toISOString(),
          requestedListingId: listingId,
          error: "ETSY_SHOP_ID_NOT_AVAILABLE",
          evidenceGaps: ["AUTHENTICATED_SHOP_ID_REQUIRED"]
        },
        { status: 503 }
      );
    }

    const accessToken = await getValidEtsyAccessToken();
    const evidence = await getEtsyListingDetailEvidence({
      listingId,
      shopId,
      headers: etsyApiHeaders(accessToken)
    });
    return NextResponse.json(evidence, {
      status: evidence.status === "PASS" ? 200 : 502,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "BLOCKED",
        mode: "READ_ONLY",
        ETSY_WRITE_COUNT: 0,
        generatedAt: new Date().toISOString(),
        requestedListingId: listingId,
        error: error instanceof Error ? error.message : "UNKNOWN",
        evidenceGaps: ["AUTHENTICATED_ETSY_READ_FAILED"]
      },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}
