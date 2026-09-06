import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  EtsyListingSalesError,
  fetchExactListingSales
} from "../../../../lib/etsy-listing-sales";
import { getValidEtsyAccessToken } from "../../../../lib/etsy-auth";
import { getStoredEtsyShopId, loadEtsyTokens } from "../../../../lib/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function authorize(request: Request) {
  const expected = process.env.ETSY_SALES_READ_TOKEN?.trim() ?? "";
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!expected) {
    return NextResponse.json(
      { status: "BLOCKED", mode: "READ_ONLY", error: "ETSY_SALES_READ_AUTH_NOT_CONFIGURED" },
      { status: 503 }
    );
  }
  if (!supplied || !secureEqual(supplied, expected)) {
    return NextResponse.json(
      { status: "BLOCKED", mode: "READ_ONLY", error: "ETSY_SALES_READ_UNAUTHORIZED" },
      {
        status: 401,
        headers: { "www-authenticate": "Bearer" }
      }
    );
  }
  return null;
}

function grantedScopes(scope?: string) {
  return new Set(
    (scope ?? "")
      .split(/[ ,]+/)
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function parseListingId(request: Request) {
  const raw = new URL(request.url).searchParams.get("listingId") ?? "";
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

export async function GET(request: Request) {
  const authError = authorize(request);
  if (authError) return authError;

  const listingId = parseListingId(request);
  if (listingId === null) {
    return NextResponse.json(
      { status: "BLOCKED", mode: "READ_ONLY", error: "VALID_LISTING_ID_REQUIRED" },
      { status: 400 }
    );
  }

  try {
    const shopId = await getStoredEtsyShopId();
    if (!shopId) throw new EtsyListingSalesError("SHOP_IDENTITY_TEST_REQUIRED", 503);

    const stored = await loadEtsyTokens();
    if (!grantedScopes(stored?.scope).has("transactions_r")) {
      throw new EtsyListingSalesError("TRANSACTIONS_R_SCOPE_REQUIRED", 403);
    }

    const accessToken = await getValidEtsyAccessToken();
    const sales = await fetchExactListingSales({ accessToken, shopId, listingId });

    return NextResponse.json(
      {
        status: "PASS",
        mode: "READ_ONLY",
        generatedAt: new Date().toISOString(),
        source: {
          provider: "ETSY_OPEN_API_V3",
          operation: "getShopReceiptTransactionsByListing",
          scope: "transactions_r"
        },
        shopId,
        listingId,
        transactionCount: sales.transactionCount,
        unitsSold: sales.unitsSold,
        pagination: sales.pagination,
        verification: {
          transactionScopeGranted: true,
          allPagesFetched: sales.pagination.complete,
          transactionCountMatchesProvider:
            sales.transactionCount === sales.pagination.reportedTransactionCount,
          unitsSoldSummedFromEveryTransactionQuantity: true,
          stableAcrossTwoCompletePasses: sales.pagination.verificationPasses === 2,
          etsyWritePerformed: false
        }
      },
      {
        headers: {
          "cache-control": "private, no-store, max-age=0"
        }
      }
    );
  } catch (error) {
    const status = error instanceof EtsyListingSalesError ? error.statusCode : 502;
    return NextResponse.json(
      {
        status: "BLOCKED",
        mode: "READ_ONLY",
        error: error instanceof Error ? error.message : "UNKNOWN"
      },
      { status }
    );
  }
}
