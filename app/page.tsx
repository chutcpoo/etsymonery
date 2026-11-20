import { LiveCount } from "./live-count";
import { readActiveCatalog } from "../lib/etsy-live-count";
export const dynamic = "force-dynamic";

export default async function Home() {
  const state = await readActiveCatalog();
  return <main className="shell"><section className="panel">
    <h1>Seller dashboard</h1>
    <h2>Active Etsy listings</h2>
    <LiveCount count={state.liveCatalogCount} observedAt={state.observedAt} />
    <p>{state.observedAt ? `Observed on Etsy at ${state.observedAt}` : `BLOCKED · ${state.error}`}</p>
    <p>Draft creation and publishing are locked.</p>
  </section></main>;
}
