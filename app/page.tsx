const workflow = [
  "Canonical Catalog identifiers",
  "Shop Identity",
  "Exact 6 live listings",
  "API performance evidence",
  "Funnel Root Cause",
  "Controlled fix candidate",
  "Tester + independent QC",
  "Production authorization"
];

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">DIGITAL PRODUCT COMMERCE</p>
          <h1>Etsy Sales Control Center</h1>
          <p className="lede">
            Diagnose why a listing is not selling before changing it. Live Etsy
            evidence, canonical Catalog identity, and ETSY GROWTH OS rules stay
            separated from Product Truth and production publishing.
          </p>
        </div>
        <div className="badge">V1 CANDIDATE · READ ONLY</div>
      </section>

      <section className="metrics">
        <article className="metricCard">
          <span>Etsy OAuth</span>
          <strong>CONNECTED FLOW</strong>
        </article>
        <article className="metricCard">
          <span>Catalog</span>
          <strong>EXACT DRIVE ID</strong>
        </article>
        <article className="metricCard">
          <span>Listings</span>
          <strong>EXACT 6</strong>
        </article>
        <article className="metricCard">
          <span>Production writes</span>
          <strong>DISABLED</strong>
        </article>
      </section>

      <section className="panel">
        <div>
          <p className="eyebrow">SALES DIAGNOSIS FLOW</p>
          <h2>Find the leak before fixing the listing.</h2>
          <p>
            Discovery, click-through, engagement and conversion are separate
            evidence stages. Missing Shop Stats remain UNKNOWN instead of being
            guessed.
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
          <p className="eyebrow">CONTROL CENTER</p>
          <h2>Exact 6 Listing Root Cause Dashboard</h2>
          <p>
            Read current listing fields, favorites and authorized sales signals.
            No listing is edited from the dashboard.
          </p>
        </div>
        <a className="connectButton" href="/sales">
          Open Sales Dashboard
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
