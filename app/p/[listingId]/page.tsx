import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicProduct } from "../../../lib/public-product";
import styles from "../public-products.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ listingId: string }>;
};

function parseListingId(raw: string) {
  const listingId = Number(raw);
  return Number.isSafeInteger(listingId) && listingId > 0 ? listingId : null;
}

function metadataDescription(description: string, title: string) {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (!normalized) return title;
  return normalized.length <= 155 ? normalized : `${normalized.slice(0, 152).trimEnd()}…`;
}

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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { listingId: rawListingId } = await params;
  const listingId = parseListingId(rawListingId);
  if (!listingId) return { title: "Product not found · PoonthaiDigital" };

  const result = await getPublicProduct(listingId);
  if (result.status !== "PASS") {
    return {
      title: "Product unavailable · PoonthaiDigital",
      robots: { index: false, follow: true }
    };
  }

  const product = result.product;
  const primaryImage = product.gallery[0]?.url;
  return {
    title: `${product.title} · PoonthaiDigital`,
    description: metadataDescription(product.description, product.title),
    robots: { index: true, follow: true },
    openGraph: {
      title: product.title,
      description: metadataDescription(product.description, product.title),
      type: "website",
      images: primaryImage ? [{ url: primaryImage, alt: product.title }] : undefined
    }
  };
}

export default async function PublicProductPage({ params }: PageProps) {
  const { listingId: rawListingId } = await params;
  const listingId = parseListingId(rawListingId);
  if (!listingId) notFound();

  const result = await getPublicProduct(listingId);
  if (result.status === "NOT_FOUND") notFound();

  if (result.status === "BLOCKED") {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <PublicHeader />
          <section className={styles.statusBox}>
            <p className={styles.eyebrow}>Temporarily unavailable</p>
            <h1>This Etsy listing could not be refreshed right now.</h1>
            <p>The public page is read-only and does not fall back to stale or invented product data.</p>
          </section>
          <PublicFooter />
        </div>
      </main>
    );
  }

  const product = result.product;
  const primaryImage = product.gallery[0] ?? null;
  const previewImages = product.gallery.slice(1);

  return (
    <main className={`${styles.page} ${styles.productPage}`}>
      <div className={styles.shell}>
        <PublicHeader />

        <div className={styles.breadcrumbRow}>
          <Link className={styles.backLink} href="/p">← All products</Link>
          <span>Etsy #{product.listingId}</span>
        </div>

        <section
          className={styles.productHero}
          data-analytics-product-id={product.productId}
          data-analytics-listing-id={product.listingId}
        >
          <div className={styles.visualColumn}>
            {primaryImage ? (
              <div className={styles.primaryVisual}>
                <img
                  src={primaryImage.url}
                  alt={primaryImage.altText}
                  width={primaryImage.width ?? undefined}
                  height={primaryImage.height ?? undefined}
                  loading="eager"
                />
              </div>
            ) : (
              <div className={styles.statusBox}>Gallery temporarily unavailable from Etsy.</div>
            )}

            {previewImages.length > 0 ? (
              <div className={styles.previewSection}>
                <div className={styles.previewHeading}>
                  <span>More previews</span>
                  <span>{product.gallery.length} images</span>
                </div>
                <div className={styles.previewStrip} aria-label="Current Etsy listing gallery">
                  {previewImages.map((image, index) => (
                    <img
                      key={`${image.url}-${index}`}
                      src={image.url}
                      alt={image.altText}
                      width={image.width ?? undefined}
                      height={image.height ?? undefined}
                      loading="lazy"
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <aside className={styles.buyPanel}>
            <div className={styles.productIdentityRow}>
              <span className={styles.productCode}>{product.productId}</span>
              <span className={styles.liveBadge}>Live on Etsy</span>
            </div>
            <h1>{product.title}</h1>
            {product.priceLabel ? <p className={styles.price}>{product.priceLabel}</p> : null}

            <div className={styles.factGrid}>
              <div>
                <span>Type</span>
                <strong>{product.isDigital === false ? "Physical item" : "Digital item"}</strong>
              </div>
              <div>
                <span>Gallery</span>
                <strong>{product.gallery.length} images</strong>
              </div>
            </div>

            <a className={styles.cta} href={product.etsyUrl} rel="noopener noreferrer">
              View on Etsy ↗
            </a>
            <Link className={styles.secondaryCta} href="/p">Browse all products</Link>
            <p className={styles.finePrint}>
              Checkout, payment and digital delivery are completed on Etsy. This page mirrors current read-only listing information.
            </p>
          </aside>
        </section>

        <section className={styles.detailStack}>
          <div className={styles.panelCompact}>
            <p className={styles.eyebrow}>Listing details</p>
            <div className={styles.detailRows}>
              <div>
                <span>Listing</span>
                <strong>#{product.listingId}</strong>
              </div>
              {product.categoryPath.length > 0 ? (
                <div>
                  <span>Category</span>
                  <strong>{product.categoryPath.join(" → ")}</strong>
                </div>
              ) : null}
            </div>
            {product.tags.length > 0 ? (
              <div className={styles.tags} aria-label="Current Etsy tags">
                {product.tags.map((tag) => (
                  <span className={styles.tag} key={tag}>{tag}</span>
                ))}
              </div>
            ) : null}
          </div>

          <details className={styles.descriptionDisclosure}>
            <summary>
              <div>
                <p className={styles.eyebrow}>Current Etsy description</p>
                <strong>Read full listing description</strong>
              </div>
              <span aria-hidden="true">+</span>
            </summary>
            <div className={styles.description}>{product.description || "Description unavailable from Etsy."}</div>
          </details>
        </section>

        <PublicFooter />
      </div>

      <div
        className={styles.mobileStickyCta}
        data-analytics-product-id={product.productId}
        data-analytics-listing-id={product.listingId}
      >
        <div>
          <span className={styles.stickyLabel}>Etsy</span>
          {product.priceLabel ? <strong>{product.priceLabel}</strong> : null}
        </div>
        <a href={product.etsyUrl} rel="noopener noreferrer">View on Etsy ↗</a>
      </div>
    </main>
  );
}
