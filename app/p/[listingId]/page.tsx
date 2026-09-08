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
          <div className={styles.topbar}>
            <Link className={styles.brand} href="/p">PoonthaiDigital</Link>
            <Link className={styles.backLink} href="/p">← All products</Link>
          </div>
          <section className={styles.statusBox}>
            <p className={styles.eyebrow}>Temporarily unavailable</p>
            <h1>This Etsy listing could not be refreshed right now.</h1>
            <p>The public page is read-only and does not fall back to stale or invented product data.</p>
          </section>
        </div>
      </main>
    );
  }

  const product = result.product;

  return (
    <main
      className={styles.page}
      data-analytics-product-id={product.productId}
      data-analytics-listing-id={product.listingId}
    >
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <Link className={styles.brand} href="/p">PoonthaiDigital</Link>
          <Link className={styles.backLink} href="/p">← All products</Link>
        </div>

        <section className={styles.productHero}>
          <div className={styles.gallery} aria-label="Current Etsy listing gallery">
            {product.gallery.length > 0 ? (
              product.gallery.map((image, index) => (
                <img
                  key={`${image.url}-${index}`}
                  src={image.url}
                  alt={image.altText}
                  width={image.width ?? undefined}
                  height={image.height ?? undefined}
                  loading={index === 0 ? "eager" : "lazy"}
                />
              ))
            ) : (
              <div className={styles.statusBox}>Gallery temporarily unavailable from Etsy.</div>
            )}
          </div>

          <aside className={styles.buyPanel}>
            <p className={styles.eyebrow}>{product.productId} · Etsy #{product.listingId}</p>
            <h1>{product.title}</h1>
            {product.priceLabel ? <p className={styles.price}>{product.priceLabel}</p> : null}
            <a className={styles.cta} href={product.etsyUrl} rel="noopener noreferrer">
              View on Etsy
            </a>
            <p className={styles.finePrint}>
              Checkout, payment and digital delivery are completed on Etsy. This page mirrors current
              read-only listing information and does not modify the Etsy listing.
            </p>
          </aside>
        </section>

        <section className={styles.details}>
          <article className={styles.panel}>
            <p className={styles.eyebrow}>Current Etsy description</p>
            <h2>About this listing</h2>
            <div className={styles.description}>{product.description || "Description unavailable from Etsy."}</div>
          </article>

          <aside className={styles.panel}>
            <p className={styles.eyebrow}>Listing details</p>
            {product.categoryPath.length > 0 ? (
              <p>{product.categoryPath.join(" → ")}</p>
            ) : null}
            {product.isDigital != null ? <p>{product.isDigital ? "Digital item" : "Physical item"}</p> : null}
            {product.tags.length > 0 ? (
              <div className={styles.tags} aria-label="Current Etsy tags">
                {product.tags.map((tag) => (
                  <span className={styles.tag} key={tag}>{tag}</span>
                ))}
              </div>
            ) : null}
          </aside>
        </section>
      </div>
    </main>
  );
}
