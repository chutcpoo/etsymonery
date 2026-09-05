import { NeonCanonicalProductRegistryRepository } from "../../lib/product-registry-repository";
import { buildOperatorDashboard } from "../../lib/operator-dashboard";
export const dynamic = "force-dynamic";
export default async function FactoryDashboardPage(){
  let rows: ReturnType<typeof buildOperatorDashboard>[]=[]; let error:string|null=null;
  try{const records=await new NeonCanonicalProductRegistryRepository().list();rows=records.map(product=>buildOperatorDashboard({product}));}
  catch(e){error=e instanceof Error?e.message:"READ_ONLY_DATA_SOURCE_UNAVAILABLE";}
  return <main className="shell salesShell"><section className="hero"><div><p className="eyebrow">GLOBAL AI DIGITAL PRODUCT FACTORY OS</p><h1>Operator Dashboard</h1><p className="lede">Read-only factory state. Mutations are separate authorized actions.</p></div><div className="badge">READ ONLY</div></section>{error?<section className="notice warningNotice"><div><strong>Data source unavailable</strong><p>{error}</p></div></section>:null}<section className="listingStack">{rows.map(row=><article className="listingCard" key={row.productId}><div className="listingTop"><div><p className="eyebrow">{row.productId}</p><h2>{row.currentState??"STATE NOT AVAILABLE"}</h2><p>Next: {row.nextExecutableStage??"COMPLETE"}</p></div><div className="badge">{row.blocker?`BLOCKED · ${row.blocker.code}`:"READ ONLY"}</div></div><div className="metrics"><article className="metricCard"><span>Fingerprint</span><strong>{row.fingerprint??"NOT AVAILABLE"}</strong></article>{row.gates.map(g=><article className="metricCard" key={g.gateType}><span>{g.gateType}</span><strong>{g.status}</strong></article>)}</div><p>Evidence: {row.evidenceIds.length?row.evidenceIds.join(", "):"NOT OBSERVED"}</p></article>)}</section></main>;
}
