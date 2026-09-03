import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../lib/etsy";
import {
  getEtsyUserIdFromToken,
  getValidEtsyAccessToken
} from "../../../../../lib/etsy-auth";
import { updateEtsyIdentity } from "../../../../../lib/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EtsyShop = {
  shop_id?: number;
  user_id?: number;
  shop_name?: string;
  currency_code?: string;
};

export async function GET() {
  try {
    const accessToken = await getValidEtsyAccessToken();
    const userId = getEtsyUserIdFromToken(accessToken);

    const response = await fetch(
      `https://api.etsy.com/v3/application/users/${userId}/shops`,
      {
        method: "GET",
        headers: etsyApiHeaders(accessToken),
        cache: "no-store"
      }
    );

    const shop = (await response.json()) as EtsyShop & { error?: string };

    if (!response.ok || !shop.shop_id || !shop.user_id) {
      return NextResponse.json(
        {
          status: "FAIL",
          test: "SHOP_IDENTITY",
          readOnly: true,
          error: shop.error ?? `ETSY_SHOP_LOOKUP_HTTP_${response.status}`
        },
        { status: 502 }
      );
    }

    const expectedShopId = process.env.ETSY_SHOP_ID?.trim();
    const identityMatch =
      !expectedShopId || String(shop.shop_id) === expectedShopId;

    if (!identityMatch) {
      return NextResponse.json(
        {
          status: "FAIL",
          test: "SHOP_IDENTITY",
          readOnly: true,
          reason: "ETSY_SHOP_ID_MISMATCH",
          expectedShopId,
          actualShopId: shop.shop_id
        },
        { status: 409 }
      );
    }

    await updateEtsyIdentity(userId, shop.shop_id);

    return NextResponse.json({
      status: "PASS",
      test: "SHOP_IDENTITY",
      readOnly: true,
      expectedShopIdConfigured: Boolean(expectedShopId),
      shop: {
        shopId: shop.shop_id,
        userId: shop.user_id,
        shopName: shop.shop_name ?? null,
        currencyCode: shop.currency_code ?? null
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "BLOCKED",
        test: "SHOP_IDENTITY",
        readOnly: true,
        error: error instanceof Error ? error.message : "UNKNOWN"
      },
      { status: 503 }
    );
  }
}
