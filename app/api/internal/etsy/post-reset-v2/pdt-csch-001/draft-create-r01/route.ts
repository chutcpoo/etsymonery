import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createListingFingerprint } from "../../../../../../../lib/candidate-fingerprint";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
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
const PRODUCT_ID = "PDT-CSCH-001";
const PRODUCT_VERSION = "V1";
const OPERATION_ID = "PDT-CSCH-001-V1-ETSY-DRAFT-CREATE-R01-20261003";
const AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-CSCH-001-V1-ETSY-DRAFT-CREATE-R01-20261003 EXACT SCOPE ONLY";
const PREPARED_CANDIDATE_FINGERPRINT =
  "20a8f340fb03a482fea246df15ef08a76b890e0639e4d570c234f18e2c5200f0";
const NONCE_SHA256 =
  "6617e0a79972c428b2c5c3965bdeea030c9788080ee5ff3769005a7104c29f22";

const EXISTING = Object.freeze([
  {
    listingId: 4579470012,
    state: "draft",
    title: "Bar Inventory Spreadsheet | Liquor Stock & Pour Cost Tracker"
  }
] as const);

const TAGS = Object.freeze([
  "cleaning schedule",
  "cleaning business",
  "cleaning checklist",
  "cleaning planner",
  "cleaner schedule",
  "maid schedule",
  "weekly cleaning",
  "monthly cleaning",
  "cleaning template",
  "cleaning spreadsheet",
  "cleaning tracker",
  "service schedule",
  "business template"
] as const);

const LISTING = Object.freeze({
  title:
    "Cleaning Schedule Template for Cleaning Business, Daily Weekly Monthly Cleaner Schedule, Editable Excel Cleaning Planner",
  description:
    "Run recurring cleaning work with a clearer system. This editable Cleaning Schedule Template is designed for solo cleaners, small cleaning teams, residential cleaning businesses and commercial cleaning businesses. Plan one task per row, choose frequency and due date, assign a cleaner or team, set priority and status, enter estimated minutes, and add notes. The built-in Dashboard and Reports summarize workload, completion, status, priority, estimated time and follow-up needs. The download includes a blank Template workbook, a completed 6-task Example workbook and a 10-page User Guide. Microsoft Excel Desktop is the primary intended environment. Excel Online and Google Sheets should be verified after opening or import. Digital download only; no physical item is shipped.",
  priceUsd: 5.9,
  tags: [...TAGS],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2026",
  taxonomy_id: 12476,
  type: "download",
  state: "draft"
});

const LISTING_FINGERPRINT = createListingFingerprint(LISTING);

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseJson(response: Response) {
  const body = await response.text();
  if (!body) return {};
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return {};
  }
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function nonceOk(value: string) {
  return secureEqual(
    createHash("sha256").update(value, "utf8").digest("hex"),
    NONCE_SHA256
  );
}

function runtimeCommit() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? "";
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

async function sellerState(token: string) {
  return getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token });
}

function baselineMatches(
  state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
) {
  if (
    state.total !== 1 ||
    state.counts.active !== 0 ||
    state.counts.draft !== 1 ||
    state.counts.inactive !== 0 ||
    state.counts.sold_out !== 0 ||
    state.counts.expired !== 0
  ) return false;

  const row = state.listings.find((x) => x.listingId === EXISTING[0].listingId);
  return Boolean(
    row &&
      row.state === EXISTING[0].state &&
      row.title === EXISTING[0].title &&
      !state.listings.some((x) => x.title === LISTING.title)
  );
}

function protectedFingerprint(
  state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
) {
  const payload = JSON.stringify({
    operationId: OPERATION_ID,
    preparedCandidateFingerprint: PREPARED_CANDIDATE_FINGERPRINT,
    listingFingerprint: LISTING_FINGERPRINT,
    counts: state.counts,
    listings: state.listings
      .map((x) => ({ listingId: x.listingId, state: x.state, title: x.title }))
      .sort((a, b) => a.listingId - b.listingId)
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

async function fetchListing(token: string, listingId: number) {
  const response = await fetch(
    `https://api.etsy.com/v3/application/listings/${listingId}`,
    { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" }
  );
  if (!response.ok) throw new Error(`CSCH_READBACK_HTTP_${response.status}`);
  const value = await parseJson(response);
  if (!isRec(value)) throw new Error("CSCH_READBACK_INVALID");
  return value;
}

async function createDraft(token: string) {
  const body = new URLSearchParams({
    quantity: String(LISTING.quantity),
    title: LISTING.title,
    description: LISTING.description,
    price: LISTING.priceUsd.toFixed(2),
    who_made: LISTING.who_made,
    when_made: LISTING.when_made,
    taxonomy_id: String(LISTING.taxonomy_id),
    type: LISTING.type,
    tags: LISTING.tags.join(",")
  });

  const response = await fetch(
    `https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings`,
    {
      method: "POST",
      headers: {
        ...etsyApiHeaders(token),
        "content-type": "application/x-www-form-urlencoded"
      },
      body,
      cache: "no-store"
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`CSCH_DRAFT_CREATE_REJECTED_${response.status}_${detail.slice(0, 300)}`);
  }
  const payload = await parseJson(response);
  const listingId = isRec(payload) ? Number(payload.listing_id) : NaN;
  if (!Number.isSafeInteger(listingId) || listingId <= 0) {
    throw new Error("CSCH_DRAFT_CREATE_RECEIPT_INVALID");
  }
  return listingId;
}

export async function GET() {
  // BLOCKER 1 — CENTRAL BUILD GATE (verifies plan approval; LEGACY_EXEMPT passes through)
  const _buildGateBlock = await enforceBuildGateForRoute("PDT-CSCH-001", "CSCH_001_DRAFT_CREATE_R01");
  if (_buildGateBlock) return _buildGateBlock;

  try {
    const token = await getValidEtsyAccessToken();
    const state = await sellerState(token);
    const matches = baselineMatches(state);
    return NextResponse.json(
      {
        status: matches ? "PROTECTED_STATE_MATCH" : "PROTECTED_STATE_MISMATCH",
        mode: "METADATA_ONLY_DRAFT_CREATE",
        operationId: OPERATION_ID,
        productId: PRODUCT_ID,
        productVersion: PRODUCT_VERSION,
        preparedCandidateFingerprint: PREPARED_CANDIDATE_FINGERPRINT,
        listingFingerprint: LISTING_FINGERPRINT,
        protectedStateFingerprint: protectedFingerprint(state),
        productionCommit: runtimeCommit(),
        counts: state.counts,
        total: state.total,
        listingIds: state.listings.map((x) => x.listingId).sort((a, b) => a - b),
        priceUsd: LISTING.priceUsd,
        publishAuthorized: false,
        imageUploadAuthorized: false,
        buyerFileUploadAuthorized: false,
        videoUploadAuthorized: false,
        ETSY_WRITE_COUNT: 0
      },
      { status: matches ? 200 : 409 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "PROTECTED_STATE_BLOCKED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        ETSY_WRITE_COUNT: 0
      },
      { status: 409 }
    );
  }
}

export async function POST(request: Request) {
  // BLOCKER 1 — CENTRAL BUILD GATE (verifies plan approval; LEGACY_EXEMPT passes through)
  const _buildGateBlock = await enforceBuildGateForRoute("PDT-CSCH-001", "CSCH_001_DRAFT_CREATE_R01_POST");
  if (_buildGateBlock) return _buildGateBlock;

  try {
    const body = await request.json();
    if (!isRec(body)) throw new Error("INVALID_BODY");

    const authorizationText =
      typeof body.authorizationText === "string" ? body.authorizationText.trim() : "";
    const nonce = typeof body.nonce === "string" ? body.nonce.trim() : "";
    const candidateFingerprint =
      typeof body.candidateFingerprint === "string"
        ? body.candidateFingerprint.trim().toLowerCase()
        : "";
    const suppliedProtected =
      typeof body.protectedStateFingerprint === "string"
        ? body.protectedStateFingerprint.trim().toLowerCase()
        : "";
    const productionCommit =
      typeof body.productionCommit === "string"
        ? body.productionCommit.trim().toLowerCase()
        : "";

    if (!secureEqual(authorizationText, AUTHORIZATION_TEXT))
      throw new Error("AUTHORIZATION_TEXT_MISMATCH");
    if (!nonceOk(nonce)) throw new Error("AUTHORIZATION_NONCE_MISMATCH");
    if (!secureEqual(candidateFingerprint, PREPARED_CANDIDATE_FINGERPRINT))
      throw new Error("CANDIDATE_FINGERPRINT_MISMATCH");
    if (!productionCommit || !secureEqual(productionCommit, runtimeCommit()))
      throw new Error("PRODUCTION_COMMIT_MISMATCH");

    const token = await getValidEtsyAccessToken();
    const before = await sellerState(token);
    if (!baselineMatches(before)) throw new Error("PROTECTED_STATE_DRIFT");
    const actualProtected = protectedFingerprint(before);
    if (!secureEqual(suppliedProtected, actualProtected))
      throw new Error("PROTECTED_STATE_FINGERPRINT_MISMATCH");

    const listingId = await createDraft(token);
    const detail = await fetchListing(token, listingId);
    const identity = verifyEtsyReadBackIdentity(
      LISTING_FINGERPRINT,
      toObservation(detail)
    );
    if (identity.status !== "MATCH" || detail.state !== "draft")
      throw new Error("DRAFT_READBACK_MISMATCH");

    const after = await sellerState(token);
    const existing = after.listings.find((x) => x.listingId === EXISTING[0].listingId);
    const created = after.listings.find((x) => x.listingId === listingId);
    if (
      after.total !== 2 ||
      after.counts.active !== 0 ||
      after.counts.draft !== 2 ||
      !existing ||
      existing.state !== "draft" ||
      existing.title !== EXISTING[0].title ||
      !created ||
      created.state !== "draft" ||
      created.title !== LISTING.title
    ) throw new Error("FINAL_SELLER_STATE_MISMATCH");

    return NextResponse.json({
      status: "DRAFT_CREATED_VERIFIED",
      operationId: OPERATION_ID,
      productId: PRODUCT_ID,
      productVersion: PRODUCT_VERSION,
      listingId,
      listingState: "draft",
      preparedCandidateFingerprint: PREPARED_CANDIDATE_FINGERPRINT,
      listingFingerprint: identity.actualFingerprint,
      title: LISTING.title,
      priceUsd: LISTING.priceUsd,
      counts: after.counts,
      total: after.total,
      publishAuthorized: false,
      imageUploadAuthorized: false,
      buyerFileUploadAuthorized: false,
      videoUploadAuthorized: false,
      ETSY_WRITE_COUNT: 1
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        publishAuthorized: false,
        ETSY_WRITE_COUNT: 0
      },
      { status: 409 }
    );
  }
}
