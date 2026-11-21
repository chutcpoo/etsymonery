import FullDashboard from "./full-dashboard";
export const dynamic = "force-dynamic";
// FullDashboard remains available for a separately reviewed release with
// verified Etsy permissions, privacy terms and product-specific controls.
void FullDashboard;
export default function EventsPage() {
  return <main className="shell">
    <a className="textLink" href="/">Control Center</a>
    <section className="hero"><div><p className="eyebrow">EVENTS · SECURITY STATUS</p>
      <h1>Etsy Event Ledger</h1>
      <p className="lede">Order webhook and receipt processing remains disabled until approved Etsy app purpose, event permissions and privacy controls are verified.</p>
    </div><div className="badge">GATED</div></section>
    <section className="metrics">
      <article className="metricCard"><span>Events received</span><strong>NOT VERIFIED</strong></article>
      <article className="metricCard"><span>Webhook status</span><strong>NOT VERIFIED</strong></article>
      <article className="metricCard"><span>Marketplace writes</span><strong>LOCKED</strong></article>
    </section>
    <section className="notice warningNotice"><p>Historical event counts and buyer information are not exposed as live Etsy evidence.</p></section>
  </main>;
}
