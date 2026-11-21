import {
  ETSY_SCOPES,
  ETSY_SELLER_READ_SCOPES,
  ETSY_SELLER_WRITE_SCOPES,
  getEtsyCredentials,
  getMissingEtsyScopes,
  parseEtsyGrantedScopes
} from "../../../lib/etsy";
import {
  getStoredEtsyGrantMetadata,
  hasStoredEtsyTokens,
  isTokenStoreConfigured
} from "../../../lib/token-store";

export const dynamic = "force-dynamic";

export default async function EtsyConnectPage() {
  const persistenceConfigured = isTokenStoreConfigured();
  let connected = false;
  let grant: Awaited<ReturnType<typeof getStoredEtsyGrantMetadata>> = null;
  let metadataUnavailable = false;
  try {
    if (persistenceConfigured) {
      connected = await hasStoredEtsyTokens();
      grant = await getStoredEtsyGrantMetadata();
    }
  } catch {
    metadataUnavailable = true;
  }
  const credentials = getEtsyCredentials();
  const expiry = grant?.expiresAt;
  const expiryValid = expiry instanceof Date && Number.isFinite(expiry.getTime());
  const accessTokenExpired = connected && expiryValid && expiry.getTime() <= Date.now();
  const accessTokenUnexpired = connected && expiryValid && expiry.getTime() > Date.now();
  const migrationEnabled = process.env.ETSY_OAUTH_MIGRATION_ENABLED === "true";
  const recordedShopId = Number.isSafeInteger(grant?.shopId) && (grant?.shopId ?? 0) > 0
    ? String(grant!.shopId)
    : "NOT VERIFIED";
  const grantedScopes = parseEtsyGrantedScopes(grant?.scope);
  const scopeMetadataPresent = Boolean(grant?.scope?.trim());
  const sellerReadGrantReady =
    connected && scopeMetadataPresent &&
    getMissingEtsyScopes(grant?.scope, ETSY_SELLER_READ_SCOPES).length === 0;
  const sellerWriteGrantReady =
    connected &&
    scopeMetadataPresent &&
    getMissingEtsyScopes(grant?.scope, ETSY_SELLER_WRITE_SCOPES).length === 0;
  const transactionsReadGrantReady =
    connected &&
    scopeMetadataPresent &&
    getMissingEtsyScopes(grant?.scope, ["transactions_r"]).length === 0;

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">ETSY OPEN API V3</p>
          <h1>Connect Etsy</h1>
          <p className="lede">
            Owner-only OAuth metadata and read-only access diagnostics.
            Stored credentials do not prove a successful live Etsy API call.
          </p>
        </div>
        <div className="badge">
          {metadataUnavailable ? "TOKEN STATUS UNAVAILABLE"
            : accessTokenExpired ? "STORED TOKEN EXPIRED"
            : connected ? "GRANT STORED — NOT VERIFIED"
            : !persistenceConfigured ? "TOKEN STORE REQUIRED"
            : "NO STORED GRANT"}
        </div>
      </section>

      <section className="panel compact">
        <div>
          <p className="eyebrow">STATUS</p>
          <h2>
            {metadataUnavailable ? "Unable to read stored OAuth metadata"
              : accessTokenExpired ? "Stored access token has expired"
              : connected ? "Grant recorded — live access not verified"
              : "No verified Etsy connection"}
          </h2>
          <p>
            Requested scopes: {ETSY_SCOPES.join(", ")}. Granted scopes:{" "}
            {scopeMetadataPresent ? grantedScopes.join(", ") : "UNKNOWN"}. Seller
            Draft read scope: {sellerReadGrantReady ? "GRANTED (LIVE UNVERIFIED)" : "BLOCKED"}. Seller
            Draft write scope: {sellerWriteGrantReady ? "RECORDED (WRITES LOCKED)" : "BLOCKED"}.
            Transactions read scope: {transactionsReadGrantReady ? "RECORDED (ANALYTICS LOCKED)" : "BLOCKED"}.
          </p>
          <p>
            Recorded Shop ID: {recordedShopId} (database metadata only).
            Access token: {accessTokenExpired ? "EXPIRED" : accessTokenUnexpired ? "UNEXPIRED (NOT LIVE VERIFIED)" : "UNKNOWN"}.
            {expiryValid ? ` Expiry: ${expiry.toISOString()} (UTC).` : " Expiry not available."}
            Etsy API live read: NOT VERIFIED. Marketplace writes: LOCKED.
          </p>
          <p>
            These indicators do not perform Etsy API requests or prove app permission,
            seller agreement, or successful token refresh. Credentials remain encrypted server-side.
          </p>
        </div>

        {!persistenceConfigured ? (
          <code>Token storage is not configured.</code>
        ) : metadataUnavailable ? (
          <code>Stored grant metadata is unavailable. Check the private server logs.</code>
        ) : migrationEnabled && credentials.configured ? (
          <a className="connectButton" href="/api/etsy/oauth/migration/launch">
            Open owner-approved OAuth migration
          </a>
        ) : (
          <p>OAuth reconnection is disabled by policy. No OAuth changes are initiated from this page.</p>
        )}
      </section>
    </main>
  );
}
