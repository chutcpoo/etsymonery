import type { ActiveListingsResult } from "../lib/etsy-active-listings";

export function EtsyListingList({ catalog }: { catalog: ActiveListingsResult }) {
  return <section className="listingStack">
    <div><h2>Etsy active listings (live read-only)</h2>
      <p>Separate from the local Factory product registry. No orders, revenue or listing changes.</p></div>
    {catalog.status !== "PASS" ? <article className="notice warningNotice"><p>Shop Manager reset baseline (26 Nov 2026, ICT, reported by the owner): 0 active listings.</p><p>Live listing details unavailable: {catalog.error}</p></article>
      : catalog.listings.length === 0 ? <article className="listingCard"><p>No active Etsy listings observed.</p></article>
      : catalog.listings.map(item => <article className="listingCard" key={item.listingId}>
          <p className="eyebrow">ETSY LISTING #{item.listingId}</p>
          <h3>{item.title}</h3>
          {item.url && <a className="textLink" href={item.url} target="_blank" rel="noopener noreferrer">View on Etsy</a>}
        </article>)}
    {catalog.status === "PASS" && <p>Observed at {catalog.observedAt} UTC. Refresh this page for a new observation.</p>}
  </section>;
}
