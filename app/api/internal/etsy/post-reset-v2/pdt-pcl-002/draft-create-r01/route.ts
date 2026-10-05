import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createListingFingerprint } from "../../../../../../../lib/candidate-fingerprint";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "../../../../../../../lib/etsy-readback-normalizer";
import { getEtsySellerStateSnapshot } from "../../../../../../../lib/etsy-seller-state-reconciliation";

import { enforceBuildGateForRoute } from "../../../../../../../lib/product-creation-plan";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHOP_ID = 23582741;
const GATE = "[GATE_PCL_RELEASE_R01]";
const OPERATION_ID = "PDT-PCL-002-V1-ETSY-DRAFT-CREATE-R01-20261005";
const NONCE_SHA256 = "b830af18477cd3e6f0cadc42fa3174bd1fab54aa458c30dfefd079359c814855";

// Known target draft listing ID (may already exist from a prior run)
const TARGET_LISTING_ID = 4588681044;

const TITLE = "Professional Cleaning Checklist Template, Editable Excel & A4 PDF, Deep Clean, Move-In Move-Out, Quality Control";
const DESCRIPTION = [
  "Professional cleaning checklist template for cleaning businesses. Includes editable Excel workbooks, a separate fictional example workbook, an A4 printable checklist pack, and a User Guide. Built for routine residential cleaning, deep cleaning, move-in / move-out work, and internal quality-control review.",
  "",
  "WHAT YOU RECEIVE — EXACTLY 4 FILES",
  "1. Professional Cleaning Checklist Template - Premium Final.xlsx — 11 sheets; blank reusable working pages",
  "2. Professional Cleaning Checklist Example - Premium Final.xlsx — 12 sheets; fictional entries showing intended use",
  "3. Professional Cleaning Checklist Printable - Premium Final.pdf — 10 pages; A4 print-friendly operational checklist pack",
  "4. Professional Cleaning Checklist User Guide - Premium Final.pdf — 6 pages; setup, workflow, compatibility and troubleshooting",
  "",
  "KEY CONTENT",
  "• Standard cleaning checklist",
  "• Kitchen checklist",
  "• Bathroom checklist",
  "• Bedroom / living-area checklist",
  "• Deep-clean checklist",
  "• Move-in / move-out checklist",
  "• Quality Control Signoff",
  "• Editable Master Checklist / task library",
  "• A4 printable pack",
  "• Quick-start and troubleshooting guidance",
  "",
  "IMPORTANT PRODUCT TRUTH",
  "• Primary intended workbook environment: Microsoft Excel Desktop",
  "• Other spreadsheet software may display validation, formatting or print layouts differently",
  "• Manual workbook only",
  "• No VBA or macros",
  "• No CRM",
  "• No calendar sync",
  "• No automatic reminders",
  "• No invoicing or payroll features",
  "• Example workbook contains fictional entries",
  "• Digital files only; no physical item is shipped",
  "",
  "HOW TO USE",
  "1. Keep one untouched master copy of the Template workbook.",
  "2. Complete Setup for the job.",
  "3. Choose the checklist matching the agreed service scope.",
  "4. Edit task wording or rows as needed.",
  "5. Record Done / N/A and flag Issue or Follow-up where applicable.",
  "6. Complete Quality Control Signoff when an internal review is needed.",
  "7. Use the A4 Printable PDF when paper is more practical."
].join("\n");

const TAGS = [
  "cleaning checklist",
  "cleaning business",
  "house cleaning list",
  "deep clean checklist",
  "move out checklist",
  "move in checklist",
  "cleaning template",
  "excel checklist",
  "printable checklist",
  "quality control",
  "cleaning forms",
  "cleaner checklist",
  "residential clean"
] as const;

const LISTING = Object.freeze({
  title: TITLE,
  description: DESCRIPTION,
  priceUsd: 4.9,
  tags: [...TAGS],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2026",
  taxonomy_id: 12476,
  type: "download",
  state: "draft"
});
const LISTING_FINGERPRINT = createListingFingerprint(LISTING);

// PROTECTED: only listings that MUST remain untouched. Stale listings removed.
const PROTECTED = Object.freeze([
  {
    listingId: 4587646332,
    state: "active",
    title: "Cleaning Business Schedule Template, Editable Excel Planner, Daily Weekly Monthly Tasks"
  }
] as const);

type Rec = Record<string, unknown>;
function isRec(value: unknown): value is Rec { return typeof value === "object" && value !== null && !Array.isArray(value); }
function secure(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
function nonceOk(value: string) { return secure(createHash("sha256").update(value, "utf8").digest("hex"), NONCE_SHA256); }
function gateEnabled() { return process.env.VERCEL_ENV === "production" && (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").includes(GATE); }
async function parseJson(response: Response) { const t = await response.text(); if (!t) return {}; try { return JSON.parse(t) as unknown; } catch { return {}; } }
function records(value: unknown) { return isRec(value) && Array.isArray(value.results) ? value.results.filter(isRec) : [] as Rec[]; }
function toObservation(value: Rec): EtsyReadBackObservation { return { title: value.title, description: value.description, price: value.price as EtsyReadBackObservation["price"], tags: value.tags, quantity: value.quantity, who_made: value.who_made, when_made: value.when_made, taxonomy_id: value.taxonomy_id, type: value.listing_type ?? value.type ?? "download", state: value.state }; }

/**
 * Baseline validation: seller state is safe to proceed.
 * Accepts two valid states:
 *   A) Pre-creation: 1 active (protected) + 0 other drafts, no target title present
 *   B) Target-already-exists: 1 active (protected) + 1 draft = target listing, target title present
 * Fails closed for any other configuration.
 */
function sellerStateIsBaseline(state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>) {
  const { counts, listings } = state;
  if (counts.inactive !== 0 || counts.sold_out !== 0 || counts.expired !== 0) return false;
  if (counts.active !== 1) return false;

  // Verify all protected listings are intact
  for (const expected of PROTECTED) {
    const row = listings.find(item => item.listingId === expected.listingId);
    if (!row || row.state !== expected.state || row.title !== expected.title) return false;
  }

  // Check no unexpected listings exist (only protected + optionally the target draft)
  const targetRow = listings.find(item => item.listingId === TARGET_LISTING_ID);
  const expectedTotal = 1 + (targetRow ? 1 : 0);
  if (listings.length !== expectedTotal) return false;

  return true;
}

function protectedFingerprint(state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>) {
  const payload = JSON.stringify({ counts: state.counts, listings: state.listings.map(item => ({ listingId: item.listingId, state: item.state, title: item.title })).sort((a,b)=>a.listingId-b.listingId), listingFingerprint: LISTING_FINGERPRINT });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

async function fetchListing(token: string, listingId: number) {
  const r = await fetch(`https://api.etsy.com/v3/application/listings/${listingId}`, { headers: etsyApiHeaders(token), cache: "no-store" });
  if (!r.ok) throw new Error(`LISTING_READ_HTTP_${r.status}`);
  const value = await parseJson(r); if (!isRec(value)) throw new Error("LISTING_READ_INVALID"); return value;
}

/**
 * Check if the known target draft ID already exists with correct identity.
 * Returns the listing ID if found, null otherwise.
 */
async function checkTargetDraftExists(token: string): Promise<number | null> {
  const r = await fetch(`https://api.etsy.com/v3/application/listings/${TARGET_LISTING_ID}`, { headers: etsyApiHeaders(token), cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`TARGET_DRAFT_READ_HTTP_${r.status}`);
  const value = await parseJson(r);
  if (!isRec(value)) return null;
  if (String(value.state) !== "draft") return null;
  if (Number(value.shop_id) !== SHOP_ID) return null;
  const identity = verifyEtsyReadBackIdentity(LISTING_FINGERPRINT, toObservation(value));
  return identity.status === "MATCH" ? TARGET_LISTING_ID : null;
}

async function exactDraftMatches(token: string) {
  const r = await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings?state=draft&limit=100`, { headers: etsyApiHeaders(token), cache: "no-store" });
  if (!r.ok) throw new Error(`DRAFT_LIST_HTTP_${r.status}`);
  const matches: number[] = [];
  for (const row of records(await parseJson(r))) {
    const id = Number(row.listing_id); if (!Number.isSafeInteger(id) || id <= 0) continue;
    const detail = await fetchListing(token, id);
    const identity = verifyEtsyReadBackIdentity(LISTING_FINGERPRINT, toObservation(detail));
    if (identity.status === "MATCH" && String(detail.state) === "draft") matches.push(id);
  }
  return matches;
}

async function createDraft(token: string) {
  // Check known target ID first (idempotent fast path)
  const knownTarget = await checkTargetDraftExists(token);
  if (knownTarget !== null) return { listingId: knownTarget, reconciled: true, reason: "TARGET_DRAFT_ALREADY_EXISTS" };

  // Check for any fingerprint match among all drafts
  const existing = await exactDraftMatches(token);
  if (existing.length === 1) return { listingId: existing[0], reconciled: true, reason: "EXACT_DRAFT_FOUND" };
  if (existing.length > 1) throw new Error("PCL_DRAFT_DUPLICATE_COLLISION");

  // No existing draft — create new
  const body = new URLSearchParams({ quantity: String(LISTING.quantity), title: TITLE, description: DESCRIPTION, price: LISTING.priceUsd.toFixed(2), who_made: LISTING.who_made, when_made: LISTING.when_made, taxonomy_id: String(LISTING.taxonomy_id), type: LISTING.type, tags: TAGS.join(",") });
  let r: Response;
  try {
    r = await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings`, { method: "POST", headers: { ...etsyApiHeaders(token), "content-type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  } catch {
    const reconciled = await exactDraftMatches(token); if (reconciled.length === 1) return { listingId: reconciled[0], reconciled: true, reason: "POST_NETWORK_ERROR_RECONCILED" }; throw new Error("PCL_DRAFT_CREATE_AMBIGUOUS");
  }
  if (r.status >= 500) { const reconciled = await exactDraftMatches(token); if (reconciled.length === 1) return { listingId: reconciled[0], reconciled: true, reason: `POST_5xx_RECONCILED_${r.status}` }; throw new Error(`PCL_DRAFT_CREATE_AMBIGUOUS_${r.status}`); }
  if (!r.ok) throw new Error(`PCL_DRAFT_CREATE_REJECTED_${r.status}`);
  const payload = await parseJson(r); const id = isRec(payload) ? Number(payload.listing_id) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) { const reconciled = await exactDraftMatches(token); if (reconciled.length === 1) return { listingId: reconciled[0], reconciled: true, reason: "POST_RECEIPT_INVALID_RECONCILED" }; throw new Error("PCL_DRAFT_RECEIPT_INVALID"); }
  const detail = await fetchListing(token, id); const identity = verifyEtsyReadBackIdentity(LISTING_FINGERPRINT, toObservation(detail));
  if (identity.status !== "MATCH" || String(detail.state) !== "draft") throw new Error("PCL_DRAFT_READBACK_MISMATCH");
  return { listingId: id, reconciled: false, reason: "CREATED_NEW" };
}

export async function GET() {
  // BLOCKER 1 — CENTRAL BUILD GATE (verifies plan approval; LEGACY_EXEMPT passes through)
  const _buildGateBlock = await enforceBuildGateForRoute("PDT-PCL-002", "PCL_002_DRAFT_CREATE_R01");
  if (_buildGateBlock) return _buildGateBlock;

  try {
    const token = await getValidEtsyAccessToken();
    const seller = await getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token });
    const baselineOk = sellerStateIsBaseline(seller);
    const targetExists = seller.listings.some(l => l.listingId === TARGET_LISTING_ID);
    return NextResponse.json({
      status: "PLAN_ONLY",
      operationId: OPERATION_ID,
      productId: "PDT-PCL-002",
      baselineMatches: baselineOk,
      targetDraftExists: targetExists,
      protectedStateFingerprint: protectedFingerprint(seller),
      listingFingerprint: LISTING_FINGERPRINT,
      sellerCounts: seller.counts,
      total: seller.total,
      priceUsd: LISTING.priceUsd,
      taxonomyId: LISTING.taxonomy_id,
      title: TITLE,
      deploymentCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
      gateEnabled: gateEnabled(),
      ETSY_WRITE_COUNT: 0
    }, { headers: { "cache-control": "no-store" } });
  } catch (e) { return NextResponse.json({ status: "PLAN_BLOCKED", error: e instanceof Error ? e.message : "UNKNOWN", ETSY_WRITE_COUNT: 0 }, { status: 409 }); }
}

export async function POST(request: Request) {
  // BLOCKER 1 — CENTRAL BUILD GATE (verifies plan approval; LEGACY_EXEMPT passes through)
  const _buildGateBlock = await enforceBuildGateForRoute("PDT-PCL-002", "PCL_002_DRAFT_CREATE_R01_POST");
  if (_buildGateBlock) return _buildGateBlock;

  let writes = 0;
  try {
    if (!gateEnabled()) throw new Error("PCL_DRAFT_GATE_DISABLED");
    if ((request.headers.get("x-operation-id") ?? "") !== OPERATION_ID) throw new Error("PCL_OPERATION_ID_INVALID");
    const body = await request.json() as { nonce?: unknown; protectedStateFingerprint?: unknown };
    const nonce = typeof body.nonce === "string" ? body.nonce.trim() : ""; if (!nonce || !nonceOk(nonce)) throw new Error("PCL_NONCE_INVALID");
    const token = await getValidEtsyAccessToken();
    const before = await getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token });
    if (!sellerStateIsBaseline(before)) throw new Error("PCL_BASELINE_MISMATCH");
    const supplied = typeof body.protectedStateFingerprint === "string" ? body.protectedStateFingerprint.trim().toLowerCase() : "";
    if (!/^[a-f0-9]{64}$/.test(supplied) || !secure(supplied, protectedFingerprint(before))) throw new Error("PCL_PROTECTED_STATE_DRIFT");

    const result = await createDraft(token);
    // reconciled=true means no Etsy write was performed (draft already existed)
    writes = result.reconciled ? 0 : 1;

    // Post-action verification: protected listings must be intact; target must be present as draft
    const after = await getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token });
    if (after.counts.active !== 1 || after.counts.draft < 1) throw new Error("PCL_FINAL_COUNTS_MISMATCH");
    for (const expected of PROTECTED) {
      const row = after.listings.find(item => item.listingId === expected.listingId);
      if (!row || row.state !== expected.state || row.title !== expected.title) throw new Error(`PCL_PROTECTED_LISTING_DRIFT_${expected.listingId}`);
    }
    const created = after.listings.find(item => item.listingId === result.listingId);
    if (!created || created.state !== "draft" || created.title !== TITLE) throw new Error("PCL_FINAL_DRAFT_MISMATCH");

    return NextResponse.json({
      status: "DRAFT_VERIFIED",
      listingId: result.listingId,
      reconciled: result.reconciled,
      reason: result.reason,
      listingFingerprint: LISTING_FINGERPRINT,
      sellerCounts: after.counts,
      total: after.total,
      ETSY_WRITE_COUNT: writes
    }, { headers: { "cache-control": "no-store" } });
  } catch (e) { return NextResponse.json({ status: writes > 0 ? "RECONCILIATION_REQUIRED" : "BLOCKED_FAIL_CLOSED", error: e instanceof Error ? e.message : "UNKNOWN", ETSY_WRITE_COUNT: writes }, { status: writes > 0 ? 202 : 409, headers: { "cache-control": "no-store" } }); }
}
