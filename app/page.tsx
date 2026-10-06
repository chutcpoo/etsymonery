import { getControlCenterV3Snapshot } from "../lib/control-center-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workflow = [
  ["01", "Product Truth", "Verify canonical product identity and buyer-facing claims"],
  ["02", "Plan & QC", "Review scope, deliverables, pricing and safety boundaries"],
  ["03", "Approve", "Owner authorization required before build"],
  ["04", "Build", "Create buyer package and listing assets"],
  ["05", "Listing QC", "Check gallery, copy, tags, video and package counts"],
  ["06", "Release Review", "Cross-system evidence before marketplace authorization"],
  ["07", "Etsy Authorization", "Exact-operation approval before any marketplace write"]
];

export default async function Home() {
  const control = await getControlCenterV3Snapshot();
  const latest = control.production.latestPublish;
  const attention = control.operations.needsAttention.length;

  return (
    <main className="sellerShell">
      <header className="sellerNav">
        <a className="brandMark" href="/">
          <span className="brandIcon">P</span>
          <span><strong>PoonthaiDigital</strong><small>Seller Workspace</small></span>
        </a>
        <nav className="navLinks" aria-label="Primary navigation">
          <a href="/factory">Products</a>
          <a href="/sales">Sales</a>
          <a href="/commerce">Orders</a>
          <a href="/events">Activity</a>
        </nav>
        <a className="outlineButton" href="/connect/etsy">Etsy connection</a>
      </header>

      <section className="sellerHero">
        <div>
          <p className="sellerEyebrow">DIGITAL PRODUCT SELLER OPERATIONS</p>
          <h1>Run your Etsy product pipeline with confidence.</h1>
          <p className="sellerLede">
            One workspace for product readiness, listing quality, sales evidence and controlled Etsy publishing.
            Product Truth stays separate from marketplace state, and every write remains authorization-gated.
          </p>
          <div className="heroActions">
            <a className="primaryButton" href="/factory">Open product workspace</a>
            <a className="secondaryButton" href="/sales">View Etsy performance</a>
          </div>
        </div>
        <aside className="readinessCard">
          <div className="readinessTop"><span>SELLER SYSTEM</span><strong className="statusDot">LIVE</strong></div>
          <h2>Release readiness</h2>
          <div className="readinessRow"><span>Etsy channel</span><strong>{control.live.status}</strong></div>
          <div className="readinessRow"><span>Production capability</span><strong>{control.production.capability}</strong></div>
          <div className="readinessRow"><span>Needs attention</span><strong>{attention}</strong></div>
          <p>Marketplace mutations are locked until an exact operation is authorized.</p>
        </aside>
      </section>

      <section className="sellerMetrics" aria-label="Seller overview">
        <article><span>Active on Etsy</span><strong>{control.live.activeCount ?? "—"}</strong><small>live listings</small></article>
        <article><span>Catalog tracked</span><strong>{control.live.catalogTrackedCount}</strong><small>canonical products</small></article>
        <article><span>Channel gap</span><strong>{control.live.liveOnlyCount ?? "—"}</strong><small>needs reconciliation</small></article>
        <article><span>Release health</span><strong>{attention ? "REVIEW" : "CLEAR"}</strong><small>{attention ? `${attention} item(s) need attention` : "no ledger alerts"}</small></article>
      </section>

      {control.live.status !== "PASS" ? (
        <section className="sellerAlert">
          <div><strong>Etsy live read needs attention</strong><p>{control.live.error ?? "Current Etsy state is temporarily unavailable."}</p></div>
          <a href="/connect/etsy">Check connection</a>
        </section>
      ) : null}

      <section className="sellerGrid">
        <article className="sellerPanel workflowPanel">
          <div className="sectionHeading">
            <div><p className="sellerEyebrow">RELEASE PIPELINE</p><h2>From Product Truth to Etsy</h2></div>
            <span className="safeBadge">Writes gated</span>
          </div>
          <div className="sellerFlow">
            {workflow.map(([number, title, description]) => (
              <div className="sellerStep" key={number}>
                <span>{number}</span><div><strong>{title}</strong><p>{description}</p></div>
              </div>
            ))}
          </div>
        </article>

        <aside className="sellerPanel quickPanel">
          <p className="sellerEyebrow">SELLER TOOLS</p>
          <h2>Daily workspace</h2>
          <div className="quickLinks">
            <a href="/factory"><span>Product Factory</span><small>Plan, QC and release state</small></a>
            <a href="/sales"><span>Sales Dashboard</span><small>Listings and channel diagnosis</small></a>
            <a href="/commerce"><span>Orders & Revenue</span><small>Receipts, fees and reviews</small></a>
            <a href="/stats-evidence"><span>Shop Stats</span><small>Capture views, visits and search evidence</small></a>
          </div>
        </aside>
      </section>

      <section className="sellerPanel">
        <div className="sectionHeading">
          <div><p className="sellerEyebrow">CONTROLLED CAPABILITIES</p><h2>What the seller system can do</h2></div>
          <a className="textLink" href="/events">View activity ledger</a>
        </div>
        <div className="capabilityGrid">
          {control.capabilities.map((item) => (
            <article key={item.capability}>
              <div className="capabilityIcon">✓</div>
              <div><strong>{item.capability}</strong><p>{item.owner}</p></div>
              <span>{item.status}</span>
            </article>
          ))}
        </div>
      </section>

      {attention ? (
        <section className="sellerPanel attentionPanel">
          <div className="sectionHeading"><div><p className="sellerEyebrow">ACTION REQUIRED</p><h2>{attention} operation(s) need review</h2></div></div>
          <div className="attentionList">
            {control.operations.needsAttention.slice(0, 6).map((operation) => (
              <div key={operation.operationId}><div><strong>{operation.operationId}</strong><p>{operation.recoveryPoint ?? operation.updatedAt}</p></div><span>{operation.attentionState}</span></div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="sellerPanel publishPanel">
        <div>
          <p className="sellerEyebrow">PRODUCTION EVIDENCE</p>
          <h2>{latest ? `${latest.status} · Etsy #${latest.listingId ?? "UNKNOWN"}` : "No publish proof observed"}</h2>
          <p>{latest ? `Latest operation ${latest.operationId} · authorization ${latest.authorizationState ?? "UNKNOWN"}.` : "No successful publish transaction is currently visible in the operation ledger."}</p>
        </div>
        <div className="publishLock"><span>ETSY WRITE</span><strong>Authorization required</strong><small>No direct publish button is exposed here.</small></div>
      </section>

      <footer className="sellerFooter"><strong>PoonthaiDigital Seller Workspace</strong><span>Evidence first · mutation last</span></footer>
    </main>
  );
}
