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
import {
  clearAuthorizedAsset,
  loadAuthorizedAsset,
  stageAuthorizedAssetChunk
} from "./authorized-operation-asset-store";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";

export const PDT_BOBA_001_C03_GALLERY_REPAIR = Object.freeze({
  operation: "GALLERY_MOBILE_SAFE_REPAIR_ONLY",
  operationId: "PDT-BOBA-001-C03-GALLERY-MOBILE-SAFE-REPAIR-001",
  authorizationId: "PTQC-PDT-BOBA-001-AUTH-20260909-C03-01",
  productId: "PDT-BOBA-001",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4560696421",
  candidateId: "ETSY-FULL-CONVERSION-REDESIGN-PDT-BOBA-001-V2-2026-09-09-C",
  candidateFingerprint: "bd07c992673bf3c339b5b2f336bb5a38d24c9c34d7799b17b9021fa29ac8515c",
  buildId: "ETSY-FULL-CONVERSION-REDESIGN-PDT-BOBA-001-BUILD-20260909-C03",
  buildFingerprint: "bd07c992673bf3c339b5b2f336bb5a38d24c9c34d7799b17b9021fa29ac8515c",
  acceptanceCriteriaVersion: "ETSY-AC-PDT-BOBA-001-FULL-CONVERSION-REDESIGN-V2.2",
  acceptanceCriteriaSha256: "56d838d64a9c8be8772dc8967eae34eb4532693a8f8677f1667adafb4e49f6c7",
  buildFreezeSha256: "77ca4de795b1d6247b61654badbbd6866f52f3a8433abeb2ead92094041024d2",
  protectedStateBaselineSha256: "98dbbbefb7c5b59a921815edb9d23c39149033d7ba2f56794e3c9339a978f185",
  protectedStateGeneratedAt: "2026-09-09T03:35:16.600Z",
  gallery: [
    { order: 1, fileName: "01_HERO_BOBA_SHOP_DAILY_OPERATIONS_TOOLKIT_9_TABS.png", googleDriveId: "1rVGb_ft_PLEMfZyrBz8BOYYLGA653HEh", byteSize: 402857, sha256: "2a10612957cc8d2b44851bbb666e0b4329f50c3f2b03ead9ef06aa77e68134a4", width: 2000, height: 1600, mimeType: "image/png" },
    { order: 2, fileName: "02_9_TABS_ONE_DAILY_ROUTINE.png", googleDriveId: "1TJqDx2Rdst39FTtieE6S1pSYCzLyhPW3", byteSize: 88720, sha256: "d357574a199de799a6e71ec1a17746f44d8cddcc9d0ac81ac338ccc3627233a4", width: 2000, height: 1600, mimeType: "image/png" },
    { order: 3, fileName: "03_9_TABS_BUILT_AROUND_DAILY_OPERATIONS.png", googleDriveId: "1u7atqgovF81U2CRtaZIunkLAZ8dgT6Yo", byteSize: 99561, sha256: "7f917adffa7f94f474e976cab1b9d29d436aa79dc2f4c293a12452f482d1078c", width: 1600, height: 900, mimeType: "image/png" },
    { order: 4, fileName: "04_OPENING_ASSIGN_THE_DAY.png", googleDriveId: "1ex80ABXlPYQqotPsmReS2jBYUkkL_yuV", byteSize: 114403, sha256: "b3e84671071a0690c3f115305f57fd6091e1f3a44c6c069ccdb6b0800444745d", width: 1600, height: 900, mimeType: "image/png" },
    { order: 5, fileName: "05_PREP_LOG_TRACK_PREP_USE_WASTE.png", googleDriveId: "1uDxY-k7mWK6qCtDwaQva2g8dWtr0weId", byteSize: 109175, sha256: "625815ec960fb99712487388a003695c55fb47e7ce0b666bf925d10326aa81a7", width: 1600, height: 900, mimeType: "image/png" },
    { order: 6, fileName: "06_STOCK_WASTE_REORDER_STATUS.png", googleDriveId: "1f6JbxC6kyEL5zRpZhrdmHo_jm_sM5Bs7", byteSize: 116300, sha256: "e6bb3abb0461de41b5c578719b2d03f6cf8829858bc6f9e22d78a3a206155722", width: 1600, height: 900, mimeType: "image/png" },
    { order: 7, fileName: "07_CASH_HANDOFF_CLOSE_SHIFT_WITH_CONTEXT.png", googleDriveId: "1aRd4oJwdlOn3g8urPtWoheL6REGqAJxV", byteSize: 113678, sha256: "17174fcb6c31e3e59de7a507bd13cf6177024a1b2f4a0994efc9069d70e88b12", width: 1600, height: 900, mimeType: "image/png" },
    { order: 8, fileName: "08_OPERATE_CLOSE_CLEANING_CLOSING_CONNECTED.png", googleDriveId: "1rsGNu8z5y3unh-CTPcppNPdw6W61fSJT", byteSize: 119287, sha256: "b1298d695d649c9dfb99cf434e26b0d2c7ef3d841d7f3a50e6d5992375e54430", width: 1600, height: 900, mimeType: "image/png" },
    { order: 9, fileName: "09_START_HERE_QUICK_DASHBOARD.png", googleDriveId: "1M-9dEHAaRRez16gti4d0p1FQPHtjnzGr", byteSize: 114904, sha256: "322e8451b6f70ac568201d2f93be5ea9688b03dec841ee9bf8ae3c29526c2dbe", width: 1600, height: 900, mimeType: "image/png" },
    { order: 10, fileName: "10_SETUP_ASSISTANT_BLANK_CHECKLIST.png", googleDriveId: "1IUMPbNHiC1YKMEMnZnADfzDRj81M0Ksj", byteSize: 122601, sha256: "41a03a6119e814b79d7423097a68c604be18e5a1511c21e5856252e9cc9b869f", width: 1600, height: 900, mimeType: "image/png" },
    { order: 11, fileName: "11_WHAT_YOU_GET_LOCKED_BUYER_DELIVERABLES.png", googleDriveId: "1Dy6b54gHWR_v4XgbZCBlwBEpHl7fZ8Us", byteSize: 118691, sha256: "76cc4e9f129c402cae403a0f7efefcddd43167c5620ed29ba3442d59a522fb7f", width: 1600, height: 900, mimeType: "image/png" },
    { order: 12, fileName: "12_DIGITAL_DOWNLOAD_SET_UP_RUN_THE_DAY.png", googleDriveId: "1Z-QqDA3OnuxrzmcyeFrkA4idQEoVgay1", byteSize: 103746, sha256: "69c4f207191e6a2b2c3d9450bc26c7d98e426528cf36ecd38dee88511422787b", width: 1600, height: 900, mimeType: "image/png" }
  ] as const
} as const);

const EXPECTED_BEFORE = Object.freeze({
  state: "active",
  title: "Boba Shop Operations Toolkit, Cafe Daily SOP, Checklist, Excel Google Sheets Template (Digital Download)",
  tags: ["bubble tea business", "boba shop toolkit", "boba operations", "boba shop sop", "cafe opening closing", "daily prep log", "stock waste tracker", "shift handoff log", "tea cafe template", "milktea inventory", "cafe cleaning sheet", "drink shop checklist", "google sheets boba"] as readonly string[],
  descriptionSha256: "d0dc4d675c55ce4ff8542b2422021a4028e2abc7479f36b27b33d9f3c58b41e4",
  price: { amount: 1290, divisor: 100, currency_code: "USD" },
  taxonomyId: 12476,
  quantity: 999,
  whoMade: "i_did",
  whenMade: "2020_2026",
  listingType: "download",
  attributesCount: 0,
  buyerFiles: [
    [1509032655604, 1, "PoonthaiDigital_Boba_Checklist_A4.pdf", 17459, "application/pdf"],
    [1509032655658, 2, "PoonthaiDigital_Boba_Checklist_US_Letter.pdf", 16632, "application/pdf"],
    [1509891952828, 3, "Boba_Read_Me_License.pdf", 4620, "application/pdf"],
    [1509891952826, 4, "Boba_Quick_Start.pdf", 4564, "application/pdf"],
    [1509980398204, 5, "PoonthaiDigital_Boba_Shop_Operations_Tracker.zip", 22370, "application/zip"]
  ] as readonly (readonly (number | string)[])[],
  currentGallery: [
    [8485017526, 1, 2000, 1600], [8485017504, 2, 2000, 1600], [8532915667, 3, 2000, 1600],
    [8532915695, 4, 2000, 1600], [8485017508, 5, 2000, 1600], [8532915683, 6, 2000, 1600],
    [8485017512, 7, 2000, 1600], [8485017510, 8, 2000, 1600], [8532915679, 9, 2000, 1600],
    [8485017528, 10, 2000, 1600]
  ] as readonly (readonly number[])[],
  offerStatus: "NOT_AVAILABLE_FROM_CURRENT_ETSY_API_PATH; DO_NOT_MUTATE_OR_INFER"
} as const);

type RecordValue = Record<string, unknown>;
type ReadState = { listing: RecordValue; images: RecordValue[]; attributes: RecordValue[]; files: RecordValue[]; statuses: Record<string, number> };
type GalleryAsset = (typeof PDT_BOBA_001_C03_GALLERY_REPAIR.gallery)[number];

export type PdtBoba001C03Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  loadAsset?: (asset: GalleryAsset) => Promise<Buffer>;
  clearAsset?: (asset: GalleryAsset) => Promise<void>;
  verifyAsset?: (bytes: Buffer, asset: GalleryAsset) => boolean;
  now?: () => string;
};

function isRecord(value: unknown): value is RecordValue { return typeof value === "object" && value !== null && !Array.isArray(value); }
function secureEqual(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function exactArray(value: unknown, expected: readonly unknown[]) { return Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected); }
async function parseJson(response: Response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text) as unknown; } catch { return {}; } }
function hashText(value: unknown) { return createHash("sha256").update(typeof value === "string" ? value.normalize("NFC") : "", "utf8").digest("hex"); }
function normalizedResults(value: unknown) { return isRecord(value) && Array.isArray(value.results) ? value.results.filter(isRecord) : null; }

export function exactPdtBoba001C03GalleryRepairBody() {
  return {
    operation: PDT_BOBA_001_C03_GALLERY_REPAIR.operation,
    operationId: PDT_BOBA_001_C03_GALLERY_REPAIR.operationId,
    authorizationId: PDT_BOBA_001_C03_GALLERY_REPAIR.authorizationId,
    productId: PDT_BOBA_001_C03_GALLERY_REPAIR.productId,
    productVersion: PDT_BOBA_001_C03_GALLERY_REPAIR.productVersion,
    shopId: PDT_BOBA_001_C03_GALLERY_REPAIR.shopId,
    listingId: PDT_BOBA_001_C03_GALLERY_REPAIR.listingId,
    candidateId: PDT_BOBA_001_C03_GALLERY_REPAIR.candidateId,
    candidateFingerprint: PDT_BOBA_001_C03_GALLERY_REPAIR.candidateFingerprint,
    buildId: PDT_BOBA_001_C03_GALLERY_REPAIR.buildId,
    buildFingerprint: PDT_BOBA_001_C03_GALLERY_REPAIR.buildFingerprint,
    acceptanceCriteriaVersion: PDT_BOBA_001_C03_GALLERY_REPAIR.acceptanceCriteriaVersion,
    acceptanceCriteriaSha256: PDT_BOBA_001_C03_GALLERY_REPAIR.acceptanceCriteriaSha256,
    buildFreezeSha256: PDT_BOBA_001_C03_GALLERY_REPAIR.buildFreezeSha256,
    protectedStateBaselineSha256: PDT_BOBA_001_C03_GALLERY_REPAIR.protectedStateBaselineSha256,
    protectedStateGeneratedAt: PDT_BOBA_001_C03_GALLERY_REPAIR.protectedStateGeneratedAt,
    gallery: PDT_BOBA_001_C03_GALLERY_REPAIR.gallery.map((asset) => ({ ...asset }))
  };
}

function authorizationError(request: Request) {
  const expected = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!expected) return NextResponse.json({ error: "PDT_BOBA_001_C03_AUTH_NOT_CONFIGURED", providerWriteCount: 0 }, { status: 503 });
  if (!supplied || !secureEqual(supplied, expected)) return NextResponse.json({ error: "PDT_BOBA_001_C03_UNAUTHORIZED", providerWriteCount: 0 }, { status: 401 });
  return null;
}

function verifyAsset(bytes: Buffer, asset: GalleryAsset) {
  if (bytes.length !== asset.byteSize || createHash("sha256").update(bytes).digest("hex") !== asset.sha256) return false;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return bytes.length >= 24 && bytes.subarray(0, 8).equals(signature) && bytes.readUInt32BE(16) === asset.width && bytes.readUInt32BE(20) === asset.height;
}

async function readState(accessToken: string, fetchImpl: typeof fetch): Promise<ReadState> {
  const base = "https://api.etsy.com/v3/application";
  const listingId = PDT_BOBA_001_C03_GALLERY_REPAIR.listingId;
  const shopId = PDT_BOBA_001_C03_GALLERY_REPAIR.shopId;
  const endpoints = {
    listing: `${base}/listings/${listingId}`,
    images: `${base}/listings/${listingId}/images`,
    attributes: `${base}/shops/${shopId}/listings/${listingId}/properties`,
    files: `${base}/shops/${shopId}/listings/${listingId}/files`
  };
  const entries = await Promise.all(Object.entries(endpoints).map(async ([name, url]) => {
    const response = await fetchImpl(url, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" });
    return { name, response, value: await parseJson(response) };
  }));
  const by = Object.fromEntries(entries.map((entry) => [entry.name, entry])) as Record<string, { response: Response; value: unknown }>;
  if (!by.listing.response.ok || !isRecord(by.listing.value) || !by.images.response.ok || !by.attributes.response.ok || !by.files.response.ok) throw new Error("PDT_BOBA_001_C03_READBACK_FAILED");
  const images = normalizedResults(by.images.value), attributes = normalizedResults(by.attributes.value), files = normalizedResults(by.files.value);
  if (!images || !attributes || !files) throw new Error("PDT_BOBA_001_C03_READBACK_INVALID");
  return { listing: by.listing.value, images, attributes, files, statuses: Object.fromEntries(entries.map((entry) => [entry.name, entry.response.status])) };
}

function protectedCoreMatches(state: ReadState) {
  const listing = state.listing;
  const price = isRecord(listing.price) ? listing.price : {};
  if (String(listing.shop_id) !== PDT_BOBA_001_C03_GALLERY_REPAIR.shopId || String(listing.state).toLowerCase() !== EXPECTED_BEFORE.state) return false;
  if (listing.title !== EXPECTED_BEFORE.title || !exactArray(listing.tags, EXPECTED_BEFORE.tags) || hashText(listing.description) !== EXPECTED_BEFORE.descriptionSha256) return false;
  if (Number(price.amount) !== EXPECTED_BEFORE.price.amount || Number(price.divisor) !== EXPECTED_BEFORE.price.divisor || price.currency_code !== EXPECTED_BEFORE.price.currency_code) return false;
  if (Number(listing.taxonomy_id) !== EXPECTED_BEFORE.taxonomyId || Number(listing.quantity) !== EXPECTED_BEFORE.quantity || listing.who_made !== EXPECTED_BEFORE.whoMade || listing.when_made !== EXPECTED_BEFORE.whenMade || (listing.listing_type ?? listing.type) !== EXPECTED_BEFORE.listingType) return false;
  if (state.attributes.length !== EXPECTED_BEFORE.attributesCount) return false;
  const files = [...state.files].sort((a, b) => Number(a.rank) - Number(b.rank)).map((file) => [Number(file.listing_file_id), Number(file.rank), file.filename, Number(file.size_bytes), file.filetype]);
  return JSON.stringify(files) === JSON.stringify(EXPECTED_BEFORE.buyerFiles);
}

function exactPreWriteBaselineMatches(state: ReadState) {
  if (!protectedCoreMatches(state)) return false;
  const gallery = [...state.images].sort((a, b) => Number(a.rank) - Number(b.rank)).map((image) => [Number(image.listing_image_id), Number(image.rank), Number(image.full_width), Number(image.full_height)]);
  return JSON.stringify(gallery) === JSON.stringify(EXPECTED_BEFORE.currentGallery);
}

function finalGalleryMatches(state: ReadState, uploadedIds: readonly string[]) {
  if (!protectedCoreMatches(state) || state.images.length !== PDT_BOBA_001_C03_GALLERY_REPAIR.gallery.length) return false;
  const images = [...state.images].sort((a, b) => Number(a.rank) - Number(b.rank));
  return PDT_BOBA_001_C03_GALLERY_REPAIR.gallery.every((asset, index) => {
    const image = images[index];
    return Number(image?.rank) === asset.order && String(image?.listing_image_id ?? "") === uploadedIds[index] && Number(image?.full_width) === asset.width && Number(image?.full_height) === asset.height;
  });
}

function multipartHeaders(token: string) { const headers = etsyApiHeaders(token); delete headers["content-type"]; return headers; }

async function loadAndVerifyAllAssets(runtime: PdtBoba001C03Runtime) {
  const assets: Array<{ asset: GalleryAsset; bytes: Buffer }> = [];
  for (const asset of PDT_BOBA_001_C03_GALLERY_REPAIR.gallery) {
    let bytes: Buffer;
    try { bytes = await (runtime.loadAsset ? runtime.loadAsset(asset) : loadAuthorizedAsset(PDT_BOBA_001_C03_GALLERY_REPAIR.operationId, asset.sha256)); }
    catch { throw new Error(`PDT_BOBA_001_C03_ASSET_NOT_READY_${asset.order}`); }
    if (!(runtime.verifyAsset ?? verifyAsset)(bytes, asset)) throw new Error(`PDT_BOBA_001_C03_ASSET_IDENTITY_MISMATCH_${asset.order}`);
    assets.push({ asset, bytes });
  }
  return assets;
}

export async function handlePdtBoba001C03GalleryRepair(body: Record<string, unknown>, request: Request, runtime: PdtBoba001C03Runtime = {}) {
  if (process.env.PUBLISH_WRITES_ENABLED !== "true") return NextResponse.json({ error: "PDT_BOBA_001_C03_WRITES_DISABLED", providerWriteCount: 0 }, { status: 403 });
  const auth = authorizationError(request); if (auth) return auth;
  const exactBody = exactPdtBoba001C03GalleryRepairBody();
  if (hashOperationRequest(body) !== hashOperationRequest(exactBody)) return NextResponse.json({ error: "PDT_BOBA_001_C03_AUTHORIZATION_CONTRACT_MISMATCH", providerWriteCount: 0 }, { status: 409 });
  if ((process.env.ETSY_SHOP_ID?.trim() ?? "") !== PDT_BOBA_001_C03_GALLERY_REPAIR.shopId) return NextResponse.json({ error: "PDT_BOBA_001_C03_SHOP_MISMATCH", providerWriteCount: 0 }, { status: 409 });

  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  const expectedRequestHash = hashOperationRequest(exactBody);
  const existing = await repository.load(PDT_BOBA_001_C03_GALLERY_REPAIR.operationId);
  if (existing) {
    if (existing.requestHash !== expectedRequestHash) return NextResponse.json({ error: "OPERATION_ID_PAYLOAD_MISMATCH", providerWriteCount: 0 }, { status: 409 });
    if (existing.status === "SUCCEEDED") return NextResponse.json({ status: "REPLAY", mode: "WRITE_ONCE", operationId: existing.operationId, requestHash: existing.requestHash, ledgerStatus: existing.status, providerWriteCount: 0, receipt: existing.receipt });
    return NextResponse.json({ error: "PDT_BOBA_001_C03_ALREADY_CLAIMED", ledgerStatus: existing.status, providerWriteCount: 0 }, { status: 409 });
  }

  let stagedAssets: Awaited<ReturnType<typeof loadAndVerifyAllAssets>>;
  try { stagedAssets = await loadAndVerifyAllAssets(runtime); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "PDT_BOBA_001_C03_ASSET_ERROR", providerWriteCount: 0 }, { status: 409 }); }

  const fetchImpl = runtime.fetchImpl ?? fetch;
  const accessToken = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
  let before: ReadState;
  try { before = await readState(accessToken, fetchImpl); }
  catch { return NextResponse.json({ error: "PDT_BOBA_001_C03_PREREAD_FAILED", providerWriteCount: 0 }, { status: 502 }); }
  if (!exactPreWriteBaselineMatches(before)) return NextResponse.json({ error: "PDT_BOBA_001_C03_PROTECTED_STATE_MISMATCH", providerWriteCount: 0 }, { status: 409 });

  const now = runtime.now?.() ?? new Date().toISOString();
  let begun: Awaited<ReturnType<typeof beginOperation>>;
  try { begun = await beginOperation(repository, PDT_BOBA_001_C03_GALLERY_REPAIR.operationId, body, now); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "OPERATION_LEDGER_ERROR", providerWriteCount: 0 }, { status: 409 }); }
  if (begun.status === "REPLAY") return NextResponse.json({ error: "PDT_BOBA_001_C03_ALREADY_CLAIMED", ledgerStatus: begun.record.status, providerWriteCount: 0 }, { status: 409 });

  const uploadedIds: string[] = [];
  let providerWriteCount = 0;
  const uploadUrl = `https://api.etsy.com/v3/application/shops/${PDT_BOBA_001_C03_GALLERY_REPAIR.shopId}/listings/${PDT_BOBA_001_C03_GALLERY_REPAIR.listingId}/images`;
  for (const { asset, bytes } of stagedAssets) {
    const form = new FormData();
    form.append("image", new File([Uint8Array.from(bytes)], asset.fileName, { type: asset.mimeType }), asset.fileName);
    form.append("rank", String(asset.order));
    form.append("overwrite", "true");
    let upload: Response;
    try {
      providerWriteCount += 1;
      upload = await fetchImpl(uploadUrl, { method: "POST", headers: multipartHeaders(accessToken), body: form, cache: "no-store" });
    } catch {
      await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: `GALLERY_UPLOAD_${asset.order}_AMBIGUOUS`, receipt: { providerWriteCount, uploadedIds } });
      return NextResponse.json({ error: "PDT_BOBA_001_C03_UPLOAD_AMBIGUOUS_DO_NOT_RETRY", providerWriteCount, uploadedIds }, { status: 202 });
    }
    const value = await parseJson(upload);
    if (!upload.ok) {
      const ledgerStatus = upload.status >= 500 ? "RECONCILIATION_REQUIRED" : "FAILED";
      await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, ledgerStatus, runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: `GALLERY_UPLOAD_${asset.order}_REJECTED`, receipt: { providerWriteCount, uploadedIds, statusCode: upload.status } });
      return NextResponse.json({ error: ledgerStatus === "RECONCILIATION_REQUIRED" ? "PDT_BOBA_001_C03_UPLOAD_AMBIGUOUS_DO_NOT_RETRY" : "PDT_BOBA_001_C03_UPLOAD_REJECTED", statusCode: upload.status, providerWriteCount, uploadedIds }, { status: ledgerStatus === "RECONCILIATION_REQUIRED" ? 202 : 502 });
    }
    if (!isRecord(value) || !value.listing_image_id) {
      await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: `GALLERY_UPLOAD_${asset.order}_NO_RECEIPT_ID`, receipt: { providerWriteCount, uploadedIds } });
      return NextResponse.json({ error: "PDT_BOBA_001_C03_UPLOAD_RECEIPT_AMBIGUOUS_DO_NOT_RETRY", providerWriteCount, uploadedIds }, { status: 202 });
    }
    uploadedIds.push(String(value.listing_image_id));
  }

  let final: ReadState;
  try { final = await readState(accessToken, fetchImpl); }
  catch {
    await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "FINAL_READBACK_FAILED", receipt: { providerWriteCount, uploadedIds } });
    return NextResponse.json({ error: "PDT_BOBA_001_C03_FINAL_READBACK_FAILED_DO_NOT_RETRY", providerWriteCount, uploadedIds }, { status: 202 });
  }
  if (!finalGalleryMatches(final, uploadedIds)) {
    await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "FINAL_READBACK_MISMATCH", receipt: { providerWriteCount, uploadedIds, readBackStatus: final.statuses } });
    return NextResponse.json({ error: "PDT_BOBA_001_C03_FINAL_READBACK_MISMATCH_DO_NOT_RETRY", providerWriteCount, uploadedIds }, { status: 202 });
  }

  const done = await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "SUCCEEDED", runtime.now?.() ?? new Date().toISOString(), {
    receipt: {
      providerWriteCount,
      uploadedIds,
      authorizationId: PDT_BOBA_001_C03_GALLERY_REPAIR.authorizationId,
      candidateFingerprint: PDT_BOBA_001_C03_GALLERY_REPAIR.candidateFingerprint,
      buildFingerprint: PDT_BOBA_001_C03_GALLERY_REPAIR.buildFingerprint,
      acceptanceCriteriaSha256: PDT_BOBA_001_C03_GALLERY_REPAIR.acceptanceCriteriaSha256,
      protectedStateBaselineSha256: PDT_BOBA_001_C03_GALLERY_REPAIR.protectedStateBaselineSha256,
      verified: { galleryExactOrdered12: "PASS", title: "PRESERVED", tags: "PRESERVED", description: "PRESERVED", price: "PRESERVED", taxonomy: "PRESERVED", attributes: "PRESERVED", quantity: "PRESERVED", buyerFiles: "PRESERVED" },
      readBackStatus: final.statuses
    }
  });
  for (const asset of PDT_BOBA_001_C03_GALLERY_REPAIR.gallery) {
    try { await (runtime.clearAsset ? runtime.clearAsset(asset) : clearAuthorizedAsset(PDT_BOBA_001_C03_GALLERY_REPAIR.operationId, asset.sha256)); } catch { /* execution already verified; cleanup is best effort */ }
  }
  return NextResponse.json({ status: "UPDATED_AND_VERIFIED", mode: "WRITE_ONCE", operationId: done.operationId, requestHash: done.requestHash, ledgerStatus: done.status, providerWriteCount, receipt: done.receipt });
}

export async function handlePdtBoba001C03AssetChunk(body: Record<string, unknown>, request: Request) {
  const auth = authorizationError(request); if (auth) return auth;
  const operationId = typeof body.operationId === "string" ? body.operationId : "";
  const assetSha256 = typeof body.assetSha256 === "string" ? body.assetSha256 : "";
  if (operationId !== PDT_BOBA_001_C03_GALLERY_REPAIR.operationId || !PDT_BOBA_001_C03_GALLERY_REPAIR.gallery.some((asset) => asset.sha256 === assetSha256)) return NextResponse.json({ error: "PDT_BOBA_001_C03_ASSET_NOT_REGISTERED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  const chunkIndex = Number(body.chunkIndex), chunkCount = Number(body.chunkCount), dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";
  try { await stageAuthorizedAssetChunk({ operationId, assetSha256, chunkIndex, chunkCount, dataBase64 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "ASSET_STAGE_FAILED", ETSY_WRITE_COUNT: 0 }, { status: 409 }); }
  return NextResponse.json({ status: "ASSET_CHUNK_STAGED", operationId, assetSha256, chunkIndex, chunkCount, ETSY_WRITE_COUNT: 0 });
}
