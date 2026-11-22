import { appSupportEmail } from "./app-support";
import { privateSingleShopId } from "./etsy-private-shop";
import { etsyApiHeaders, parseEtsyGrantedScopes } from "./etsy";
import { fetchEtsyReadWithRetry } from "./etsy-http";
import { loadEtsyReadGrantWithOptionalRefresh } from "./etsy-read-refresh";

export type ActiveListing = { listingId: number; title: string; url: string | null };
export type ActiveListingsResult =
  | { status: "PASS"; error: null; count: number; listings: ActiveListing[]; observedAt: string }
  | { status: "BLOCKED"; error: string; count: null; listings: []; observedAt: null };

/** Owner's single-shop read-only catalog. No marketplace mutation or transaction data. */
export async function readActiveListings({
  expectedShop = Number(process.env.ETSY_SHOP_ID),
  loadGrant = loadEtsyReadGrantWithOptionalRefresh,
  transport = fetch,
  now = Date.now
}: {
  expectedShop?: number;
  loadGrant?: typeof loadEtsyReadGrantWithOptionalRefresh;
  transport?: typeof fetch;
  now?: () => number;
} = {}): Promise<ActiveListingsResult> {
  const blocked = (error: string): ActiveListingsResult =>
    ({ status: "BLOCKED", error, count: null, listings: [], observedAt: null });
  if (privateSingleShopId() !== expectedShop || !Number.isSafeInteger(expectedShop) || expectedShop < 1)
    return blocked("PRIVATE_SINGLE_SHOP_AUTHORIZATION_REQUIRED");
  if (!appSupportEmail()) return blocked("MONITORED_SUPPORT_CONTACT_REQUIRED");
  try {
    const grant = await loadGrant();
    if (!grant || grant.shopId !== expectedShop || !grant.userId ||
        !grant.accessToken.startsWith(String(grant.userId) + ".") ||
        grant.expiresAt.getTime() <= now() ||
        parseEtsyGrantedScopes(grant.scope).join(" ") !== "listings_r")
      return blocked("FRESH_MINIMAL_SHOP_GRANT_REQUIRED");
    const listings: ActiveListing[] = [];
    const seen = new Set<number>();
    let total: number | null = null;
    // Up to 10,000 listings; stop safely rather than returning an incomplete catalog.
    for (let offset = 0; offset < 10000; offset += 100) {
      const url = `https://api.etsy.com/v3/application/shops/${expectedShop}/listings?state=active&limit=100&offset=${offset}`;
      const response = await fetchEtsyReadWithRetry(transport, url, {
        method: "GET", cache: "no-store", redirect: "error", headers: etsyApiHeaders(grant.accessToken)
      });
      if (!response.ok) return blocked(`ETSY_HTTP_${response.status}`);
      const body: unknown = await response.json();
      if (!body || typeof body !== "object") return blocked("ETSY_LISTINGS_RESPONSE_INVALID");
      const payload = body as { count?: unknown; results?: unknown };
      if (!Number.isSafeInteger(payload.count) || Number(payload.count) < 0 || !Array.isArray(payload.results))
        return blocked("ETSY_LISTINGS_RESPONSE_INVALID");
      if (total !== null && total !== payload.count) return blocked("ETSY_CATALOG_CHANGED_DURING_READ");
      total = Number(payload.count);
      if (payload.results.length !== Math.min(100, total - offset))
        return blocked("ETSY_LISTINGS_PAGE_INCOMPLETE");
      for (const value of payload.results) {
        if (!value || typeof value !== "object") return blocked("ETSY_LISTING_INVALID");
        const item = value as Record<string, unknown>;
        const id = item.listing_id;
        if (item.shop_id !== expectedShop || item.state !== "active" ||
            !Number.isSafeInteger(id) || Number(id) <= 0 || seen.has(Number(id)) ||
            typeof item.title !== "string" || !item.title.trim()) return blocked("ETSY_LISTING_INVALID");
        seen.add(Number(id));
        const candidate = item.url;
        const safeUrl = typeof candidate === "string" && /^https:\/\/www\.etsy\.com\/listing\//.test(candidate)
          ? candidate : null;
        listings.push({ listingId: Number(id), title: item.title, url: safeUrl });
      }
      if (listings.length === total) return { status: "PASS", error: null, count: total, listings, observedAt: new Date(now()).toISOString() };
      if (payload.results.length === 0) return blocked("ETSY_LISTINGS_PAGE_INCOMPLETE");
    }
    return blocked("ETSY_CATALOG_EXCEEDS_SAFE_LIMIT");
  } catch {
    return blocked("ETSY_LISTINGS_READ_UNAVAILABLE");
  }
}
