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

export default async function PublicProductIndexPage() {
  const catalog = await getPublicCatalog();

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <span className={styles.brand}>PoonthaiDigital</span>
          <a className={styles.backLink} href="https://www.etsy.com/shop/PoonthaiDigital">
            Etsy shop ↗
          </a>
        </div>

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
              <Link className={styles.card} href={`/p/${item.listingId}`} key={item.listingId}>
                <div>
                  <p className={styles.eyebrow}>{item.productId}</p>
                  <h2>{item.title}</h2>
                </div>
                <div className={styles.cardMeta}>
                  <span>Etsy #{item.listingId}</span>
                  <span>View product →</span>
                </div>
              </Link>
            ))}
          </section>
        ) : (
          <section className={styles.statusBox}>
            <p className={styles.eyebrow}>Temporarily unavailable</p>
            <h2>Live Etsy product data could not be refreshed.</h2>
            <p>Please use the Etsy shop link above while the read-only connection recovers.</p>
          </section>
        )}
      </div>
    </main>
  );
}
