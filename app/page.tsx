import { getControlCenterV3Snapshot } from "../lib/control-center-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const setup = [
  ["1", "Connect your Etsy shop", "Securely connect your shop to bring listings and sales signals into one workspace.", "/connect/etsy", "Connect Etsy"],
  ["2", "Add your first product", "Create a product workspace and keep files, listing details and readiness checks organized.", "/factory", "Open Products"],
  ["3", "Check listing readiness", "Review images, copy, tags, pricing and release checks before anything goes live.", "/factory", "Run checks"],
  ["4", "Track what sells", "Use sales, order and shop-stat evidence to decide what to improve next.", "/sales", "View performance"]
];

const benefits = [
  ["Organize products", "Keep every digital product moving through a clear preparation and review process."],
  ["Prepare better listings", "See listing readiness and quality checks before publishing to your shop."],
  ["Understand performance", "Bring sales, orders and shop evidence together without mixing it with product source data."],
  ["Publish with control", "Marketplace changes stay locked until you explicitly authorize the exact action."]
];

export default async function Home() {
  const control = await getControlCenterV3Snapshot();
  const attention = control.operations.needsAttention.length;
  const connected = control.live.status === "PASS";

  return (
    <main className="saasShell">
      <header className="saasNav">
        <a className="brandMark" href="/"><span className="brandIcon">P</span><span><strong>PoonthaiDigital</strong><small>Seller Workspace</small></span></a>
        <nav className="navLinks" aria-label="Primary navigation"><a href="/factory">Products</a><a href="/sales">Listings</a><a href="/commerce">Orders</a><a href="/stats-evidence">Analytics</a></nav>
        <a className="outlineButton" href="/connect/etsy">{connected ? "Shop connected" : "Connect Etsy"}</a>
      </header>

      <section className="customerHero">
        <div>
          <span className="trustPill">Built for digital product sellers</span>
          <h1>Your Etsy seller command center.</h1>
          <p>Plan products, prepare stronger listings, check quality, understand sales and keep publishing decisions under your control.</p>
          <div className="heroActions"><a className="primaryButton" href="/connect/etsy">{connected ? "View Etsy connection" : "Connect your Etsy shop"}</a><a className="secondaryButton" href="#getting-started">See how it works</a></div>
          <div className="microTrust"><span>✓ No automatic publishing</span><span>✓ Seller-authorized changes</span><span>✓ Read-first workflow</span></div>
        </div>
        <aside className="productMock">
          <div className="mockTop"><div><small>YOUR SHOP</small><strong>{connected ? "Connected" : "Setup in progress"}</strong></div><span className={connected ? "livePill" : "setupPill"}>{connected ? "LIVE DATA" : "GET STARTED"}</span></div>
          <div className="mockMetrics"><div><span>Active listings</span><strong>{control.live.activeCount ?? "—"}</strong></div><div><span>Products tracked</span><strong>{control.live.catalogTrackedCount}</strong></div></div>
          <div className="mockTask"><span>01</span><div><strong>Prepare products</strong><small>Files, listing details and quality checks</small></div><b>→</b></div>
          <div className="mockTask"><span>02</span><div><strong>Review before publishing</strong><small>Know what is ready and what needs attention</small></div><b>→</b></div>
          <div className="mockTask"><span>03</span><div><strong>Learn from sales</strong><small>Orders, revenue and shop evidence</small></div><b>→</b></div>
          <div className="safeStrip"><strong>Publishing protection</strong><span>Changes require your authorization</span></div>
        </aside>
      </section>

      <section className="valueStrip"><span>PRODUCTS</span><i>→</i><span>LISTING CHECKS</span><i>→</i><span>SALES</span><i>→</i><span>IMPROVEMENTS</span><i>→</i><span>CONTROLLED PUBLISHING</span></section>

      <section className="benefitSection">
        <div className="centerHeading"><p className="sellerEyebrow">ONE WORKSPACE</p><h2>Less tab switching. Clearer next steps.</h2><p>Designed around the day-to-day work of running a digital product shop.</p></div>
        <div className="benefitGrid">{benefits.map(([title,description],i)=><article key={title}><span>0{i+1}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>

      <section className="onboardingSection" id="getting-started">
        <div className="onboardingIntro"><p className="sellerEyebrow">GET STARTED</p><h2>Set up your seller workspace in four steps.</h2><p>Start read-only. Review your shop and product setup first. Publishing remains locked until you approve an exact marketplace action.</p><div className="securityNote"><strong>Safe by default</strong><span>This Preview does not expose a direct Etsy publish action.</span></div></div>
        <div className="setupList">{setup.map(([n,title,description,href,cta])=><article key={n}><span className="stepNumber">{n}</span><div><h3>{title}</h3><p>{description}</p></div><a href={href}>{cta} →</a></article>)}</div>
      </section>

      <section className="workspacePreview">
        <div className="sectionHeading"><div><p className="sellerEyebrow">YOUR WORKSPACE</p><h2>Everything important, without the internal jargon.</h2></div><a className="textLink" href="/factory">Open workspace →</a></div>
        <div className="customerMetrics"><article><span>Active on Etsy</span><strong>{control.live.activeCount ?? "—"}</strong><small>currently live</small></article><article><span>Products tracked</span><strong>{control.live.catalogTrackedCount}</strong><small>in your workspace</small></article><article><span>Needs review</span><strong>{attention}</strong><small>items to check</small></article><article><span>Shop connection</span><strong>{connected ? "Connected" : "Check setup"}</strong><small>{connected ? "live shop data available" : "finish connection to continue"}</small></article></div>
        <div className="toolCards"><a href="/factory"><strong>Products</strong><span>Prepare products and check readiness.</span><b>Open →</b></a><a href="/sales"><strong>Listings</strong><span>Review live listing and sales signals.</span><b>Open →</b></a><a href="/commerce"><strong>Orders & revenue</strong><span>See order, fee and review evidence.</span><b>Open →</b></a><a href="/stats-evidence"><strong>Shop analytics</strong><span>Add shop stats Etsy does not expose here.</span><b>Open →</b></a></div>
      </section>

      <section className="ctaPanel"><div><p className="sellerEyebrow">READY TO START?</p><h2>Connect your shop. Keep publishing under your control.</h2><p>Explore the workspace with read-first seller tools before authorizing any marketplace change.</p></div><a className="primaryButton" href="/connect/etsy">{connected ? "Review Etsy connection" : "Connect Etsy shop"}</a></section>
      <footer className="sellerFooter"><strong>PoonthaiDigital Seller Workspace</strong><span>Seller tools for digital product operations</span></footer>
    </main>
  );
}
