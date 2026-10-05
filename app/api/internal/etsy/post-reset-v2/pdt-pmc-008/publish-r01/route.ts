import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { fetchEtsyReadWithRetry } from "../../../../../../../lib/etsy-http";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import {
  verifyEtsyReadBackIdentity,
  type EtsyReadBackObservation
} from "../../../../../../../lib/etsy-readback-normalizer";
import { getEtsySellerStateSnapshot } from "../../../../../../../lib/etsy-seller-state-reconciliation";

import { enforceBuildGateForRoute } from "../../../../../../../lib/product-creation-plan";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = 23582741;
const LISTING_ID = 4586179854;
const EXISTING_DRAFT_ID = 4579470012;
const EXPECTED_DRAFT_FINGERPRINT =
  "ed829603306698ed67cb56f9bcac9c226b0c7b05b1b09f7c4442187ee4521f29";
const AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-PMC-008-ETSY-PUBLISH-R01-20261001 LISTING-4586179854 ETSYCOM-ONLY NO-PATTERN EXACT SCOPE ONLY";
const GATE = "[GATE_PMC_PUBLISH_R01]";
const WRITE_HEADER = "x-autodigitalpublisher-write-token";

const EXPECTED_ACTIVE_IDS = Object.freeze([
  4578945050,
  4579068925,
  4580126260,
  4580303015,
  4581821318
] as const);

const EXPECTED_BUYER_FILES = Object.freeze([
  {
    rank: 1,
    name: "PDT-PMC-008_V1_Pricing_Margin_Calculator_R07.zip",
    size: 76582
  },
  {
    rank: 2,
    name: "PDT-PMC-008_V1_Quick_Start_Guide_FINAL.pdf",
    size: 29755
  }
] as const);

const EXPECTED_ALT_TEXTS = Object.freeze([
  "Small Business Pricing and Margin Calculator showing real workbook pricing outputs for break-even, markup, target-margin, and target-profit methods.",
  "Real demo dashboard showing saved products, pricing status counts, average margin, and estimated monthly profit.",
  "Settings worksheet showing editable planning assumptions for labor rate, fees, discount, target margin, target profit, overhead, and expected units.",
  "Real pricing output worksheet comparing break-even, markup, target-margin, and target-profit list prices side by side.",
  "Main pricing calculator showing buyer inputs on the left and calculated pricing outputs on the right in one worksheet.",
  "Cost library worksheet showing materials, suppliers, package costs, quantities, units, and calculated cost per unit.",
  "Products workflow showing product inputs and calculated comparison columns for cost, price, profit, margin, monthly profit, and status.",
  "Four-step workflow using real workbook screenshots: set assumptions, enter costs, compare pricing methods, and review the dashboard.",
  "What You Receive image showing CLEAN workbook, DEMO workbook, Quick Start PDF, Microsoft Excel plus Google Sheets compatibility, six sheets, and no macros.",
  "Product boundaries image explaining supported pricing planning and cost organization uses and excluded services such as financial advice, bank sync, ecommerce integration, automatic fee updates, and guaranteed results."
] as const);

const CHANNEL_SCOPE_UI_EVIDENCE = Object.freeze({
  verifiedOnDevice: "P001783",
  verifiedDate: "2026-10-01",
  etsyComChecked: true,
  patternChecked: false,
  noUnsavedChanges: true
});

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function txt(value: unknown) {
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}

function num(value: unknown) {
  return Number(value);
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function gateEnabled() {
  return (
    process.env.VERCEL_ENV === "production" &&
    (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").includes(GATE)
  );
}

function toObservation(value: Rec): EtsyReadBackObservation {
  return {
    title: value.title,
    description: value.description,
    price: value.price as EtsyReadBackObservation["price"],
    tags: value.tags,
    quantity: value.quantity,
    who_made: value.who_made,
    when_made: value.when_made,
    taxonomy_id: value.taxonomy_id,
    type: value.listing_type ?? value.type ?? "download",
    state: value.state
  };
}

async function readJson(url: string, token: string) {
  const response = await fetchEtsyReadWithRetry(fetch, url, {
    method: "GET",
    headers: etsyApiHeaders(token),
    cache: "no-store"
  });
  const bodyText = await response.text();
  let body: unknown = {};
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {}
  if (!response.ok || !isRec(body)) {
    throw new Error("PMC_PUBLISH_READ_HTTP_" + String(response.status));
  }
  return body;
}

async function collection(url: string, token: string) {
  const payload = await readJson(url, token);
  if (!Array.isArray(payload.results)) {
    throw new Error("PMC_PUBLISH_COLLECTION_INVALID");
  }
  return payload.results.filter(isRec);
}

function metadataSignature(listing: Rec) {
  const tags = Array.isArray(listing.tags) ? listing.tags.map(txt).sort() : [];
  const price = isRec(listing.price)
    ? {
        amount: num(listing.price.amount),
        divisor: num(listing.price.divisor),
        currency: txt(listing.price.currency_code)
      }
    : null;
  return createHash("sha256")
    .update(
      JSON.stringify({
        listingId: num(listing.listing_id),
        shopId: num(listing.shop_id),
        title: txt(listing.title),
        description: txt(listing.description),
        price,
        quantity: num(listing.quantity),
        whoMade: txt(listing.who_made),
        whenMade: txt(listing.when_made),
        taxonomyId: num(listing.taxonomy_id),
        type: txt(listing.listing_type ?? listing.type ?? "download"),
        tags
      }),
      "utf8"
    )
    .digest("hex");
}

function buyerFilesMatch(files: Rec[]) {
  const ordered = [...files].sort((a, b) => num(a.rank) - num(b.rank));
  if (ordered.length !== EXPECTED_BUYER_FILES.length) return false;
  return EXPECTED_BUYER_FILES.every((expected, index) => {
    const actual = ordered[index];
    return (
      num(actual.rank) === expected.rank &&
      txt(actual.filename) === expected.name &&
      num(actual.size_bytes) === expected.size
    );
  });
}

function galleryMatches(images: Rec[]) {
  const ordered = [...images].sort((a, b) => num(a.rank) - num(b.rank));
  if (ordered.length !== 10) return false;
  return ordered.every(
    (image, index) =>
      num(image.rank) === index + 1 &&
      num(image.full_width) === 2000 &&
      num(image.full_height) === 2000 &&
      txt(image.alt_text) === EXPECTED_ALT_TEXTS[index]
  );
}

function videoMatches(videos: Rec[]) {
  return (
    videos.length === 1 &&
    txt(videos[0].video_state).toLowerCase() === "active"
  );
}

async function readState() {
  const token = await getValidEtsyAccessToken();
  const listingBase =
    "https://api.etsy.com/v3/application/listings/" + String(LISTING_ID);
  const shopListingBase =
    "https://api.etsy.com/v3/application/shops/" +
    String(SHOP_ID) +
    "/listings/" +
    String(LISTING_ID);

  const [listing, images, files, videos, seller] = await Promise.all([
    readJson(listingBase, token),
    collection(listingBase + "/images", token),
    collection(shopListingBase + "/files", token),
    collection(listingBase + "/videos", token),
    getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token })
  ]);

  return { token, listing, images, files, videos, seller };
}

function sellerBaselineMatches(
  seller: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
) {
  if (
    seller.total !== 7 ||
    seller.counts.active !== 5 ||
    seller.counts.draft !== 2 ||
    seller.counts.inactive !== 0 ||
    seller.counts.sold_out !== 0 ||
    seller.counts.expired !== 0
  ) {
    return false;
  }

  const active = new Set(
    seller.listings
      .filter((item) => item.state === "active")
      .map((item) => item.listingId)
  );
  if (
    active.size !== EXPECTED_ACTIVE_IDS.length ||
    EXPECTED_ACTIVE_IDS.some((id) => !active.has(id))
  ) {
    return false;
  }

  return (
    seller.listings.some(
      (item) => item.listingId === LISTING_ID && item.state === "draft"
    ) &&
    seller.listings.some(
      (item) => item.listingId === EXISTING_DRAFT_ID && item.state === "draft"
    )
  );
}

function sellerAfterMatches(
  seller: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
) {
  if (
    seller.total !== 7 ||
    seller.counts.active !== 6 ||
    seller.counts.draft !== 1 ||
    seller.counts.inactive !== 0 ||
    seller.counts.sold_out !== 0 ||
    seller.counts.expired !== 0
  ) {
    return false;
  }

  const active = new Set(
    seller.listings
      .filter((item) => item.state === "active")
      .map((item) => item.listingId)
  );
  if (
    active.size !== EXPECTED_ACTIVE_IDS.length + 1 ||
    EXPECTED_ACTIVE_IDS.some((id) => !active.has(id)) ||
    !active.has(LISTING_ID)
  ) {
    return false;
  }

  return seller.listings.some(
    (item) => item.listingId === EXISTING_DRAFT_ID && item.state === "draft"
  );
}

function protectedOtherListingsUnchanged(
  before: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>,
  after: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
) {
  for (const original of before.listings) {
    if (original.listingId === LISTING_ID) continue;
    const current = after.listings.find(
      (item) => item.listingId === original.listingId
    );
    if (
      !current ||
      current.state !== original.state ||
      current.title !== original.title
    ) {
      return false;
    }
  }
  return true;
}

function protectedSha(state: Awaited<ReturnType<typeof readState>>) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        listingId: LISTING_ID,
        draftFingerprint: EXPECTED_DRAFT_FINGERPRINT,
        metadataSignature: metadataSignature(state.listing),
        images: [...state.images]
          .sort((a, b) => num(a.rank) - num(b.rank))
          .map((item) => ({
            id: num(item.listing_image_id),
            rank: num(item.rank),
            width: num(item.full_width),
            height: num(item.full_height),
            altText: txt(item.alt_text)
          })),
        files: [...state.files]
          .sort((a, b) => num(a.rank) - num(b.rank))
          .map((item) => ({
            rank: num(item.rank),
            filename: txt(item.filename),
            size: num(item.size_bytes)
          })),
        videos: state.videos.map((item) => ({
          id: num(item.video_id),
          state: txt(item.video_state)
        })),
        seller: state.seller.listings
          .map((item) => ({
            id: item.listingId,
            state: item.state,
            title: item.title
          }))
          .sort((a, b) => a.id - b.id),
        channelScopeUiEvidence: CHANNEL_SCOPE_UI_EVIDENCE
      }),
      "utf8"
    )
    .digest("hex");
}

function preflight(state: Awaited<ReturnType<typeof readState>>) {
  const identity = verifyEtsyReadBackIdentity(
    EXPECTED_DRAFT_FINGERPRINT,
    toObservation(state.listing)
  );
  return {
    listingIdentityExact:
      identity.status === "MATCH" && txt(state.listing.state) === "draft",
    buyerFilesExact: buyerFilesMatch(state.files),
    galleryExact: galleryMatches(state.images),
    videoExact: videoMatches(state.videos),
    sellerBaselineExact: sellerBaselineMatches(state.seller)
  };
}

function allTrue(record: Record<string, boolean>) {
  return Object.values(record).every(Boolean);
}

export async function GET(request: Request) {
  // BLOCKER 1 — CENTRAL BUILD GATE (verifies plan approval; LEGACY_EXEMPT passes through)
  const _buildGateBlock = await enforceBuildGateForRoute("PDT-PMC-008", "PMC_008_PUBLISH_R01");
  if (_buildGateBlock) return _buildGateBlock;

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "plan";
    const state = await readState();

    if (action === "reconcile_readonly") {
      const active =
        txt(state.listing.state) === "active" &&
        buyerFilesMatch(state.files) &&
        galleryMatches(state.images) &&
        videoMatches(state.videos) &&
        sellerAfterMatches(state.seller);
      return NextResponse.json(
        {
          status: active
            ? "PMC_PUBLISH_R01_RECONCILED"
            : "PMC_PUBLISH_R01_RECONCILE_BLOCKED",
          mode: "READ_ONLY",
          listingId: LISTING_ID,
          listingState: txt(state.listing.state),
          imageCount: state.images.length,
          videoCount: state.videos.length,
          buyerFileCount: state.files.length,
          sellerCounts: state.seller.counts,
          channelScopeUiEvidence: CHANNEL_SCOPE_UI_EVIDENCE,
          publishGateEnabled: gateEnabled(),
          ETSY_WRITE_COUNT: 0
        },
        {
          status: active ? 200 : 409,
          headers: { "cache-control": "no-store" }
        }
      );
    }

    const checks = preflight(state);
    const ready = allTrue(checks);
    return NextResponse.json(
      {
        status: ready ? "PMC_PUBLISH_R01_READY" : "PMC_PUBLISH_R01_BLOCKED",
        mode: "PLAN_ONLY",
        listingId: LISTING_ID,
        listingState: txt(state.listing.state),
        protectedSha256: protectedSha(state),
        checks,
        sellerCounts: state.seller.counts,
        total: state.seller.total,
        buyerFileCount: state.files.length,
        imageCount: state.images.length,
        videoCount: state.videos.length,
        channelScopeUiEvidence: CHANNEL_SCOPE_UI_EVIDENCE,
        authorizationRequired: AUTHORIZATION_TEXT,
        publishGateEnabled: gateEnabled(),
        publishPerformed: false,
        patternPublicationPerformed: false,
        ETSY_WRITE_COUNT: 0
      },
      {
        status: ready ? 200 : 409,
        headers: { "cache-control": "no-store" }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "PMC_PUBLISH_R01_BLOCKED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        publishPerformed: false,
        ETSY_WRITE_COUNT: 0
      },
      { status: 409, headers: { "cache-control": "no-store" } }
    );
  }
}

export async function POST(request: Request) {
  // BLOCKER 1 — CENTRAL BUILD GATE (verifies plan approval; LEGACY_EXEMPT passes through)
  const _buildGateBlock = await enforceBuildGateForRoute("PDT-PMC-008", "PMC_008_PUBLISH_R01_POST");
  if (_buildGateBlock) return _buildGateBlock;

  let writes = 0;
  try {
    if (!gateEnabled()) throw new Error("PMC_PUBLISH_R01_GATE_DISABLED");

    const header =
      request.headers.get(WRITE_HEADER)?.normalize("NFC").trim() ?? "";
    if (!header || !secureEqual(header, AUTHORIZATION_TEXT)) {
      throw new Error("PMC_PUBLISH_R01_WRITE_TOKEN_INVALID");
    }

    const body = (await request.json()) as unknown;
    if (!isRec(body)) throw new Error("PMC_PUBLISH_R01_BODY_INVALID");

    const authorizationText = txt(body.authorizationText);
    if (!secureEqual(authorizationText, AUTHORIZATION_TEXT)) {
      throw new Error("PMC_PUBLISH_R01_AUTHORIZATION_INVALID");
    }

    const suppliedBaseline = txt(body.protectedSha256).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(suppliedBaseline)) {
      throw new Error("PMC_PUBLISH_R01_BASELINE_INVALID");
    }

    const before = await readState();
    const checks = preflight(before);
    if (!allTrue(checks)) {
      throw new Error("PMC_PUBLISH_R01_FRESH_PREFLIGHT_MISMATCH");
    }

    const actualBaseline = protectedSha(before);
    if (!secureEqual(actualBaseline, suppliedBaseline)) {
      throw new Error("PMC_PUBLISH_R01_PROTECTED_STATE_DRIFT");
    }

    const beforeMetadataSignature = metadataSignature(before.listing);

    const response = await fetch(
      "https://api.etsy.com/v3/application/shops/" +
        String(SHOP_ID) +
        "/listings/" +
        String(LISTING_ID),
      {
        method: "PATCH",
        headers: {
          ...etsyApiHeaders(before.token),
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ state: "active" }),
        cache: "no-store"
      }
    );

    writes = 1;
    if (response.status >= 500 || response.status === 429) {
      return NextResponse.json(
        {
          status: "RECONCILIATION_REQUIRED",
          error: "PMC_PUBLISH_R01_AMBIGUOUS_HTTP_" + String(response.status),
          authorizationConsumed: true,
          ETSY_WRITE_COUNT: 1
        },
        { status: 202, headers: { "cache-control": "no-store" } }
      );
    }
    if (!response.ok) {
      throw new Error("PMC_PUBLISH_R01_REJECTED_HTTP_" + String(response.status));
    }

    const after = await readState();
    const pass =
      txt(after.listing.state) === "active" &&
      metadataSignature(after.listing) === beforeMetadataSignature &&
      buyerFilesMatch(after.files) &&
      galleryMatches(after.images) &&
      videoMatches(after.videos) &&
      sellerAfterMatches(after.seller) &&
      protectedOtherListingsUnchanged(before.seller, after.seller);

    return NextResponse.json(
      {
        status: pass ? "PMC_PUBLISH_R01_PASS" : "RECONCILIATION_REQUIRED",
        listingId: LISTING_ID,
        listingState: pass ? "active" : txt(after.listing.state),
        sellerCounts: after.seller.counts,
        imageCount: after.images.length,
        videoCount: after.videos.length,
        buyerFileCount: after.files.length,
        channelScopeUiEvidence: CHANNEL_SCOPE_UI_EVIDENCE,
        protectedMetadataUnchanged:
          metadataSignature(after.listing) === beforeMetadataSignature,
        protectedListingsUnchanged: protectedOtherListingsUnchanged(
          before.seller,
          after.seller
        ),
        patternPublicationPerformed: false,
        authorizationConsumed: true,
        ETSY_WRITE_COUNT: 1
      },
      {
        status: pass ? 200 : 202,
        headers: { "cache-control": "no-store" }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: writes > 0 ? "RECONCILIATION_REQUIRED" : "BLOCKED_FAIL_CLOSED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        listingId: LISTING_ID,
        patternPublicationPerformed: false,
        ETSY_WRITE_COUNT: writes
      },
      {
        status: writes > 0 ? 202 : 409,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
