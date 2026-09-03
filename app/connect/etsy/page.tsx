import {
  ETSY_SCOPES,
  getEtsyCredentials
} from "../../../lib/etsy";
import {
  hasStoredEtsyTokens,
  isTokenStoreConfigured
} from "../../../lib/token-store";

export const dynamic = "force-dynamic";

export default async function EtsyConnectPage() {
  const persistenceConfigured = isTokenStoreConfigured();
  const connected = persistenceConfigured
    ? await hasStoredEtsyTokens()
    : false;
  const credentials = getEtsyCredentials();

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">ETSY OPEN API V3</p>
          <h1>Connect Etsy</h1>
          <p className="lede">
            Authorize AutoDigitalPublisher to create and manage Etsy listing drafts
            through OAuth 2.0 with PKCE.
          </p>
        </div>
        <div className="badge">
          {connected
            ? "CONNECTED"
            : !persistenceConfigured
              ? "TOKEN STORE REQUIRED"
              : credentials.configured
                ? "READY TO AUTHORIZE"
                : "API KEY REQUIRED"}
        </div>
      </section>

      <section className="panel compact">
        <div>
          <p className="eyebrow">STATUS</p>
          <h2>
            {connected ? "Etsy authorization active" : "Etsy authorization pending"}
          </h2>
          <p>
            Requested scopes: {ETSY_SCOPES.join(", ")}. OAuth tokens are stored
            server-side with application-layer encryption. Marketplace writes remain
            disabled until the production publish adapter passes verification.
          </p>
        </div>

        {!persistenceConfigured ? (
          <code>Set DATABASE_URL + TOKEN_ENCRYPTION_KEY</code>
        ) : credentials.configured ? (
          <a className="connectButton" href="/api/etsy/oauth/start">
            {connected ? "Reconnect Etsy" : "Connect Etsy"}
          </a>
        ) : (
          <code>Set ETSY_API_KEY + ETSY_SHARED_SECRET</code>
        )}
      </section>
    </main>
  );
}
