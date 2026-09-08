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
      <Link className={styles.brand} href="/p">PoonthaiDigital</Link>
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
      <div>
        <strong>PoonthaiDigital</strong>
        <p>Current listing information is read from Etsy. Checkout and digital delivery remain on Etsy.</p>
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

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <PublicHeader />

        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Live Etsy catalog</p>
            <h1>Digital tools currently available from PoonthaiDigital.</h1>
          </div>
          <p className={styles.lede}>
            Product titles and active-listing identity on this page come from a fresh,
            read-only Etsy channel read. Checkout and fulfillment remain on Etsy.
          </p>
        </section>

        {catalog.status === "PASS" ? (
          <section className={styles.grid} aria-label="Active Etsy products">
            {catalog.items.map((item) => (
              <article className={styles.card} key={item.listingId}>
                <div className={styles.cardBody}>
                  <div className={styles.cardHeader}>
                    <p className={styles.eyebrow}>{item.productId}</p>
                    <span className={styles.liveBadge}>Live on Etsy</span>
                  </div>
                  <h2>{item.title}</h2>
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
