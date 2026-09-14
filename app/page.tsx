import { getControlCenterV3Snapshot } from "../lib/control-center-v3";

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
  const control = await getControlCenterV3Snapshot();
  const latest = control.production.latestPublish;

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">GLOBAL AI DIGITAL PRODUCT FACTORY OS</p>
          <h1>Control Center V3</h1>
          <p className="lede">
            Live Etsy channel state, canonical Catalog identity and proven
            production execution are shown as separate read models. Marketplace mutations remain gated. This dashboard now also exposes executor capabilities and operation-ledger attention states without enabling direct UI writes.
          </p>
        </div>
        <div className="badge">V3 · GATED OPERATOR</div>
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
          <p className="eyebrow">AUTHORIZED ACTION CAPABILITIES</p>
          <h2>What this runtime can execute safely.</h2>
          <p>Product Truth and SEO stay handoff-only. Etsy mutations remain exact-contract, authorization-bound operations.</p>
        </div>
        <div className="listingStack">
          {control.capabilities.map((item) => (
            <article className="listingCard" key={item.capability}>
              <div className="listingTop">
                <div><strong>{item.capability}</strong><p>{item.owner}</p></div>
                <div className="badge">{item.status}</div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {control.operations.needsAttention.length ? (
        <section className="panel">
          <div>
            <p className="eyebrow">NEEDS ATTENTION</p>
            <h2>{control.operations.needsAttention.length} ledger operation(s) require review.</h2>
            <p>Reconciliation and failed operations are never blindly retried.</p>
          </div>
          <div className="listingStack">
            {control.operations.needsAttention.slice(0, 8).map((operation) => (
              <article className="listingCard" key={operation.operationId}>
                <div className="listingTop">
                  <div><strong>{operation.operationId}</strong><p>{operation.recoveryPoint ?? operation.updatedAt}</p></div>
                  <div className="badge">{operation.attentionState}</div>
                </div>
              </article>
            ))}
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
          <p className="eyebrow">COMMERCE INTELLIGENCE</p>
          <h2>Orders, revenue, Etsy fees and review signals</h2>
          <p>
            Read-only receipt, payment-account and review evidence for sales
            decisions, with buyer PII intentionally excluded from the dashboard.
          </p>
        </div>
        <a className="connectButton" href="/commerce">
          Open Commerce Dashboard
        </a>
      </section>

      <section className="panel compact">
        <div>
          <p className="eyebrow">REAL-TIME ETSY EVENTS</p>
          <h2>Verified order signals and read-only receipt correlation</h2>
          <p>
            Inspect signature-verified webhook events, duplicate suppression,
            replay protection and PII-minimized receipt evidence.
          </p>
        </div>
        <a className="connectButton" href="/events">
          Open Event Ledger
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
