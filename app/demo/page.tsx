"use client";

import { useState } from "react";
import "./demo.css";

const modules = [
  { icon: "◫", name: "Factory", description: "Product pipeline and quality gates", status: "Preview", value: "03" },
  { icon: "▥", name: "Sales", description: "Listings and sales insights", status: "Locked", value: "—" },
  { icon: "▤", name: "Commerce", description: "Orders, revenue and fees", status: "Locked", value: "—" },
  { icon: "◷", name: "Events", description: "Operational activity timeline", status: "Locked", value: "—" },
  { icon: "▦", name: "Shop Stats", description: "Store performance and analytics", status: "Locked", value: "—" },
  { icon: "◇", name: "Etsy Connection", description: "OAuth and permission overview", status: "Locked", value: "—" }
];
const initial = { name: "Digital Pricing Calculator", price: "29", cost: "7", quantity: "12" };
const money = (value: number) => Number.isFinite(value) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value) : "—";

export default function DemoPage() {
  const [form, setForm] = useState(initial);
  const [active, setActive] = useState("Overview");
  const price = Number(form.price);
  const cost = Number(form.cost);
  const quantity = Number(form.quantity);
  const valid = form.price.trim() !== "" && form.cost.trim() !== "" && form.quantity.trim() !== "" && [price,cost,quantity].every(Number.isFinite) && price >= 0 && cost >= 0 && Number.isInteger(quantity) && quantity >= 0;
  const gross = valid ? (price - cost) * quantity : NaN;
  const revenue = valid ? price * quantity : NaN;
  const margin = valid && price > 0 ? ((price - cost) / price) * 100 : NaN;
  const update = (key: keyof typeof initial, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  return <div className="demoApp">
    <aside className="demoSidebar" aria-label="Demo navigation">
      <div className="demoBrand"><span className="demoLogo">P</span><div><strong>PoonthaiDigital</strong><small>Publisher Studio</small></div></div>
      <div className="demoSideLabel">WORKSPACE</div>
      <nav className="demoNav">
        {["Overview", ...modules.map(m => m.name)].map((name, index) => <button key={name} type="button" className={active === name ? "selected" : ""} onClick={() => setActive(name)}><span aria-hidden="true">{index === 0 ? "▦" : modules[index-1].icon}</span>{name}{index !== 0 && <span className="demoNavLock" aria-label="Locked">·</span>}</button>)}
      </nav>
      <div className="demoSideBottom"><span className="demoStatusDot" /> Safe demo mode <small>Sample data · No Etsy access</small></div>
    </aside>
    <div className="demoMain">
      <header className="demoTopbar"><div><span className="demoBreadcrumb">Workspace</span><span className="demoSlash">/</span><strong>{active}</strong></div><div className="demoTopRight"><span className="demoLiveBadge">● Demo environment</span><span className="demoAvatar">PD</span></div></header>
      <main className="demoContent">
        <div className="demoHeading"><div><p className="demoKicker">YOUR WORKSPACE</p><h1>{active === "Overview" ? "Business overview" : active}</h1><p>Explore the product dashboard with editable sample data. No sign-in required.</p></div><span className="demoModeTag">PREVIEW ONLY</span></div>
        {active !== "Overview" && <div className="demoAlert" role="status"><strong>{active} is protected in production.</strong> This preview shows navigation only. Real data and actions require owner authentication.</div>}
        <div className="demoStats" aria-label="Sample financial summary">
          <article><div className="demoStatTop"><span>Sample revenue</span><span className="demoStatIcon">↗</span></div><strong>{money(revenue)}</strong><small>Calculated from sample inputs</small></article>
          <article><div className="demoStatTop"><span>Sample gross difference</span><span className="demoStatIcon">◇</span></div><strong>{money(gross)}</strong><small>Before fees and taxes</small></article>
          <article><div className="demoStatTop"><span>Gross margin</span><span className="demoStatIcon">◫</span></div><strong>{Number.isFinite(margin) ? margin.toFixed(1) + "%" : "—"}</strong><small>Illustrative only</small></article>
          <article><div className="demoStatTop"><span>Etsy live connection</span><span className="demoStatIcon">⌁</span></div><strong className="demoNotConnected">Not connected</strong><small>No live API calls</small></article>
        </div>
        <div className="demoWorkGrid">
          <section className="demoPanel"><div className="demoPanelHeader"><div><h2>Product sandbox</h2><p>Edit values to see calculations update instantly</p></div><span className="demoPill">Local only</span></div>
            <div className="demoFields">
              <label className="demoFull">Product name<input value={form.name} onChange={e=>update("name",e.target.value)} maxLength={100} placeholder="Product name" /></label>
              <label>Selling price (USD)<input type="number" min="0" step="0.01" value={form.price} onChange={e=>update("price",e.target.value)} /></label>
              <label>Cost per unit (USD)<input type="number" min="0" step="0.01" value={form.cost} onChange={e=>update("cost",e.target.value)} /></label>
              <label>Sample units<input type="number" min="0" step="1" value={form.quantity} onChange={e=>update("quantity",e.target.value)} /></label>
              <div className="demoFull demoCalculation"><span>Estimated gross difference</span><strong>{money(gross)}</strong><small>Excludes marketplace fees, advertising and tax</small></div>
              {!valid && <p className="demoValidation demoFull" role="alert">Enter non-negative prices and a whole-number unit count.</p>}
            </div>
            <button className="demoReset" type="button" onClick={()=>setForm(initial)}>↺ Reset sample</button>
          </section>
          <section className="demoPanel"><div className="demoPanelHeader"><div><h2>Workspace modules</h2><p>Production access remains restricted</p></div></div>
            <div className="demoModuleList">{modules.map(m=><button key={m.name} type="button" onClick={()=>setActive(m.name)} className="demoModule"><span className="demoModuleIcon">{m.icon}</span><span className="demoModuleText"><strong>{m.name}</strong><small>{m.description}</small></span><span className="demoModuleStatus">{m.status}</span></button>)}</div>
          </section>
        </div>
        <div className="demoFooter"><span>● Demo data only. Nothing is saved or published.</span><span>Production authentication and Etsy write controls remain enabled.</span></div>
      </main>
    </div>
  </div>;
}
