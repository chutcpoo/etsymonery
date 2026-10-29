import type { Metadata } from "next";
import {
  STUDIO_DRIVE_ROOT_ID,
  NEW_PRODUCT_TEMPLATE_ID,
  STUDIO_ETSY_CONNECTION,
  STUDIO_GITHUB_REPO,
  STUDIO_VERCEL_PROJECT,
  driveFileLink,
  driveFolderLink,
  getStudioReleaseBlockers,
  getStudioProjectSummary,
  studioProjects
} from "../../lib/digital-studio";

export const metadata: Metadata = {
  title: "Digital Products Studio | PoonthaiDigital",
  description: "Read-only Etsy product-development inventory and QA gates"
};

const steps = [
  "Source art + approve composition",
  "Save immutable originals to Drive",
  "Physical print test (A4; inspect line work)",
  "Prepare buyer PDF/ZIP + delivery evidence",
  "Approve listing copy, mockups, and policy",
  "Register and verify canonical Product Truth",
  "Tester PASS + independent Final QC PASS",
  "Exact Production Authorization",
  "Separate gated Etsy operation + readback"
];

export default function DigitalProductsStudio() {
  const summaries = getStudioProjectSummary();
  const images = summaries.reduce((total, product) => total + product.images, 0);
  const files = summaries.reduce((total, product) => total + product.savedFiles, 0);
  const styleApproved = summaries.reduce((total, product) => total + product.styleApproved, 0);

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">DIGITAL PRODUCTS STUDIO · INTERNAL INVENTORY</p>
          <h1>From artwork to<br />approved product.</h1>
          <p className="lede">
            A read-only view of creative assets in Google Drive, proposed product
            identities in GitHub, Vercel workflow, and Etsy handoff. This inventory
            is a verified snapshot, not a live Drive sync and not the canonical sales catalog.
          </p>
          <p><a className="textLink" href="/">← Back to Publisher</a></p>
        </div>
        <div className="badge">NOT FOR SALE · NO MARKETPLACE WRITES</div>
      </section>

      <section className="metrics">
        <article className="metricCard"><span>Studio products</span><strong>{summaries.length}</strong></article>
        <article className="metricCard"><span>Images tracked</span><strong>{images}</strong></article>
        <article className="metricCard"><span>Files verified in Drive</span><strong>{files}</strong></article>
        <article className="metricCard"><span>Style-approved</span><strong>{styleApproved} / {images}</strong></article>
      </section>

      <section className="notice warningNotice">
        <div>
          <p className="eyebrow">RELEASE GATE · CLOSED</p>
          <h2>Style approval is not print certification or permission to sell.</h2>
          <p>Each product must pass physical print checks, buyer-file QC, canonical Product Truth reconciliation, Tester, independent final QC and exact authorization before any Etsy write.</p>
        </div>
        <div className="badge">ETSY WRITE COUNT = 0</div>
      </section>

      <section className="panel">
        <div>
          <p className="eyebrow">FOUR-SERVICE ARCHITECTURE</p>
          <h2>One controlled workflow.</h2>
          <p>Source documents stay in Drive; approved application code stays in GitHub; Vercel runs the app; Etsy is an external channel reached only through the existing gated publisher.</p>
        </div>
        <div className="listingStack">
          <article className="listingCard"><strong>01 · Google Drive</strong><p>Artwork, QA evidence, registry and templates.</p><a className="textLink" href={driveFolderLink(STUDIO_DRIVE_ROOT_ID)} target="_blank" rel="noopener noreferrer">Open project Drive ↗</a></article>
          <article className="listingCard"><strong>02 · GitHub</strong><p>Versioned code and read-only studio manifest; review changes by PR.</p><a className="textLink" href={STUDIO_GITHUB_REPO} target="_blank" rel="noopener noreferrer">Open repository ↗</a></article>
          <article className="listingCard"><strong>03 · Vercel</strong><p>Preview first, test and inspect deployment before production approval.</p><a className="textLink" href={STUDIO_VERCEL_PROJECT} target="_blank" rel="noopener noreferrer">Open deployments ↗</a></article>
          <article className="listingCard"><strong>04 · Etsy</strong><p>Existing OAuth and controlled publisher; nothing in Studio creates a listing.</p><a className="textLink" href={STUDIO_ETSY_CONNECTION}>Inspect connection ↗</a></article>
        </div>
      </section>

      {studioProjects.map(project => {
        const blockers = getStudioReleaseBlockers(project);
        return (
          <section className="panel" key={project.id}>
            <div>
              <p className="eyebrow">{project.id} · {project.status.replaceAll("_", " ")}</p>
              <h2>{project.name}</h2>
              <p>{project.standard}</p>
              <p><strong>Canonical Catalog:</strong> NOT IMPORTED · <strong>Etsy listing:</strong> NONE</p>
              <p><strong>Drive snapshot verified:</strong> {project.snapshotVerifiedOn}</p>
              <p><a className="textLink" href={driveFolderLink(project.driveFolderId)} target="_blank" rel="noopener noreferrer">Open product Drive ↗</a></p>
              <p><a className="textLink" href={driveFileLink(project.registryFileId)} target="_blank" rel="noopener noreferrer">Image registry v1.0 ↗</a></p>
            </div>
            <div className="listingStack">
              {project.images.map(image => (
                <article className="listingCard" key={image.code}>
                  <div className="listingTop">
                    <div>
                      <p className="eyebrow">IMAGE {image.code}</p>
                      <h2>{image.name}</h2>
                      <p>{image.description}</p>
                    </div>
                    <div className="badge">STYLE APPROVED ONLY</div>
                  </div>
                  <p>Print test: <strong>NOT DONE</strong></p>
                  <p>{image.assets.map((asset, index) => (
                    <span key={asset.driveFileId}>
                      {index > 0 ? " · " : ""}
                      <a className="textLink" href={driveFileLink(asset.driveFileId)} target="_blank" rel="noopener noreferrer">{asset.kind}</a>
                    </span>
                  ))}</p>
                </article>
              ))}
              <article className="listingCard">
                <p className="eyebrow">RELEASE BLOCKERS · {blockers.length}</p>
                <h2>Not eligible for publisher intake</h2>
                <ol className="flow">
                  {blockers.map((blocker, index) => (
                    <li key={blocker}><span>{String(index + 1).padStart(2, "0")}</span>{blocker}</li>
                  ))}
                </ol>
              </article>
            </div>
          </section>
        );
      })}

      <section className="panel">
        <div>
          <p className="eyebrow">REUSABLE PIPELINE</p>
          <h2>Ready for product 002 and beyond.</h2>
          <p>Copy the existing Drive template for a future product, then add its own studio manifest record on a reviewed GitHub branch. Do not reuse another product's QC or approval evidence.</p>
          <a className="textLink" href={driveFolderLink(NEW_PRODUCT_TEMPLATE_ID)} target="_blank" rel="noopener noreferrer">Open new-product folder template ↗</a>
        </div>
        <ol className="flow">
          {steps.map((step, index) => (
            <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>
          ))}
        </ol>
      </section>

      <section className="notice">
        <div>
          <p className="eyebrow">DATA FRESHNESS</p>
          <h2>Manual registry snapshot · 29 Oct 2026</h2>
          <p>Drive URLs were verified when this snapshot was compiled. This page does not authenticate to Google Drive at runtime or sync Etsy shop state. The active commerce application remains separate.</p>
        </div>
      </section>
    </main>
  );
}
