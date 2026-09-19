import { etsyApiHeaders } from "./etsy";
import { fetchEtsyReadWithRetry, type EtsyReadRetryOptions } from "./etsy-http";

export const ETSY_SELLER_STATE_RECONCILIATION_VERSION = "1.0.0" as const;
export const ETSY_SELLER_STATE_WRITE_COUNT = 0 as const;
export const ETSY_SELLER_STATES = ["active", "inactive", "sold_out", "draft", "expired"] as const;

type SellerState = (typeof ETSY_SELLER_STATES)[number];
type Rec = Record<string, unknown>;

type Dependencies = {
  fetchImpl?: typeof fetch;
  retryOptions?: EtsyReadRetryOptions;
};

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSku(value: unknown) {
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}

function listingSummary(value: Rec, state: SellerState, skus: string[]) {
  const listingId = Number(value.listing_id);
  if (!Number.isSafeInteger(listingId) || listingId <= 0) return null;
  return {
    listingId,
    shopId: Number.isSafeInteger(Number(value.shop_id)) ? Number(value.shop_id) : null,
    state: typeof value.state === "string" ? value.state : state,
    title: typeof value.title === "string" ? value.title : null,
    url: typeof value.url === "string" ? value.url : null,
    skus
  };
}

async function json(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}

async function listingSkus(
  listingId: number,
  accessToken: string,
  fetchImpl: typeof fetch,
  retryOptions: EtsyReadRetryOptions
) {
  const response = await fetchEtsyReadWithRetry(
    fetchImpl,
    `https://api.etsy.com/v3/application/listings/${listingId}/inventory`,
    { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" },
    retryOptions
  );
  if (!response.ok) throw new Error(`ETSY_SELLER_INVENTORY_READBACK_HTTP_${response.status}`);
  const payload = await json(response);
  if (!isRec(payload) || !Array.isArray(payload.products)) return [];
  const values = payload.products
    .filter(isRec)
    .map((product) => normalizeSku(product.sku))
    .filter(Boolean);
  return [...new Set(values)];
}

export async function getEtsySellerStateSnapshot(input: {
  shopId: number;
  accessToken: string;
  dependencies?: Dependencies;
}) {
  if (!Number.isSafeInteger(input.shopId) || input.shopId <= 0) {
    throw new Error("INVALID_ETSY_SELLER_STATE_SHOP_ID");
  }
  if (!input.accessToken.trim()) throw new Error("ETSY_ACCESS_TOKEN_REQUIRED");

  const fetchImpl = input.dependencies?.fetchImpl ?? fetch;
  const retryOptions = input.dependencies?.retryOptions ?? {};
  const listings: Array<ReturnType<typeof listingSummary> extends infer T ? Exclude<T, null> : never> = [];
  const counts: Record<SellerState, number> = {
    active: 0, inactive: 0, sold_out: 0, draft: 0, expired: 0
  };
  const PAGE_LIMIT = 100;
  const MAX_PAGES = 10;

  for (const state of ETSY_SELLER_STATES) {
    let returnedForState = 0;
    let providerCount: number | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * PAGE_LIMIT;
      const response = await fetchEtsyReadWithRetry(
        fetchImpl,
        `https://api.etsy.com/v3/application/shops/${input.shopId}/listings?state=${state}&limit=${PAGE_LIMIT}&offset=${offset}`,
        { method: "GET", headers: etsyApiHeaders(input.accessToken), cache: "no-store" },
        retryOptions
      );
      const payload = await json(response);
      if (!response.ok || !isRec(payload) || !Array.isArray(payload.results)) {
        throw new Error(`ETSY_SELLER_STATE_READBACK_HTTP_${state}_${response.status}`);
      }
      if (providerCount === null && Number.isSafeInteger(Number(payload.count))) {
        providerCount = Number(payload.count);
      }

      for (const item of payload.results.filter(isRec)) {
        if (Number(item.shop_id) !== input.shopId) {
          throw new Error("ETSY_SELLER_STATE_SHOP_ID_MISMATCH");
        }
        const listingId = Number(item.listing_id);
        if (!Number.isSafeInteger(listingId) || listingId <= 0) continue;
        const skus = await listingSkus(listingId, input.accessToken, fetchImpl, retryOptions);
        const normalized = listingSummary(item, state, skus);
        if (normalized) listings.push(normalized);
      }

      returnedForState += payload.results.length;
      if (payload.results.length < PAGE_LIMIT) break;
      if (providerCount !== null && returnedForState >= providerCount) break;
      if (page === MAX_PAGES - 1) throw new Error(`ETSY_SELLER_STATE_TRUNCATED_${state}`);
    }
    counts[state] = returnedForState;
  }

  return {
    status: "PASS" as const,
    mode: "READ_ONLY" as const,
    ETSY_WRITE_COUNT: ETSY_SELLER_STATE_WRITE_COUNT,
    shopId: input.shopId,
    states: [...ETSY_SELLER_STATES],
    counts,
    total: listings.length,
    listings
  };
}
