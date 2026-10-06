import { NextResponse, type NextRequest } from "next/server";
import { etsyApiHeaders } from "../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../../lib/etsy-seller-state-reconciliation";
import {
  DRAFT_CATALOG_04_15,
  type DraftProductSpec
} from "../../../../../../lib/batch-draft-catalog-04-15";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHOP_ID = 23582741;
const OPERATION_ID = "PDT-BATCH-DRAFT-CREATE-004-015-20261006" as const;
const AUTH_HEADER_VALUE = "AUTHORIZE_DRAFT_CREATION_04_15_NO_PUBLISH" as const;

// Exactly 3 protected active listings that must remain untouched at all times.
const PROTECTED_ACTIVE_LISTINGS = Object.freeze([
  {
    listingId: 4587646332,
    title: "Cleaning Business Schedule Template, Editable Excel Planner, Daily Weekly Monthly Tasks"
  },
  {
    listingId: 4588681044,
    title: "Professional Cleaning Checklist Template, Editable Excel & A4 PDF, Deep Clean, Move-In Move-Out, Quality Control"
  },
  {
    listingId: 4588738623,
    title: "Cleaning Service Proposal Template, Editable Excel & PDF, Commercial Bid System, Scope Matrix, 3-Tier Pricing"
  }
] as const);

type Rec = Record<string, unknown>;
function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function fetchListingWithRetry(
  token: string,
  listingId: number,
  maxAttempts = 3
): Promise<Rec | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`https://api.etsy.com/v3/application/listings/${listingId}`, {
      headers: etsyApiHeaders(token),
      cache: "no-store"
    });
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = res.headers.get("retry-after");
      let delayMs = Math.min(8000, 1000 * 2 ** (attempt - 1));
      if (retryAfter) {
        const parsed = Number(retryAfter);
        if (Number.isFinite(parsed) && parsed >= 0) delayMs = Math.min(8000, Math.ceil(parsed * 1000));
      }
      if (attempt < maxAttempts) {
        await sleep(delayMs);
        continue;
      }
    }
    if (!res.ok) throw new Error(`LISTING_READ_HTTP_${res.status}`);
    const data = await parseJson(res);
    return isRec(data) ? data : null;
  }
  return null;
}

async function getExistingShopDrafts(token: string): Promise<Array<{ listingId: number; title: string; state: string }>> {
  const res = await fetch(
    `https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings?state=draft&limit=100`,
    { headers: etsyApiHeaders(token), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`DRAFT_LIST_HTTP_${res.status}`);
  const data = await parseJson(res);
  if (!isRec(data) || !Array.isArray(data.results)) return [];
  return (data.results as Rec[])
    .map((r) => ({
      listingId: Number(r.listing_id),
      title: String(r.title ?? "").trim(),
      state: String(r.state ?? "")
    }))
    .filter((r) => Number.isSafeInteger(r.listingId) && r.listingId > 0);
}

function verifyBaselineSellerState(
  state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
): { ok: boolean; reason?: string } {
  const { counts, listings } = state;
  if (counts.inactive !== 0 || counts.sold_out !== 0 || counts.expired !== 0) {
    return { ok: false, reason: "UNEXPECTED_NON_ACTIVE_NON_DRAFT_STATES" };
  }
  if (counts.active !== 3) {
    return { ok: false, reason: `ACTIVE_COUNT_MISMATCH_EXPECTED_3_GOT_${counts.active}` };
  }
  for (const expected of PROTECTED_ACTIVE_LISTINGS) {
    const found = listings.find((l) => l.listingId === expected.listingId);
    if (!found) {
      return { ok: false, reason: `PROTECTED_LISTING_MISSING_${expected.listingId}` };
    }
    if (found.state !== "active") {
      return { ok: false, reason: `PROTECTED_LISTING_NOT_ACTIVE_${expected.listingId}` };
    }
    if (found.title !== expected.title) {
      return { ok: false, reason: `PROTECTED_LISTING_TITLE_DRIFT_${expected.listingId}` };
    }
  }
  return { ok: true };
}

async function createSingleDraftListing(token: string, spec: DraftProductSpec) {
  // Check if draft with exact title already exists (idempotency)
  const existingDrafts = await getExistingShopDrafts(token);
  const matched = existingDrafts.find((d) => d.title === spec.title);
  if (matched) {
    return {
      productId: spec.productId,
      listingId: matched.listingId,
      url: `https://www.etsy.com/listing/${matched.listingId}`,
      state: "draft",
      reconciled: true,
      reason: "EXACT_DRAFT_ALREADY_EXISTS",
      title: spec.title,
      priceUsd: spec.priceUsd
    };
  }

  // Create new draft
  const body = new URLSearchParams({
    quantity: String(spec.quantity),
    title: spec.title,
    description: spec.description,
    price: spec.priceUsd.toFixed(2),
    who_made: spec.whoMade,
    when_made: spec.whenMade,
    taxonomy_id: String(spec.taxonomyId),
    type: spec.type,
    state: spec.state, // STRICTLY "draft"
    tags: spec.tags.join(",")
  });

  let res: Response;
  try {
    res = await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings`, {
      method: "POST",
      headers: {
        ...etsyApiHeaders(token),
        "content-type": "application/x-www-form-urlencoded"
      },
      body,
      cache: "no-store"
    });
  } catch (netErr) {
    // On network error, check if listing was created
    await sleep(1000);
    const postDrafts = await getExistingShopDrafts(token);
    const retryMatch = postDrafts.find((d) => d.title === spec.title);
    if (retryMatch) {
      return {
        productId: spec.productId,
        listingId: retryMatch.listingId,
        url: `https://www.etsy.com/listing/${retryMatch.listingId}`,
        state: "draft",
        reconciled: true,
        reason: "POST_NETWORK_ERROR_RECONCILED",
        title: spec.title,
        priceUsd: spec.priceUsd
      };
    }
    throw new Error(`POST_NETWORK_ERROR:${netErr instanceof Error ? netErr.message : "UNKNOWN"}`);
  }

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") ?? 5);
    await sleep(Math.min(10000, retryAfter * 1000));
    // Re-check if draft exists after retry-after
    const postDrafts = await getExistingShopDrafts(token);
    const retryMatch = postDrafts.find((d) => d.title === spec.title);
    if (retryMatch) {
      return {
        productId: spec.productId,
        listingId: retryMatch.listingId,
        url: `https://www.etsy.com/listing/${retryMatch.listingId}`,
        state: "draft",
        reconciled: true,
        reason: "POST_429_RECONCILED",
        title: spec.title,
        priceUsd: spec.priceUsd
      };
    }
    throw new Error("ETSY_RATE_LIMIT_429");
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DRAFT_CREATE_FAILED_${res.status}:${errText.slice(0, 300)}`);
  }

  const payload = await parseJson(res);
  const createdId = isRec(payload) ? Number(payload.listing_id) : NaN;
  if (!Number.isSafeInteger(createdId) || createdId <= 0) {
    throw new Error("INVALID_CREATED_LISTING_ID_IN_RESPONSE");
  }

  // Readback verification
  await sleep(400);
  const readback = await fetchListingWithRetry(token, createdId);
  if (!readback) {
    throw new Error(`READBACK_404_FOR_CREATED_LISTING_${createdId}`);
  }
  if (String(readback.state) !== "draft") {
    throw new Error(`READBACK_STATE_NOT_DRAFT:${readback.state}`);
  }

  return {
    productId: spec.productId,
    listingId: createdId,
    url: `https://www.etsy.com/listing/${createdId}`,
    state: "draft",
    reconciled: false,
    reason: "CREATED_NEW",
    title: spec.title,
    priceUsd: spec.priceUsd
  };
}

export async function GET() {
  try {
    const token = await getValidEtsyAccessToken();
    const seller = await getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token });
    const baseline = verifyBaselineSellerState(seller);
    const drafts = await getExistingShopDrafts(token);

    return NextResponse.json(
      {
        status: "PREFLIGHT_PASS",
        mode: "READ_ONLY",
        operationId: OPERATION_ID,
        shopId: SHOP_ID,
        baselineVerification: baseline,
        counts: seller.counts,
        total: seller.total,
        protectedActiveListings: PROTECTED_ACTIVE_LISTINGS,
        existingDraftsCount: drafts.length,
        candidateProductsCount: DRAFT_CATALOG_04_15.length,
        candidateProducts: DRAFT_CATALOG_04_15.map((p) => ({
          productId: p.productId,
          title: p.title,
          priceUsd: p.priceUsd,
          tagsCount: p.tags.length,
          alreadyDraftOnEtsy: drafts.some((d) => d.title === p.title)
        })),
        noPublishEnforced: true,
        ETSY_WRITE_COUNT: 0
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: "PREFLIGHT_BLOCKED",
        error: err instanceof Error ? err.message : "UNKNOWN",
        ETSY_WRITE_COUNT: 0
      },
      { status: 409, headers: { "cache-control": "no-store" } }
    );
  }
}

export async function POST(request: NextRequest) {
  let writesCount = 0;
  try {
    // Authorization checks
    const opId = request.headers.get("x-operation-id")?.trim();
    const authAction = request.headers.get("x-auth-action")?.trim();

    if (opId !== OPERATION_ID) {
      throw new Error("INVALID_OPERATION_ID");
    }
    if (authAction !== AUTH_HEADER_VALUE) {
      throw new Error("INVALID_AUTH_ACTION_HEADER");
    }

    const token = await getValidEtsyAccessToken();

    // Baseline validation
    const beforeSeller = await getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token });
    const baseline = verifyBaselineSellerState(beforeSeller);
    if (!baseline.ok) {
      throw new Error(`BASELINE_SELLER_STATE_INVALID:${baseline.reason}`);
    }

    // Determine target products to process (all 12 by default, or single/range if filtered)
    let body: { productId?: string; range?: string } = {};
    try {
      body = (await request.json()) as { productId?: string; range?: string };
    } catch {
      // Body may be empty
    }

    const filterProductId = request.nextUrl.searchParams.get("productId") ?? body.productId;
    const filterRange = request.nextUrl.searchParams.get("range") ?? body.range;

    let targetCatalog = [...DRAFT_CATALOG_04_15];

    if (filterProductId) {
      const match = targetCatalog.filter(
        (p) => p.productId.toUpperCase() === filterProductId.trim().toUpperCase()
      );
      if (match.length === 0) {
        throw new Error(`PRODUCT_NOT_FOUND_IN_CATALOG:${filterProductId}`);
      }
      targetCatalog = match;
    } else if (filterRange) {
      // e.g. "04-07" or "08-11" or "12-15"
      const parts = filterRange.split("-").map((s) => Number(s.trim()));
      if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
        const [fromNum, toNum] = parts;
        targetCatalog = targetCatalog.filter((p) => {
          const pNum = Number(p.productId.split("-").pop());
          return pNum >= fromNum && pNum <= toNum;
        });
      }
    }

    const results: Array<{
      productId: string;
      listingId: number;
      url: string;
      state: string;
      reconciled: boolean;
      reason: string;
      title: string;
      priceUsd: number;
    }> = [];

    for (const spec of targetCatalog) {
      const res = await createSingleDraftListing(token, spec);
      results.push(res);
      if (!res.reconciled) {
        writesCount++;
      }
      // Gentle pacing to stay well within Etsy rate limits
      await sleep(350);
    }

    // Post-creation readback & verification
    const afterSeller = await getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token });
    const postBaseline = verifyBaselineSellerState(afterSeller);
    if (!postBaseline.ok) {
      throw new Error(`POST_ACTION_BASELINE_CORRUPTED:${postBaseline.reason}`);
    }

    return NextResponse.json(
      {
        status: "BATCH_DRAFTS_VERIFIED",
        operationId: OPERATION_ID,
        shopId: SHOP_ID,
        targetScope: `${targetCatalog[0]?.productId} to ${targetCatalog[targetCatalog.length - 1]?.productId}`,
        processedCount: results.length,
        createdCount: results.filter((r) => !r.reconciled).length,
        reconciledCount: results.filter((r) => r.reconciled).length,
        results,
        baselineActiveProtectedIntact: true,
        noPublishEnforced: true,
        sellerCounts: afterSeller.counts,
        total: afterSeller.total,
        ETSY_WRITE_COUNT: writesCount
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: writesCount > 0 ? "PARTIAL_WRITES_RECONCILIATION_REQUIRED" : "BLOCKED_FAIL_CLOSED",
        error: err instanceof Error ? err.message : "UNKNOWN",
        ETSY_WRITE_COUNT: writesCount
      },
      { status: writesCount > 0 ? 202 : 409, headers: { "cache-control": "no-store" } }
    );
  }
}
