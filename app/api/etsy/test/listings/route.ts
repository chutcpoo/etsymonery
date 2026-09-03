import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../lib/etsy-auth";
import { getStoredEtsyShopId } from "../../../../../lib/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EtsyListing = {
  listing_id?: number;
  shop_id?: number;
  title?: string;
  state?: string;
  url?: string;
};

type EtsyListingsResponse = {
  count?: number;
  results?: EtsyListing[];
  error?: string;
};

export async function GET() {
  try {
    const shopId = await getStoredEtsyShopId();

    if (!shopId) {
      return NextResponse.json(
        {
          status: "BLOCKED",
          test: "READ_ONLY_LISTINGS",
          readOnly: true,
          error: "SHOP_IDENTITY_TEST_REQUIRED"
        },
        { status: 409 }
      );
    }

    const accessToken = await getValidEtsyAccessToken();
    const response = await fetch(
      `https://api.etsy.com/v3/application/shops/${shopId}/listings?state=active&limit=10`,
      {
        method: "GET",
        headers: etsyApiHeaders(accessToken),
        cache: "no-store"
      }
    );

    const payload = (await response.json()) as EtsyListingsResponse;

    if (!response.ok || !Array.isArray(payload.results)) {
      return NextResponse.json(
        {
          status: "FAIL",
          test: "READ_ONLY_LISTINGS",
          readOnly: true,
          error:
            payload.error ?? `ETSY_LISTINGS_LOOKUP_HTTP_${response.status}`
        },
        { status: 502 }
      );
    }

    const wrongShop = payload.results.find(
      (listing) => listing.shop_id != null && listing.shop_id !== shopId
    );

    if (wrongShop) {
      return NextResponse.json(
        {
          status: "FAIL",
          test: "READ_ONLY_LISTINGS",
          readOnly: true,
          error: "LISTING_SHOP_ID_MISMATCH"
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      status: "PASS",
      test: "READ_ONLY_LISTINGS",
      readOnly: true,
      shopId,
      count: payload.count ?? payload.results.length,
      sampled: payload.results.map((listing) => ({
        listingId: listing.listing_id ?? null,
        title: listing.title ?? null,
        state: listing.state ?? null,
        url: listing.url ?? null
      }))
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "BLOCKED",
        test: "READ_ONLY_LISTINGS",
        readOnly: true,
        error: error instanceof Error ? error.message : "UNKNOWN"
      },
      { status: 503 }
    );
  }
}
