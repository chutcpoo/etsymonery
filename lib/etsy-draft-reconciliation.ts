import { etsyApiHeaders } from "./etsy";
import { fetchEtsyReadWithRetry, type EtsyReadRetryOptions } from "./etsy-http";

export const ETSY_DRAFT_RECONCILIATION_VERSION = "1.0.0" as const;
export const ETSY_DRAFT_RECONCILIATION_WRITE_COUNT = 0 as const;

const PAGE_LIMIT = 100;
const MAX_PAGES = 5;

type DraftListing = {
  listing_id?: number;
  shop_id?: number;
  title?: string;
  state?: string;
  price?: unknown;
  taxonomy_id?: number;
  quantity?: number;
  who_made?: string;
  when_made?: string;
  listing_type?: string;
  tags?: unknown;
  updated_timestamp?: number;
  url?: string;
};

type DraftListingsResponse = {
  count?: number;
  results?: DraftListing[];
  error?: string;
};

export type EtsyDraftSummary = {
  listingId: number;
  shopId: number | null;
  title: string | null;
  state: string | null;
  price: unknown;
  taxonomyId: number | null;
  quantity: number | null;
  whoMade: string | null;
  whenMade: string | null;
  listingType: string | null;
  tags: string[];
  updatedTimestamp: number | null;
  url: string | null;
};

type Dependencies = {
  fetchImpl?: typeof fetch;
  retryOptions?: EtsyReadRetryOptions;
};

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function summary(listing: DraftListing): EtsyDraftSummary | null {
  if (!Number.isSafeInteger(listing.listing_id) || Number(listing.listing_id) <= 0) {
    return null;
  }

  return {
    listingId: Number(listing.listing_id),
    shopId:
      Number.isSafeInteger(listing.shop_id) && Number(listing.shop_id) > 0
        ? Number(listing.shop_id)
        : null,
    title: typeof listing.title === "string" ? listing.title : null,
    state: typeof listing.state === "string" ? listing.state : null,
    price: listing.price ?? null,
    taxonomyId:
      Number.isSafeInteger(listing.taxonomy_id) && Number(listing.taxonomy_id) > 0
        ? Number(listing.taxonomy_id)
        : null,
    quantity:
      Number.isSafeInteger(listing.quantity) && Number(listing.quantity) >= 0
        ? Number(listing.quantity)
        : null,
    whoMade: typeof listing.who_made === "string" ? listing.who_made : null,
    whenMade: typeof listing.when_made === "string" ? listing.when_made : null,
    listingType:
      typeof listing.listing_type === "string" ? listing.listing_type : null,
    tags: asStringArray(listing.tags),
    updatedTimestamp:
      Number.isSafeInteger(listing.updated_timestamp) &&
      Number(listing.updated_timestamp) >= 0
        ? Number(listing.updated_timestamp)
        : null,
    url: typeof listing.url === "string" ? listing.url : null
  };
}

export async function getEtsyDraftListingSummaries(input: {
  shopId: number;
  accessToken: string;
  dependencies?: Dependencies;
}) {
  if (!Number.isSafeInteger(input.shopId) || input.shopId <= 0) {
    throw new Error("INVALID_ETSY_DRAFT_RECONCILIATION_SHOP_ID");
  }
  if (!input.accessToken.trim()) {
    throw new Error("ETSY_ACCESS_TOKEN_REQUIRED");
  }

  const fetchImpl = input.dependencies?.fetchImpl ?? fetch;
  const retryOptions = input.dependencies?.retryOptions ?? {};
  const drafts: EtsyDraftSummary[] = [];
  let providerCount: number | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_LIMIT;
    const response = await fetchEtsyReadWithRetry(
      fetchImpl,
      `https://api.etsy.com/v3/application/shops/${input.shopId}/listings?state=draft&limit=${PAGE_LIMIT}&offset=${offset}`,
      {
        method: "GET",
        headers: etsyApiHeaders(input.accessToken),
        cache: "no-store"
      },
      retryOptions
    );

    let payload: DraftListingsResponse;
    try {
      payload = (await response.json()) as DraftListingsResponse;
    } catch {
      throw new Error(`ETSY_DRAFT_RECONCILIATION_INVALID_JSON:${response.status}`);
    }

    if (!response.ok || !Array.isArray(payload.results)) {
      throw new Error(
        payload.error ?? `ETSY_DRAFT_RECONCILIATION_HTTP_${response.status}`
      );
    }

    if (providerCount === null && Number.isSafeInteger(payload.count)) {
      providerCount = Number(payload.count);
    }

    for (const item of payload.results) {
      const normalized = summary(item);
      if (!normalized) continue;
      if (normalized.shopId !== null && normalized.shopId !== input.shopId) {
        throw new Error("ETSY_DRAFT_RECONCILIATION_SHOP_ID_MISMATCH");
      }
      drafts.push(normalized);
    }

    if (payload.results.length < PAGE_LIMIT) break;
    if (providerCount !== null && drafts.length >= providerCount) break;
  }

  return {
    status: "PASS" as const,
    mode: "READ_ONLY" as const,
    ETSY_WRITE_COUNT: ETSY_DRAFT_RECONCILIATION_WRITE_COUNT,
    shopId: input.shopId,
    providerCount,
    returnedCount: drafts.length,
    truncated:
      providerCount !== null ? drafts.length < providerCount : drafts.length >= PAGE_LIMIT * MAX_PAGES,
    drafts
  };
}
