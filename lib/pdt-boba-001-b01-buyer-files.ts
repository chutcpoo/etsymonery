import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import {
  beginOperation,
  hashOperationRequest,
  NeonOperationLedgerRepository,
  recordOperationResult,
  type OperationLedgerRecord,
  type OperationLedgerRepository
} from "./operation-ledger";
import { clearAuthorizedAsset, loadAuthorizedAsset } from "./authorized-operation-asset-store";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;
const AUTHORIZATION_ID_ENV = "ETSY_BOBA_B01_BUYER_FILES_AUTHORIZATION_ID";
const REQUEST_SHA_ENV = "ETSY_BOBA_B01_BUYER_FILES_REQUEST_SHA256";

export const PDT_BOBA_001_B01_BUYER_FILES = Object.freeze({
  operation: "REPLACE_EXACT_TWO_DIGITAL_BUYER_FILES_ONLY",
  operationId: "PDT-BOBA-001-B01-BUYER-FILES-001",
  productId: "PDT-BOBA-001",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4560696421",
  candidateId: "ETSY-FULL-REBUILD-PDT-BOBA-001-V1-2026-09-12-B",
  candidateFingerprint: "85dae17bac2e772771fb4fa825fd66af617a7833d6dd06c7bab4873c2dbd1056",
  buildId: "ETSY-FULL-REBUILD-PDT-BOBA-001-BUILD-20260912-B01",
  buildFingerprint: "6128efc19ba774c0ba4e17d4f854bdb38ac1d41ed5a672ff9fea47066810b3fb",
  buildFreezeSha256: "9edc333f09e04a45440ab54b53894f9422b6b33d9b7be9d1b06444a9b5b981c9",
  acceptanceCriteriaId: "ETSY-AC-PDT-BOBA-001-FULL-REBUILD-B01-V1",
  acceptanceCriteriaSha256: "75abe1d42b6f69698e2e4a0070921fe7127d57203cad0f1b7538cfd55a7829e1",
  targets: [
    {
      slot: 4,
      currentListingFileId: 1509891952826,
      fileName: "Boba_Quick_Start.pdf",
      currentSizeBytes: 4564,
      targetSizeBytes: 5305,
      sha256: "8e31ebfcefba49a6705c8690422ba9188e757c78b0c36c59e119afb70169c76c",
      googleDriveId: "1k7XSNfczK1dujfCZOl0_a9pN2YniH3XG",
      mimeType: "application/pdf"
    },
    {
      slot: 5,
      currentListingFileId: 1509980398204,
      fileName: "PoonthaiDigital_Boba_Shop_Operations_Tracker.zip",
      currentSizeBytes: 22370,
      targetSizeBytes: 22264,
      sha256: "f57f510f416ecfa244d3b351e945cbe7856e8f364dff0a457012f1b6ebc42d78",
      googleDriveId: "1gE3KPhLrAT63ec2z_7eq0wm7CETf4XJD",
      mimeType: "application/zip"
    }
  ] as const
} as const);

const EXPECTED = Object.freeze({
  state: "active",
  title: "Boba Shop Operations Toolkit, Cafe Daily SOP, Checklist, Excel Google Sheets Template (Digital Download)",
  descriptionSha256: "7a2e5de9d37961bff1219442785d8006f7498111f84aa89e0c4cba2372e678e5",
  price: [1290, 100, "USD"] as const,
  taxonomyId: 12476,
  quantity: 999,
  whoMade: "i_did",
  whenMade: "2020_2026",
  listingType: "download",
  tags: [
    "bubble tea business", "boba shop toolkit", "boba operations", "boba shop sop",
    "cafe opening closing", "daily prep log", "stock waste tracker", "shift handoff log",
    "tea cafe template", "milktea inventory", "cafe cleaning sheet", "drink shop checklist",
    "google sheets boba"
  ] as readonly string[],
  attributesCount: 0,
  gallery: [
    [8547319609, 1, 2000, 1600], [8547319665, 2, 2000, 1600], [8547319731, 3, 1600, 900],
    [8547319783, 4, 1600, 900], [8547319831, 5, 1600, 900], [8547319873, 6, 1600, 900],
    [8499440812, 7, 1600, 900], [8499440860, 8, 1600, 900], [8499440896, 9, 1600, 900],
    [8547320067, 10, 1600, 900], [8547320117, 11, 1600, 900], [8499441032, 12, 1600, 900]
  ] as readonly (readonly number[])[],
  protectedBuyerFiles: [
    [1509032655604, 1, "PoonthaiDigital_Boba_Checklist_A4.pdf", 17459, "application/pdf"],
    [1509032655658, 2, "PoonthaiDigital_Boba_Checklist_US_Letter.pdf", 16632, "application/pdf"],
    [1509891952828, 3, "Boba_Read_Me_License.pdf", 4620, "application/pdf"]
  ] as readonly (readonly (number | string)[])[],
  returnPolicyId: 1,
  fileData: "4 PDF, 1 ZIP"
} as const);

export const PDT_BOBA_001_B01_BUYER_FILE_SHA_EVIDENCE_GAP = "SHA256_NOT_AVAILABLE_FROM_PROVIDER" as const;
export const PDT_BOBA_001_B01_OFFER_EVIDENCE_GAP = "NOT_AVAILABLE_FROM_CURRENT_ETSY_API_PATH" as const;
export const PDT_BOBA_001_B01_DELIVERY_EVIDENCE_GAP = "DEDICATED_PROVIDER_ENDPOINT_NOT_AVAILABLE" as const;

type Rec = Record<string, unknown>;
export type PdtBoba001B01BuyerFileTarget = (typeof PDT_BOBA_001_B01_BUYER_FILES.targets)[number];
type Target = PdtBoba001B01BuyerFileTarget;
type State = {
  listing: Rec;
  images: Rec[];
  attributes: Rec[];
  files: Rec[];
  videos: Rec[];
  statuses: Record<string, number>;
};

type CompletedTargetReceipt = {
  slot: number;
  expectedSha256: string;
  deletedListingFileId: string;
  providerListingFileId: string;
  providerFilename: string;
  providerSizeBytes: number;
};

type InFlightTargetReceipt = {
  slot: number;
  phase: "DELETE_VERIFIED";
  deletedListingFileId: string;
  expectedSha256: string;
};

export type PdtBoba001B01BuyerFilesRuntime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  loadAsset?: (target: Target) => Promise<Buffer>;
  clearAsset?: (target: Target) => Promise<void>;
  verifyAsset?: (bytes: Buffer, target: Target, fileName?: string) => boolean;
  now?: () => string;
};

const isRec = (value: unknown): value is Rec => typeof value === "object" && value !== null && !Array.isArray(value);
const hashText = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value.normalize("NFC") : "", "utf8").digest("hex");
const secureEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const results = (value: unknown) => isRec(value) && Array.isArray(value.results) ? value.results.filter(isRec) : null;
async function json(response: Response) { const text = await response.text(); try { return text ? JSON.parse(text) as unknown : {}; } catch { return {}; } }
function multipartHeaders(token: string) { const headers = etsyApiHeaders(token); delete headers["content-type"]; return headers; }

export function exactPdtBoba001B01BuyerFilesBody(authorizationId: string) {
  return {
    operation: PDT_BOBA_001_B01_BUYER_FILES.operation,
    operationId: PDT_BOBA_001_B01_BUYER_FILES.operationId,
    authorizationId,
    productId: PDT_BOBA_001_B01_BUYER_FILES.productId,
    productVersion: PDT_BOBA_001_B01_BUYER_FILES.productVersion,
    shopId: PDT_BOBA_001_B01_BUYER_FILES.shopId,
    listingId: PDT_BOBA_001_B01_BUYER_FILES.listingId,
    candidateId: PDT_BOBA_001_B01_BUYER_FILES.candidateId,
    candidateFingerprint: PDT_BOBA_001_B01_BUYER_FILES.candidateFingerprint,
    buildId: PDT_BOBA_001_B01_BUYER_FILES.buildId,
    buildFingerprint: PDT_BOBA_001_B01_BUYER_FILES.buildFingerprint,
    buildFreezeSha256: PDT_BOBA_001_B01_BUYER_FILES.buildFreezeSha256,
    acceptanceCriteriaId: PDT_BOBA_001_B01_BUYER_FILES.acceptanceCriteriaId,
    acceptanceCriteriaSha256: PDT_BOBA_001_B01_BUYER_FILES.acceptanceCriteriaSha256,
    targets: PDT_BOBA_001_B01_BUYER_FILES.targets.map((target) => ({ ...target }))
  };
}

export function verifyPdtBoba001B01BuyerFileAsset(bytes: Buffer, target: Target, fileName = target.fileName) {
  return fileName === target.fileName && bytes.length === target.targetSizeBytes && createHash("sha256").update(bytes).digest("hex") === target.sha256;
}

async function loadAndVerifyAssets(runtime: PdtBoba001B01BuyerFilesRuntime) {
  const loaded: Array<{ target: Target; bytes: Buffer }> = [];
  for (const target of PDT_BOBA_001_B01_BUYER_FILES.targets) {
    let bytes: Buffer;
    try {
      bytes = await (runtime.loadAsset ? runtime.loadAsset(target) : loadAuthorizedAsset(PDT_BOBA_001_B01_BUYER_FILES.operationId, target.sha256));
    } catch {
      throw new Error(`PDT_BOBA_001_B01_BUYER_FILE_ASSET_NOT_READY_SLOT_${target.slot}`);
    }
    if (!(runtime.verifyAsset ?? verifyPdtBoba001B01BuyerFileAsset)(bytes, target, target.fileName)) throw new Error(`PDT_BOBA_001_B01_BUYER_FILE_ASSET_IDENTITY_MISMATCH_SLOT_${target.slot}`);
    loaded.push({ target, bytes });
  }
  return loaded;
}

async function readState(token: string, fetchImpl: typeof fetch): Promise<State> {
  const base = "https://api.etsy.com/v3/application";
  const listingId = PDT_BOBA_001_B01_BUYER_FILES.listingId;
  const shopId = PDT_BOBA_001_B01_BUYER_FILES.shopId;
  const urls = {
    listing: `${base}/listings/${listingId}`,
    images: `${base}/listings/${listingId}/images`,
    attributes: `${base}/shops/${shopId}/listings/${listingId}/properties`,
    files: `${base}/shops/${shopId}/listings/${listingId}/files`,
    videos: `${base}/listings/${listingId}/videos`
  };
  const entries = await Promise.all(Object.entries(urls).map(async ([name, url]) => {
    const response = await fetchImpl(url, { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" });
    return { name, response, value: await json(response) };
  }));
  const by = Object.fromEntries(entries.map((entry) => [entry.name, entry])) as Record<string, { response: Response; value: unknown }>;
  const images = results(by.images.value), attributes = results(by.attributes.value), files = results(by.files.value), videos = results(by.videos.value);
  if (!by.listing.response.ok || !isRec(by.listing.value) || !by.images.response.ok || !by.attributes.response.ok || !by.files.response.ok || !by.videos.response.ok || !images || !attributes || !files || !videos) {
    throw new Error("PDT_BOBA_001_B01_BUYER_FILES_READBACK_FAILED");
  }
  return {
    listing: by.listing.value,
    images,
    attributes,
    files,
    videos,
    statuses: Object.fromEntries(entries.map((entry) => [entry.name, entry.response.status]))
  };
}

function coreProtectedMatches(state: State, allowTransientFileData = false) {
  const listing = state.listing;
  const price = isRec(listing.price) ? listing.price : {};
  if (String(listing.listing_id) !== PDT_BOBA_001_B01_BUYER_FILES.listingId || String(listing.shop_id) !== PDT_BOBA_001_B01_BUYER_FILES.shopId) return false;
  if (String(listing.state).toLowerCase() !== EXPECTED.state || listing.title !== EXPECTED.title || hashText(listing.description) !== EXPECTED.descriptionSha256) return false;
  if (JSON.stringify(listing.tags) !== JSON.stringify(EXPECTED.tags)) return false;
  if (Number(price.amount) !== EXPECTED.price[0] || Number(price.divisor) !== EXPECTED.price[1] || price.currency_code !== EXPECTED.price[2]) return false;
  if (Number(listing.taxonomy_id) !== EXPECTED.taxonomyId || Number(listing.quantity) !== EXPECTED.quantity || listing.who_made !== EXPECTED.whoMade || listing.when_made !== EXPECTED.whenMade || (listing.listing_type ?? listing.type) !== EXPECTED.listingType) return false;
  if (state.attributes.length !== EXPECTED.attributesCount || Number(listing.return_policy_id) !== EXPECTED.returnPolicyId || (!allowTransientFileData && listing.file_data !== EXPECTED.fileData)) return false;
  const gallery = [...state.images].sort((a, b) => Number(a.rank) - Number(b.rank)).map((image) => [Number(image.listing_image_id), Number(image.rank), Number(image.full_width), Number(image.full_height)]);
  return JSON.stringify(gallery) === JSON.stringify(EXPECTED.gallery);
}

function normalizedVideoSnapshot(videos: Rec[]) {
  return [...videos]
    .map((video) => ({
      video_id: Number(video.video_id),
      height: Number(video.height),
      width: Number(video.width),
      thumbnail_url: String(video.thumbnail_url ?? ""),
      video_url: String(video.video_url ?? ""),
      video_state: String(video.video_state ?? "")
    }))
    .sort((a, b) => a.video_id - b.video_id);
}

function fileRows(state: State) {
  return [...state.files].sort((a, b) => Number(a.rank) - Number(b.rank)).map((file) => [
    Number(file.listing_file_id), Number(file.rank), file.filename, Number(file.size_bytes), file.filetype
  ] as const);
}

function protectedFilesMatch(state: State) {
  return JSON.stringify(fileRows(state).slice(0, 3)) === JSON.stringify(EXPECTED.protectedBuyerFiles);
}

function currentTargetMatches(state: State, target: Target) {
  const row = fileRows(state).find((candidate) => candidate[1] === target.slot);
  return Boolean(row && row[0] === target.currentListingFileId && row[2] === target.fileName && row[3] === target.currentSizeBytes && row[4] === target.mimeType);
}

function deletedTargetObserved(state: State, target: Target) {
  return !state.files.some((file) => Number(file.listing_file_id) === target.currentListingFileId);
}

function replacedTargetMatches(state: State, target: Target, providerListingFileId?: string) {
  const row = fileRows(state).find((candidate) => candidate[1] === target.slot);
  if (!row || row[2] !== target.fileName || row[3] !== target.targetSizeBytes || row[4] !== target.mimeType) return false;
  if (providerListingFileId && String(row[0]) !== providerListingFileId) return false;
  return true;
}

function inFlightReceipt(record: OperationLedgerRecord | null): InFlightTargetReceipt | null {
  const value = record?.receipt?.inFlightTarget;
  if (!isRec(value) || value.phase !== "DELETE_VERIFIED" || typeof value.deletedListingFileId !== "string" || typeof value.expectedSha256 !== "string") return null;
  const slot = Number(value.slot);
  if (!Number.isSafeInteger(slot)) return null;
  return { slot, phase: "DELETE_VERIFIED", deletedListingFileId: value.deletedListingFileId, expectedSha256: value.expectedSha256 };
}

function expectedProgressRows(completed: CompletedTargetReceipt[], deletedTargetIndex?: number) {
  const rows: Array<readonly (number | string)[]> = EXPECTED.protectedBuyerFiles.map((row) => [...row]);
  for (let index = 0; index < PDT_BOBA_001_B01_BUYER_FILES.targets.length; index += 1) {
    if (index === deletedTargetIndex) continue;
    const target = PDT_BOBA_001_B01_BUYER_FILES.targets[index];
    const receipt = completed.find((item) => item.slot === target.slot);
    const rank = target.slot - (deletedTargetIndex !== undefined && index > deletedTargetIndex ? 1 : 0);
    rows.push(receipt
      ? [Number(receipt.providerListingFileId), rank, target.fileName, target.targetSizeBytes, target.mimeType]
      : [target.currentListingFileId, rank, target.fileName, target.currentSizeBytes, target.mimeType]);
  }
  return rows;
}

function progressStateMatches(state: State, completed: CompletedTargetReceipt[], beforeVideoSnapshot: unknown, deletedTargetIndex?: number) {
  const expectedRows = expectedProgressRows(completed, deletedTargetIndex);
  return coreProtectedMatches(state, deletedTargetIndex !== undefined)
    && JSON.stringify(normalizedVideoSnapshot(state.videos)) === JSON.stringify(beforeVideoSnapshot)
    && JSON.stringify(fileRows(state)) === JSON.stringify(expectedRows);
}

function uploadedReceiptFromState(state: State, target: Target): CompletedTargetReceipt | null {
  const row = fileRows(state).find((candidate) => candidate[1] === target.slot);
  if (!row || row[0] === target.currentListingFileId || row[2] !== target.fileName || row[3] !== target.targetSizeBytes || row[4] !== target.mimeType) return null;
  return {
    slot: target.slot,
    expectedSha256: target.sha256,
    deletedListingFileId: String(target.currentListingFileId),
    providerListingFileId: String(row[0]),
    providerFilename: String(row[2]),
    providerSizeBytes: Number(row[3])
  };
}

function exactBeforeMatches(state: State) {
  return coreProtectedMatches(state) && protectedFilesMatch(state) && PDT_BOBA_001_B01_BUYER_FILES.targets.every((target) => currentTargetMatches(state, target)) && state.files.length === 5;
}

function protectedAfterMatches(state: State, beforeVideoSnapshot: unknown) {
  return coreProtectedMatches(state) && protectedFilesMatch(state) && JSON.stringify(normalizedVideoSnapshot(state.videos)) === JSON.stringify(beforeVideoSnapshot) && state.files.length === 5;
}

function authError(request: Request) {
  const expected = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!expected) return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_WRITE_AUTH_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0 }, { status: 503 });
  if (!supplied || !secureEqual(supplied, expected)) return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_UNAUTHORIZED", ETSY_WRITE_COUNT: 0 }, { status: 401 });
  return null;
}

function completedReceipts(record: OperationLedgerRecord | null): CompletedTargetReceipt[] {
  if (!record?.receipt || !Array.isArray(record.receipt.completedTargets)) return [];
  return record.receipt.completedTargets.filter((value: unknown): value is CompletedTargetReceipt => {
    if (!isRec(value)) return false;
    return Number.isSafeInteger(Number(value.slot)) && typeof value.expectedSha256 === "string" && typeof value.deletedListingFileId === "string" && typeof value.providerListingFileId === "string" && typeof value.providerFilename === "string" && Number.isSafeInteger(Number(value.providerSizeBytes));
  });
}

async function savePendingProgress(repository: OperationLedgerRepository, record: OperationLedgerRecord, receipt: Rec, recoveryPoint: string, now: string) {
  await repository.save({ ...record, status: "PENDING", receipt, recoveryPoint, updatedAt: now });
}

export async function verifyPdtBoba001B01BuyerFilesProtectedState(runtime: PdtBoba001B01BuyerFilesRuntime = {}) {
  try {
    const token = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
    const state = await readState(token, runtime.fetchImpl ?? fetch);
    const match = exactBeforeMatches(state);
    return NextResponse.json({
      status: match ? "PROTECTED_STATE_MATCH" : "PROTECTED_STATE_MISMATCH",
      operationId: PDT_BOBA_001_B01_BUYER_FILES.operationId,
      candidateFingerprint: PDT_BOBA_001_B01_BUYER_FILES.candidateFingerprint,
      buildFingerprint: PDT_BOBA_001_B01_BUYER_FILES.buildFingerprint,
      buildFreezeSha256: PDT_BOBA_001_B01_BUYER_FILES.buildFreezeSha256,
      acceptanceCriteriaSha256: PDT_BOBA_001_B01_BUYER_FILES.acceptanceCriteriaSha256,
      providerReadStatus: state.statuses,
      evidenceGaps: {
        buyerFileSha256: PDT_BOBA_001_B01_BUYER_FILE_SHA_EVIDENCE_GAP,
        offerDiscount: PDT_BOBA_001_B01_OFFER_EVIDENCE_GAP,
        deliveryConfiguration: PDT_BOBA_001_B01_DELIVERY_EVIDENCE_GAP
      },
      ETSY_WRITE_COUNT: 0
    }, { status: match ? 200 : 409 });
  } catch {
    return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_VERIFICATION_FAILED", ETSY_WRITE_COUNT: 0 }, { status: 502 });
  }
}

export async function handlePdtBoba001B01BuyerFiles(body: Rec, request: Request, runtime: PdtBoba001B01BuyerFilesRuntime = {}) {
  if (process.env.PUBLISH_WRITES_ENABLED !== "true") return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_WRITES_DISABLED", ETSY_WRITE_COUNT: 0 }, { status: 403 });
  const authorizationError = authError(request); if (authorizationError) return authorizationError;
  if (process.env.ETSY_SHOP_ID?.trim() !== PDT_BOBA_001_B01_BUYER_FILES.shopId) return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_SHOP_MISMATCH", ETSY_WRITE_COUNT: 0 }, { status: 409 });

  const authorizationId = process.env[AUTHORIZATION_ID_ENV]?.trim() ?? "";
  const allowedRequestHash = process.env[REQUEST_SHA_ENV]?.trim().toLowerCase() ?? "";
  if (!authorizationId || !SHA256.test(allowedRequestHash)) return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_PRODUCTION_AUTH_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0 }, { status: 503 });
  const exactBody = exactPdtBoba001B01BuyerFilesBody(authorizationId);
  if (hashOperationRequest(body) !== hashOperationRequest(exactBody) || !secureEqual(hashOperationRequest(body), allowedRequestHash)) return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_AUTHORIZATION_CONTRACT_MISMATCH", ETSY_WRITE_COUNT: 0 }, { status: 409 });

  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  const existing = await repository.load(PDT_BOBA_001_B01_BUYER_FILES.operationId);
  if (existing && existing.requestHash !== allowedRequestHash) return NextResponse.json({ error: "OPERATION_ID_PAYLOAD_MISMATCH", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  if (existing?.status === "SUCCEEDED") return NextResponse.json({ status: "REPLAY", mode: "WRITE_ONCE", operationId: existing.operationId, requestHash: existing.requestHash, ledgerStatus: existing.status, receipt: existing.receipt, ETSY_WRITE_COUNT: 0 });
  if (existing?.status === "FAILED") return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_FAILED_DO_NOT_RETRY", ledgerStatus: existing.status, receipt: existing.receipt, ETSY_WRITE_COUNT: 0 }, { status: 409 });
  if (existing?.status === "RECONCILIATION_REQUIRED") return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_RECONCILIATION_REQUIRED_DO_NOT_RETRY", ledgerStatus: existing.status, receipt: existing.receipt, ETSY_WRITE_COUNT: 0 }, { status: 202 });
  if (existing?.status === "PENDING") {
    const confirmedWriteCount = Number.isSafeInteger(Number(existing.receipt?.ETSY_WRITE_COUNT)) ? Number(existing.receipt?.ETSY_WRITE_COUNT) : 0;
    const writeAttemptCount = Number.isSafeInteger(Number(existing.receipt?.ETSY_WRITE_ATTEMPT_COUNT)) ? Number(existing.receipt?.ETSY_WRITE_ATTEMPT_COUNT) : confirmedWriteCount;
    const receipt = { ...(existing.receipt ?? {}), ETSY_WRITE_COUNT: confirmedWriteCount, ETSY_WRITE_ATTEMPT_COUNT: writeAttemptCount, ETSY_WRITE_COUNT_STATUS: "UNRESOLVED_REQUIRES_RECONCILIATION" };
    await recordOperationResult(repository, existing.operationId, existing.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "PENDING_REPLAY_BLOCKED_REQUIRES_RECONCILIATION", receipt });
    return NextResponse.json({
      error: "PDT_BOBA_001_B01_BUYER_FILES_PENDING_REQUIRES_RECONCILIATION_DO_NOT_RETRY",
      ledgerStatus: "RECONCILIATION_REQUIRED",
      receipt,
      ETSY_WRITE_COUNT: confirmedWriteCount,
      ETSY_WRITE_ATTEMPT_COUNT: writeAttemptCount,
      ETSY_WRITE_COUNT_STATUS: "UNRESOLVED_REQUIRES_RECONCILIATION"
    }, { status: 202 });
  }

  let assets: Awaited<ReturnType<typeof loadAndVerifyAssets>>;
  try { assets = await loadAndVerifyAssets(runtime); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "PDT_BOBA_001_B01_BUYER_FILES_ASSET_ERROR", ETSY_WRITE_COUNT: 0 }, { status: 409 }); }

  const fetchImpl = runtime.fetchImpl ?? fetch;
  const token = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
  let before: State;
  try { before = await readState(token, fetchImpl); }
  catch { return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_PREREAD_FAILED", ETSY_WRITE_COUNT: 0 }, { status: 502 }); }

  const currentVideoSnapshot = normalizedVideoSnapshot(before.videos);
  const priorVideoSnapshot = existing?.receipt && Array.isArray(existing.receipt.protectedVideoSnapshot) ? existing.receipt.protectedVideoSnapshot : null;
  const beforeVideoSnapshot = existing ? priorVideoSnapshot : currentVideoSnapshot;
  if (existing && !beforeVideoSnapshot) return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_PENDING_VIDEO_BASELINE_MISSING", ETSY_WRITE_COUNT: 0 }, { status: 409 });

  let completed = completedReceipts(existing);
  let inFlight = inFlightReceipt(existing);
  let record: OperationLedgerRecord;

  if (existing) {
    if (existing.status !== "PENDING") return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_ALREADY_CLAIMED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
    const rawCompleted = Array.isArray(existing.receipt?.completedTargets) ? existing.receipt.completedTargets : [];
    const sequential = completed.every((item, index) => item.slot === PDT_BOBA_001_B01_BUYER_FILES.targets[index]?.slot && item.expectedSha256 === PDT_BOBA_001_B01_BUYER_FILES.targets[index]?.sha256);
    const validInFlight = !inFlight || (inFlight.slot === PDT_BOBA_001_B01_BUYER_FILES.targets[completed.length]?.slot && inFlight.deletedListingFileId === String(PDT_BOBA_001_B01_BUYER_FILES.targets[completed.length]?.currentListingFileId) && inFlight.expectedSha256 === PDT_BOBA_001_B01_BUYER_FILES.targets[completed.length]?.sha256);
    if (rawCompleted.length !== completed.length || !sequential || !validInFlight) {
      await recordOperationResult(repository, existing.operationId, existing.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "PENDING_LEDGER_STATE_INVALID", receipt: existing.receipt });
      return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_RECONCILIATION_REQUIRED_DO_NOT_RETRY", ETSY_WRITE_COUNT: 0 }, { status: 202 });
    }
    record = existing;
  } else {
    if (!exactBeforeMatches(before)) return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_PROTECTED_OR_TARGET_PRECONDITION_MISMATCH", ETSY_WRITE_COUNT: 0 }, { status: 409 });
    const begun = await beginOperation(repository, PDT_BOBA_001_B01_BUYER_FILES.operationId, body, runtime.now?.() ?? new Date().toISOString());
    if (begun.status === "REPLAY") return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_ALREADY_CLAIMED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
    record = begun.record;
    await savePendingProgress(repository, record, { completedTargets: [], protectedVideoSnapshot: beforeVideoSnapshot, ETSY_WRITE_COUNT: 0, ETSY_WRITE_ATTEMPT_COUNT: 0, ETSY_WRITE_COUNT_STATUS: "CONFIRMED", evidenceGap: PDT_BOBA_001_B01_BUYER_FILE_SHA_EVIDENCE_GAP }, "READY_BEFORE_FIRST_MUTATION", runtime.now?.() ?? new Date().toISOString());
    record = (await repository.load(record.operationId)) ?? record;
  }

  let providerWriteCount = completed.length * 2 + (inFlight ? 1 : 0);
  let providerWriteAttemptCount = Number.isSafeInteger(Number(record.receipt?.ETSY_WRITE_ATTEMPT_COUNT)) ? Number(record.receipt?.ETSY_WRITE_ATTEMPT_COUNT) : providerWriteCount;
  let state = before;
  const filesUrl = `https://api.etsy.com/v3/application/shops/${PDT_BOBA_001_B01_BUYER_FILES.shopId}/listings/${PDT_BOBA_001_B01_BUYER_FILES.listingId}/files`;
  const terminal = async (status: "FAILED" | "RECONCILIATION_REQUIRED", error: string, recoveryPoint: string, targetSlot: number, extra: Rec = {}, writeCountStatus: "CONFIRMED" | "UNRESOLVED_REQUIRES_RECONCILIATION" = "CONFIRMED") => {
    const receipt = { completedTargets: completed, ...(inFlight ? { inFlightTarget: inFlight } : {}), protectedVideoSnapshot: beforeVideoSnapshot, ETSY_WRITE_COUNT: providerWriteCount, ETSY_WRITE_ATTEMPT_COUNT: providerWriteAttemptCount, ETSY_WRITE_COUNT_STATUS: writeCountStatus, evidenceGap: PDT_BOBA_001_B01_BUYER_FILE_SHA_EVIDENCE_GAP, ...extra };
    await recordOperationResult(repository, record.operationId, record.requestHash, status, runtime.now?.() ?? new Date().toISOString(), { recoveryPoint, receipt });
    return NextResponse.json({ error, targetSlot, ETSY_WRITE_COUNT: providerWriteCount, ETSY_WRITE_ATTEMPT_COUNT: providerWriteAttemptCount, ETSY_WRITE_COUNT_STATUS: writeCountStatus }, { status: status === "RECONCILIATION_REQUIRED" ? 202 : 502 });
  };

  for (let index = completed.length; index < assets.length; index += 1) {
    const { target, bytes } = assets[index];

    const inferredUpload = uploadedReceiptFromState(state, target);
    if (inferredUpload && progressStateMatches(state, [...completed, inferredUpload], beforeVideoSnapshot)) {
      completed = [...completed, inferredUpload];
      inFlight = null;
      providerWriteCount = completed.length * 2;
      await savePendingProgress(repository, record, { completedTargets: completed, protectedVideoSnapshot: beforeVideoSnapshot, ETSY_WRITE_COUNT: providerWriteCount, recoveredFromProviderState: true, evidenceGap: PDT_BOBA_001_B01_BUYER_FILE_SHA_EVIDENCE_GAP }, `TARGET_${target.slot}_UPLOAD_RECONCILED`, runtime.now?.() ?? new Date().toISOString());
      record = (await repository.load(record.operationId)) ?? record;
      continue;
    }

    if (progressStateMatches(state, completed, beforeVideoSnapshot, index)) {
      if (!inFlight) {
        inFlight = { slot: target.slot, phase: "DELETE_VERIFIED", deletedListingFileId: String(target.currentListingFileId), expectedSha256: target.sha256 };
        providerWriteCount = completed.length * 2 + 1;
        await savePendingProgress(repository, record, { completedTargets: completed, inFlightTarget: inFlight, protectedVideoSnapshot: beforeVideoSnapshot, ETSY_WRITE_COUNT: providerWriteCount, recoveredFromProviderState: true, evidenceGap: PDT_BOBA_001_B01_BUYER_FILE_SHA_EVIDENCE_GAP }, `TARGET_${target.slot}_DELETE_RECONCILED`, runtime.now?.() ?? new Date().toISOString());
        record = (await repository.load(record.operationId)) ?? record;
      }
    } else if (progressStateMatches(state, completed, beforeVideoSnapshot)) {
      if (inFlight) return terminal("RECONCILIATION_REQUIRED", "PDT_BOBA_001_B01_BUYER_FILES_RECONCILIATION_REQUIRED_DO_NOT_RETRY", `TARGET_${target.slot}_DELETE_LEDGER_PROVIDER_MISMATCH`, target.slot);
      const deleteUrl = `${filesUrl}/${target.currentListingFileId}`;
      let deletion: Response;
      providerWriteAttemptCount += 1;
      try {
        deletion = await fetchImpl(deleteUrl, { method: "DELETE", headers: etsyApiHeaders(token), cache: "no-store" });
      } catch {
        try {
          state = await readState(token, fetchImpl);
          if (progressStateMatches(state, completed, beforeVideoSnapshot, index)) {
            providerWriteCount += 1;
            inFlight = { slot: target.slot, phase: "DELETE_VERIFIED", deletedListingFileId: String(target.currentListingFileId), expectedSha256: target.sha256 };
            return terminal("RECONCILIATION_REQUIRED", "PDT_BOBA_001_B01_BUYER_FILES_DELETE_AMBIGUOUS_DO_NOT_RETRY", `TARGET_${target.slot}_DELETE_RESPONSE_AMBIGUOUS_CONFIRMED_BY_READBACK`, target.slot);
          }
        } catch { /* count remains last exactly confirmed value */ }
        return terminal("RECONCILIATION_REQUIRED", "PDT_BOBA_001_B01_BUYER_FILES_DELETE_AMBIGUOUS_DO_NOT_RETRY", `TARGET_${target.slot}_DELETE_RESPONSE_AMBIGUOUS`, target.slot, {}, "UNRESOLVED_REQUIRES_RECONCILIATION");
      }
      let afterDelete: State;
      try { afterDelete = await readState(token, fetchImpl); }
      catch { return terminal("RECONCILIATION_REQUIRED", "PDT_BOBA_001_B01_BUYER_FILES_POST_DELETE_READBACK_FAILED_DO_NOT_RETRY", `TARGET_${target.slot}_DELETE_READBACK_FAILED`, target.slot, { statusCode: deletion.status }); }
      if (!deletion.ok || deletion.status !== 204) {
        state = afterDelete;
        const unchanged = progressStateMatches(afterDelete, completed, beforeVideoSnapshot);
        const deleted = progressStateMatches(afterDelete, completed, beforeVideoSnapshot, index);
        if (deleted) {
          providerWriteCount += 1;
          inFlight = { slot: target.slot, phase: "DELETE_VERIFIED", deletedListingFileId: String(target.currentListingFileId), expectedSha256: target.sha256 };
        }
        const ambiguous = deletion.status >= 500 || !unchanged;
        const countStatus = deleted || unchanged ? "CONFIRMED" : "UNRESOLVED_REQUIRES_RECONCILIATION";
        return terminal(ambiguous ? "RECONCILIATION_REQUIRED" : "FAILED", ambiguous ? "PDT_BOBA_001_B01_BUYER_FILES_DELETE_AMBIGUOUS_DO_NOT_RETRY" : "PDT_BOBA_001_B01_BUYER_FILES_DELETE_REJECTED_DO_NOT_RETRY", `TARGET_${target.slot}_DELETE_REJECTED`, target.slot, { statusCode: deletion.status }, countStatus);
      }
      if (!progressStateMatches(afterDelete, completed, beforeVideoSnapshot, index)) {
        state = afterDelete;
        const deletionObserved = deletedTargetObserved(afterDelete, target);
        if (deletionObserved) {
          providerWriteCount += 1;
          inFlight = { slot: target.slot, phase: "DELETE_VERIFIED", deletedListingFileId: String(target.currentListingFileId), expectedSha256: target.sha256 };
        }
        return terminal("RECONCILIATION_REQUIRED", "PDT_BOBA_001_B01_BUYER_FILES_POST_DELETE_READBACK_MISMATCH_DO_NOT_RETRY", `TARGET_${target.slot}_DELETE_READBACK_MISMATCH`, target.slot, { statusCode: deletion.status }, deletionObserved ? "CONFIRMED" : "UNRESOLVED_REQUIRES_RECONCILIATION");
      }
      state = afterDelete;
      providerWriteCount += 1;
      inFlight = { slot: target.slot, phase: "DELETE_VERIFIED", deletedListingFileId: String(target.currentListingFileId), expectedSha256: target.sha256 };
      await savePendingProgress(repository, record, { completedTargets: completed, inFlightTarget: inFlight, protectedVideoSnapshot: beforeVideoSnapshot, ETSY_WRITE_COUNT: providerWriteCount, ETSY_WRITE_ATTEMPT_COUNT: providerWriteAttemptCount, ETSY_WRITE_COUNT_STATUS: "CONFIRMED", readBackStatus: afterDelete.statuses, evidenceGap: PDT_BOBA_001_B01_BUYER_FILE_SHA_EVIDENCE_GAP }, `TARGET_${target.slot}_DELETE_VERIFIED`, runtime.now?.() ?? new Date().toISOString());
      record = (await repository.load(record.operationId)) ?? record;
    } else {
      return terminal("RECONCILIATION_REQUIRED", "PDT_BOBA_001_B01_BUYER_FILES_PENDING_PROVIDER_STATE_UNSAFE_DO_NOT_RETRY", `TARGET_${target.slot}_PROVIDER_STATE_UNSAFE`, target.slot);
    }

    const form = new FormData();
    form.append("file", new File([Uint8Array.from(bytes)], target.fileName, { type: target.mimeType }), target.fileName);
    form.append("name", target.fileName);
    form.append("rank", String(target.slot));
    let upload: Response;
    providerWriteAttemptCount += 1;
    try {
      upload = await fetchImpl(filesUrl, { method: "POST", headers: multipartHeaders(token), body: form, cache: "no-store" });
    } catch {
      try {
        state = await readState(token, fetchImpl);
        const inferred = uploadedReceiptFromState(state, target);
        if (inferred && progressStateMatches(state, [...completed, inferred], beforeVideoSnapshot)) {
          providerWriteCount += 1;
          completed = [...completed, inferred];
          inFlight = null;
          return terminal("RECONCILIATION_REQUIRED", "PDT_BOBA_001_B01_BUYER_FILES_UPLOAD_AMBIGUOUS_DO_NOT_RETRY", `TARGET_${target.slot}_UPLOAD_RESPONSE_AMBIGUOUS_CONFIRMED_BY_READBACK`, target.slot);
        }
      } catch { /* count remains last exactly confirmed value */ }
      return terminal("RECONCILIATION_REQUIRED", "PDT_BOBA_001_B01_BUYER_FILES_UPLOAD_AMBIGUOUS_DO_NOT_RETRY", `TARGET_${target.slot}_UPLOAD_RESPONSE_AMBIGUOUS`, target.slot, {}, "UNRESOLVED_REQUIRES_RECONCILIATION");
    }
    const uploadValue = await json(upload);
    let afterUpload: State;
    try { afterUpload = await readState(token, fetchImpl); }
    catch { return terminal("RECONCILIATION_REQUIRED", "PDT_BOBA_001_B01_BUYER_FILES_POST_UPLOAD_READBACK_FAILED_DO_NOT_RETRY", `TARGET_${target.slot}_UPLOAD_READBACK_FAILED`, target.slot, { statusCode: upload.status }); }
    state = afterUpload;
    if (!upload.ok || upload.status !== 201) {
      const inferred = uploadedReceiptFromState(afterUpload, target);
      if (inferred && progressStateMatches(afterUpload, [...completed, inferred], beforeVideoSnapshot)) {
        providerWriteCount += 1;
        completed = [...completed, inferred];
        inFlight = null;
        return terminal("RECONCILIATION_REQUIRED", "PDT_BOBA_001_B01_BUYER_FILES_UPLOAD_REJECTED_AFTER_DELETE_DO_NOT_RETRY", `TARGET_${target.slot}_UPLOAD_REJECTED_AFTER_DELETE_PROVIDER_CHANGED`, target.slot, { statusCode: upload.status });
      }
      const unchangedAfterDelete = progressStateMatches(afterUpload, completed, beforeVideoSnapshot, index);
      return terminal("RECONCILIATION_REQUIRED", "PDT_BOBA_001_B01_BUYER_FILES_UPLOAD_REJECTED_AFTER_DELETE_DO_NOT_RETRY", `TARGET_${target.slot}_UPLOAD_REJECTED_AFTER_DELETE`, target.slot, { statusCode: upload.status }, unchangedAfterDelete ? "CONFIRMED" : "UNRESOLVED_REQUIRES_RECONCILIATION");
    }
    const receiptItem = uploadedReceiptFromState(afterUpload, target);
    if (!receiptItem || !isRec(uploadValue) || String(uploadValue.listing_file_id) !== receiptItem.providerListingFileId || Number(uploadValue.rank) !== target.slot || uploadValue.filename !== target.fileName || Number(uploadValue.size_bytes) !== target.targetSizeBytes || !progressStateMatches(afterUpload, [...completed, receiptItem], beforeVideoSnapshot)) {
      if (receiptItem) providerWriteCount += 1;
      return terminal("RECONCILIATION_REQUIRED", "PDT_BOBA_001_B01_BUYER_FILES_UPLOAD_RECEIPT_OR_READBACK_MISMATCH_DO_NOT_RETRY", `TARGET_${target.slot}_UPLOAD_RECEIPT_OR_READBACK_MISMATCH`, target.slot, { providerReceipt: isRec(uploadValue) ? uploadValue : {} }, receiptItem ? "CONFIRMED" : "UNRESOLVED_REQUIRES_RECONCILIATION");
    }

    providerWriteCount += 1;
    completed = [...completed, receiptItem];
    inFlight = null;
    await savePendingProgress(repository, record, { completedTargets: completed, protectedVideoSnapshot: beforeVideoSnapshot, ETSY_WRITE_COUNT: providerWriteCount, ETSY_WRITE_ATTEMPT_COUNT: providerWriteAttemptCount, ETSY_WRITE_COUNT_STATUS: "CONFIRMED", readBackStatus: afterUpload.statuses, evidenceGap: PDT_BOBA_001_B01_BUYER_FILE_SHA_EVIDENCE_GAP }, `TARGET_${target.slot}_UPLOAD_VERIFIED`, runtime.now?.() ?? new Date().toISOString());
    record = (await repository.load(record.operationId)) ?? record;
  }

  let finalState: State;
  try { finalState = await readState(token, fetchImpl); }
  catch {
    const receipt = { completedTargets: completed, protectedVideoSnapshot: beforeVideoSnapshot, ETSY_WRITE_COUNT: providerWriteCount, ETSY_WRITE_ATTEMPT_COUNT: providerWriteAttemptCount, ETSY_WRITE_COUNT_STATUS: "CONFIRMED" };
    await recordOperationResult(repository, record.operationId, record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "FINAL_READBACK_FAILED", receipt });
    return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_FINAL_READBACK_FAILED_DO_NOT_RETRY", ETSY_WRITE_COUNT: providerWriteCount }, { status: 202 });
  }
  const finalOk = progressStateMatches(finalState, completed, beforeVideoSnapshot) && completed.length === PDT_BOBA_001_B01_BUYER_FILES.targets.length && PDT_BOBA_001_B01_BUYER_FILES.targets.every((target, index) => replacedTargetMatches(finalState, target, completed[index]?.providerListingFileId));
  if (!finalOk) {
    const receipt = { completedTargets: completed, protectedVideoSnapshot: beforeVideoSnapshot, ETSY_WRITE_COUNT: providerWriteCount, ETSY_WRITE_ATTEMPT_COUNT: providerWriteAttemptCount, ETSY_WRITE_COUNT_STATUS: "CONFIRMED", readBackStatus: finalState.statuses };
    await recordOperationResult(repository, record.operationId, record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "FINAL_READBACK_MISMATCH", receipt });
    return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_FINAL_READBACK_MISMATCH_DO_NOT_RETRY", ETSY_WRITE_COUNT: providerWriteCount }, { status: 202 });
  }

  const done = await recordOperationResult(repository, record.operationId, record.requestHash, "SUCCEEDED", runtime.now?.() ?? new Date().toISOString(), {
    receipt: {
      completedTargets: completed,
      protectedVideoSnapshot: beforeVideoSnapshot,
      ETSY_WRITE_COUNT: providerWriteCount,
      ETSY_WRITE_ATTEMPT_COUNT: providerWriteAttemptCount,
      ETSY_WRITE_COUNT_STATUS: "CONFIRMED",
      authorizationId,
      candidateFingerprint: PDT_BOBA_001_B01_BUYER_FILES.candidateFingerprint,
      buildFingerprint: PDT_BOBA_001_B01_BUYER_FILES.buildFingerprint,
      buildFreezeSha256: PDT_BOBA_001_B01_BUYER_FILES.buildFreezeSha256,
      acceptanceCriteriaSha256: PDT_BOBA_001_B01_BUYER_FILES.acceptanceCriteriaSha256,
      verified: {
        targetFiles: "PASS_PROVIDER_FILENAME_SIZE_ID",
        stagedSha256BeforeWrite: "PASS",
        protectedBuyerFilesSlots1To3: "PRESERVED",
        listingCore: "PRESERVED",
        orderedTags: "PRESERVED",
        orderedGallery12: "PRESERVED",
        video: "PRESERVED",
        attributes: "PRESERVED",
        deliveryVisibleState: "PRESERVED"
      },
      evidenceGaps: {
        providerBuyerFileSha256: PDT_BOBA_001_B01_BUYER_FILE_SHA_EVIDENCE_GAP,
        offerDiscount: PDT_BOBA_001_B01_OFFER_EVIDENCE_GAP,
        dedicatedDeliveryConfiguration: PDT_BOBA_001_B01_DELIVERY_EVIDENCE_GAP
      },
      readBackStatus: finalState.statuses
    }
  });

  for (const target of PDT_BOBA_001_B01_BUYER_FILES.targets) {
    try { await (runtime.clearAsset ? runtime.clearAsset(target) : clearAuthorizedAsset(PDT_BOBA_001_B01_BUYER_FILES.operationId, target.sha256)); } catch { /* verified operation is complete; cleanup is best effort */ }
  }
  return NextResponse.json({ status: "UPDATED_AND_VERIFIED", mode: "WRITE_ONCE", operationId: done.operationId, requestHash: done.requestHash, ledgerStatus: done.status, receipt: done.receipt, ETSY_WRITE_COUNT: providerWriteCount, ETSY_WRITE_ATTEMPT_COUNT: providerWriteAttemptCount, ETSY_WRITE_COUNT_STATUS: "CONFIRMED" });
}
