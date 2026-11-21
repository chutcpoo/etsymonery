"use client";

import { useState } from "react";

const sections = [
  { title: "Factory", detail: "Product planning and quality checks", href: "/factory" },
  { title: "Sales", detail: "Listing and sales reporting", href: "/sales" },
  { title: "Commerce", detail: "Orders and revenue", href: "/commerce" },
  { title: "Events", detail: "Operational activity", href: "/events" },
  { title: "Shop Stats", detail: "Performance reporting", href: "/stats-evidence" },
  { title: "Etsy Connection", detail: "OAuth and permission status", href: "/connect/etsy" }
];

export default function DemoPage() {
  const [product, setProduct] = useState("Sample digital product");
  const [cost, setCost] = useState("5");
  const [price, setPrice] = useState("25");
  const margin = Number(price) - Number(cost);
  return <main className="shell">
    <section className="hero"><div>
      <p className="eyebrow">NO-LOGIN DEMO · SAMPLE DATA ONLY</p>
      <h1>PoonthaiDigital Publisher</h1>
      <p className="lede">Explore the interface without logging in. All edits below are temporary in this browser tab. No Etsy data, customer records, credentials, or production settings are loaded or changed.</p>
    </div><div className="badge">DEMO · NO LIVE ACCESS</div></section>
    <section className="notice"><div><h2>Try editing a sample product</h2>
      <p><label htmlFor="demo-product">Product name</label> <input id="demo-product" value={product} onChange={e => setProduct(e.target.value)} maxLength={100} /></p>
      <p><label htmlFor="demo-price">Example selling price (USD)</label> <input id="demo-price" type="number" min="0" max="1000000" value={price} onChange={e => setPrice(e.target.value)} /></p>
      <p><label htmlFor="demo-cost">Example cost (USD)</label> <input id="demo-cost" type="number" min="0" max="1000000" value={cost} onChange={e => setCost(e.target.value)} /></p>
      <p><strong>{product || "Untitled product"}</strong> · Sample gross difference: {Number.isFinite(margin) ? margin.toFixed(2) : "—"} USD (before fees and taxes)</p>
      <p>Refreshing this page resets these sample values. Nothing is saved to production.</p>
    </div></section>
    <section className="listingStack">{sections.map(item => <article className="listingCard" key={item.href}>
      <div className="listingTop"><div><h2>{item.title}</h2><p>{item.detail}</p></div><span className="badge">OWNER LOGIN REQUIRED</span></div>
    </article>)}</section>
    <section className="notice"><p>Production modules remain protected. This demo does not bypass operator authentication or enable Etsy write actions.</p></section>
  </main>;
}
