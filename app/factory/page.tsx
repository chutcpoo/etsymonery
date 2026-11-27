import WorkflowBoard from "./workflow-board";
import { listWorkflowItems, type WorkflowItem } from "../../lib/local-factory-workflow";
import { readActiveListings } from "../../lib/etsy-active-listings";
import { EtsyListingList } from "../etsy-listing-list";
import { LiveCount } from "../live-count";
import FullFactoryDashboard from "./full-dashboard";
import { buildOperatorDashboard } from "../../lib/operator-dashboard";
import { NeonCanonicalProductRegistryRepository } from "../../lib/product-registry-repository";
import { readActiveCatalog } from "../../lib/etsy-live-count";
import { isLegacyProduct } from "../../lib/legacy-products";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function FactoryDashboardPage() {
  const live = await readActiveCatalog();
  const catalog = await readActiveListings();
  void FullFactoryDashboard;
  let workflowItems: WorkflowItem[] = [];
  let workflowError: string | null = null;
  try { workflowItems = await listWorkflowItems(); }
  catch { workflowError = "FACTORY_WORKFLOW_STORE_UNAVAILABLE"; }
  const rows: ReturnType<typeof buildOperatorDashboard>[] = [];
  const archivedRows: typeof rows = [];
  let error: string | null = null;
  try {
    const records = await new NeonCanonicalProductRegistryRepository().list();
    for (const product of records) {
      const row = buildOperatorDashboard({ product });
      if (isLegacyProduct(product.productId)) archivedRows.push(row);
      else rows.push(row);
    }
  } catch {
    error = "FACTORY_REGISTRY_UNAVAILABLE";
  }
  return <main className="shell salesShell">
    <a className="textLink" href="/">Control Center</a>
    <section className="hero"><div>
      <p className="eyebrow">FACTORY · LOCAL REGISTRY</p>
      <h1>Product Factory</h1>
      <p className="lede">Canonical product states and QC gates are read-only. No Etsy listing changes are triggered by this page.</p>
    </div><div className="badge">READ ONLY</div></section>
    <section className="metrics">
      <article className="metricCard"><span>Current registry products</span><strong>{error ? "UNKNOWN" : rows.length}</strong></article>
      <article className="metricCard"><span>Live Etsy listings</span><LiveCount count={live.liveCatalogCount} observedAt={live.observedAt} /></article>
      <article className="metricCard"><span>Live read</span><strong>{live.status}</strong></article>
      <article className="metricCard"><span>Marketplace writes</span><strong>LOCKED</strong></article>
    </section>
    {error && <section className="notice warningNotice"><p>{error}: verify the production registry database and schema.</p></section>}
    {live.status !== "PASS" && <section className="notice warningNotice"><p>Live Etsy access: {live.error}</p></section>}
    <EtsyListingList catalog={catalog} />
    <WorkflowBoard initialItems={workflowItems} loadError={workflowError} />
    <section className="listingStack">
      <div><h2>Local Factory product registry</h2><p>Independent production/QC records; not automatically matched to Etsy listings.</p></div>
      {rows.length === 0 && !error && <article className="listingCard"><p>No current product records found.</p></article>}
      {rows.map(row => <article className="listingCard" key={row.productId}>
        <p className="eyebrow">{row.productId}</p><h2>{row.currentState ?? "STATE NOT AVAILABLE"}</h2>
        <p>Next: {row.nextExecutableStage ?? "NOT AVAILABLE"}</p>
        <p>Blocker: {row.blocker?.code ?? "NONE OBSERVED"}</p>
        <div className="tagRow">{row.gates.map(gate => <span key={gate.gateType}>{gate.gateType}: {gate.status}</span>)}</div>
      </article>)}
    </section>
    {archivedRows.length > 0 && <details className="listingStack">
      <summary>Legacy product history ({archivedRows.length})</summary>
      {archivedRows.map(row => <article className="listingCard" key={row.productId}>
        <h3>{row.productId}</h3>
        <p>Last recorded state: {row.currentState ?? "UNKNOWN"}</p>
        <div className="tagRow">{row.gates.map(gate => <span key={gate.gateType}>{gate.gateType}: {gate.status}</span>)}</div>
      </article>)}
    </details>}
  </main>;
}
