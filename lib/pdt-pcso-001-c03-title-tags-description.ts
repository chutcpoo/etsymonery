import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import {
  beginOperation,
  hashOperationRequest,
  NeonOperationLedgerRepository,
  recordOperationResult,
  type OperationLedgerRepository
} from "./operation-ledger";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;
const AUTHORIZATION_ID_ENV = "ETSY_PCSO_C03_AUTHORIZATION_ID";
const REQUEST_SHA_ENV = "ETSY_PCSO_C03_REQUEST_SHA256";

const TARGET_DESCRIPTION = `Run each private-chef client service from inquiry to rebooking in one connected spreadsheet system.

This Private Chef Client-to-Service Operations System is built for solo private chefs, personal chefs, and small chef operators who need a practical way to keep client details, service readiness, pricing, preparation, payments, follow-up, and profit feedback connected.

Instead of using separate notes and disconnected trackers, the workbook follows one service flow:

Client → Service Pipeline → Quote & Profit Guard → Service Plan → Shopping & Prep → Service Day → Actuals & Payments → Follow-Up & Rebooking.

WHAT YOU GET
• 1 .xlsx workbook with 12 linked tabs
• 1 Quick Start PDF
• Instant digital download inside one buyer ZIP

12 WORKBOOK TABS
1. START HERE
2. SETTINGS
3. CLIENTS
4. SERVICE PIPELINE
5. MENU LIBRARY
6. QUOTE & PROFIT GUARD
7. SERVICE PLAN
8. SHOPPING & PREP
9. SERVICE DAY
10. ACTUALS & PAYMENTS
11. FOLLOW-UP & REBOOKING
12. DASHBOARD & NEXT ACTIONS

SERVICE READINESS GUARD
See whether a service is ready to move forward. The sample workflow clearly flags missing prerequisites such as venue confirmation, guest count, dietary/allergy review, deposit, or prep plan.

QUOTE VS ACTUAL PROFIT FEEDBACK
Track estimated cost, estimated profit, estimated margin, actual cost, actual profit, and actual margin so future pricing decisions can use real service results rather than guesses.

CLIENT MEMORY
Keep dietary notes, allergy notes, preferences, dislikes, prior service context, and follow-up information connected to future service planning.

NEXT-ACTION DASHBOARD
See upcoming services, blocked services, outstanding balances, margin feedback, and the next action that needs attention. Dashboard priorities point back to the source record instead of showing disconnected KPIs only.

COMPATIBILITY
• Google Sheets: verified on an exact converted copy of the same production candidate
• No macros

IMPORTANT SCOPE
This is an administrative operations and decision-support template. It is not legal, tax, accounting, medical, nutrition, allergen-safety, food-safety, insurance, licensing, or regulatory advice. Allergy and dietary fields are tracking aids only and do not certify that any meal is safe for a person.

This product does not include payroll/staff scheduling, a full inventory ERP, marketing automation, or a full recipe-management/nutrition system.

DIGITAL PRODUCT
No physical item will be shipped. Basic spreadsheet familiarity is recommended.

LICENSE
For use by one purchaser in their own single business. Do not resell, redistribute, sublicense, or share the editable source files.`;

export const PDT_PCSO_001_C03 = Object.freeze({
  operation: "UPDATE_ACTIVE_LISTING_TITLE_TAGS_DESCRIPTION_ONLY",
  operationId: "PDT-PCSO-001-C03-TITLE-TAGS-DESCRIPTION-001",
  productId: "PDT-PCSO-001",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4569445414",
  candidateId: "ETSY-OPT-RC-PDT-PCSO-001-V1-2026-09-10-C",
  candidateFingerprint: "6dc5927096e5e94b1f07ba2d80c88d7fddfe25380623c53eb9c5a40f6512830c",
  buildId: "ETSY-OPT-RC-PDT-PCSO-001-BUILD-20260910-C04",
  buildFingerprint: "c6649df3ae97f8107c0295453c3c5b26b4986b74ffca61c331508d1a83d1c072",
  acceptanceCriteriaId: "ETSY-OPT-RC-PDT-PCSO-001-AC-20260910-C04",
  acceptanceCriteriaSha256: "229862a72546d6996b12ab723a4f7d5861435a8f6116224c3d75ff776b2a7560",
  freshBaselineSha256: "d528735c0ffcba1a4e7ad174838398857bd7c5508c3c6fc128d4229cf261b6e6",
  targetTitleSha256: "953d536917098452487fdfc4d26c988fbfe3c7eafabbf402106ff26dbc0acdd0",
  targetOrderedTagsSha256: "1cc6922d9d59f55415cc5cc1257e7793e63d43e3081547a9ee87788210d3f58c",
  targetDescriptionSha256: "d9f0cebf476cfd3c3c6bf304adbdc13f2be3c8a02bc7228b90a744ff8e2fd96e",
  title: "Private Chef Business Spreadsheet | Client, Booking, Pricing, Profit & Rebooking Tracker | Google Sheets",
  tags: [
    "private chef", "personal chef", "chef business", "chef planner", "chef template",
    "client tracker", "service tracker", "booking tracker", "food cost tracker", "profit tracker",
    "google sheets", "rebooking tracker", "chef spreadsheet"
  ] as readonly string[],
  description: TARGET_DESCRIPTION
} as const);

const EXPECTED_BEFORE = Object.freeze({
  title: "Private Chef Business Spreadsheet | Client Service Tracker | Pricing, Profit & Rebooking Dashboard | Excel + Google Sheets",
  tags: [
    "private chef", "personal chef", "chef business", "chef spreadsheet", "client tracker",
    "service tracker", "chef pricing", "profit tracker", "booking tracker", "rebooking tracker",
    "food cost tracker", "excel template", "google sheets"
  ] as readonly string[],
  descriptionSha256: "3aff33ab799654ef6ec95004e8b9ed380fa943afd891cfe9c259d3da8cc033a5",
  price: { amount: 1490, divisor: 100, currency_code: "USD" },
  taxonomyId: 12478,
  quantity: 999,
  whoMade: "i_did",
  whenMade: "2020_2026",
  listingType: "download",
  attributesCount: 0,
  gallery: [
    [8480115528, 1], [8480115746, 2], [8528020775, 3], [8480116096, 4],
    [8480116374, 5], [8480116568, 6], [8480116820, 7], [8528021909, 8]
  ] as readonly (readonly number[])[],
  buyerFiles: [[1512525825958, 1, "PDT-PCSO-001_Private_Chef_Operations_V1.zip", 30182, "application/octet-stream"]] as readonly (readonly (number | string)[])[]
} as const);

const TOP_LEVEL_FIELDS = [
  "acceptanceCriteriaId", "acceptanceCriteriaSha256", "authorizationId", "buildFingerprint", "buildId",
  "candidateFingerprint", "candidateId", "freshBaselineSha256", "listingId", "operation", "operationId",
  "patch", "productId", "productVersion", "shopId", "targetDescriptionSha256",
  "targetOrderedTagsSha256", "targetTitleSha256"
];
const PATCH_FIELDS = ["description", "tags", "title"];

type ExactInput = {
  operation: string; operationId: string; authorizationId: string; productId: string; productVersion: string;
  shopId: string; listingId: string; candidateId: string; candidateFingerprint: string; buildId: string;
  buildFingerprint: string; acceptanceCriteriaId: string; acceptanceCriteriaSha256: string;
  freshBaselineSha256: string; targetTitleSha256: string; targetOrderedTagsSha256: string;
  targetDescriptionSha256: string; patch: { title: string; tags: string[]; description: string };
};
type RecordValue = Record<string, unknown>;
type ReadState = { listing: RecordValue; images: RecordValue[]; attributes: RecordValue[]; files: RecordValue[]; statuses: Record<string, number> };

export type PdtPcso001C03Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  now?: () => string;
};

function isRecord(value: unknown): value is RecordValue { return typeof value === "object" && value !== null && !Array.isArray(value); }
function secureEqual(left: string, right: string) { const a = Buffer.from(left), b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function exactKeys(value: RecordValue, expected: string[]) { return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected); }
function hashText(value: string) { return createHash("sha256").update(value.normalize("NFC"), "utf8").digest("hex"); }
function hashOrderedTags(value: readonly string[]) { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }
function exactArray(value: unknown, expected: readonly unknown[]) { return Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected); }
function normalizedResults(value: unknown) { return isRecord(value) && Array.isArray(value.results) ? value.results.filter(isRecord) : null; }
async function parseJson(response: Response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text) as unknown; } catch { return {}; } }

function targetIdentitySelfCheck() {
  return PDT_PCSO_001_C03.tags.length === 13 && PDT_PCSO_001_C03.tags.every((tag) => tag.length <= 20) &&
    hashText(PDT_PCSO_001_C03.title) === PDT_PCSO_001_C03.targetTitleSha256 &&
    hashOrderedTags(PDT_PCSO_001_C03.tags) === PDT_PCSO_001_C03.targetOrderedTagsSha256 &&
    hashText(PDT_PCSO_001_C03.description) === PDT_PCSO_001_C03.targetDescriptionSha256 &&
    !PDT_PCSO_001_C03.description.includes("Microsoft Excel Desktop: verified on the exact production candidate");
}

export function exactPdtPcso001C03Body(authorizationId: string) {
  return {
    operation: PDT_PCSO_001_C03.operation,
    operationId: PDT_PCSO_001_C03.operationId,
    authorizationId,
    productId: PDT_PCSO_001_C03.productId,
    productVersion: PDT_PCSO_001_C03.productVersion,
    shopId: PDT_PCSO_001_C03.shopId,
    listingId: PDT_PCSO_001_C03.listingId,
    candidateId: PDT_PCSO_001_C03.candidateId,
    candidateFingerprint: PDT_PCSO_001_C03.candidateFingerprint,
    buildId: PDT_PCSO_001_C03.buildId,
    buildFingerprint: PDT_PCSO_001_C03.buildFingerprint,
    acceptanceCriteriaId: PDT_PCSO_001_C03.acceptanceCriteriaId,
    acceptanceCriteriaSha256: PDT_PCSO_001_C03.acceptanceCriteriaSha256,
    freshBaselineSha256: PDT_PCSO_001_C03.freshBaselineSha256,
    targetTitleSha256: PDT_PCSO_001_C03.targetTitleSha256,
    targetOrderedTagsSha256: PDT_PCSO_001_C03.targetOrderedTagsSha256,
    targetDescriptionSha256: PDT_PCSO_001_C03.targetDescriptionSha256,
    patch: { title: PDT_PCSO_001_C03.title, tags: [...PDT_PCSO_001_C03.tags], description: PDT_PCSO_001_C03.description }
  };
}

function parseExactInput(body: RecordValue, configuredAuthorizationId: string): ExactInput | null {
  if (!exactKeys(body, TOP_LEVEL_FIELDS) || !isRecord(body.patch) || !exactKeys(body.patch, PATCH_FIELDS)) return null;
  if (!Array.isArray(body.patch.tags) || !body.patch.tags.every((tag) => typeof tag === "string")) return null;
  const input = body as unknown as ExactInput;
  const exact = exactPdtPcso001C03Body(configuredAuthorizationId);
  if (JSON.stringify(input) !== JSON.stringify(exact)) return null;
  return input;
}

function authorizationError(request: Request) {
  const expected = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!expected) return NextResponse.json({ error: "PDT_PCSO_001_C03_WRITE_AUTH_NOT_CONFIGURED", providerPatchCount: 0 }, { status: 503 });
  if (!supplied || !secureEqual(supplied, expected)) return NextResponse.json({ error: "PDT_PCSO_001_C03_UNAUTHORIZED", providerPatchCount: 0 }, { status: 401 });
  return null;
}

async function readState(accessToken: string, fetchImpl: typeof fetch): Promise<ReadState> {
  const base = "https://api.etsy.com/v3/application", listingId = PDT_PCSO_001_C03.listingId, shopId = PDT_PCSO_001_C03.shopId;
  const endpoints = {
    listing: `${base}/listings/${listingId}`,
    images: `${base}/listings/${listingId}/images`,
    attributes: `${base}/shops/${shopId}/listings/${listingId}/properties`,
    files: `${base}/shops/${shopId}/listings/${listingId}/files`
  };
  const entries = await Promise.all(Object.entries(endpoints).map(async ([name, url]) => {
    const response = await fetchImpl(url, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" });
    const value = await parseJson(response);
    return { name, response, value };
  }));
  const by = Object.fromEntries(entries.map((x) => [x.name, x])) as Record<string, { name: string; response: Response; value: unknown }>;
  if (!by.listing.response.ok || !isRecord(by.listing.value) || !by.images.response.ok || !by.attributes.response.ok || !by.files.response.ok) {
    throw new Error("PDT_PCSO_001_C03_READBACK_FAILED");
  }
  const images = normalizedResults(by.images.value), attributes = normalizedResults(by.attributes.value), files = normalizedResults(by.files.value);
  if (!images || !attributes || !files) throw new Error("PDT_PCSO_001_C03_READBACK_INVALID");
  return { listing: by.listing.value, images, attributes, files, statuses: Object.fromEntries(entries.map((x) => [x.name, x.response.status])) };
}

function protectedStateMatches(state: ReadState) {
  const l = state.listing, price = isRecord(l.price) ? l.price : {};
  if (String(l.shop_id) !== PDT_PCSO_001_C03.shopId || String(l.state).toLowerCase() !== "active") return false;
  if (Number(price.amount) !== EXPECTED_BEFORE.price.amount || Number(price.divisor) !== EXPECTED_BEFORE.price.divisor || price.currency_code !== EXPECTED_BEFORE.price.currency_code) return false;
  if (Number(l.taxonomy_id) !== EXPECTED_BEFORE.taxonomyId || Number(l.quantity) !== EXPECTED_BEFORE.quantity) return false;
  if (l.who_made !== EXPECTED_BEFORE.whoMade || l.when_made !== EXPECTED_BEFORE.whenMade || (l.listing_type ?? l.type) !== EXPECTED_BEFORE.listingType) return false;
  if (state.attributes.length !== EXPECTED_BEFORE.attributesCount) return false;
  const gallery = [...state.images].sort((a, b) => Number(a.rank) - Number(b.rank)).map((x) => [Number(x.listing_image_id), Number(x.rank)]);
  if (JSON.stringify(gallery) !== JSON.stringify(EXPECTED_BEFORE.gallery)) return false;
  const files = [...state.files].sort((a, b) => Number(a.rank) - Number(b.rank)).map((x) => [Number(x.listing_file_id), Number(x.rank), x.filename, Number(x.size_bytes), x.filetype]);
  return JSON.stringify(files) === JSON.stringify(EXPECTED_BEFORE.buyerFiles);
}

function beforeStateMatches(state: ReadState) {
  return protectedStateMatches(state) && state.listing.title === EXPECTED_BEFORE.title && exactArray(state.listing.tags, EXPECTED_BEFORE.tags) &&
    typeof state.listing.description === "string" && hashText(state.listing.description) === EXPECTED_BEFORE.descriptionSha256;
}

function finalStateMatches(state: ReadState) {
  return protectedStateMatches(state) && state.listing.title === PDT_PCSO_001_C03.title && exactArray(state.listing.tags, PDT_PCSO_001_C03.tags) &&
    state.listing.description === PDT_PCSO_001_C03.description;
}

function result(status: "UPDATED_AND_VERIFIED" | "RECONCILED", requestHash: string, providerPatchCount: 0 | 1, receipt: Record<string, unknown>) {
  return NextResponse.json({
    status, mode: "WRITE_ONCE", operationId: PDT_PCSO_001_C03.operationId, requestHash, ledgerStatus: "SUCCEEDED",
    providerPatchCount, buildId: PDT_PCSO_001_C03.buildId, buildFingerprint: PDT_PCSO_001_C03.buildFingerprint,
    acceptanceCriteriaId: PDT_PCSO_001_C03.acceptanceCriteriaId, acceptanceCriteriaSha256: PDT_PCSO_001_C03.acceptanceCriteriaSha256,
    listingId: PDT_PCSO_001_C03.listingId, shopId: PDT_PCSO_001_C03.shopId, receipt
  });
}

export async function handlePdtPcso001C03TitleTagsDescription(
  body: RecordValue,
  request: Request,
  runtime: PdtPcso001C03Runtime = {}
) {
  if (process.env.PUBLISH_WRITES_ENABLED !== "true") return NextResponse.json({ error: "PDT_PCSO_001_C03_WRITES_DISABLED", providerPatchCount: 0 }, { status: 403 });
  const auth = authorizationError(request); if (auth) return auth;
  if (!targetIdentitySelfCheck()) return NextResponse.json({ error: "PDT_PCSO_001_C03_FROZEN_TARGET_HASH_MISMATCH", providerPatchCount: 0 }, { status: 409 });
  if ((process.env.ETSY_SHOP_ID?.trim() ?? "") !== PDT_PCSO_001_C03.shopId) return NextResponse.json({ error: "PDT_PCSO_001_C03_SHOP_MISMATCH", providerPatchCount: 0 }, { status: 409 });

  const authorizationId = process.env[AUTHORIZATION_ID_ENV]?.trim() ?? "";
  const authorizedRequestSha256 = process.env[REQUEST_SHA_ENV]?.trim().toLowerCase() ?? "";
  if (!authorizationId || !SHA256.test(authorizedRequestSha256)) return NextResponse.json({ error: "PDT_PCSO_001_C03_PRODUCTION_AUTH_NOT_CONFIGURED", providerPatchCount: 0 }, { status: 503 });
  const input = parseExactInput(body, authorizationId);
  if (!input || hashOperationRequest(body) !== authorizedRequestSha256) return NextResponse.json({ error: "PDT_PCSO_001_C03_AUTHORIZATION_CONTRACT_MISMATCH", providerPatchCount: 0 }, { status: 409 });

  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  const existing = await repository.load(PDT_PCSO_001_C03.operationId);
  if (existing) {
    if (existing.requestHash !== authorizedRequestSha256) return NextResponse.json({ error: "OPERATION_ID_PAYLOAD_MISMATCH", providerPatchCount: 0 }, { status: 409 });
    if (existing.status === "SUCCEEDED") return NextResponse.json({ status: "REPLAY", mode: "WRITE_ONCE", operationId: existing.operationId, requestHash: existing.requestHash, ledgerStatus: existing.status, providerPatchCount: 0, receipt: existing.receipt });
  }

  const fetchImpl = runtime.fetchImpl ?? fetch;
  const accessToken = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
  let before: ReadState;
  try { before = await readState(accessToken, fetchImpl); }
  catch { return NextResponse.json({ error: "PDT_PCSO_001_C03_PREREAD_FAILED", providerPatchCount: 0 }, { status: 502 }); }

  if (existing) {
    if (finalStateMatches(before)) {
      const done = await recordOperationResult(repository, PDT_PCSO_001_C03.operationId, existing.requestHash, "SUCCEEDED", runtime.now?.() ?? new Date().toISOString(), { receipt: { ...(existing.receipt ?? {}), reconciled: true, providerPatchCount: 0 } });
      return result("RECONCILED", done.requestHash, 0, done.receipt ?? {});
    }
    return NextResponse.json({ error: "PDT_PCSO_001_C03_ALREADY_CLAIMED", ledgerStatus: existing.status, providerPatchCount: 0 }, { status: 409 });
  }

  const now = runtime.now?.() ?? new Date().toISOString();
  if (finalStateMatches(before)) {
    const begun = await beginOperation(repository, PDT_PCSO_001_C03.operationId, body, now);
    const done = await recordOperationResult(repository, PDT_PCSO_001_C03.operationId, begun.record.requestHash, "SUCCEEDED", now, { receipt: { reconciled: true, providerPatchCount: 0, readBackStatus: before.statuses } });
    return result("RECONCILED", done.requestHash, 0, done.receipt ?? {});
  }
  if (!beforeStateMatches(before)) return NextResponse.json({ error: "PDT_PCSO_001_C03_PRECONDITION_MISMATCH", providerPatchCount: 0 }, { status: 409 });

  let begun: Awaited<ReturnType<typeof beginOperation>>;
  try { begun = await beginOperation(repository, PDT_PCSO_001_C03.operationId, body, now); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "OPERATION_LEDGER_ERROR", providerPatchCount: 0 }, { status: 409 }); }
  if (begun.status === "REPLAY") return NextResponse.json({ error: "PDT_PCSO_001_C03_ALREADY_CLAIMED", ledgerStatus: begun.record.status, providerPatchCount: 0 }, { status: 409 });

  const patchBody = new URLSearchParams();
  patchBody.set("title", PDT_PCSO_001_C03.title);
  patchBody.set("tags", PDT_PCSO_001_C03.tags.join(","));
  patchBody.set("description", PDT_PCSO_001_C03.description);
  const patchUrl = `https://api.etsy.com/v3/application/shops/${PDT_PCSO_001_C03.shopId}/listings/${PDT_PCSO_001_C03.listingId}`;

  let patchResponse: Response | null = null;
  try {
    patchResponse = await fetchImpl(patchUrl, {
      method: "PATCH",
      headers: { ...etsyApiHeaders(accessToken), "content-type": "application/x-www-form-urlencoded" },
      body: patchBody,
      cache: "no-store"
    });
    await parseJson(patchResponse);
  } catch {
    patchResponse = null;
  }

  if (patchResponse && !patchResponse.ok && patchResponse.status < 500) {
    await recordOperationResult(repository, PDT_PCSO_001_C03.operationId, begun.record.requestHash, "FAILED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "PATCH_REJECTED", receipt: { providerPatchCount: 1, statusCode: patchResponse.status } });
    return NextResponse.json({ error: "PDT_PCSO_001_C03_PATCH_REJECTED", statusCode: patchResponse.status, providerPatchCount: 1 }, { status: 502 });
  }

  let after: ReadState | null = null;
  try { after = await readState(accessToken, fetchImpl); } catch {}
  if (after && finalStateMatches(after)) {
    const done = await recordOperationResult(repository, PDT_PCSO_001_C03.operationId, begun.record.requestHash, "SUCCEEDED", runtime.now?.() ?? new Date().toISOString(), {
      receipt: {
        providerPatchCount: 1,
        updateStatusCode: patchResponse?.status ?? null,
        readBackStatus: after.statuses,
        reconciled: !patchResponse?.ok,
        verified: { title: "PASS", tagsExactOrdered13: "PASS", description: "PASS", protectedFields: "PASS", gallery: "PASS", buyerFiles: "PASS", attributes: "PASS" }
      }
    });
    return result(patchResponse?.ok ? "UPDATED_AND_VERIFIED" : "RECONCILED", done.requestHash, 1, done.receipt ?? {});
  }

  const pending = await recordOperationResult(repository, PDT_PCSO_001_C03.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), {
    recoveryPoint: "POST_PATCH_READBACK",
    receipt: { providerPatchCount: 1, updateStatusCode: patchResponse?.status ?? null }
  });
  return NextResponse.json({ error: "PDT_PCSO_001_C03_RECONCILIATION_REQUIRED", requestHash: pending.requestHash, ledgerStatus: pending.status, providerPatchCount: 1 }, { status: 202 });
}
