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
  providerListingFileId: string;
  providerFilename: string;
  providerSizeBytes: number;
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

function coreProtectedMatches(state: State) {
  const listing = state.listing;
  const price = isRec(listing.price) ? listing.price : {};
  if (String(listing.listing_id) !== PDT_BOBA_001_B01_BUYER_FILES.listingId || String(listing.shop_id) !== PDT_BOBA_001_B01_BUYER_FILES.shopId) return false;
  if (String(listing.state).toLowerCase() !== EXPECTED.state || listing.title !== EXPECTED.title || hashText(listing.description) !== EXPECTED.descriptionSha256) return false;
  if (JSON.stringify(listing.tags) !== JSON.stringify(EXPECTED.tags)) return false;
  if (Number(price.amount) !== EXPECTED.price[0] || Number(price.divisor) !== EXPECTED.price[1] || price.currency_code !== EXPECTED.price[2]) return false;
  if (Number(listing.taxonomy_id) !== EXPECTED.taxonomyId || Number(listing.quantity) !== EXPECTED.quantity || listing.who_made !== EXPECTED.whoMade || listing.when_made !== EXPECTED.whenMade || (listing.listing_type ?? listing.type) !== EXPECTED.listingType) return false;
  if (state.attributes.length !== EXPECTED.attributesCount || Number(listing.return_policy_id) !== EXPECTED.returnPolicyId || listing.file_data !== EXPECTED.fileData) return false;
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

function replacedTargetMatches(state: State, target: Target, providerListingFileId?: string) {
  const row = fileRows(state).find((candidate) => candidate[1] === target.slot);
  if (!row || row[2] !== target.fileName || row[3] !== target.targetSizeBytes || row[4] !== target.mimeType) return false;
  if (providerListingFileId && String(row[0]) !== providerListingFileId) return false;
  return true;
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
    return Number.isSafeInteger(Number(value.slot)) && typeof value.expectedSha256 === "string" && typeof value.providerListingFileId === "string" && typeof value.providerFilename === "string" && Number.isSafeInteger(Number(value.providerSizeBytes));
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

  let assets: Awaited<ReturnType<typeof loadAndVerifyAssets>>;
  try { assets = await loadAndVerifyAssets(runtime); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "PDT_BOBA_001_B01_BUYER_FILES_ASSET_ERROR", ETSY_WRITE_COUNT: 0 }, { status: 409 }); }

  const fetchImpl = runtime.fetchImpl ?? fetch;
  const token = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
  let before: State;
  try { before = await readState(token, fetchImpl); }
  catch { return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_PREREAD_FAILED", ETSY_WRITE_COUNT: 0 }, { status: 502 }); }

  const currentVideoSnapshot = normalizedVideoSnapshot(before.videos);
  const priorVideoSnapshot = existing?.receipt && Array.isArray(existing.receipt.protectedVideoSnapshot)
    ? existing.receipt.protectedVideoSnapshot
    : null;
  const beforeVideoSnapshot = existing ? priorVideoSnapshot : currentVideoSnapshot;
  if (existing && !beforeVideoSnapshot) return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_PENDING_VIDEO_BASELINE_MISSING", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  let completed = completedReceipts(existing);
  let record: OperationLedgerRecord;
  let startIndex = 0;

  if (existing) {
    if (existing.status !== "PENDING") return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_ALREADY_CLAIMED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
    if (completed.length === 1 && completed[0].slot === PDT_BOBA_001_B01_BUYER_FILES.targets[0].slot) {
      if (!protectedAfterMatches(before, beforeVideoSnapshot) || !replacedTargetMatches(before, PDT_BOBA_001_B01_BUYER_FILES.targets[0], completed[0].providerListingFileId) || !currentTargetMatches(before, PDT_BOBA_001_B01_BUYER_FILES.targets[1])) {
        await recordOperationResult(repository, existing.operationId, existing.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "PENDING_RECOVERY_STATE_MISMATCH", receipt: existing.receipt });
        return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_RECONCILIATION_REQUIRED_DO_NOT_RETRY", ETSY_WRITE_COUNT: 0 }, { status: 202 });
      }
      record = existing;
      startIndex = 1;
    } else if (completed.length === 2 && protectedAfterMatches(before, beforeVideoSnapshot) && PDT_BOBA_001_B01_BUYER_FILES.targets.every((target, index) => replacedTargetMatches(before, target, completed[index]?.providerListingFileId))) {
      const done = await recordOperationResult(repository, existing.operationId, existing.requestHash, "SUCCEEDED", runtime.now?.() ?? new Date().toISOString(), { receipt: { ...(existing.receipt ?? {}), reconciled: true, ETSY_WRITE_COUNT: 0 } });
      return NextResponse.json({ status: "RECONCILED", mode: "WRITE_ONCE", operationId: done.operationId, requestHash: done.requestHash, ledgerStatus: done.status, receipt: done.receipt, ETSY_WRITE_COUNT: 0 });
    } else {
      return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_PENDING_DO_NOT_BLIND_RETRY", receipt: existing.receipt, ETSY_WRITE_COUNT: 0 }, { status: 409 });
    }
  } else {
    if (!exactBeforeMatches(before)) return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_PROTECTED_OR_TARGET_PRECONDITION_MISMATCH", ETSY_WRITE_COUNT: 0 }, { status: 409 });
    const begun = await beginOperation(repository, PDT_BOBA_001_B01_BUYER_FILES.operationId, body, runtime.now?.() ?? new Date().toISOString());
    if (begun.status === "REPLAY") return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_ALREADY_CLAIMED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
    record = begun.record;
  }

  let providerWriteCount = 0;
  const uploadUrl = `https://api.etsy.com/v3/application/shops/${PDT_BOBA_001_B01_BUYER_FILES.shopId}/listings/${PDT_BOBA_001_B01_BUYER_FILES.listingId}/files`;
  for (let index = startIndex; index < assets.length; index += 1) {
    const { target, bytes } = assets[index];
    const form = new FormData();
    form.append("file", new File([Uint8Array.from(bytes)], target.fileName, { type: target.mimeType }), target.fileName);
    form.append("name", target.fileName);
    form.append("rank", String(target.slot));

    let upload: Response;
    try {
      providerWriteCount += 1;
      upload = await fetchImpl(uploadUrl, { method: "POST", headers: multipartHeaders(token), body: form, cache: "no-store" });
    } catch {
      const receipt = { completedTargets: completed, protectedVideoSnapshot: beforeVideoSnapshot, ETSY_WRITE_COUNT: providerWriteCount, ambiguousTargetSlot: target.slot, evidenceGap: PDT_BOBA_001_B01_BUYER_FILE_SHA_EVIDENCE_GAP };
      await recordOperationResult(repository, record.operationId, record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: `TARGET_${target.slot}_PROVIDER_RESPONSE_AMBIGUOUS`, receipt });
      return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_PROVIDER_RESPONSE_AMBIGUOUS_DO_NOT_RETRY", targetSlot: target.slot, ETSY_WRITE_COUNT: providerWriteCount }, { status: 202 });
    }

    const uploadValue = await json(upload);
    if (!upload.ok) {
      const status = upload.status >= 500 ? "RECONCILIATION_REQUIRED" as const : "FAILED" as const;
      const receipt = { completedTargets: completed, protectedVideoSnapshot: beforeVideoSnapshot, ETSY_WRITE_COUNT: providerWriteCount, rejectedTargetSlot: target.slot, statusCode: upload.status };
      await recordOperationResult(repository, record.operationId, record.requestHash, status, runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: `TARGET_${target.slot}_UPLOAD_REJECTED`, receipt });
      return NextResponse.json({ error: status === "RECONCILIATION_REQUIRED" ? "PDT_BOBA_001_B01_BUYER_FILES_PROVIDER_RESPONSE_AMBIGUOUS_DO_NOT_RETRY" : "PDT_BOBA_001_B01_BUYER_FILES_UPLOAD_REJECTED_DO_NOT_RETRY", targetSlot: target.slot, statusCode: upload.status, ETSY_WRITE_COUNT: providerWriteCount }, { status: status === "RECONCILIATION_REQUIRED" ? 202 : 502 });
    }

    if (!isRec(uploadValue) || !uploadValue.listing_file_id || Number(uploadValue.rank) !== target.slot || uploadValue.filename !== target.fileName || Number(uploadValue.size_bytes) !== target.targetSizeBytes) {
      const receipt = { completedTargets: completed, protectedVideoSnapshot: beforeVideoSnapshot, ETSY_WRITE_COUNT: providerWriteCount, ambiguousTargetSlot: target.slot, providerReceipt: isRec(uploadValue) ? uploadValue : {} };
      await recordOperationResult(repository, record.operationId, record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: `TARGET_${target.slot}_UPLOAD_RECEIPT_MISMATCH`, receipt });
      return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_UPLOAD_RECEIPT_AMBIGUOUS_DO_NOT_RETRY", targetSlot: target.slot, ETSY_WRITE_COUNT: providerWriteCount }, { status: 202 });
    }

    let afterEach: State;
    try { afterEach = await readState(token, fetchImpl); }
    catch {
      const receipt = { completedTargets: completed, protectedVideoSnapshot: beforeVideoSnapshot, ETSY_WRITE_COUNT: providerWriteCount, ambiguousTargetSlot: target.slot, providerListingFileId: String(uploadValue.listing_file_id) };
      await recordOperationResult(repository, record.operationId, record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: `TARGET_${target.slot}_READBACK_FAILED`, receipt });
      return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_POST_WRITE_READBACK_FAILED_DO_NOT_RETRY", targetSlot: target.slot, ETSY_WRITE_COUNT: providerWriteCount }, { status: 202 });
    }

    const receiptItem: CompletedTargetReceipt = {
      slot: target.slot,
      expectedSha256: target.sha256,
      providerListingFileId: String(uploadValue.listing_file_id),
      providerFilename: String(uploadValue.filename),
      providerSizeBytes: Number(uploadValue.size_bytes)
    };
    const candidateCompleted = [...completed, receiptItem];
    const protectedOk = protectedAfterMatches(afterEach, beforeVideoSnapshot);
    const completedOk = candidateCompleted.every((item) => {
      const completedTarget = PDT_BOBA_001_B01_BUYER_FILES.targets.find((candidate) => candidate.slot === item.slot);
      return Boolean(completedTarget && replacedTargetMatches(afterEach, completedTarget, item.providerListingFileId));
    });
    const remainingOk = PDT_BOBA_001_B01_BUYER_FILES.targets.slice(index + 1).every((remaining) => currentTargetMatches(afterEach, remaining));
    if (!protectedOk || !completedOk || !remainingOk) {
      const receipt = { completedTargets: candidateCompleted, protectedVideoSnapshot: beforeVideoSnapshot, ETSY_WRITE_COUNT: providerWriteCount, readBackStatus: afterEach.statuses, evidenceGap: PDT_BOBA_001_B01_BUYER_FILE_SHA_EVIDENCE_GAP };
      await recordOperationResult(repository, record.operationId, record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: `TARGET_${target.slot}_READBACK_MISMATCH`, receipt });
      return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_POST_WRITE_READBACK_MISMATCH_DO_NOT_RETRY", targetSlot: target.slot, ETSY_WRITE_COUNT: providerWriteCount }, { status: 202 });
    }

    completed = candidateCompleted;
    const pendingReceipt = { completedTargets: completed, protectedVideoSnapshot: beforeVideoSnapshot, ETSY_WRITE_COUNT: providerWriteCount, readBackStatus: afterEach.statuses, evidenceGap: PDT_BOBA_001_B01_BUYER_FILE_SHA_EVIDENCE_GAP };
    await savePendingProgress(repository, record, pendingReceipt, `TARGET_${target.slot}_VERIFIED`, runtime.now?.() ?? new Date().toISOString());
    const persisted = await repository.load(record.operationId);
    if (!persisted) throw new Error("PDT_BOBA_001_B01_BUYER_FILES_LEDGER_PROGRESS_MISSING");
    record = persisted;
  }

  let finalState: State;
  try { finalState = await readState(token, fetchImpl); }
  catch {
    const receipt = { completedTargets: completed, protectedVideoSnapshot: beforeVideoSnapshot, ETSY_WRITE_COUNT: providerWriteCount };
    await recordOperationResult(repository, record.operationId, record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "FINAL_READBACK_FAILED", receipt });
    return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_FINAL_READBACK_FAILED_DO_NOT_RETRY", ETSY_WRITE_COUNT: providerWriteCount }, { status: 202 });
  }
  const finalOk = protectedAfterMatches(finalState, beforeVideoSnapshot) && PDT_BOBA_001_B01_BUYER_FILES.targets.every((target, index) => replacedTargetMatches(finalState, target, completed[index]?.providerListingFileId));
  if (!finalOk) {
    const receipt = { completedTargets: completed, protectedVideoSnapshot: beforeVideoSnapshot, ETSY_WRITE_COUNT: providerWriteCount, readBackStatus: finalState.statuses };
    await recordOperationResult(repository, record.operationId, record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "FINAL_READBACK_MISMATCH", receipt });
    return NextResponse.json({ error: "PDT_BOBA_001_B01_BUYER_FILES_FINAL_READBACK_MISMATCH_DO_NOT_RETRY", ETSY_WRITE_COUNT: providerWriteCount }, { status: 202 });
  }

  const done = await recordOperationResult(repository, record.operationId, record.requestHash, "SUCCEEDED", runtime.now?.() ?? new Date().toISOString(), {
    receipt: {
      completedTargets: completed,
      protectedVideoSnapshot: beforeVideoSnapshot,
      ETSY_WRITE_COUNT: providerWriteCount,
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
  return NextResponse.json({ status: "UPDATED_AND_VERIFIED", mode: "WRITE_ONCE", operationId: done.operationId, requestHash: done.requestHash, ledgerStatus: done.status, receipt: done.receipt, ETSY_WRITE_COUNT: providerWriteCount });
}
