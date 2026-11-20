import { neon } from "@neondatabase/serverless";
import { appSupportEmail } from "./app-support";
import { getEtsyCredentials, parseEtsyGrantedScopes } from "./etsy";
import { reviewedReference, validateMigrationToken } from "./etsy-oauth-migration";
import { decryptSecret, encryptSecret } from "./token-crypto";
import { loadEtsyReadGrant } from "./token-store";

type ReadGrant = NonNullable<Awaited<ReturnType<typeof loadEtsyReadGrant>>>;

// Read refresh is separately OFF by default. This only rotates an already
// minimal listings_r OAuth token; it cannot change the Etsy authorization
// scopes or initiate a new grant.
export function mayRefreshMinimalReadGrant(grant: ReadGrant | null, now = Date.now()) {
  return Boolean(grant &&
    process.env.ETSY_READ_TOKEN_REFRESH_ENABLED === "true" &&
    reviewedReference(process.env.ETSY_READ_TOKEN_REFRESH_APPROVAL_REF) &&
    reviewedReference(process.env.ETSY_READ_APP_PERMISSION_REF) &&
    reviewedReference(process.env.ETSY_READ_SELLER_AGREEMENT_REF) &&
    appSupportEmail() &&
    Number.isSafeInteger(grant.shopId) && grant.shopId > 0 &&
    grant.shopId === Number(process.env.ETSY_SHOP_ID) &&
    grant.shopId === Number(process.env.ETSY_READ_APPROVED_SHOP_ID) &&
    Number.isSafeInteger(grant.userId) && grant.userId > 0 &&
    grant.accessToken.startsWith(String(grant.userId) + ".") &&
    parseEtsyGrantedScopes(grant.scope).length === 1 &&
    parseEtsyGrantedScopes(grant.scope)[0] === "listings_r" &&
    grant.expiresAt.getTime() <= now + 120_000);
}

export async function loadEtsyReadGrantWithOptionalRefresh({
  loadGrant = loadEtsyReadGrant,
  transport = fetch,
  now = Date.now
}: {
  loadGrant?: typeof loadEtsyReadGrant;
  transport?: typeof fetch;
  now?: () => number;
} = {}) {
  const current = await loadGrant();
  if (!mayRefreshMinimalReadGrant(current, now())) return current;

  const url = process.env.DATABASE_URL?.trim();
  const { keystring } = getEtsyCredentials();
  if (!url || !keystring) return current;
  const sql = neon(url);
  // Do not load or decrypt the existing broad grant's refresh secret: the
  // metadata checks above have already verified EXACTLY listings_r.
  const rows = await sql`
    SELECT refresh_token_enc
    FROM oauth_tokens
    WHERE provider = 'etsy' AND account_key = 'primary'
      AND scope = 'listings_r'
      AND user_id = ${current!.userId}
      AND shop_id = ${current!.shopId}
    LIMIT 1;
  `;
  if (rows.length !== 1) return current;
  const oldCipher = String(rows[0].refresh_token_enc ?? "");
  const refreshToken = decryptSecret(oldCipher);
  if (!refreshToken.startsWith(String(current!.userId) + "."))
    throw new Error("REFRESH_TOKEN_USER_MISMATCH");

  const response = await transport("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST", cache: "no-store", redirect: "error",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token", client_id: keystring, refresh_token: refreshToken
    }),
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) {
    // Another concurrent worker may already have rotated the token.
    const latest = await loadGrant();
    return latest?.expiresAt.getTime() && latest.expiresAt.getTime() > now() + 120_000
      ? latest : current;
  }
  const updated = validateMigrationToken(await response.json(), current!.userId, now);
  const encryptedAccess = encryptSecret(updated.accessToken);
  const encryptedRefresh = encryptSecret(updated.refreshToken);
  const saved = await sql`
    UPDATE oauth_tokens SET
      access_token_enc = ${encryptedAccess},
      refresh_token_enc = ${encryptedRefresh},
      expires_at = ${updated.expiresAt.toISOString()}::timestamptz,
      scope = 'listings_r', token_type = 'Bearer', updated_at = NOW()
    WHERE provider = 'etsy' AND account_key = 'primary'
      AND user_id = ${current!.userId} AND shop_id = ${current!.shopId}
      AND scope = 'listings_r' AND refresh_token_enc = ${oldCipher}
    RETURNING user_id, shop_id, scope;
  `;
  // Compare-and-swap prevents stale concurrent refreshes from writing over
  // the winning refresh token. Caller re-reads the canonical primary row.
  if (saved.length !== 1) return loadGrant();
  return loadGrant();
}
