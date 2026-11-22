import { appSupportEmail } from "./app-support";
import { privateSingleShopId } from "./etsy-private-shop";
import { ETSY_SCOPES, etsyApiHeaders, parseEtsyGrantedScopes } from "./etsy";
import { fetchEtsyReadWithRetry } from "./etsy-http";
import { loadEtsyReadGrantWithOptionalRefresh } from "./etsy-read-refresh";

type ReadAuthorization = { shopId: number; etsyPermissionRef: string; sellerPrivacyAgreementRef: string };

// Read-only authorization is configured only after the owner reviews the
// underlying Etsy app permission and shop-specific agreement. Do not infer it
// from a stored OAuth token, app access label, request body or listing history.
// Missing / placeholder evidence always fails closed; no marketplace writes.
function evidenceReference(value?: string) {
  const normalized = value?.trim() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/-]{7,255}$/.test(normalized) ||
      /^(test|todo|tbd|pending|placeholder|not-approved)/i.test(normalized)) return null;
  return normalized;
}

export function reviewedReadAuthorizationFromEnvironment(): ReadAuthorization | null {
  const shop = Number(process.env.ETSY_READ_APPROVED_SHOP_ID);
  const etsyPermissionRef = evidenceReference(process.env.ETSY_READ_APP_PERMISSION_REF);
  const sellerPrivacyAgreementRef = evidenceReference(process.env.ETSY_READ_SELLER_AGREEMENT_REF);
  if (!Number.isSafeInteger(shop) || shop < 1) return null;
  if (etsyPermissionRef && sellerPrivacyAgreementRef)
    return { shopId: shop, etsyPermissionRef, sellerPrivacyAgreementRef };
  // Explicit owner-only mode avoids pretending a private shop needs third-party seller acceptance.
  if (privateSingleShopId() === shop)
    return { shopId: shop, etsyPermissionRef: "private-single-shop", sellerPrivacyAgreementRef: "owner-operated" };
  return null;
}

export async function readActiveCatalog({
  authorization = reviewedReadAuthorizationFromEnvironment(),
  expectedShop = Number(process.env.ETSY_SHOP_ID),
  loadGrant = loadEtsyReadGrantWithOptionalRefresh,
  transport = fetch,
  now = Date.now
}: {
  authorization?: ReadAuthorization | null;
  expectedShop?: number;
  loadGrant?: typeof loadEtsyReadGrantWithOptionalRefresh;
  transport?: typeof fetch;
  now?: () => number;
} = {}) {
  const unavailable = (error: string) => ({
    status: "BLOCKED" as const, error, liveCatalogCount: null, observedAt: null
  });
  if (!authorization?.etsyPermissionRef.trim() || !authorization.sellerPrivacyAgreementRef.trim())
    return unavailable("ETSY_APP_AUTHORIZATION_AND_SELLER_PRIVACY_AGREEMENT_REQUIRED");
  if (!appSupportEmail()) return unavailable("MONITORED_SUPPORT_CONTACT_REQUIRED");
  if (!Number.isSafeInteger(expectedShop) || expectedShop < 1 || authorization.shopId !== expectedShop)
    return unavailable("AUTHORIZED_SHOP_MISMATCH");

  try {
    const grant = await loadGrant();
    const scopes = parseEtsyGrantedScopes(grant?.scope);
    if (!grant || grant.shopId !== expectedShop || !grant.userId ||
        grant.accessToken.split(".", 1)[0] !== String(grant.userId) ||
        !(grant.expiresAt.getTime() > now()) ||
        scopes.length !== 1 || scopes[0] !== ETSY_SCOPES[0]) return unavailable("FRESH_MINIMAL_SHOP_GRANT_REQUIRED");

    // The provider's active total fits in a single page request even for large shops.
    const response = await fetchEtsyReadWithRetry(transport,
      `https://api.etsy.com/v3/application/shops/${expectedShop}/listings?state=active&limit=1`,
      { method: "GET", cache: "no-store", redirect: "error", headers: etsyApiHeaders(grant.accessToken) });
    if (!response.ok) return unavailable(`ETSY_HTTP_${response.status}`);
    const data = await response.json();
    if (!Number.isSafeInteger(data?.count) || data.count < 0 || !Array.isArray(data.results) ||
        data.results.length !== Math.min(1, data.count) || data.results.some((row: {shop_id?: number; state?: string; listing_id?: number} | null) =>
          row?.shop_id !== expectedShop || row.state !== "active" || !Number.isSafeInteger(row.listing_id) || !(Number(row.listing_id) > 0)))
      return unavailable("ETSY_LIVE_TOTAL_UNVERIFIED");
    return { status: "PASS" as const, error: null, liveCatalogCount: data.count as number, observedAt: new Date(now()).toISOString() };
  } catch {
    return unavailable("ETSY_LIVE_READ_UNAVAILABLE");
  }
}
