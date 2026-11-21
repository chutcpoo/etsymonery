import { LiveCount } from "./live-count";
import { appSupportEmail } from "../lib/app-support";
import { readActiveCatalog } from "../lib/etsy-live-count";
export const dynamic = "force-dynamic";

const modules = [
  { href: "/factory", title: "Factory", detail: "Local product registry and QC status (read-only)" },
  { href: "/sales", title: "Sales", detail: "Etsy listing and sales evidence; requires approved data access" },
  { href: "/commerce", title: "Commerce", detail: "Orders, revenue and fees; requires transactions_r" },
  { href: "/events", title: "Events", detail: "Event ledger; requires approved Etsy data use" },
  { href: "/stats-evidence", title: "Shop Stats", detail: "Analytics remains disabled until written authorization" },
  { href: "/connect/etsy", title: "Etsy Connection", detail: "OAuth status and granted permissions" }
];

export default async function Home() {
  const state = await readActiveCatalog();
  const email = appSupportEmail();
  return <main className="shell">
    <section className="hero">
      <div>
        <p className="eyebrow">CONTROL CENTER · OWNER READ ACCESS</p>
        <h1>PoonthaiDigital Publisher</h1>
        <p className="lede">Production control center. The original modules are available as navigation, while live Etsy data and marketplace changes remain subject to explicit permission and item-specific approvals.</p>
        <p>{"The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy."}</p>
      </div>
      <div className="badge">READ ONLY · SECURE</div>
    </section>
    <section className="metrics">
      <article className="metricCard"><span>Production website</span><strong>ONLINE</strong></article>
      <article className="metricCard"><span>Active Etsy listings</span><LiveCount count={state.liveCatalogCount} observedAt={state.observedAt} /></article>
      <article className="metricCard"><span>Etsy live read</span><strong>{state.status}</strong></article>
      <article className="metricCard"><span>Marketplace writes</span><strong>LOCKED</strong></article>
    </section>
    {state.status !== "PASS" ? <section className="notice warningNotice">
      <div><p className="eyebrow">ETSY AUTHORIZATION</p><h2>Live Etsy data not yet verified</h2><p>{state.error}</p>
        <p>A stored OAuth token does not replace Etsy app authorization and the reviewed seller agreement.</p>
      </div>
    </section> : <p>Live count observed at {state.observedAt}. Refresh to obtain a new observation.</p>}
    <section className="listingStack">
      {modules.map((module) => <article className="listingCard" key={module.href}>
        <div className="listingTop">
          <div><h2>{module.title}</h2><p>{module.detail}</p></div>
          <a className="connectButton" href={module.href}>Open</a>
        </div>
      </article>)}
    </section>
    <section className="notice">
      <div><h2>Product plans and independent QC</h2><p>The existing role-protected backend remains available to authorized operators. Draft and publishing operations require a separate reviewed release and are not enabled by this dashboard.</p></div>
    </section>
    <p>{email ? <a href={`mailto:${email}`}>Seller support · {email}</a> : "Monitored seller support email is required."}</p>
  </main>;
}
