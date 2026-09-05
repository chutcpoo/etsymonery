import { getControlCenterV2Snapshot } from "../lib/control-center-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workflow = [
  "Canonical Catalog identifiers",
  "Shop Identity + OAuth",
  "Live Etsy readback",
  "API performance evidence",
  "Funnel Root Cause",
  "Controlled fix candidate",
  "Tester + independent QC",
  "Production authorization",
  "Secure authorized publish",
  "Ledger + post-publish monitoring"
];

export default async function Home() {
  const control = await getControlCenterV2Snapshot();
  const latest = control.production.latestPublish;

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">GLOBAL AI DIGITAL PRODUCT FACTORY OS</p>
          <h1>Control Center V2</h1>
          <p className="lede">
            Live Etsy channel state, canonical Catalog identity and proven
            production execution are shown as separate read models. Marketplace
            mutations remain gated, authorized actions outside this dashboard.
          </p>
        </div>
        <div className="badge">V2 · LIVE READ MODEL</div>
      </section>

      <section className="metrics">
        <article className="metricCard">
          <span>Live active</span>
          <strong>{control.live.activeCount ?? "UNKNOWN"}</strong>
        </article>
        <article className="metricCard">
          <span>Catalog tracked</span>
          <strong>{control.live.catalogTrackedCount}</strong>
        </article>
        <article className="metricCard">
          <span>Live-only gap</span>
          <strong>{control.live.liveOnlyCount ?? "UNKNOWN"}</strong>
        </article>
        <article className="metricCard">
          <span>Production capability</span>
          <strong>{control.production.capability}</strong>
        </article>
      </section>

      {control.live.status !== "PASS" ? (
        <section className="notice warningNotice">
          <div>
            <p className="eyebrow">LIVE CHANNEL READ</p>
            <h2>Current Etsy state is temporarily unavailable.</h2>
            <p>{control.live.error ?? "UNKNOWN"}</p>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div>
          <p className="eyebrow">FACTORY FLOW</p>
          <h2>Evidence first, mutation last.</h2>
          <p>
            Catalog state, live Etsy state, gates, authorization, secure execution
            and ledger proof stay separated so the dashboard never invents Product
            Truth from channel state.
          </p>
        </div>
        <ol className="flow">
          {workflow.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="panel compact">
        <div>
          <p className="eyebrow">PROVEN PRODUCTION BACKEND</p>
          <h2>{latest ? `${latest.status} · Etsy #${latest.listingId ?? "UNKNOWN"}` : "No publish proof observed"}</h2>
          <p>
            {latest
              ? `Latest operation ${latest.operationId} · state ${latest.state ?? "UNKNOWN"} · authorization ${latest.authorizationState ?? "UNKNOWN"}.`
              : "No successful publish transaction is currently visible in the operation ledger."}
          </p>
        </div>
        <a className="connectButton" href="/factory">
          Open Factory Dashboard
        </a>
      </section>

      <section className="panel compact">
        <div>
          <p className="eyebrow">SALES CONTROL CENTER</p>
          <h2>Live channel + catalog-tracked diagnosis</h2>
          <p>
            See every current active Etsy listing while keeping deep diagnosis
            limited to listings with canonical identifier projection.
          </p>
        </div>
        <a className="connectButton" href="/sales">
          Open Sales Dashboard
        </a>
      </section>

      <section className="panel compact">
        <div>
          <p className="eyebrow">SHOP STATS</p>
          <h2>Fill evidence the Etsy API does not expose</h2>
          <p>
            Views, visits, search terms and CTR remain UNKNOWN until Shop Stats
            evidence is supplied.
          </p>
        </div>
        <a className="textLink" href="/stats-evidence">
          Capture Shop Stats
        </a>
      </section>

      <section className="panel compact">
        <div>
          <p className="eyebrow">ETSY CONNECTION</p>
          <h2>OAuth + encrypted token lifecycle</h2>
          <p>
            Re-authorize only when requested scopes change or the stored grant
            requires renewal.
          </p>
        </div>
        <a className="textLink" href="/connect/etsy">
          Etsy connection status
        </a>
      </section>
    </main>
  );
}
