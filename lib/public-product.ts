import { cache } from "react";
import { ETSY_CHANNEL_INDEX } from "./catalog-channel-index";
import { getControlCenterV2Snapshot } from "./control-center-v2";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { getEtsyListingDetailEvidence } from "./etsy-listing-detail";
import { getStoredEtsyShopId } from "./token-store";

type JsonRecord = Record<string, unknown>;

export type PublicCatalogItem = {
  productId: string;
  listingId: number;
  title: string;
  etsyUrl: string;
};

export type PublicProduct = PublicCatalogItem & {
  state: "active";
  description: string;
  priceLabel: string | null;
  tags: string[];
  categoryPath: string[];
  isDigital: boolean | null;
  gallery: Array<{
    url: string;
    altText: string;
    width: number | null;
    height: number | null;
  }>;
  providerGeneratedAt: string | null;
};

export type PublicProductResult =
  | { status: "PASS"; product: PublicProduct }
  | { status: "NOT_FOUND"; reason: string }
  | { status: "BLOCKED"; reason: string };

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function trackedIdentity(listingId: number) {
  return ETSY_CHANNEL_INDEX.find((item) => item.listingId === listingId) ?? null;
}

export function formatEtsyMoney(value: unknown) {
  if (!isRecord(value)) return asString(value);
  const amount = asNumber(value.amount);
  const divisor = asNumber(value.divisor);
  const currency = asString(value.currency_code);
  if (amount == null || divisor == null || divisor <= 0 || !currency) return null;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency
    }).format(amount / divisor);
  } catch {
    return `${(amount / divisor).toFixed(2)} ${currency}`;
  }
}

function galleryFromEvidence(value: unknown, fallbackAlt: string) {
  if (!isRecord(value) || !Array.isArray(value.images)) return [];

  return value.images.flatMap((rawImage) => {
    if (!isRecord(rawImage)) return [];
    const urls = isRecord(rawImage.urls) ? rawImage.urls : {};
    const url =
      asString(urls.url_fullxfull) ??
      asString(urls.url_570xN) ??
      asString(urls.url_170x135);
    if (!url) return [];

    return [
      {
        url,
        altText: asString(rawImage.alt_text) ?? fallbackAlt,
        width: asNumber(rawImage.full_width),
        height: asNumber(rawImage.full_height)
      }
    ];
  });
}

function categoryPath(value: unknown) {
  if (!isRecord(value)) return [];
  return asStringArray(value.path);
}

export const getPublicCatalog = cache(async () => {
  const snapshot = await getControlCenterV2Snapshot();
  if (snapshot.live.status !== "PASS") {
    return {
      status: "BLOCKED" as const,
      reason: snapshot.live.error ?? "ETSY_LIVE_READ_UNAVAILABLE",
      items: [] as PublicCatalogItem[]
    };
  }

  const items = snapshot.live.listings
    .filter(
      (listing): listing is typeof listing & { productId: string } =>
        listing.catalogTracked && typeof listing.productId === "string"
    )
    .map((listing) => ({
      productId: listing.productId,
      listingId: listing.listingId,
      title: listing.title ?? `Etsy listing ${listing.listingId}`,
      etsyUrl: listing.url ?? `https://www.etsy.com/listing/${listing.listingId}`
    }))
    .sort((left, right) => left.productId.localeCompare(right.productId));

  return {
    status: "PASS" as const,
    reason: null,
    items
  };
});

export const getPublicProduct = cache(async (listingId: number): Promise<PublicProductResult> => {
  const identity = trackedIdentity(listingId);
  if (!identity) return { status: "NOT_FOUND", reason: "LISTING_NOT_IN_CANONICAL_CHANNEL_INDEX" };

  const shopId = await getStoredEtsyShopId();
  if (!shopId) return { status: "BLOCKED", reason: "ETSY_SHOP_ID_NOT_AVAILABLE" };

  try {
    const accessToken = await getValidEtsyAccessToken();
    const rawEvidence: unknown = await getEtsyListingDetailEvidence({
      listingId,
      shopId,
      headers: etsyApiHeaders(accessToken)
    });

    if (!isRecord(rawEvidence) || rawEvidence.status !== "PASS") {
      return { status: "BLOCKED", reason: "ETSY_LISTING_DETAIL_NOT_AVAILABLE" };
    }

    const listing = isRecord(rawEvidence.listing) ? rawEvidence.listing : {};
    if (asNumber(listing.listing_id) !== listingId || asNumber(listing.shop_id) !== shopId) {
      return { status: "BLOCKED", reason: "ETSY_LISTING_IDENTITY_MISMATCH" };
    }

    if (listing.state !== "active") {
      return { status: "NOT_FOUND", reason: "ETSY_LISTING_NOT_ACTIVE" };
    }

    const title = asString(listing.title) ?? `Etsy listing ${listingId}`;
    const description = asString(listing.description) ?? "";
    const gallery = galleryFromEvidence(rawEvidence.gallery, title);

    return {
      status: "PASS",
      product: {
        productId: identity.productId,
        listingId,
        title,
        state: "active",
        description,
        priceLabel: formatEtsyMoney(listing.price),
        tags: asStringArray(listing.tags),
        categoryPath: categoryPath(listing.category),
        isDigital:
          typeof listing.is_digital === "boolean" ? listing.is_digital : null,
        gallery,
        etsyUrl: `https://www.etsy.com/listing/${listingId}`,
        providerGeneratedAt: asString(rawEvidence.generatedAt)
      }
    };
  } catch (error) {
    return {
      status: "BLOCKED",
      reason: error instanceof Error ? error.message : "ETSY_PUBLIC_PRODUCT_READ_FAILED"
    };
  }
});
