import { getControlCenterV3Snapshot } from "../../lib/control-center-v3";
import { buildOperatorDashboard } from "../../lib/operator-dashboard";
import { NeonCanonicalProductRegistryRepository } from "../../lib/product-registry-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function FactoryDashboardPage() {
  let rows: ReturnType<typeof buildOperatorDashboard>[] = [];
  let error: string | null = null;

  const control = await getControlCenterV3Snapshot();
  const latest = control.production.latestPublish;

  try {
    const records = await new NeonCanonicalProductRegistryRepository().list();
    rows = records.map((product) => buildOperatorDashboard({ product }));
  } catch (caught) {
    error =
      caught instanceof Error ? caught.message : "READ_ONLY_DATA_SOURCE_UNAVAILABLE";
  }

  return (
    <main className="shell salesShell">
      <section className="hero">
        <div>
          <p className="eyebrow">GLOBAL AI DIGITAL PRODUCT FACTORY OS</p>
          <h1>Operator Dashboard V3</h1>
          <p className="lede">
            Read-only factory state synchronized with live Etsy channel state and
            the production operation ledger. Mutations remain separate authorized
            actions.
          </p>
        </div>
        <div className="badge">V3 · GATED READ MODEL</div>
      </section>

      <section className="metrics">
        <article className="metricCard">
          <span>Live active</span>
          <strong>{control.live.activeCount ?? "UNKNOWN"}</strong>
        </article>
        <article className="metricCard">
          <span>Catalog tracked</span>
          <strong>{control.live.catalogTrackedCount}</strong>
        </article>
        <article className="metricCard">
          <span>Production</span>
          <strong>{control.production.capability}</strong>
        </article>
        <article className="metricCard">
          <span>Latest publish</span>
          <strong>{latest?.status ?? "NOT OBSERVED"}</strong>
        </article>
      </section>

      {control.operations.needsAttention.length ? (
        <section className="notice warningNotice">
          <div>
            <p className="eyebrow">OPERATION LEDGER</p>
            <h2>{control.operations.needsAttention.length} operation(s) need attention</h2>
            <p>{control.operations.needsAttention.slice(0, 5).map((item) => `${item.operationId}: ${item.attentionState}`).join(" · ")}</p>
          </div>
          <div className="badge">NO BLIND RETRY</div>
        </section>
      ) : null}

      <section className="notice">
        <div>
          <p className="eyebrow">PRODUCTION EXECUTION PROOF</p>
          <h2>
            {latest
              ? `${latest.status} · Etsy #${latest.listingId ?? "UNKNOWN"}`
              : "No publish proof observed"}
          </h2>
          <p>
            {latest
              ? `${latest.operationId} · state ${latest.state ?? "UNKNOWN"} · authorization ${latest.authorizationState ?? "UNKNOWN"} · updated ${latest.updatedAt}`
              : "The ledger has no recent publish operation visible to this read model."}
          </p>
        </div>
        <div className="badge">AUTHORIZED ACTIONS ONLY</div>
      </section>

      {control.live.status !== "PASS" ? (
        <section className="notice warningNotice">
          <div>
            <strong>Live Etsy read unavailable</strong>
            <p>{control.live.error ?? "UNKNOWN"}</p>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="notice warningNotice">
          <div>
            <strong>Factory registry unavailable</strong>
            <p>{error}</p>
          </div>
        </section>
      ) : null}

      <section className="listingStack">
        {rows.map((row) => (
          <article className="listingCard" key={row.productId}>
            <div className="listingTop">
              <div>
                <p className="eyebrow">{row.productId}</p>
                <h2>{row.currentState ?? "STATE NOT AVAILABLE"}</h2>
                <p>Next: {row.nextExecutableStage ?? "COMPLETE"}</p>
              </div>
              <div className="badge">
                {row.blocker ? `BLOCKED · ${row.blocker.code}` : "READ ONLY"}
              </div>
            </div>
            <div className="metrics">
              <article className="metricCard">
                <span>Fingerprint</span>
                <strong>{row.fingerprint ?? "NOT AVAILABLE"}</strong>
              </article>
              {row.gates.map((gate) => (
                <article className="metricCard" key={gate.gateType}>
                  <span>{gate.gateType}</span>
                  <strong>{gate.status}</strong>
                </article>
              ))}
            </div>
            <p>
              Evidence: {row.evidenceIds.length ? row.evidenceIds.join(", ") : "NOT OBSERVED"}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
