import { LiveCount } from "../live-count";
import FullDashboard from "./full-dashboard";
import { readActiveCatalog } from "../../lib/etsy-live-count";
export const dynamic = "force-dynamic";
// FullDashboard remains available for a separately reviewed release with
// verified Etsy permissions, privacy terms and product-specific controls.
void FullDashboard;
export default async function SalesControlCenterPage() {
  const live = await readActiveCatalog();
  return <main className="shell">
    <a className="textLink" href="/">Control Center</a>
    <section className="hero"><div>
      <p className="eyebrow">SALES · VERIFIED READ ONLY</p><h1>Sales Dashboard</h1>
      <p className="lede">Only approved and fresh Etsy listing evidence is displayed. Revenue and conversion data are unavailable without separate permissions and verified sources.</p>
    </div><div className="badge">READ ONLY</div></section>
    <section className="metrics">
      <article className="metricCard"><span>Active listings</span><LiveCount count={live.liveCatalogCount} observedAt={live.observedAt} /></article>
      <article className="metricCard"><span>Live verification</span><strong>{live.status}</strong></article>
      <article className="metricCard"><span>Orders</span><strong>NOT VERIFIED</strong></article>
      <article className="metricCard"><span>Revenue</span><strong>NOT VERIFIED</strong></article>
    </section>
    {live.status !== "PASS" && <section className="notice warningNotice"><p>{live.error}</p></section>}
    <section className="notice"><p>Detailed sales analytics remain unavailable until the shop owner has the required Etsy authorization, transaction scopes, and approved data use. Historical counts are not substituted for live evidence.</p></section>
  </main>;
}
