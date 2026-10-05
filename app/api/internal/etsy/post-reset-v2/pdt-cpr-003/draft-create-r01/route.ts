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
const GATE = "[GATE_CPR_RELEASE_R01]";
const OPERATION_ID = "PDT-CPR-003-V1-ETSY-DRAFT-CREATE-R01-20261005";
const NONCE_SHA256 = "640b024f72af9f2e383ee8a580b35dfe163b039957d162f44d0dd6f9b1e27635";

const TITLE = "Cleaning Service Proposal Template, Editable Excel & PDF, Commercial Bid System, Scope Matrix, 3-Tier Pricing";
const DESCRIPTION = [
  "Professional cleaning service proposal system for commercial cleaning businesses. Includes an editable Excel template with 6 structured worksheets, a completed fictional reference example, an 8-page client-ready printable proposal PDF, a 2-page facility intake sheet, and a 6-page user guide. Designed for winning commercial cleaning contracts through a structured 3-tier pricing framework.",
  "",
  "WHAT YOU RECEIVE — EXACTLY 5 FILES",
  "1. Cleaning Service Proposal Template - Premium Final.xlsx — 6 sheets; blank reusable commercial proposal template with formulas",
  "2. Cleaning Service Proposal Example - Premium Final.xlsx — 6 sheets; fictional 14,500 sq ft commercial reference proposal",
  "3. Cleaning Service Proposal Printable - Premium Final.pdf — 8 pages; client-ready proposal example for presentation binders or PDF pitch",
  "4. Cleaning Service Proposal User Guide - Premium Final.pdf — 6 pages; bidding strategy, workflow, and customization guide",
  "5. Cleaning Service Proposal Facility Intake Sheet - Premium Final.pdf — 2 pages; commercial pre-bid walkthrough & facility intake sheet",
  "",
  "KEY FEATURES",
  "• 6 structured commercial worksheets",
  "• Room-by-room scope matrix with Included / Optional Add-on / Excluded status dropdown",
  "• 3-Tier pricing framework (Essential Clean, Standard Clean, Executive Clean)",
  "• Automatic annual contract value calculation formula",
  "• Formal proposal cover with client & provider details",
  "• Company profile section with operational pillars",
  "• Structured commercial service terms & operating policies",
  "• 8-page client-ready printable proposal example",
  "• 2-page facility intake sheet for pre-bid walkthroughs",
  "• Full workflow guide",
  "",
  "IMPORTANT PRODUCT TRUTH",
  "• Primary intended workbook environment: Microsoft Excel Desktop (Windows and macOS)",
  "• Can be opened in Google Sheets with standard formula fidelity",
  "• Manual workbook only — no automated bid engine",
  "• Package rates require manual input",
  "• No VBA or macros",
  "• No CRM or calendar sync",
  "• Service terms are structured general business policies, not legal advice",
  "• Printable PDF and example workbook contain fictional sample data",
  "• Digital files only; no physical item is shipped",
  "",
  "FULL COMMERCIAL WORKFLOW",
  "1. Pre-bid walkthrough using the Facility Intake Sheet",
  "2. Build scope in Sheet 3 using the room-by-room matrix",
  "3. Set tier pricing in Sheet 4",
  "4. Present the printed proposal to the client",
  "5. Copy agreed tier into Sheet 6 for the service agreement"
].join("\n");

const TAGS = [
  "cleaning proposal",
  "cleaning business",
  "commercial cleaning",
  "cleaning bid",
  "proposal template",
  "cleaning contract",
  "cleaning service",
  "excel template",
  "cleaning pricing",
  "janitorial proposal",
  "cleaning quote",
  "bid proposal",
  "janitorial bid"
] as const;

const LISTING = Object.freeze({
  title: TITLE,
  description: DESCRIPTION,
  priceUsd: 6.9,
  tags: [...TAGS],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2026",
  taxonomy_id: 12476,
  type: "download",
  state: "draft"
});
const LISTING_FINGERPRINT = createListingFingerprint(LISTING);

// PROTECTED: listings that MUST remain untouched at all times.
const PROTECTED = Object.freeze([
  {
    listingId: 4587646332,
    state: "active",
    title: "Cleaning Business Schedule Template, Editable Excel Planner, Daily Weekly Monthly Tasks"
  }
] as const);

// PDT-PCL-002 is the other expected listing (active after Product 02 publish)
const PCL_002_LISTING_ID = 4588681044;

type Rec = Record<string, unknown>;
function isRec(value: unknown): value is Rec { return typeof value === "object" && value !== null && !Array.isArray(value); }
function secure(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
function nonceOk(value: string) { return secure(createHash("sha256").update(value, "utf8").digest("hex"), NONCE_SHA256); }
function gateEnabled() { return process.env.VERCEL_ENV === "production" && (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").includes(GATE); }
async function parseJson(response: Response) { const t = await response.text(); if (!t) return {}; try { return JSON.parse(t) as unknown; } catch { return {}; } }
function records(value: unknown) { return isRec(value) && Array.isArray(value.results) ? value.results.filter(isRec) : [] as Rec[]; }
function toObservation(value: Rec): EtsyReadBackObservation { return { title: value.title, description: value.description, price: value.price as EtsyReadBackObservation["price"], tags: value.tags, quantity: value.quantity, who_made: value.who_made, when_made: value.when_made, taxonomy_id: value.taxonomy_id, type: value.listing_type ?? value.type ?? "download", state: value.state }; }

async function sleep(ms: number) { await new Promise(r => setTimeout(r, ms)); }

/**
 * Baseline validation for PDT-CPR-003 draft creation.
 * Pre-condition: PDT-PCL-002 (4588681044) must be active (Product 02 published).
 * Accepts: all PROTECTED active, PCL-002 active, no CPR-003 title in any listing.
 * Fails closed for any unexpected configuration.
 */
function sellerStateIsBaseline(state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>) {
  const { counts, listings } = state;
  if (counts.inactive !== 0 || counts.sold_out !== 0 || counts.expired !== 0) return false;
  if (counts.active < 1) return false;

  // All PROTECTED listings must be intact
  for (const expected of PROTECTED) {
    const row = listings.find(item => item.listingId === expected.listingId);
    if (!row || row.state !== expected.state || row.title !== expected.title) return false;
  }

  // PDT-PCL-002 must be active (published) before creating CPR-003
  const pcl002 = listings.find(item => item.listingId === PCL_002_LISTING_ID);
  if (!pcl002 || pcl002.state !== "active") return false;
  if (pcl002.title !== "Professional Cleaning Checklist Template, Editable Excel & A4 PDF, Deep Clean, Move-In Move-Out, Quality Control") return false;

  return true;
}

function protectedFingerprint(state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>) {
  const payload = JSON.stringify({ counts: state.counts, listings: state.listings.map(item => ({ listingId: item.listingId, state: item.state, title: item.title })).sort((a,b)=>a.listingId-b.listingId), listingFingerprint: LISTING_FINGERPRINT });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

async function fetchListing(token: string, listingId: number, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await fetch(`https://api.etsy.com/v3/application/listings/${listingId}`, { headers: etsyApiHeaders(token), cache: "no-store" });
    if (r.status === 404) return null;
    if (r.status === 429 || r.status >= 500) {
      const retryAfter = r.headers.get("retry-after");
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
    if (!r.ok) throw new Error(`LISTING_READ_HTTP_${r.status}`);
    const value = await parseJson(r);
    if (!isRec(value)) return null;
    return value;
  }
  return null;
}

async function exactDraftMatches(token: string) {
  const r = await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings?state=draft&limit=100`, { headers: etsyApiHeaders(token), cache: "no-store" });
  if (!r.ok) throw new Error(`DRAFT_LIST_HTTP_${r.status}`);
  const matches: number[] = [];
  for (const row of records(await parseJson(r))) {
    const id = Number(row.listing_id); if (!Number.isSafeInteger(id) || id <= 0) continue;
    await sleep(350);
    const detail = await fetchListing(token, id);
    if (!detail) continue;
    const identity = verifyEtsyReadBackIdentity(LISTING_FINGERPRINT, toObservation(detail));
    if (identity.status === "MATCH" && String(detail.state) === "draft") matches.push(id);
  }
  return matches;
}

async function createDraft(token: string) {
  // Check for any fingerprint match among all drafts (idempotent / reconciliation)
  const existing = await exactDraftMatches(token);
  if (existing.length === 1) return { listingId: existing[0], reconciled: true, reason: "EXACT_DRAFT_FOUND" };
  if (existing.length > 1) throw new Error("CPR_DRAFT_DUPLICATE_COLLISION");

  // No existing draft — create new
  const body = new URLSearchParams({ quantity: String(LISTING.quantity), title: TITLE, description: DESCRIPTION, price: LISTING.priceUsd.toFixed(2), who_made: LISTING.who_made, when_made: LISTING.when_made, taxonomy_id: String(LISTING.taxonomy_id), type: LISTING.type, tags: TAGS.join(",") });
  let r: Response;
  try {
    r = await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings`, { method: "POST", headers: { ...etsyApiHeaders(token), "content-type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  } catch {
    const reconciled = await exactDraftMatches(token); if (reconciled.length === 1) return { listingId: reconciled[0], reconciled: true, reason: "POST_NETWORK_ERROR_RECONCILED" }; throw new Error("CPR_DRAFT_CREATE_AMBIGUOUS");
  }
  if (r.status >= 500) { const reconciled = await exactDraftMatches(token); if (reconciled.length === 1) return { listingId: reconciled[0], reconciled: true, reason: `POST_5xx_RECONCILED_${r.status}` }; throw new Error(`CPR_DRAFT_CREATE_AMBIGUOUS_${r.status}`); }
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`CPR_DRAFT_CREATE_REJECTED_${r.status}_${errText.slice(0, 300)}`);
  }
  const payload = await parseJson(r); const id = isRec(payload) ? Number(payload.listing_id) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) { const reconciled = await exactDraftMatches(token); if (reconciled.length === 1) return { listingId: reconciled[0], reconciled: true, reason: "POST_RECEIPT_INVALID_RECONCILED" }; throw new Error("CPR_DRAFT_RECEIPT_INVALID"); }
  await sleep(500);
  const detail = await fetchListing(token, id);
  if (!detail) throw new Error("CPR_DRAFT_READBACK_404");
  const identity = verifyEtsyReadBackIdentity(LISTING_FINGERPRINT, toObservation(detail));
  if (identity.status !== "MATCH" || String(detail.state) !== "draft") throw new Error("CPR_DRAFT_READBACK_MISMATCH");
  return { listingId: id, reconciled: false, reason: "CREATED_NEW" };
}

export async function GET() {
  // BLOCKER 1 — CENTRAL BUILD GATE (verifies plan approval; LEGACY_EXEMPT passes through)
  const _buildGateBlock = await enforceBuildGateForRoute("PDT-CPR-003", "CPR_003_DRAFT_CREATE_R01");
  if (_buildGateBlock) return _buildGateBlock;

  try {
    const token = await getValidEtsyAccessToken();
    const seller = await getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token });
    const baselineOk = sellerStateIsBaseline(seller);
    const existingDrafts = seller.listings.filter(l => l.title === TITLE);
    return NextResponse.json({
      status: "PLAN_ONLY",
      operationId: OPERATION_ID,
      productId: "PDT-CPR-003",
      baselineMatches: baselineOk,
      existingMatchingDrafts: existingDrafts.length,
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
  const _buildGateBlock = await enforceBuildGateForRoute("PDT-CPR-003", "CPR_003_DRAFT_CREATE_R01_POST");
  if (_buildGateBlock) return _buildGateBlock;

  let writes = 0;
  try {
    if (!gateEnabled()) throw new Error("CPR_DRAFT_GATE_DISABLED");
    if ((request.headers.get("x-operation-id") ?? "") !== OPERATION_ID) throw new Error("CPR_OPERATION_ID_INVALID");
    const body = await request.json() as { nonce?: unknown; protectedStateFingerprint?: unknown };
    const nonce = typeof body.nonce === "string" ? body.nonce.trim() : ""; if (!nonce || !nonceOk(nonce)) throw new Error("CPR_NONCE_INVALID");
    const token = await getValidEtsyAccessToken();
    const before = await getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token });
    if (!sellerStateIsBaseline(before)) throw new Error("CPR_BASELINE_MISMATCH");
    const supplied = typeof body.protectedStateFingerprint === "string" ? body.protectedStateFingerprint.trim().toLowerCase() : "";
    if (!/^[a-f0-9]{64}$/.test(supplied) || !secure(supplied, protectedFingerprint(before))) throw new Error("CPR_PROTECTED_STATE_DRIFT");

    const result = await createDraft(token);
    writes = result.reconciled ? 0 : 1;

    // Post-action verification
    const after = await getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token });
    if (after.counts.inactive !== 0 || after.counts.sold_out !== 0 || after.counts.expired !== 0) throw new Error("CPR_FINAL_UNEXPECTED_STATES");
    for (const expected of PROTECTED) {
      const row = after.listings.find(item => item.listingId === expected.listingId);
      if (!row || row.state !== expected.state || row.title !== expected.title) throw new Error(`CPR_PROTECTED_LISTING_DRIFT_${expected.listingId}`);
    }
    const pcl002After = after.listings.find(item => item.listingId === PCL_002_LISTING_ID);
    if (!pcl002After || pcl002After.state !== "active") throw new Error("CPR_PCL002_ACTIVE_DRIFT");
    const created = after.listings.find(item => item.listingId === result.listingId);
    if (!created || created.state !== "draft" || created.title !== TITLE) throw new Error("CPR_FINAL_DRAFT_MISMATCH");

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
