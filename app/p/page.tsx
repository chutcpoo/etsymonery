import type { Metadata } from "next";
import Link from "next/link";
import { getPublicCatalog } from "../../lib/public-product";
import styles from "./public-products.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PoonthaiDigital on Etsy",
  description: "Current active Etsy listings from PoonthaiDigital, read from the connected Etsy shop.",
  robots: { index: true, follow: true }
};

function PublicHeader() {
  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/p" aria-label="PoonthaiDigital products">
        <span className={styles.brandMark}>P</span>
        <span>PoonthaiDigital</span>
      </Link>
      <nav className={styles.desktopNav} aria-label="Main navigation">
        <Link className={styles.navLink} href="/p">Products</Link>
        <a className={styles.navCta} href="https://www.etsy.com/shop/PoonthaiDigital" rel="noopener noreferrer">
          Etsy Shop ↗
        </a>
      </nav>
      <details className={styles.mobileMenu}>
        <summary aria-label="Open menu">Menu</summary>
        <nav className={styles.mobileNav} aria-label="Mobile navigation">
          <Link href="/p">Products</Link>
          <a href="https://www.etsy.com/shop/PoonthaiDigital" rel="noopener noreferrer">Etsy Shop ↗</a>
        </nav>
      </details>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerBrand}>
        <span className={styles.brandMark}>P</span>
        <div>
          <strong>PoonthaiDigital</strong>
          <p>Current listing information is read from Etsy. Checkout and digital delivery remain on Etsy.</p>
        </div>
      </div>
      <div className={styles.footerLinks}>
        <Link href="/p">Products</Link>
        <a href="https://www.etsy.com/shop/PoonthaiDigital" rel="noopener noreferrer">Visit Etsy Shop ↗</a>
      </div>
    </footer>
  );
}

export default async function PublicProductIndexPage() {
  const catalog = await getPublicCatalog();
  const activeCount = catalog.status === "PASS" ? catalog.items.length : null;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <PublicHeader />

        <section className={styles.catalogHero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>PoonthaiDigital · Etsy catalog</p>
            <h1>Products</h1>
            <p className={styles.lede}>
              Current active Etsy listings from the connected shop. Product titles and listing identity are read-only.
            </p>
          </div>
          <div className={styles.heroStat} aria-label="Current catalog status">
            <span className={styles.statDot} aria-hidden="true" />
            <div>
              <strong>{activeCount ?? "—"}</strong>
              <span>active Etsy products</span>
            </div>
          </div>
        </section>

        {catalog.status === "PASS" ? (
          <section className={styles.catalogSection} aria-label="Active Etsy products">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Live catalog</p>
                <h2>Choose a product</h2>
              </div>
              <span>{catalog.items.length} listings</span>
            </div>

            <div className={styles.grid}>
              {catalog.items.map((item, index) => (
                <article
                  className={styles.card}
                  key={item.listingId}
                  data-analytics-product-id={item.productId}
                  data-analytics-listing-id={item.listingId}
                >
                  <div className={styles.cardTopline}>
                    <span className={styles.cardIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <span className={styles.liveBadge}>Live on Etsy</span>
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.productCode}>{item.productId}</p>
                    <h3>{item.title}</h3>
                    <p className={styles.cardListing}>Etsy listing #{item.listingId}</p>
                  </div>
                  <div className={styles.cardActions}>
                    <Link className={styles.cardButton} href={`/p/${item.listingId}`}>
                      View product
                    </Link>
                    <a className={styles.cardTextLink} href={item.etsyUrl} rel="noopener noreferrer">
                      Etsy ↗
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section className={styles.statusBox}>
            <p className={styles.eyebrow}>Temporarily unavailable</p>
            <h2>Live Etsy product data could not be refreshed.</h2>
            <p>Please use the Etsy shop link above while the read-only connection recovers.</p>
          </section>
        )}

        <PublicFooter />
      </div>
    </main>
  );
}
