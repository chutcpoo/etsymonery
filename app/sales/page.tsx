import { getControlCenterV2Snapshot } from "../../lib/control-center-v2";
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
    const [snapshot, control] = await Promise.all([
      getSalesControlCenterSnapshot(),
      getControlCenterV2Snapshot()
    ]);

    return (
      <main className="shell salesShell">
        <section className="hero">
          <div>
            <p className="eyebrow">ETSY SALES CONTROL CENTER V2</p>
            <h1>Sell by evidence.</h1>
            <p className="lede">
              Live Etsy channel state is shown separately from the canonical
              Catalog identifier projection. Deep diagnosis stays limited to
              catalog-tracked listings; live-only listings are never promoted to
              Product Truth by the UI.
            </p>
          </div>
          <div className="badge">
            READ ONLY · {control.live.activeCount ?? "?"} LIVE
          </div>
        </section>

        <section className="metrics">
          <article className="metricCard">
            <span>Shop ID</span>
            <strong>{control.live.shopId ?? snapshot.shopId}</strong>
          </article>
          <article className="metricCard">
            <span>Live active</span>
            <strong>{control.live.activeCount ?? "UNKNOWN"}</strong>
          </article>
          <article className="metricCard">
            <span>Catalog tracked</span>
            <strong>{control.live.catalogTrackedCount}</strong>
          </article>
          <article className="metricCard">
            <span>Live-only gap</span>
            <strong>{control.live.liveOnlyCount ?? "UNKNOWN"}</strong>
          </article>
          <article className="metricCard">
            <span>Sales scope</span>
            <strong>
              {snapshot.transactionScopeGranted ? "CONNECTED" : "RE-AUTH REQUIRED"}
            </strong>
          </article>
        </section>

        {snapshot.requiresReauthorization ? (
          <section className="notice warningNotice">
            <div>
              <p className="eyebrow">ONE-TIME ACTION</p>
              <h2>Re-authorize Etsy for sales evidence</h2>
              <p>
                The Sales Control Center requests transactions_r so it can read
                sales transaction counts. It performs no marketplace writes.
              </p>
            </div>
            <a className="connectButton" href="/api/etsy/oauth/start">
              Re-authorize Etsy
            </a>
          </section>
        ) : null}

        <section className="notice">
          <div>
            <p className="eyebrow">LIVE CHANNEL RECONCILIATION</p>
            <h2>
              {control.live.activeCount ?? "Unknown"} active Etsy listings · {control.live.catalogTrackedCount} catalog tracked
            </h2>
            <p>
              Listings outside the current canonical identifier projection remain
              LIVE ONLY until the Catalog projection is explicitly refreshed from
              Google Drive authority.
            </p>
          </div>
          <div className="badge">NO UI WRITES</div>
        </section>

        <section className="listingStack">
          {control.live.listings.map((listing) => (
            <article className="listingCard" key={`live-${listing.listingId}`}>
              <div className="listingTop">
                <div>
                  <p className="eyebrow">
                    {listing.catalogTracked
                      ? listing.productId
                      : "LIVE ONLY · NOT IN CATALOG PROJECTION"}
                  </p>
                  <h2>{listing.title ?? `Listing ${listing.listingId}`}</h2>
                  <p>
                    Etsy #{listing.listingId} · {listing.state ?? "UNKNOWN"}
                  </p>
                </div>
                <div className="badge">
                  {listing.catalogTracked ? "CATALOG TRACKED" : "LIVE ONLY"}
                </div>
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

        <section className="notice">
          <div>
            <p className="eyebrow">CATALOG-TRACKED DIAGNOSIS</p>
            <h2>{snapshot.exactListingCount} listings with canonical identifier projection</h2>
            <p>
              The detailed funnel diagnostics below remain bound to the exact
              read-only Product_ID ↔ Etsy Listing_ID projection from the canonical
              Catalog.
            </p>
          </div>
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
                <span
                  className={`rootState ${
                    listing.rootCauseState === "NOT_YET_CONFIRMED"
                      ? "neutral"
                      : "warn"
                  }`}
                >
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
            <p className="eyebrow">ETSY SALES CONTROL CENTER V2</p>
            <h1>Runtime prerequisite blocked.</h1>
            <p className="lede">
              {error instanceof Error ? error.message : "UNKNOWN"}
            </p>
          </div>
          <div className="badge">READ ONLY · BLOCKED</div>
        </section>
        <section className="notice">
          <p>
            Restore the read-only Etsy/Neon prerequisites and reload this page.
            Marketplace writes are never performed from the Sales dashboard.
          </p>
        </section>
      </main>
    );
  }
}
