import { cookies } from "next/headers";
import { ETSY_SCOPES, getEtsyCredentials } from "../../../lib/etsy";

export const dynamic = "force-dynamic";

export default async function EtsyConnectPage() {
  const store = await cookies();
  const connected = Boolean(
    store.get("etsy_access_token")?.value &&
      store.get("etsy_refresh_token")?.value
  );
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
          {connected ? "CONNECTED" : credentials.configured ? "READY TO AUTHORIZE" : "API KEY REQUIRED"}
        </div>
      </section>

      <section className="panel compact">
        <div>
          <p className="eyebrow">STATUS</p>
          <h2>{connected ? "Etsy authorization active" : "Etsy authorization pending"}</h2>
          <p>
            Requested scopes: {ETSY_SCOPES.join(", ")}. Marketplace writes remain
            disabled until the production publish adapter passes verification.
          </p>
        </div>

        {credentials.configured ? (
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
