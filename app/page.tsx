import { appSupportEmail } from "../lib/app-support";
import { LiveCount } from "./live-count";
import { readActiveCatalog } from "../lib/etsy-live-count";
export const dynamic = "force-dynamic";

export default async function Home() {
  const state = await readActiveCatalog();
  const email = appSupportEmail();
  return <main className="shell"><section className="panel">
    <h1>AutoDigitalPublisher</h1>
    <p>{"The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy."}</p>
    <h2>Active Etsy listings</h2>
    <LiveCount count={state.liveCatalogCount} observedAt={state.observedAt} />
    <p>{state.observedAt ? `Observed on Etsy at ${state.observedAt}` : `BLOCKED · ${state.error}`}</p>
    <p>Draft creation and publishing are locked.</p>
    <p>{email ? <a href={`mailto:${email}`}>Seller support · {email}</a> : "BLOCKED · A monitored seller support email is required."}</p>
  </section></main>;
}
