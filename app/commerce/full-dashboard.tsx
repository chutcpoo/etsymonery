import { getCommerceIntelligenceSnapshot } from "../../lib/etsy-commerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatMoneyTotals(values: Array<{ currency: string; amount: number }>) {
  if (values.length === 0) return "UNKNOWN";
  return values.map((value) => formatMoney(value.amount, value.currency)).join(" + ");
}

function formatPercent(value: number | null) {
  if (value == null) return "UNKNOWN";
  return `${Math.round(value * 100)}%`;
}

function formatDate(timestamp: number | null) {
  if (!timestamp) return "UNKNOWN";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok"
  }).format(new Date(timestamp * 1000));
}

export default async function CommercePage() {
  try {
    const snapshot = await getCommerceIntelligenceSnapshot(30);

    return (
      <main className="shell salesShell">
        <section className="hero">
          <div>
            <p className="eyebrow">ETSY COMMERCE INTELLIGENCE P0</p>
            <h1>Orders, money and reviews.</h1>
            <p className="lede">
              Read-only Etsy commerce evidence for the last {snapshot.period.days} days.
              Buyer names, emails and addresses are intentionally excluded from this view.
            </p>
          </div>
          <div className="badge">READ ONLY · {snapshot.status}</div>
        </section>

        {snapshot.authorization.requiresReauthorization ? (
          <section className="notice warningNotice">
            <div>
              <p className="eyebrow">OAUTH SCOPE</p>
              <h2>transactions_r is required for orders and money evidence.</h2>
              <p>Reviews can still be read, but receipts, payment details and ledger evidence remain blocked until Etsy is re-authorized.</p>
            </div>
            <a className="connectButton" href="/api/etsy/oauth/start">
              Re-authorize Etsy
            </a>
          </section>
        ) : null}

        {snapshot.errors.length > 0 ? (
          <section className="notice warningNotice">
            <div>
              <p className="eyebrow">PARTIAL EVIDENCE</p>
              <h2>Some Etsy read endpoints did not return a complete snapshot.</h2>
              <p>{snapshot.errors.join(" · ")}</p>
            </div>
          </section>
        ) : null}

        <section className="metrics">
          <article className="metricCard">
            <span>Orders</span>
            <strong>{snapshot.orderCount}</strong>
          </article>
          <article className="metricCard">
            <span>Units sold</span>
            <strong>{snapshot.unitsSold}</strong>
          </article>
          <article className="metricCard">
            <span>Gross</span>
            <strong>{formatMoneyTotals(snapshot.money.gross)}</strong>
          </article>
          <article className="metricCard">
            <span>Etsy fees</span>
            <strong>{formatMoneyTotals(snapshot.money.fees)}</strong>
          </article>
          <article className="metricCard">
            <span>Net</span>
            <strong>{formatMoneyTotals(snapshot.money.net)}</strong>
          </article>
          <article className="metricCard">
            <span>Payment coverage</span>
            <strong>{formatPercent(snapshot.paymentCoverage)}</strong>
          </article>
          <article className="metricCard">
            <span>Review sample</span>
            <strong>{snapshot.reviews.sampleCount}</strong>
          </article>
          <article className="metricCard">
            <span>Avg rating</span>
            <strong>{snapshot.reviews.averageRating?.toFixed(2) ?? "UNKNOWN"}</strong>
          </article>
          <article className="metricCard">
            <span>1–3 star</span>
            <strong>{snapshot.reviews.lowRatingCount}</strong>
          </article>
        </section>

        <section className="notice">
          <div>
            <p className="eyebrow">SOURCE COVERAGE</p>
            <h2>Evidence completeness is visible, not guessed.</h2>
            <p>
              Receipts {snapshot.sourceCoverage.receipts.returned}/{snapshot.sourceCoverage.receipts.apiCount} · Payment detail verified {snapshot.sourceCoverage.receiptPayments.verified}/{snapshot.sourceCoverage.receiptPayments.attempted} · Ledger {snapshot.sourceCoverage.ledger.returned}/{snapshot.sourceCoverage.ledger.apiCount} · Reviews {snapshot.sourceCoverage.reviews.returned}/{snapshot.sourceCoverage.reviews.apiCount}
            </p>
          </div>
          <div className="badge">ETSY_WRITE_COUNT = 0</div>
        </section>

        <section className="panel">
          <div>
            <p className="eyebrow">LISTING COMMERCE SIGNALS</p>
            <h2>Which listings are actually producing orders and reviews?</h2>
          </div>
          <div className="listingStack">
            {snapshot.listings.length === 0 ? (
              <article className="listingCard">
                <h3>No listing-level commerce evidence in this period.</h3>
              </article>
            ) : (
              snapshot.listings.map((listing) => (
                <article className="listingCard" key={listing.listingId}>
                  <div className="listingTop">
                    <div>
                      <p className="eyebrow">ETSY #{listing.listingId}</p>
                      <h2>{listing.title ?? `Listing ${listing.listingId}`}</h2>
                    </div>
                    <div className="badge">{listing.unitsSold} UNITS</div>
                  </div>
                  <div className="listingMetrics">
                    <div><span>Orders</span><strong>{listing.orderCount}</strong></div>
                    <div><span>Units</span><strong>{listing.unitsSold}</strong></div>
                    <div><span>Reviews</span><strong>{listing.reviewCount}</strong></div>
                    <div><span>Avg rating</span><strong>{listing.averageRating?.toFixed(2) ?? "UNKNOWN"}</strong></div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <div>
            <p className="eyebrow">RECENT ORDERS</p>
            <h2>PII-minimized order evidence</h2>
            <p>No buyer name, email or postal address is returned by this dashboard.</p>
          </div>
          <div className="listingStack">
            {snapshot.orders.slice(0, 20).map((order, index) => (
              <article className="listingCard" key={order.receiptId ?? `order-${index}`}>
                <div className="listingTop">
                  <div>
                    <p className="eyebrow">RECEIPT {order.receiptId ?? "UNKNOWN"}</p>
                    <h2>{order.status ?? "UNKNOWN"}</h2>
                    <p>{formatDate(order.createdTimestamp)}</p>
                  </div>
                  <div className="badge">{order.units} UNITS</div>
                </div>
                <div className="listingMetrics">
                  <div><span>Lines</span><strong>{order.lineCount}</strong></div>
                  <div><span>Total</span><strong>{order.total.amount != null && order.total.currency ? formatMoney(order.total.amount, order.total.currency) : "UNKNOWN"}</strong></div>
                  <div><span>Paid</span><strong>{order.wasPaid == null ? "UNKNOWN" : order.wasPaid ? "YES" : "NO"}</strong></div>
                  <div><span>Delivered</span><strong>{order.wasDelivered == null ? "UNKNOWN" : order.wasDelivered ? "YES" : "NO"}</strong></div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div>
            <p className="eyebrow">REVIEW WATCH</p>
            <h2>Recent public review evidence</h2>
          </div>
          <div className="listingStack">
            {snapshot.reviews.recent.length === 0 ? (
              <article className="listingCard"><h3>No reviews returned in this period.</h3></article>
            ) : (
              snapshot.reviews.recent.map((review, index) => (
                <article className="listingCard" key={`${review.listingId ?? "unknown"}-${review.createdTimestamp ?? index}`}>
                  <div className="listingTop">
                    <div>
                      <p className="eyebrow">ETSY #{review.listingId ?? "UNKNOWN"}</p>
                      <h2>{review.rating == null ? "Unrated" : `${review.rating}/5`}</h2>
                      <p>{formatDate(review.createdTimestamp)}</p>
                    </div>
                    <div className={`badge ${review.rating != null && review.rating <= 3 ? "warningNotice" : ""}`}>
                      {review.rating != null && review.rating <= 3 ? "ATTENTION" : "REVIEW"}
                    </div>
                  </div>
                  <p>{review.review || "No review text."}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <div>
            <p className="eyebrow">PAYMENT ACCOUNT LEDGER</p>
            <h2>Recent debit / credit evidence</h2>
            <p>{snapshot.sourceCoverage.ledger.amountSemantics}</p>
          </div>
          <div className="listingStack">
            {snapshot.ledger.recent.slice(0, 20).map((entry, index) => (
              <article className="listingCard" key={entry.entryId ?? `ledger-${index}`}>
                <div className="listingTop">
                  <div>
                    <p className="eyebrow">ENTRY {entry.entryId ?? "UNKNOWN"}</p>
                    <h2>{entry.description ?? entry.ledgerType ?? "Ledger entry"}</h2>
                    <p>{formatDate(entry.createdTimestamp)}</p>
                  </div>
                  <div className="badge">{entry.currency ?? "UNKNOWN"}</div>
                </div>
                <div className="listingMetrics">
                  <div><span>Amount minor units</span><strong>{entry.amountMinorUnits ?? "UNKNOWN"}</strong></div>
                  <div><span>Balance minor units</span><strong>{entry.balanceMinorUnits ?? "UNKNOWN"}</strong></div>
                  <div><span>Type</span><strong>{entry.ledgerType ?? "UNKNOWN"}</strong></div>
                  <div><span>Reference</span><strong>{entry.referenceType ?? "UNKNOWN"}</strong></div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="notice">
          <div>
            <p className="eyebrow">BOUNDARY</p>
            <h2>Evidence only. No automatic Etsy mutation.</h2>
            <p>
              This page can reveal sales, fee and review signals. Product Truth, SEO candidates and live marketplace changes remain owned by their existing governance gates.
            </p>
          </div>
          <a className="connectButton" href="/sales">Open Sales Dashboard</a>
        </section>
      </main>
    );
  } catch (error) {
    return (
      <main className="shell">
        <section className="hero">
          <div>
            <p className="eyebrow">ETSY COMMERCE INTELLIGENCE P0</p>
            <h1>Commerce evidence is blocked.</h1>
            <p className="lede">{error instanceof Error ? error.message : "UNKNOWN_ERROR"}</p>
          </div>
          <div className="badge">READ ONLY · BLOCKED</div>
        </section>
        <section className="notice warningNotice">
          <div>
            <h2>No Etsy write was attempted.</h2>
            <p>Resolve OAuth/shop identity first, then refresh this page.</p>
          </div>
          <a className="connectButton" href="/connect/etsy">Etsy connection</a>
        </section>
      </main>
    );
  }
}
