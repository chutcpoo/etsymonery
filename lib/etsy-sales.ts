import {
  CANONICAL_CATALOG_SOURCE,
  ETSY_CHANNEL_INDEX
} from "./catalog-channel-index";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { getStoredEtsyShopId, loadEtsyTokens } from "./token-store";

type EtsyMoney = {
  amount?: number;
  divisor?: number;
  currency_code?: string;
};

type EtsyImage = {
  url_75x75?: string;
  url_170x135?: string;
  url_570xN?: string;
  url_fullxfull?: string;
};

type EtsyListing = {
  listing_id?: number;
  shop_id?: number;
  title?: string;
  description?: string;
  state?: string;
  url?: string;
  num_favorers?: number;
  tags?: string[];
  price?: EtsyMoney;
  images?: EtsyImage[];
  error?: string;
};

type EtsyListingsResponse = {
  count?: number;
  results?: EtsyListing[];
  error?: string;
};

type EtsyTransactions = {
  count?: number;
  results?: unknown[];
  error?: string;
};

export type FunnelSignal =
  | "UNKNOWN_SHOP_STATS_REQUIRED"
  | "NO_SALES_SIGNAL"
  | "SALES_SIGNAL_PRESENT"
  | "LOW_ENGAGEMENT_SIGNAL"
  | "ENGAGEMENT_SIGNAL_PRESENT"
  | "EVIDENCE_BLOCKED";

export type ListingDiagnosis = {
  productId: string;
  listingId: number;
  found: boolean;
  title: string | null;
  state: string | null;
  url: string | null;
  price: {
    amount: number | null;
    currency: string | null;
  };
  imageUrl: string | null;
  imageCount: number;
  tagCount: number;
  tags: string[];
  favoriteCount: number | null;
  transactionCount: number | null;
  transactionEvidence: "VERIFIED" | "AUTH_SCOPE_REQUIRED" | "API_ERROR";
  seoChecks: {
    usesAll13Tags: boolean;
    tagsWithin20Characters: boolean;
    duplicateTags: string[];
    titleWordCount: number;
    titleClarityReviewRecommended: boolean;
  };
  funnel: {
    discovery: FunnelSignal;
    clickThrough: FunnelSignal;
    engagement: FunnelSignal;
    conversion: FunnelSignal;
  };
  rootCauseState:
    | "EVIDENCE_BLOCKED"
    | "NOT_YET_CONFIRMED"
    | "EVIDENCE_SUPPORTED_CANDIDATE";
  rootCauseCandidate: string;
  priorityNextStep: string;
  evidenceNotes: string[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function moneyValue(money?: EtsyMoney) {
  if (!money || typeof money.amount !== "number") return null;
  const divisor = money.divisor || 100;
  return money.amount / divisor;
}

function normalizeScope(scope?: string) {
  return new Set(
    (scope ?? "")
      .split(/[ ,]+/)
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function titleWordCount(title?: string) {
  return (title ?? "").trim().split(/\s+/).filter(Boolean).length;
}

function duplicateTags(tags: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const tag of tags) {
    const normalized = tag.trim().toLocaleLowerCase();
    if (seen.has(normalized)) duplicates.add(tag);
    seen.add(normalized);
  }

  return [...duplicates];
}

async function fetchShopListings(
  accessToken: string,
  shopId: number
): Promise<{ listings: Map<number, EtsyListing>; error?: string }> {
  const response = await fetch(
    `https://api.etsy.com/v3/application/shops/${shopId}/listings?state=active&limit=100&includes=Images`,
    {
      method: "GET",
      headers: etsyApiHeaders(accessToken),
      cache: "no-store"
    }
  );

  const payload = (await response.json()) as EtsyListingsResponse;

  if (!response.ok || !Array.isArray(payload.results)) {
    return {
      listings: new Map(),
      error: payload.error ?? `ETSY_SHOP_LISTINGS_HTTP_${response.status}`
    };
  }

  const listings = new Map<number, EtsyListing>();

  for (const listing of payload.results) {
    if (listing.shop_id != null && listing.shop_id !== shopId) {
      return { listings: new Map(), error: "LISTING_SHOP_ID_MISMATCH" };
    }

    if (typeof listing.listing_id === "number") {
      listings.set(listing.listing_id, listing);
    }
  }

  return { listings };
}

async function fetchTransactionCount(
  accessToken: string,
  shopId: number,
  listingId: number
): Promise<{ count: number | null; state: "VERIFIED" | "API_ERROR" }> {
  const response = await fetch(
    `https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/transactions?limit=1`,
    {
      method: "GET",
      headers: etsyApiHeaders(accessToken),
      cache: "no-store"
    }
  );

  const payload = (await response.json()) as EtsyTransactions;

  if (!response.ok || typeof payload.count !== "number") {
    return { count: null, state: "API_ERROR" };
  }

  return { count: payload.count, state: "VERIFIED" };
}

function diagnose(
  productId: string,
  listingId: number,
  listing: EtsyListing | null,
  listingError: string | undefined,
  transactionCount: number | null,
  transactionEvidence: "VERIFIED" | "AUTH_SCOPE_REQUIRED" | "API_ERROR"
): ListingDiagnosis {
  if (!listing) {
    return {
      productId,
      listingId,
      found: false,
      title: null,
      state: null,
      url: null,
      price: { amount: null, currency: null },
      imageUrl: null,
      imageCount: 0,
      tagCount: 0,
      tags: [],
      favoriteCount: null,
      transactionCount,
      transactionEvidence,
      seoChecks: {
        usesAll13Tags: false,
        tagsWithin20Characters: false,
        duplicateTags: [],
        titleWordCount: 0,
        titleClarityReviewRecommended: false
      },
      funnel: {
        discovery: "EVIDENCE_BLOCKED",
        clickThrough: "EVIDENCE_BLOCKED",
        engagement: "EVIDENCE_BLOCKED",
        conversion: "EVIDENCE_BLOCKED"
      },
      rootCauseState: "EVIDENCE_BLOCKED",
      rootCauseCandidate: "LIVE_LISTING_RECONCILIATION_FAILED",
      priorityNextStep: "Resolve exact live listing identity before optimization.",
      evidenceNotes: [listingError ?? "LISTING_NOT_RETURNED_BY_API"]
    };
  }

  const tags = Array.isArray(listing.tags) ? listing.tags : [];
  const duplicates = duplicateTags(tags);
  const words = titleWordCount(listing.title);
  const titleReview = words > 15;
  const favorites =
    typeof listing.num_favorers === "number" ? listing.num_favorers : null;

  const seoGap =
    tags.length < 13 ||
    tags.some((tag) => tag.length > 20) ||
    duplicates.length > 0;
  const inactive = listing.state !== "active";

  const evidenceNotes = [
    "Views, visits, search terms and CTR are not exposed by the Etsy Open API v3 reference used by this build.",
    "No conversion rate is calculated without Etsy Shop Stats visits.",
    "A low-sales Root Cause is never confirmed from SEO fields alone."
  ];

  let rootCauseState: ListingDiagnosis["rootCauseState"] = "NOT_YET_CONFIRMED";
  let rootCauseCandidate = "SHOP_STATS_REQUIRED_FOR_FUNNEL_DIAGNOSIS";
  let priorityNextStep =
    "Collect Etsy Shop Stats views, visits and search terms before changing a major listing variable.";

  if (inactive) {
    rootCauseState = "EVIDENCE_SUPPORTED_CANDIDATE";
    rootCauseCandidate = "LISTING_NOT_ACTIVE";
    priorityNextStep = "Verify listing state and channel authorization before any optimization.";
  } else if (seoGap) {
    rootCauseState = "EVIDENCE_SUPPORTED_CANDIDATE";
    rootCauseCandidate = "ETSY_SEARCH_METADATA_GAP";
    priorityNextStep =
      "Review title/tags with ETSY GROWTH OS; do not patch until traffic evidence and Product Truth are reconciled.";
  } else if (titleReview) {
    rootCauseState = "EVIDENCE_SUPPORTED_CANDIDATE";
    rootCauseCandidate = "TITLE_CLARITY_REVIEW";
    priorityNextStep =
      "Review title clarity against current Etsy guidance; treat this as a candidate, not a proven sales cause.";
  }

  const engagement: FunnelSignal =
    favorites == null
      ? "UNKNOWN_SHOP_STATS_REQUIRED"
      : favorites === 0
        ? "LOW_ENGAGEMENT_SIGNAL"
        : "ENGAGEMENT_SIGNAL_PRESENT";

  const conversion: FunnelSignal =
    transactionEvidence !== "VERIFIED"
      ? "UNKNOWN_SHOP_STATS_REQUIRED"
      : (transactionCount ?? 0) > 0
        ? "SALES_SIGNAL_PRESENT"
        : "NO_SALES_SIGNAL";

  return {
    productId,
    listingId,
    found: true,
    title: listing.title ?? null,
    state: listing.state ?? null,
    url: listing.url ?? null,
    price: {
      amount: moneyValue(listing.price),
      currency: listing.price?.currency_code ?? null
    },
    imageUrl:
      listing.images?.[0]?.url_570xN ??
      listing.images?.[0]?.url_fullxfull ??
      null,
    imageCount: listing.images?.length ?? 0,
    tagCount: tags.length,
    tags,
    favoriteCount: favorites,
    transactionCount,
    transactionEvidence,
    seoChecks: {
      usesAll13Tags: tags.length === 13,
      tagsWithin20Characters: tags.every((tag) => tag.length <= 20),
      duplicateTags: duplicates,
      titleWordCount: words,
      titleClarityReviewRecommended: titleReview
    },
    funnel: {
      discovery: "UNKNOWN_SHOP_STATS_REQUIRED",
      clickThrough: "UNKNOWN_SHOP_STATS_REQUIRED",
      engagement,
      conversion
    },
    rootCauseState,
    rootCauseCandidate,
    priorityNextStep,
    evidenceNotes
  };
}

export async function getSalesControlCenterSnapshot() {
  const shopId = await getStoredEtsyShopId();
  if (!shopId) throw new Error("SHOP_IDENTITY_TEST_REQUIRED");

  const accessToken = await getValidEtsyAccessToken();
  const stored = await loadEtsyTokens();
  const grantedScopes = normalizeScope(stored?.scope);
  const transactionScopeGranted = grantedScopes.has("transactions_r");

  const listings: ListingDiagnosis[] = [];
  const listingBatch = await fetchShopListings(accessToken, shopId);

  for (const entry of ETSY_CHANNEL_INDEX) {
    const listing = listingBatch.listings.get(entry.listingId) ?? null;
    const listingError =
      listingBatch.error ??
      (listing ? undefined : "LISTING_NOT_RETURNED_BY_GET_LISTINGS_BY_SHOP");

    let transactionCount: number | null = null;
    let transactionEvidence:
      | "VERIFIED"
      | "AUTH_SCOPE_REQUIRED"
      | "API_ERROR" = "AUTH_SCOPE_REQUIRED";

    if (transactionScopeGranted && listing) {
      const transactionResult = await fetchTransactionCount(
        accessToken,
        shopId,
        entry.listingId
      );
      transactionCount = transactionResult.count;
      transactionEvidence = transactionResult.state;
      await sleep(230);
    }

    listings.push(
      diagnose(
        entry.productId,
        entry.listingId,
        listing,
        listingError,
        transactionCount,
        transactionEvidence
      )
    );
  }

  return {
    status: "PASS",
    mode: "READ_ONLY",
    generatedAt: new Date().toISOString(),
    shopId,
    exactListingCount: ETSY_CHANNEL_INDEX.length,
    listingAcquisition: {
      operation: "getListingsByShop",
      requestCount: 1,
      state: "active",
      limit: 100,
      includes: ["Images"]
    },
    catalogSource: CANONICAL_CATALOG_SOURCE,
    requestedPerformanceScope: "transactions_r",
    transactionScopeGranted,
    requiresReauthorization: !transactionScopeGranted,
    apiLimitations: {
      views: "NOT_AVAILABLE_FROM_OPEN_API",
      visits: "NOT_AVAILABLE_FROM_OPEN_API",
      searchTerms: "NOT_AVAILABLE_FROM_OPEN_API",
      clickThroughRate: "NOT_AVAILABLE_FROM_OPEN_API",
      conversionRate: "REQUIRES_SHOP_STATS_VISITS"
    },
    listings
  };
}
