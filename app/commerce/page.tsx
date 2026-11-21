import FullDashboard from "./full-dashboard";
import { getStoredEtsyGrantMetadata, isTokenStoreConfigured } from "../../lib/token-store";
import { getMissingEtsyScopes } from "../../lib/etsy";
export const dynamic = "force-dynamic";
// FullDashboard remains available for a separately reviewed release with
// verified Etsy permissions, privacy terms and product-specific controls.
void FullDashboard;
export default async function CommercePage() {
  let grant: Awaited<ReturnType<typeof getStoredEtsyGrantMetadata>> = null;
  try { if (isTokenStoreConfigured()) grant = await getStoredEtsyGrantMetadata(); } catch { /* status remains unknown */ }
  const missing = getMissingEtsyScopes(grant?.scope, ["transactions_r"]);
  return <main className="shell">
    <a className="textLink" href="/">Control Center</a>
    <section className="hero"><div><p className="eyebrow">COMMERCE · PERMISSION STATUS</p>
      <h1>Orders and Revenue</h1>
      <p className="lede">No Etsy order, payment, fee, or buyer information is requested until its required authorization has been reviewed.</p>
    </div><div className="badge">DATA ACCESS GATED</div></section>
    <section className="metrics">
      <article className="metricCard"><span>transactions_r</span><strong>{missing.length ? "NOT GRANTED" : "GRANTED"}</strong></article>
      <article className="metricCard"><span>Orders</span><strong>NOT VERIFIED</strong></article>
      <article className="metricCard"><span>Revenue</span><strong>NOT VERIFIED</strong></article>
      <article className="metricCard"><span>Fees</span><strong>NOT VERIFIED</strong></article>
    </section>
    <section className="notice warningNotice"><p>Commerce API access and automated analytics require the correct Etsy permissions and separately reviewed data-use authorization. No historical revenue estimates are displayed.</p></section>
  </main>;
}
