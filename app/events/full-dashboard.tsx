import { NeonEtsyEventRepository } from "../../lib/etsy-event-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dateTime(value: string | null) {
  if (!value) return "UNKNOWN";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Bangkok"
  }).format(new Date(value));
}

export default async function EventsPage() {
  try {
    const snapshot = await new NeonEtsyEventRepository().getSnapshot(50, null);
    const health = snapshot.health;
    return (
      <main className="shell salesShell">
        <section className="hero">
          <div>
            <p className="eyebrow">ETSY REAL-TIME EVENTS P1</p>
            <h1>Verified signals, no marketplace writes.</h1>
            <p className="lede">
              Signature-verified, replay-guarded Etsy order events with a
              PII-minimized persistent ledger and optional fresh receipt readback.
            </p>
          </div>
          <div className="badge">READ ONLY · {snapshot.status}</div>
        </section>

        <section className="metrics">
          <article className="metricCard"><span>Signing secret</span><strong>{health.webhookSigningSecretConfigured ? "YES" : "NO"}</strong></article>
          <article className="metricCard"><span>Events received</span><strong>{health.eventsReceived}</strong></article>
          <article className="metricCard"><span>Duplicates ignored</span><strong>{health.duplicateDeliveriesSafelyIgnored}</strong></article>
          <article className="metricCard"><span>Signature failures</span><strong>{health.signatureFailures}</strong></article>
          <article className="metricCard"><span>Readback failures</span><strong>{health.readbackFailures}</strong></article>
          <article className="metricCard"><span>ETSY_WRITE_COUNT</span><strong>{health.ETSY_WRITE_COUNT}</strong></article>
        </section>

        <section className="notice">
          <div>
            <p className="eyebrow">LAST VERIFIED ETSY EVENT</p>
            <h2>{dateTime(health.lastVerifiedEtsyEvent)}</h2>
            <p>Raw webhook payloads and Etsy receipt bodies are never stored.</p>
          </div>
          <div className="badge">BUYER PII EXCLUDED</div>
        </section>

        <section className="listingStack">
          {snapshot.events.length === 0 ? (
            <article className="listingCard">
              <h2>No verified Etsy events recorded yet.</h2>
              <p>The endpoint remains fail-closed until its signing secret and database migration are configured.</p>
            </article>
          ) : snapshot.events.map((event) => (
            <article className="listingCard" key={event.eventId}>
              <div className="listingTop">
                <div>
                  <p className="eyebrow">{dateTime(event.eventTimestamp)}</p>
                  <h2>{event.eventType}</h2>
                  <p>Receipt {event.receiptId ?? "NOT_AVAILABLE"}</p>
                </div>
                <div className="badge">{event.processingState}</div>
              </div>
              <div className="listingMetrics eventMetrics">
                <div><span>Listing IDs</span><strong>{event.listingIds.length ? event.listingIds.join(", ") : "NOT_AVAILABLE"}</strong></div>
                <div><span>Verification</span><strong>{event.verificationState}</strong></div>
                <div><span>Readback</span><strong>{event.readbackState}</strong></div>
                <div><span>Duplicates</span><strong>{event.duplicateCount}</strong></div>
                <div><span>Received</span><strong>{dateTime(event.receivedAt)}</strong></div>
              </div>
            </article>
          ))}
        </section>
      </main>
    );
  } catch {
    return (
      <main className="shell">
        <section className="hero">
          <div>
            <p className="eyebrow">ETSY REAL-TIME EVENTS P1</p>
            <h1>Event ledger unavailable.</h1>
            <p className="lede">Apply the safe database migration and configure the runtime signing secret. No Etsy write was attempted.</p>
          </div>
          <div className="badge">READ ONLY · BLOCKED</div>
        </section>
      </main>
    );
  }
}

