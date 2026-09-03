import { getSalesControlCenterSnapshot } from "../../lib/etsy-sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function signalClass(value: string) {
  if (value.includes("PRESENT") || value === "VERIFIED") return "signal good";
  if (value.includes("LOW") || value.includes("NO_SALES")) return "signal warn";
  return "signal neutral";
}

export default async function SalesControlCenterPage() {
  try {
    const snapshot = await getSalesControlCenterSnapshot();

    return (
      <main className="shell salesShell">
        <section className="hero">
          <div>
            <p className="eyebrow">ETSY SALES CONTROL CENTER</p>
            <h1>Sell by evidence.</h1>
            <p className="lede">
              Live Etsy evidence reconciled against the exact six Listing IDs from
              the canonical Catalog identifier projection. No listing writes are
              performed from this screen.
            </p>
          </div>
          <div className="badge">READ ONLY · 6 LISTINGS</div>
        </section>

        <section className="metrics">
          <article className="metricCard">
            <span>Shop ID</span>
            <strong>{snapshot.shopId}</strong>
          </article>
          <article className="metricCard">
            <span>Exact Listings</span>
            <strong>{snapshot.exactListingCount}</strong>
          </article>
          <article className="metricCard">
            <span>Sales Scope</span>
            <strong>
              {snapshot.transactionScopeGranted ? "CONNECTED" : "RE-AUTH REQUIRED"}
            </strong>
          </article>
          <article className="metricCard">
            <span>Catalog</span>
            <strong>CANONICAL ID LOCK</strong>
          </article>
        </section>

        {snapshot.requiresReauthorization ? (
          <section className="notice warningNotice">
            <div>
              <p className="eyebrow">ONE-TIME ACTION</p>
              <h2>Re-authorize Etsy for sales evidence</h2>
              <p>
                The Sales Control Center now requests transactions_r so it can
                read sales transaction counts. It still performs no marketplace
                writes.
              </p>
            </div>
            <a className="connectButton" href="/api/etsy/oauth/start">
              Re-authorize Etsy
            </a>
          </section>
        ) : null}

        <section className="notice">
          <div>
            <p className="eyebrow">EVIDENCE BOUNDARY</p>
            <h2>Shop Stats are intentionally not invented.</h2>
            <p>
              Etsy Open API does not provide views, visits, search terms or CTR
              through the endpoints used here. Discovery and click-through stay
              UNKNOWN until Etsy Shop Stats evidence is supplied.
            </p>
          </div>
          <a className="connectButton" href="/stats-evidence">
            Capture Shop Stats
          </a>
        </section>

        <section className="listingStack">
          {snapshot.listings.map((listing) => (
            <article className="listingCard" key={listing.listingId}>
              <div className="listingTop">
                <div className="listingIdentity">
                  {listing.imageUrl ? (
                    <img
                      className="listingThumb"
                      src={listing.imageUrl}
                      alt=""
                    />
                  ) : (
                    <div className="listingThumb placeholder">NO IMAGE</div>
                  )}
                  <div>
                    <p className="eyebrow">{listing.productId}</p>
                    <h2>{listing.title ?? `Listing ${listing.listingId}`}</h2>
                    <p>
                      Etsy #{listing.listingId} · {listing.state ?? "UNKNOWN"}
                    </p>
                  </div>
                </div>
                <span className={`rootState ${listing.rootCauseState === "NOT_YET_CONFIRMED" ? "neutral" : "warn"}`}>
                  {listing.rootCauseState}
                </span>
              </div>

              <div className="listingMetrics">
                <div>
                  <span>Favorites</span>
                  <strong>{listing.favoriteCount ?? "UNKNOWN"}</strong>
                </div>
                <div>
                  <span>Transactions</span>
                  <strong>
                    {listing.transactionEvidence === "VERIFIED"
                      ? listing.transactionCount
                      : listing.transactionEvidence}
                  </strong>
                </div>
                <div>
                  <span>Tags</span>
                  <strong>{listing.tagCount}/13</strong>
                </div>
                <div>
                  <span>Images</span>
                  <strong>{listing.imageCount}</strong>
                </div>
                <div>
                  <span>Title words</span>
                  <strong>{listing.seoChecks.titleWordCount}</strong>
                </div>
              </div>

              <div className="funnelGrid">
                <div>
                  <span>Discovery</span>
                  <b className={signalClass(listing.funnel.discovery)}>
                    {listing.funnel.discovery}
                  </b>
                </div>
                <div>
                  <span>Click-through</span>
                  <b className={signalClass(listing.funnel.clickThrough)}>
                    {listing.funnel.clickThrough}
                  </b>
                </div>
                <div>
                  <span>Engagement</span>
                  <b className={signalClass(listing.funnel.engagement)}>
                    {listing.funnel.engagement}
                  </b>
                </div>
                <div>
                  <span>Conversion</span>
                  <b className={signalClass(listing.funnel.conversion)}>
                    {listing.funnel.conversion}
                  </b>
                </div>
              </div>

              <div className="diagnosis">
                <div>
                  <span>Root Cause Candidate</span>
                  <strong>{listing.rootCauseCandidate}</strong>
                </div>
                <p>{listing.priorityNextStep}</p>
              </div>

              <div className="tagRow">
                {listing.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>

              {listing.url ? (
                <a className="textLink" href={listing.url}>
                  Open Etsy listing
                </a>
              ) : null}
            </article>
          ))}
        </section>

        <section className="notice">
          <div>
            <p className="eyebrow">CANONICAL SOURCE</p>
            <h2>{snapshot.catalogSource.title}</h2>
            <p>
              Drive ID {snapshot.catalogSource.driveId}. The repository contains
              only a derived identifier projection, never Product Truth or an
              editable Catalog copy.
            </p>
          </div>
          <code>{snapshot.catalogSource.snapshotModifiedAt}</code>
        </section>
      </main>
    );
  } catch (error) {
    return (
      <main className="shell">
        <section className="hero">
          <div>
            <p className="eyebrow">ETSY SALES CONTROL CENTER</p>
            <h1>Runtime prerequisite blocked.</h1>
            <p className="lede">
              {error instanceof Error ? error.message : "UNKNOWN"}
            </p>
          </div>
          <div className="badge">READ ONLY · BLOCKED</div>
        </section>
        <section className="notice">
          <p>
            Finish encrypted Etsy token persistence and Shop Identity Test,
            then reload this page. Production listing writes remain disabled.
          </p>
        </section>
      </main>
    );
  }
}
