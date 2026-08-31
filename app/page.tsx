const channels = [
  { name: "Etsy", status: "Planner ready", detail: "Draft payload + Product Truth Gate" },
  { name: "Gumroad", status: "Planner ready", detail: "Unpublished product payload" },
  { name: "Payhip", status: "Planner ready", detail: "Invisible product payload" }
];

const workflow = [
  "Product package",
  "Product Truth Gate",
  "Channel payloads",
  "Authorization boundary",
  "Marketplace adapter",
  "Audit result"
];

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">DIGITAL PRODUCT COMMERCE</p>
          <h1>AutoDigitalPublisher</h1>
          <p className="lede">
            One control center for turning verified digital products into safe,
            channel-specific publishing jobs.
          </p>
        </div>
        <div className="badge">V1.0 · ACTIVE BASELINE</div>
      </section>

      <section className="grid">
        {channels.map((channel) => (
          <article className="card" key={channel.name}>
            <div className="statusDot" />
            <h2>{channel.name}</h2>
            <strong>{channel.status}</strong>
            <p>{channel.detail}</p>
          </article>
        ))}
      </section>

      <section className="panel">
        <div>
          <p className="eyebrow">EXECUTION FLOW</p>
          <h2>Truth first. Publish second.</h2>
        </div>
        <ol className="flow">
          {workflow.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="panel compact">
        <div>
          <p className="eyebrow">API</p>
          <h2>POST /api/publish</h2>
          <p>Builds a validated multi-channel publish plan. Live marketplace writes are off by default.</p>
        </div>
        <code>GET /api/health</code>
      </section>
    </main>
  );
}
