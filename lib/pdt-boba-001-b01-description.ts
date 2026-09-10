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
const AUTHORIZATION_ID_ENV = "ETSY_BOBA_B01_DESCRIPTION_AUTHORIZATION_ID";
const REQUEST_SHA_ENV = "ETSY_BOBA_B01_DESCRIPTION_REQUEST_SHA256";

const TARGET_DESCRIPTION = `Run your boba or bubble tea shop with one practical daily operations toolkit instead of scattered checklists.

Designed for boba shop owners, store managers, and cafe teams that want a repeatable workflow for opening, closing, prep, cleaning, stock and waste logging, cash close, and shift handoff.

This digital download combines an editable 9-tab workbook with print-ready A4 and US Letter checklists, plus a Quick Start and Read Me / License.

─────────────────────────────────
WHAT YOU WILL RECEIVE
─────────────────────────────────
1. PoonthaiDigital_Boba_Shop_Operations_Tracker.zip
   - Editable 9-tab workbook (.xlsx)
   - Google Sheets compatible workflow
2. PoonthaiDigital_Boba_Checklist_A4.pdf — 8 pages
3. PoonthaiDigital_Boba_Checklist_US_Letter.pdf — 8 pages
4. Boba_Quick_Start.pdf — 2 pages
5. Boba_Read_Me_License.pdf — 2 pages

─────────────────────────────────
9 WORKBOOK TABS
─────────────────────────────────
1. Start Here — quick status and reorder summary
2. Opening — opening tasks, owners, target times, status, and notes
3. Closing — closing tasks and end-of-day checks
4. Prep Log — record prepared, used, waste, and closing quantities
5. Cleaning — daily, weekly, and monthly cleaning routines
6. Stock & Waste — record stock movement, waste, closing quantity, and reorder status
7. Cash & Handoff — record expected and actual cash, variance, and shift notes
8. Blank Checklist — add recurring shop-specific tasks
9. Setup Assistant — configure the workbook for your shop

─────────────────────────────────
FILE FORMATS / COMPATIBILITY
─────────────────────────────────
• Excel .xlsx workbook
• Google Sheets compatible workflow
• A4 and US Letter printable PDFs
• Quick Start and Read Me / License PDFs

─────────────────────────────────
HOW TO USE IT
─────────────────────────────────
1. Purchase and download the digital files.
2. Open the Quick Start guide.
3. Open the workbook in Excel or use the compatible Google Sheets workflow.
4. Customize the editable fields for your shop.
5. Use the workbook digitally or print the included A4 / US Letter PDFs.

─────────────────────────────────
IMPORTANT
─────────────────────────────────
• This is an instant digital download. No physical item will be shipped.
• The toolkit is for internal shop organization and workflow support.
• It does not provide legal, food-safety, accounting, tax, payroll, POS, or compliance certification advice.
• For personal and single-business use only. Resale or redistribution is not permitted.

Product: PDT-BOBA-001 V1.`;

export const PDT_BOBA_001_B01_PROTECTED_GALLERY_IDS = Object.freeze([
  8547319609,
  8547319665,
  8547319731,
  8547319783,
  8547319831,
  8547319873,
  8499440812,
  8499440860,
  8499440896,
  8547320067,
  8547320117,
  8499441032
] as const);

export const PDT_BOBA_001_B01_DESCRIPTION = Object.freeze({
  operation: "UPDATE_ACTIVE_LISTING_DESCRIPTION_ONLY",
  operationId: "PDT-BOBA-001-B01-DESCRIPTION-ONLY-001",
  canonicalDriveId: "1poNRPlqzb2q1se6Diqssg_7CdH0eVrw2es1zioOOwXg",
  productId: "PDT-BOBA-001",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4560696421",
  candidateId: "ETSY-OPT-RC-PDT-BOBA-001-V1-2026-09-10-B",
  candidateFingerprint: "4f56c4ad4ccb39a51d034ac8c01e17f6b0d927fa1a291d5ba91dfc7d64fae497",
  buildId: "ETSY-OPT-RC-PDT-BOBA-001-BUILD-20260910-B01",
  buildFingerprint: "06203979b91476aa50d04f45056ca20ad8f863952a86b71da660495c21a046b1",
  acceptanceCriteriaId: "ETSY-OPT-RC-PDT-BOBA-001-AC-20260910-B01",
  acceptanceCriteriaSha256: "f16ebf363c02864ec7496f3b050b8bd2795e061b6a806d451a0d31d63065b558",
  protectedStateBaselineSha256: "6614a60dab611e28260b60989a9bed2c877ec4657a54cb7726bbd4dd3f1cb248",
  targetDescriptionSha256: "7a2e5de9d37961bff1219442785d8006f7498111f84aa89e0c4cba2372e678e5",
  description: TARGET_DESCRIPTION
} as const);

const EXPECTED = Object.freeze({
  title: "Boba Shop Operations Toolkit, Cafe Daily SOP, Checklist, Excel Google Sheets Template (Digital Download)",
  tags: [
    "bubble tea business",
    "boba shop toolkit",
    "boba operations",
    "boba shop sop",
    "cafe opening closing",
    "daily prep log",
    "stock waste tracker",
    "shift handoff log",
    "tea cafe template",
    "milktea inventory",
    "cafe cleaning sheet",
    "drink shop checklist",
    "google sheets boba"
  ] as readonly string[],
  beforeDescriptionSha256: "d0dc4d675c55ce4ff8542b2422021a4028e2abc7479f36b27b33d9f3c58b41e4",
  price: [1290, 100, "USD"] as const,
  taxonomyId: 12476,
  quantity: 999,
  whoMade: "i_did",
  whenMade: "2020_2026",
  listingType: "download",
  attributesCount: 0,
  gallery: PDT_BOBA_001_B01_PROTECTED_GALLERY_IDS.map((listingImageId, index) => [listingImageId, index + 1] as const),
  buyerFiles: [
    [1509032655604, 1, "PoonthaiDigital_Boba_Checklist_A4.pdf", 17459, "application/pdf"],
    [1509032655658, 2, "PoonthaiDigital_Boba_Checklist_US_Letter.pdf", 16632, "application/pdf"],
    [1509891952828, 3, "Boba_Read_Me_License.pdf", 4620, "application/pdf"],
    [1509891952826, 4, "Boba_Quick_Start.pdf", 4564, "application/pdf"],
    [1509980398204, 5, "PoonthaiDigital_Boba_Shop_Operations_Tracker.zip", 22370, "application/zip"]
  ] as readonly (readonly (number | string)[])[]
});

type Rec = Record<string, unknown>;
type State = { listing: Rec; images: Rec[]; attributes: Rec[]; files: Rec[]; statuses: Record<string, number> };
export type PdtBoba001B01Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  now?: () => string;
};

const isRec = (value: unknown): value is Rec => typeof value === "object" && value !== null && !Array.isArray(value);
const hashText = (value: string) => createHash("sha256").update(value.normalize("NFC"), "utf8").digest("hex");
const secureEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isRec(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function protectedBaselineFingerprint() {
  return createHash("sha256").update(JSON.stringify(stableValue(EXPECTED)), "utf8").digest("hex");
}

async function json(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function results(value: unknown) {
  return isRec(value) && Array.isArray(value.results) ? value.results.filter(isRec) : null;
}

export function exactPdtBoba001B01DescriptionBody(authorizationId: string) {
  return {
    operation: PDT_BOBA_001_B01_DESCRIPTION.operation,
    operationId: PDT_BOBA_001_B01_DESCRIPTION.operationId,
    authorizationId,
    canonicalDriveId: PDT_BOBA_001_B01_DESCRIPTION.canonicalDriveId,
    productId: PDT_BOBA_001_B01_DESCRIPTION.productId,
    productVersion: PDT_BOBA_001_B01_DESCRIPTION.productVersion,
    shopId: PDT_BOBA_001_B01_DESCRIPTION.shopId,
    listingId: PDT_BOBA_001_B01_DESCRIPTION.listingId,
    candidateId: PDT_BOBA_001_B01_DESCRIPTION.candidateId,
    candidateFingerprint: PDT_BOBA_001_B01_DESCRIPTION.candidateFingerprint,
    buildId: PDT_BOBA_001_B01_DESCRIPTION.buildId,
    buildFingerprint: PDT_BOBA_001_B01_DESCRIPTION.buildFingerprint,
    acceptanceCriteriaId: PDT_BOBA_001_B01_DESCRIPTION.acceptanceCriteriaId,
    acceptanceCriteriaSha256: PDT_BOBA_001_B01_DESCRIPTION.acceptanceCriteriaSha256,
    protectedStateBaselineSha256: PDT_BOBA_001_B01_DESCRIPTION.protectedStateBaselineSha256,
    targetDescriptionSha256: PDT_BOBA_001_B01_DESCRIPTION.targetDescriptionSha256,
    patch: { description: PDT_BOBA_001_B01_DESCRIPTION.description }
  };
}

function exact(body: Rec, authorizationId: string) {
  return JSON.stringify(body) === JSON.stringify(exactPdtBoba001B01DescriptionBody(authorizationId));
}

async function readState(token: string, fetchImpl: typeof fetch): Promise<State> {
  const base = "https://api.etsy.com/v3/application";
  const listingId = PDT_BOBA_001_B01_DESCRIPTION.listingId;
  const shopId = PDT_BOBA_001_B01_DESCRIPTION.shopId;
  const urls = {
    listing: `${base}/listings/${listingId}`,
    images: `${base}/listings/${listingId}/images`,
    attributes: `${base}/shops/${shopId}/listings/${listingId}/properties`,
    files: `${base}/shops/${shopId}/listings/${listingId}/files`
  };
  const entries = await Promise.all(Object.entries(urls).map(async ([name, url]) => {
    const response = await fetchImpl(url, { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" });
    return { name, response, value: await json(response) };
  }));
  const byName = Object.fromEntries(entries.map((entry) => [entry.name, entry])) as Record<string, { response: Response; value: unknown }>;
  const images = results(byName.images.value);
  const attributes = results(byName.attributes.value);
  const files = results(byName.files.value);
  if (!byName.listing.response.ok || !isRec(byName.listing.value) || !byName.images.response.ok || !byName.attributes.response.ok || !byName.files.response.ok || !images || !attributes || !files) {
    throw new Error("PDT_BOBA_001_B01_READ_FAILED");
  }
  return {
    listing: byName.listing.value,
    images,
    attributes,
    files,
    statuses: Object.fromEntries(entries.map((entry) => [entry.name, entry.response.status]))
  };
}

function protectedMatches(state: State) {
  const listing = state.listing;
  const price = isRec(listing.price) ? listing.price : {};
  if (
    String(listing.shop_id) !== PDT_BOBA_001_B01_DESCRIPTION.shopId ||
    String(listing.state).toLowerCase() !== "active" ||
    listing.title !== EXPECTED.title ||
    JSON.stringify(listing.tags) !== JSON.stringify(EXPECTED.tags)
  ) return false;
  if (
    Number(price.amount) !== EXPECTED.price[0] ||
    Number(price.divisor) !== EXPECTED.price[1] ||
    price.currency_code !== EXPECTED.price[2] ||
    Number(listing.taxonomy_id) !== EXPECTED.taxonomyId ||
    Number(listing.quantity) !== EXPECTED.quantity ||
    listing.who_made !== EXPECTED.whoMade ||
    listing.when_made !== EXPECTED.whenMade ||
    (listing.listing_type ?? listing.type) !== EXPECTED.listingType ||
    state.attributes.length !== EXPECTED.attributesCount
  ) return false;
  const gallery = [...state.images]
    .sort((a, b) => Number(a.rank) - Number(b.rank))
    .map((image) => [Number(image.listing_image_id), Number(image.rank)]);
  const files = [...state.files]
    .sort((a, b) => Number(a.rank) - Number(b.rank))
    .map((file) => [Number(file.listing_file_id), Number(file.rank), file.filename, Number(file.size_bytes), file.filetype]);
  return JSON.stringify(gallery) === JSON.stringify(EXPECTED.gallery) && JSON.stringify(files) === JSON.stringify(EXPECTED.buyerFiles);
}

const beforeMatches = (state: State) => protectedMatches(state) && typeof state.listing.description === "string" && hashText(state.listing.description) === EXPECTED.beforeDescriptionSha256;
const finalMatches = (state: State) => protectedMatches(state) && state.listing.description === PDT_BOBA_001_B01_DESCRIPTION.description;

function authError(request: Request) {
  const expected = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!expected) return NextResponse.json({ error: "PDT_BOBA_001_B01_WRITE_AUTH_NOT_CONFIGURED", providerPatchCount: 0 }, { status: 503 });
  if (!supplied || !secureEqual(supplied, expected)) return NextResponse.json({ error: "PDT_BOBA_001_B01_UNAUTHORIZED", providerPatchCount: 0 }, { status: 401 });
  return null;
}

export async function verifyPdtBoba001B01ProtectedState(runtime: PdtBoba001B01Runtime = {}) {
  if (protectedBaselineFingerprint() !== PDT_BOBA_001_B01_DESCRIPTION.protectedStateBaselineSha256) {
    return NextResponse.json({ error: "PDT_BOBA_001_B01_INTERNAL_BASELINE_FINGERPRINT_MISMATCH", providerPatchCount: 0, ETSY_WRITE_COUNT: 0 }, { status: 500 });
  }
  try {
    const token = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
    const state = await readState(token, runtime.fetchImpl ?? fetch);
    const match = beforeMatches(state);
    return NextResponse.json({
      status: match ? "PROTECTED_STATE_MATCH" : "PROTECTED_STATE_MISMATCH",
      operationId: PDT_BOBA_001_B01_DESCRIPTION.operationId,
      protectedStateBaselineSha256: PDT_BOBA_001_B01_DESCRIPTION.protectedStateBaselineSha256,
      providerPatchCount: 0,
      ETSY_WRITE_COUNT: 0,
      readStatus: state.statuses
    }, { status: match ? 200 : 409 });
  } catch {
    return NextResponse.json({ error: "PDT_BOBA_001_B01_VERIFICATION_FAILED", providerPatchCount: 0, ETSY_WRITE_COUNT: 0 }, { status: 502 });
  }
}

export async function handlePdtBoba001B01Description(body: Rec, request: Request, runtime: PdtBoba001B01Runtime = {}) {
  if (process.env.PUBLISH_WRITES_ENABLED !== "true") return NextResponse.json({ error: "PDT_BOBA_001_B01_WRITES_DISABLED", providerPatchCount: 0 }, { status: 403 });
  const authorizationError = authError(request);
  if (authorizationError) return authorizationError;
  if (hashText(PDT_BOBA_001_B01_DESCRIPTION.description) !== PDT_BOBA_001_B01_DESCRIPTION.targetDescriptionSha256) return NextResponse.json({ error: "PDT_BOBA_001_B01_TARGET_FINGERPRINT_MISMATCH", providerPatchCount: 0 }, { status: 409 });
  if (protectedBaselineFingerprint() !== PDT_BOBA_001_B01_DESCRIPTION.protectedStateBaselineSha256) return NextResponse.json({ error: "PDT_BOBA_001_B01_INTERNAL_BASELINE_FINGERPRINT_MISMATCH", providerPatchCount: 0 }, { status: 409 });
  if (process.env.ETSY_SHOP_ID?.trim() !== PDT_BOBA_001_B01_DESCRIPTION.shopId) return NextResponse.json({ error: "PDT_BOBA_001_B01_SHOP_MISMATCH", providerPatchCount: 0 }, { status: 409 });

  const authorizationId = process.env[AUTHORIZATION_ID_ENV]?.trim() ?? "";
  const allowedRequestHash = process.env[REQUEST_SHA_ENV]?.trim().toLowerCase() ?? "";
  if (!authorizationId || !SHA256.test(allowedRequestHash)) return NextResponse.json({ error: "PDT_BOBA_001_B01_PRODUCTION_AUTH_NOT_CONFIGURED", providerPatchCount: 0 }, { status: 503 });
  if (!exact(body, authorizationId) || !secureEqual(hashOperationRequest(body), allowedRequestHash)) return NextResponse.json({ error: "PDT_BOBA_001_B01_AUTHORIZATION_CONTRACT_MISMATCH", providerPatchCount: 0 }, { status: 409 });

  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  const existing = await repository.load(PDT_BOBA_001_B01_DESCRIPTION.operationId);
  if (existing?.requestHash !== undefined && existing.requestHash !== allowedRequestHash) return NextResponse.json({ error: "OPERATION_ID_PAYLOAD_MISMATCH", providerPatchCount: 0 }, { status: 409 });
  if (existing?.status === "SUCCEEDED") return NextResponse.json({ status: "REPLAY", mode: "WRITE_ONCE", operationId: existing.operationId, requestHash: existing.requestHash, ledgerStatus: existing.status, providerPatchCount: 0, receipt: existing.receipt });

  const fetchImpl = runtime.fetchImpl ?? fetch;
  const token = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
  let before: State;
  try {
    before = await readState(token, fetchImpl);
  } catch {
    return NextResponse.json({ error: "PDT_BOBA_001_B01_PREREAD_FAILED", providerPatchCount: 0 }, { status: 502 });
  }
  if (existing) {
    if (finalMatches(before)) {
      const done = await recordOperationResult(repository, existing.operationId, existing.requestHash, "SUCCEEDED", runtime.now?.() ?? new Date().toISOString(), { receipt: { ...(existing.receipt ?? {}), reconciled: true, providerPatchCount: 0 } });
      return NextResponse.json({ status: "RECONCILED", mode: "WRITE_ONCE", operationId: done.operationId, requestHash: done.requestHash, ledgerStatus: done.status, providerPatchCount: 0, receipt: done.receipt });
    }
    return NextResponse.json({ error: "PDT_BOBA_001_B01_ALREADY_CLAIMED", providerPatchCount: 0 }, { status: 409 });
  }
  if (!beforeMatches(before)) return NextResponse.json({ error: "PDT_BOBA_001_B01_PROTECTED_STATE_MISMATCH", providerPatchCount: 0 }, { status: 409 });

  const now = runtime.now?.() ?? new Date().toISOString();
  const begun = await beginOperation(repository, PDT_BOBA_001_B01_DESCRIPTION.operationId, body, now);
  if (begun.status === "REPLAY") return NextResponse.json({ error: "PDT_BOBA_001_B01_ALREADY_CLAIMED", providerPatchCount: 0 }, { status: 409 });

  const form = new URLSearchParams();
  form.set("description", PDT_BOBA_001_B01_DESCRIPTION.description);
  let patch: Response | null = null;
  try {
    patch = await fetchImpl(`https://api.etsy.com/v3/application/shops/${PDT_BOBA_001_B01_DESCRIPTION.shopId}/listings/${PDT_BOBA_001_B01_DESCRIPTION.listingId}`, {
      method: "PATCH",
      headers: { ...etsyApiHeaders(token), "content-type": "application/x-www-form-urlencoded" },
      body: form,
      cache: "no-store"
    });
    await json(patch);
  } catch {}

  if (patch && !patch.ok && patch.status < 500) {
    await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "FAILED", now, { recoveryPoint: "PATCH_REJECTED", receipt: { providerPatchCount: 1, statusCode: patch.status } });
    return NextResponse.json({ error: "PDT_BOBA_001_B01_PATCH_REJECTED", providerPatchCount: 1 }, { status: 502 });
  }

  let after: State | null = null;
  try {
    after = await readState(token, fetchImpl);
  } catch {}
  if (after && finalMatches(after)) {
    const done = await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "SUCCEEDED", runtime.now?.() ?? new Date().toISOString(), { receipt: { providerPatchCount: 1, updateStatusCode: patch?.status ?? null, readBackStatus: after.statuses, verified: { description: "PASS", protectedState: "PASS" } } });
    return NextResponse.json({ status: patch?.ok ? "UPDATED_AND_VERIFIED" : "RECONCILED", mode: "WRITE_ONCE", operationId: done.operationId, requestHash: done.requestHash, ledgerStatus: done.status, providerPatchCount: 1, receipt: done.receipt });
  }

  const pending = await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "POST_PATCH_READBACK", receipt: { providerPatchCount: 1, updateStatusCode: patch?.status ?? null } });
  return NextResponse.json({ error: "PDT_BOBA_001_B01_RECONCILIATION_REQUIRED", requestHash: pending.requestHash, providerPatchCount: 1 }, { status: 202 });
}
