import { timingSafeEqual } from "node:crypto";
import { etsyApiHeaders } from "./etsy";
import { fetchEtsyReadWithRetry } from "./etsy-http";

// Scope: read-only P01 seller identity preflight. Does not touch Etsy OAuth or listings.
export const P01_EXPECTED_SHOP_NAME = "PoonthaiDigital";
const NO_STORE = { "cache-control": "no-store" };

function blocked(error: string, code: number) {
  return Response.json({
    status: "BLOCKED", mode: "READ_ONLY", error,
    EtsyWriteCount: 0, ETSY_WRITE_COUNT: 0, etsyMutationPerformed: false
  }, { status: code, headers: NO_STORE });
}

function secureEqual(expected: string, supplied: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function rejectEtsyShopIdentityWrite() {
  return Response.json({
    status: "BLOCKED", mode: "READ_ONLY", error: "METHOD_NOT_ALLOWED",
    ETSY_WRITE_COUNT: 0, etsyMutationPerformed: false
  }, { status: 405, headers: { ...NO_STORE, Allow: "GET" } });
}

export function createEtsyShopIdentityPreflightGetHandler(
  deps: { fetchImpl?: typeof fetch } = {}
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET") return rejectEtsyShopIdentityWrite();
    const expectedToken = process.env.ETSY_TAXONOMY_READ_TOKEN?.trim() ?? "";
    if (!expectedToken) return blocked("ETSY_P01_READ_AUTH_NOT_CONFIGURED", 503);
    const auth = request.headers.get("authorization") ?? "";
    const actual = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!actual || !secureEqual(expectedToken, actual)) {
      return blocked("ETSY_P01_READ_UNAUTHORIZED", 401);
    }
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].length !== 0 || request.body !== null) {
      return blocked("ETSY_SHOP_IDENTITY_QUERY_NOT_ALLOWED", 400);
    }
    const configured = process.env.ETSY_SHOP_ID?.trim() ?? "";
    if (!/^[1-9]\d{0,14}$/.test(configured) ||
      !Number.isSafeInteger(Number(configured))) {
      return blocked("ETSY_SHOP_ID_NOT_CONFIGURED", 503);
    }
    const shopId = Number(configured);
    try {
      const res = await fetchEtsyReadWithRetry(
        deps.fetchImpl ?? fetch,
        "https://openapi.etsy.com/v3/application/shops/" + shopId,
        { method: "GET", headers: etsyApiHeaders(), cache: "no-store" }
      );
      if (!res.ok) return blocked("ETSY_SHOP_IDENTITY_PROVIDER_UNAVAILABLE", 502);
      const data: unknown = await res.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return blocked("ETSY_SHOP_IDENTITY_INVALID_RESPONSE", 502);
      }
      const shop = data as Record<string, unknown>;
      if (shop.shop_id !== shopId || typeof shop.shop_name !== "string" ||
        shop.shop_name.trim().length === 0) {
        return blocked("ETSY_SHOP_IDENTITY_MISMATCH", 409);
      }
      const actualName = shop.shop_name.trim();
      const nameMatches = actualName.toLowerCase() === P01_EXPECTED_SHOP_NAME.toLowerCase();
      if (!nameMatches) return blocked("ETSY_SHOP_NAME_MISMATCH", 409);
      return Response.json({
        status: "PASS", mode: "READ_ONLY", source: "etsy-open-api-v3-getShop",
        shop_id: shopId, shop_name: actualName,
        expected_shop_name: P01_EXPECTED_SHOP_NAME,
        name_matches: true,
        currency_code: typeof shop.currency_code === "string" ?
          shop.currency_code.trim().toUpperCase() : null,
        evidence_generated_at: new Date().toISOString(),
        ETSY_WRITE_COUNT: 0, etsyMutationPerformed: false
      }, { headers: NO_STORE });
    } catch {
      return blocked("ETSY_SHOP_IDENTITY_READ_FAILED", 503);
    }
  };
}
