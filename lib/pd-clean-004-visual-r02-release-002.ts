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
const SHA256 = /^[a-f0-9]{64}$/;

export const PD_CLEAN_004_VISUAL_R02_RELEASE_002 = Object.freeze({
  operation: "REPLACE_GALLERY_8_ALT_TEXT_8_ADD_VIDEO_1_ONLY",
  operationId: "PD-CLEAN-004-VISUAL-R02-RELEASE-002",
  recoveryOf: "PD-CLEAN-004-VISUAL-R02-RELEASE-001",
  recoveryReason: "ETSY_HTTP_429_BEFORE_FIRST_CONFIRMED_WRITE",
  operationFingerprint: "ab27b1d8712abb91e813d4782dc8fbd4ad40c57f2e52ffc414ae4fa21c49b59e",
  authorizationId: "PD-CLEAN-004-VISUAL-R02-AUTH-20260916-03-RECOVERY",
  productId: "PD-CLEAN-004",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4561795303",
  candidateId: "ETSY-VISUAL-PD-CLEAN-004-V1-2026-09-16-R02",
  candidateFingerprint: "4448973e5abee4bd344414307c12066248af5f9ab7de26062333deee7f77f069",
  buildId: "ETSY-VISUAL-PD-CLEAN-004-BUILD-20260916-R02",
  acceptanceCriteriaId: "PD-CLEAN-004-VISUAL-AC-20260916-R02",
  authorizationEvidenceDriveId: "1J5rTN25Xs5Xozfg0kTBui3o_VsUcaISwxq0K02_WWZs",
  freezeEvidenceDriveId: "1ieI7K21t6NJCJoYtZlj6GAnKG9PaR330",
  operationFreezeDriveId: "1XKX6XLq_6k2KOPeyj40_Ap4cRykQow1365-TknZOW2A",
  finalQcDriveId: "1m7d_vxTdmp6zXVI5NqOUXkKHWEJadPP6",
  protectedStateDriveId: "1zg69vdNxMz-OdHuXul1ArtXgsIWD0FTJ2_-mUoNeZo8",
  gallery: [
    {
      order: 1,
      fileName: "PD-CLEAN-004_01_HERO_cafe-cleaning-checklist-schedule.jpg",
      driveId: "1vuay2bYHdUDbfcoIhPvvFbsSkZ6KmPPV",
      byteSize: 318649,
      sha256: "ba3657425384f9f50ba281dfea62ebec35327f5b712393fe252ea995ef2a87f3",
      width: 2500,
      height: 2000,
      mimeType: "image/jpeg",
      altText: "Cafe cleaning checklist and schedule hero showing a real Opening Clean Excel workbook worksheet, with opening, service reset, closing, weekly, monthly and verification workflow messaging."
    },
    {
      order: 2,
      fileName: "PD-CLEAN-004_02_WHATS-INCLUDED_8-workbook-tabs.jpg",
      driveId: "1Y10nDQNuIHmlYp4VDHk0JK9ObfOFbELG",
      byteSize: 264406,
      sha256: "ad324e91037979b70fff6e8e70f96e81e37665c3a386482a88590d334e3fbff1",
      width: 2500,
      height: 2000,
      mimeType: "image/jpeg",
      altText: "Cafe cleaning toolkit overview showing a real Start Here workbook preview beside the exact eight tabs: Start Here, Opening Clean, Service Reset, Closing Clean, Weekly, Monthly, Verification and Blank Checklist."
    },
    {
      order: 3,
      fileName: "PD-CLEAN-004_03_KEY-WORKSHEET_opening-clean.jpg",
      driveId: "1cVMAlf1LVruIwX-y6OGO02xweQhKdn1P",
      byteSize: 337420,
      sha256: "615fe79ac0ff537791176890324851312fd494d68e929526e3c77692577f8a08",
      width: 2500,
      height: 2000,
      mimeType: "image/jpeg",
      altText: "Opening Clean worksheet for a cafe cleaning checklist showing real workbook fields for area, cleaning task, frequency, assigned to, due time, status, verified by and notes."
    },
    {
      order: 4,
      fileName: "PD-CLEAN-004_04_WORKFLOW_service-reset-closing-clean.jpg",
      driveId: "1zTpXXmGRm77HPibyXcj-7vcmKl1_HMYW",
      byteSize: 288446,
      sha256: "71e6f54a0841651d1f52960a1d1ca3b0c075254566c16f71a564b8bec7f93c6d",
      width: 2500,
      height: 2000,
      mimeType: "image/jpeg",
      altText: "Cafe cleaning workflow showing real Service Reset and Closing Clean workbook worksheets side by side, with assignment, status and verified by fields used through service and closing."
    },
    {
      order: 5,
      fileName: "PD-CLEAN-004_05_KEY-WORKSHEET_weekly-monthly.jpg",
      driveId: "1yCk1PpVnG0XFQGxQQjPQN1VV7hPsufUA",
      byteSize: 311893,
      sha256: "e106d959d477c3f100ec8a0c7cc6ddcf2d0a7e86dc5c5121a684cbd7f492a7ec",
      width: 2500,
      height: 2000,
      mimeType: "image/jpeg",
      altText: "Cafe cleaning schedule showing real Weekly and Monthly workbook worksheets with assigned to, due day or date, status, verified by and notes fields for recurring cleaning tasks."
    },
    {
      order: 6,
      fileName: "PD-CLEAN-004_06_KEY-WORKSHEET_verification.jpg",
      driveId: "1TKJXe7f3vGOOkIU4Gbtotf0trwvdwTWS",
      byteSize: 233282,
      sha256: "d1fba8db8387ded4962705fc24b7875f94bf57d69b58e7e1793b1e383d2e1104",
      width: 2500,
      height: 2000,
      mimeType: "image/jpeg",
      altText: "Cafe cleaning verification worksheet showing a real workbook preview with date, shift, area, issue or missed task, immediate action, assigned to, due, status, verified by and notes fields."
    },
    {
      order: 7,
      fileName: "PD-CLEAN-004_07_EDITABLE-WORKFLOW_customize-tasks.jpg",
      driveId: "1PEQNNMkkGxI7L9Omy9zjtSkwTxJERVgh",
      byteSize: 356957,
      sha256: "9cae01a4e203da797bbf278c4187b459d993699add275c0ee38250246ea5d283",
      width: 2500,
      height: 2000,
      mimeType: "image/jpeg",
      altText: "Editable cafe cleaning workbook showing real Opening Clean task rows with cleaning task, assigned to, status, verified by and notes fields that can be customized for a business workflow."
    },
    {
      order: 8,
      fileName: "PD-CLEAN-004_08_WHAT-YOU-GET_delivery-trust.jpg",
      driveId: "16_x1Ap04dEzNoiSuMSPedwr2FkLco1Nr",
      byteSize: 238393,
      sha256: "2d9a593c0f632814091a7efa00be03fb95e807adbe03d1ea46e6d68a9edbfb88",
      width: 2500,
      height: 2000,
      mimeType: "image/jpeg",
      altText: "What you get with the cafe cleaning toolkit: real Start Here workbook preview beside the buyer ZIP, A4 eight-page PDF, US Letter eight-page PDF, two-page Quick Start and two-page Read Me and License PDF."
    }
  ] as const,
  video: {
    fileName: "PD-CLEAN-004_VIDEO_cafe-cleaning-checklist.mp4",
    driveId: "1tEEOIDctFE8jGhi9N9seKPWQKfcC3nc4",
    byteSize: 412385,
    sha256: "c4c366024450af646f68951d57fa0a6f93e903dba3784503faddc644fd051102",
    width: 1920,
    height: 1080,
    durationSeconds: 12,
    mimeType: "video/mp4"
  }
} as const);

const EXPECTED_BEFORE = Object.freeze({
  state: "active",
  title: "Cafe Cleaning Checklist & Schedule | Excel, Google Sheets, PDF",
  descriptionSha256: "8499e2bdebfee3c3cd45abb54fb4ac3bbed0349e4e93849425b54b1cbc97deda",
  descriptionLength: 2323,
  price: { amount: 790, divisor: 100, currencyCode: "USD" },
  taxonomyId: 12476,
  quantity: 999,
  whoMade: "i_did",
  whenMade: "2020_2026",
  listingType: "download",
  returnPolicyId: 1,
  fileData: "4 PDF, 1 ZIP",
  tags: [
    "cafe cleaning", "cleaning checklist", "weekly cleaning", "monthly cleaning", "closing cleaning",
    "opening cleaning", "coffee shop cleaning", "cleaning schedule", "cafe manager tool",
    "printable checklist", "excel checklist", "google sheets cafe", "digital download"
  ] as readonly string[],
  gallery: [
    [8473646947, 1, 2000, 2000], [8425776576, 2, 2000, 2000],
    [8425776592, 3, 2000, 2000], [8473646969, 4, 2000, 2000],
    [8425776588, 5, 2000, 2000], [8425776584, 6, 2000, 2000],
    [8425776642, 7, 2000, 2000], [8473646991, 8, 2000, 2000]
  ] as readonly (readonly number[])[],
  buyerFiles: [
    [1509497461832, 1, "Cafe_Cleaning_A4.pdf", 20770, "application/pdf"],
    [1509497461994, 2, "Cafe_Cleaning_US_Letter.pdf", 20342, "application/pdf"],
    [1510699937465, 3, "Cafe_Cleaning_Quick_Start.pdf", 4613, "application/pdf"],
    [1510699937529, 4, "Cafe_Cleaning_Read_Me_License.pdf", 4219, "application/pdf"],
    [1511184503089, 5, "Cafe_Cleaning_Checklist.zip", 15289, "application/zip"]
  ] as readonly (readonly (string | number)[])[]
} as const);

type Rec = Record<string, unknown>;
type State = {
  listing: Rec;
  images: Rec[];
  attributes: Rec[];
  files: Rec[];
  videos: Rec[];
  statuses: Record<string, number>;
};
type GalleryAsset = (typeof PD_CLEAN_004_VISUAL_R02_RELEASE_002.gallery)[number];
type ReleaseAsset = GalleryAsset | typeof PD_CLEAN_004_VISUAL_R02_RELEASE_002.video;

export type PdClean004VisualR02Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  loadAsset?: (asset: ReleaseAsset) => Promise<Buffer>;
  clearAsset?: (asset: ReleaseAsset) => Promise<void>;
  verifyAsset?: (bytes: Buffer, asset: ReleaseAsset) => boolean;
  verifyVideoUrl?: (url: string, expectedSha256: string, expectedSize: number) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => string;
};

const isRec = (value: unknown): value is Rec => typeof value === "object" && value !== null && !Array.isArray(value);
const results = (value: unknown) => isRec(value) && Array.isArray(value.results) ? value.results.filter(isRec) : null;
const secureEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const normalizeProtectedDescription = (value: unknown) => typeof value === "string" ? value.normalize("NFC").replaceAll("&gt;", ">") : "";
const hashText = (value: unknown) => createHash("sha256").update(normalizeProtectedDescription(value), "utf8").digest("hex");
async function json(response: Response) { const text = await response.text(); try { return text ? JSON.parse(text) as unknown : {}; } catch { return {}; } }
function multipartHeaders(token: string) { const headers = etsyApiHeaders(token); delete headers["content-type"]; return headers; }
function imageRows(state: State) { return [...state.images].sort((a, b) => Number(a.rank) - Number(b.rank)).map((image) => [Number(image.listing_image_id), Number(image.rank), Number(image.full_width), Number(image.full_height)]); }
function fileRows(state: State) { return [...state.files].sort((a, b) => Number(a.rank) - Number(b.rank)).map((file) => [Number(file.listing_file_id), Number(file.rank), String(file.filename ?? ""), Number(file.size_bytes), String(file.filetype ?? "")]); }
function videoRows(state: State) { return [...state.videos].map((video) => ({ videoId: Number(video.video_id), width: Number(video.width), height: Number(video.height), videoState: String(video.video_state ?? ""), videoUrl: String(video.video_url ?? "") })).sort((a, b) => a.videoId - b.videoId); }

async function readState(accessToken: string, fetchImpl: typeof fetch): Promise<State> {
  const base = "https://api.etsy.com/v3/application";
  const shop = PD_CLEAN_004_VISUAL_R02_RELEASE_002.shopId;
  const listing = PD_CLEAN_004_VISUAL_R02_RELEASE_002.listingId;
  const urls = {
    listing: `${base}/listings/${listing}`,
    images: `${base}/listings/${listing}/images`,
    attributes: `${base}/shops/${shop}/listings/${listing}/properties`,
    files: `${base}/shops/${shop}/listings/${listing}/files`,
    videos: `${base}/listings/${listing}/videos`
  };
  const entries = await Promise.all(Object.entries(urls).map(async ([name, url]) => {
    const response = await fetchImpl(url, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" });
    return { name, response, value: await json(response) };
  }));
  const by = Object.fromEntries(entries.map((entry) => [entry.name, entry])) as Record<string, { response: Response; value: unknown }>;
  const images = results(by.images.value), attributes = results(by.attributes.value), files = results(by.files.value), videos = results(by.videos.value);
  if (!by.listing.response.ok || !isRec(by.listing.value) || !by.images.response.ok || !by.attributes.response.ok || !by.files.response.ok || !by.videos.response.ok || !images || !attributes || !files || !videos) {
    throw new Error("PD_CLEAN_004_R02_RECOVERY_002_READBACK_FAILED");
  }
  return { listing: by.listing.value, images, attributes, files, videos, statuses: Object.fromEntries(entries.map((entry) => [entry.name, entry.response.status])) };
}

function protectedCoreMatches(state: State) {
  const listing = state.listing;
  const price = isRec(listing.price) ? listing.price : {};
  if (String(listing.listing_id) !== PD_CLEAN_004_VISUAL_R02_RELEASE_002.listingId || String(listing.shop_id) !== PD_CLEAN_004_VISUAL_R02_RELEASE_002.shopId) return false;
  if (String(listing.state).toLowerCase() !== EXPECTED_BEFORE.state || listing.title !== EXPECTED_BEFORE.title) return false;
  if (hashText(listing.description) !== EXPECTED_BEFORE.descriptionSha256 || normalizeProtectedDescription(listing.description).length !== EXPECTED_BEFORE.descriptionLength) return false;
  if (JSON.stringify(listing.tags) !== JSON.stringify(EXPECTED_BEFORE.tags)) return false;
  if (Number(price.amount) !== EXPECTED_BEFORE.price.amount || Number(price.divisor) !== EXPECTED_BEFORE.price.divisor || price.currency_code !== EXPECTED_BEFORE.price.currencyCode) return false;
  if (Number(listing.taxonomy_id) !== EXPECTED_BEFORE.taxonomyId || Number(listing.quantity) !== EXPECTED_BEFORE.quantity) return false;
  if (listing.who_made !== EXPECTED_BEFORE.whoMade || listing.when_made !== EXPECTED_BEFORE.whenMade || (listing.listing_type ?? listing.type) !== EXPECTED_BEFORE.listingType) return false;
  if (Number(listing.return_policy_id) !== EXPECTED_BEFORE.returnPolicyId || listing.file_data !== EXPECTED_BEFORE.fileData || state.attributes.length !== 0) return false;
  if ("is_supply" in listing && listing.is_supply !== false) return false;
  return JSON.stringify(fileRows(state)) === JSON.stringify(EXPECTED_BEFORE.buyerFiles);
}

function exactPreWriteBaselineMatches(state: State) {
  return protectedCoreMatches(state) &&
    JSON.stringify(imageRows(state)) === JSON.stringify(EXPECTED_BEFORE.gallery) &&
    videoRows(state).length === 0;
}

function protectedSnapshot(state: State) {
  const listing = state.listing;
  const price = isRec(listing.price) ? listing.price : {};
  return {
    listingId: Number(listing.listing_id), shopId: Number(listing.shop_id), state: listing.state,
    title: listing.title, descriptionSha256: hashText(listing.description), descriptionLength: normalizeProtectedDescription(listing.description).length,
    tags: listing.tags, price: { amount: Number(price.amount), divisor: Number(price.divisor), currencyCode: price.currency_code },
    taxonomyId: Number(listing.taxonomy_id), quantity: Number(listing.quantity), whoMade: listing.who_made,
    whenMade: listing.when_made, listingType: listing.listing_type ?? listing.type, returnPolicyId: Number(listing.return_policy_id),
    fileData: listing.file_data, images: imageRows(state), attributes: state.attributes, files: fileRows(state),
    videos: videoRows(state).map(({ videoId, width, height, videoState }) => ({ videoId, width, height, videoState }))
  } as Record<string, unknown>;
}

export function exactPdClean004Recovery002AuthorizationHash(protectedStateFingerprint: string) {
  return hashOperationRequest({
    authorizationId: PD_CLEAN_004_VISUAL_R02_RELEASE_002.authorizationId,
    operationId: PD_CLEAN_004_VISUAL_R02_RELEASE_002.operationId,
    recoveryOf: PD_CLEAN_004_VISUAL_R02_RELEASE_002.recoveryOf,
    recoveryReason: PD_CLEAN_004_VISUAL_R02_RELEASE_002.recoveryReason,
    operationFingerprint: PD_CLEAN_004_VISUAL_R02_RELEASE_002.operationFingerprint,
    candidateFingerprint: PD_CLEAN_004_VISUAL_R02_RELEASE_002.candidateFingerprint,
    scope: PD_CLEAN_004_VISUAL_R02_RELEASE_002.operation,
    protectedStateFingerprint: protectedStateFingerprint.trim().toLowerCase()
  });
}

export function exactPdClean004Recovery002ReleaseBody(protectedStateFingerprint: string) {
  return {
    operation: PD_CLEAN_004_VISUAL_R02_RELEASE_002.operation,
    operationId: PD_CLEAN_004_VISUAL_R02_RELEASE_002.operationId,
    recoveryOf: PD_CLEAN_004_VISUAL_R02_RELEASE_002.recoveryOf,
    recoveryReason: PD_CLEAN_004_VISUAL_R02_RELEASE_002.recoveryReason,
    operationFingerprint: PD_CLEAN_004_VISUAL_R02_RELEASE_002.operationFingerprint,
    authorizationId: PD_CLEAN_004_VISUAL_R02_RELEASE_002.authorizationId,
    productId: PD_CLEAN_004_VISUAL_R02_RELEASE_002.productId,
    productVersion: PD_CLEAN_004_VISUAL_R02_RELEASE_002.productVersion,
    shopId: PD_CLEAN_004_VISUAL_R02_RELEASE_002.shopId,
    listingId: PD_CLEAN_004_VISUAL_R02_RELEASE_002.listingId,
    candidateId: PD_CLEAN_004_VISUAL_R02_RELEASE_002.candidateId,
    candidateFingerprint: PD_CLEAN_004_VISUAL_R02_RELEASE_002.candidateFingerprint,
    buildId: PD_CLEAN_004_VISUAL_R02_RELEASE_002.buildId,
    acceptanceCriteriaId: PD_CLEAN_004_VISUAL_R02_RELEASE_002.acceptanceCriteriaId,
    protectedStateFingerprint: protectedStateFingerprint.trim().toLowerCase(),
    gallery: PD_CLEAN_004_VISUAL_R02_RELEASE_002.gallery.map((asset) => ({ ...asset })),
    video: { ...PD_CLEAN_004_VISUAL_R02_RELEASE_002.video }
  };
}

function writeAuthorizationError(request: Request) {
  if (process.env.PUBLISH_WRITES_ENABLED !== "true") return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_WRITES_DISABLED", ETSY_WRITE_COUNT: 0 }, { status: 403 });
  const expected = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!expected) return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_WRITE_AUTH_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0 }, { status: 503 });
  if (!supplied || !secureEqual(expected, supplied)) return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_UNAUTHORIZED", ETSY_WRITE_COUNT: 0 }, { status: 401 });
  if ((process.env.ETSY_SHOP_ID?.trim() ?? "") !== PD_CLEAN_004_VISUAL_R02_RELEASE_002.shopId) return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_SHOP_MISMATCH", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  return null;
}

function stagingAuthorizationError(request: Request) {
  const expected = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!expected) return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_STAGE_AUTH_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0 }, { status: 503 });
  if (!supplied || !secureEqual(expected, supplied)) return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_STAGE_UNAUTHORIZED", ETSY_WRITE_COUNT: 0 }, { status: 401 });
  return null;
}

function jpegDimensions(bytes: Buffer) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    const sof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (sof && length >= 7) return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    offset += length;
  }
  return null;
}

function defaultVerifyAsset(bytes: Buffer, asset: ReleaseAsset) {
  if (bytes.length !== asset.byteSize || createHash("sha256").update(bytes).digest("hex") !== asset.sha256) return false;
  if (asset.mimeType === "video/mp4") return bytes.length > 12 && bytes.toString("ascii", 4, 8) === "ftyp";
  const dimensions = jpegDimensions(bytes);
  return Boolean(dimensions && dimensions.width === asset.width && dimensions.height === asset.height);
}

async function loadAndVerifyAllAssets(runtime: PdClean004VisualR02Runtime) {
  const all: ReleaseAsset[] = [...PD_CLEAN_004_VISUAL_R02_RELEASE_002.gallery, PD_CLEAN_004_VISUAL_R02_RELEASE_002.video];
  const loaded: Array<{ asset: ReleaseAsset; bytes: Buffer }> = [];
  for (const asset of all) {
    let bytes: Buffer;
    try {
      bytes = await (runtime.loadAsset ? runtime.loadAsset(asset) : loadAuthorizedAsset(PD_CLEAN_004_VISUAL_R02_RELEASE_002.operationId, asset.sha256));
    } catch {
      throw new Error(`PD_CLEAN_004_R02_RECOVERY_002_ASSET_NOT_READY_${asset.sha256.slice(0, 8)}`);
    }
    if (!(runtime.verifyAsset ?? defaultVerifyAsset)(bytes, asset)) throw new Error(`PD_CLEAN_004_R02_RECOVERY_002_ASSET_IDENTITY_MISMATCH_${asset.sha256.slice(0, 8)}`);
    loaded.push({ asset, bytes });
  }
  return loaded;
}

async function defaultVerifyVideoUrl(fetchImpl: typeof fetch, url: string, expectedSha256: string, expectedSize: number) {
  if (!url.startsWith("https://")) return false;
  const response = await fetchImpl(url, { method: "GET", cache: "no-store" });
  if (!response.ok) return false;
  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes.length === expectedSize && createHash("sha256").update(bytes).digest("hex") === expectedSha256;
}

async function pollState(token: string, fetchImpl: typeof fetch, predicate: (state: State) => boolean, sleep: (ms: number) => Promise<void>) {
  let last: State | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try { last = await readState(token, fetchImpl); if (predicate(last)) return last; } catch { /* retry read only */ }
    if (attempt < 5) await sleep(750);
  }
  return last;
}

function finalGalleryMatches(state: State, uploadedIds: readonly string[]) {
  if (!protectedCoreMatches(state) || state.images.length !== PD_CLEAN_004_VISUAL_R02_RELEASE_002.gallery.length) return false;
  const images = [...state.images].sort((a, b) => Number(a.rank) - Number(b.rank));
  return PD_CLEAN_004_VISUAL_R02_RELEASE_002.gallery.every((asset, index) => {
    const image = images[index];
    return String(image?.listing_image_id ?? "") === uploadedIds[index] && Number(image?.rank) === asset.order &&
      Number(image?.full_width) === asset.width && Number(image?.full_height) === asset.height && String(image?.alt_text ?? "") === asset.altText;
  });
}

export async function verifyPdClean004R02Recovery002ProtectedState(runtime: PdClean004VisualR02Runtime = {}) {
  try {
    const token = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
    const state = await readState(token, runtime.fetchImpl ?? fetch);
    const match = exactPreWriteBaselineMatches(state);
    return NextResponse.json({
      status: match ? "PROTECTED_STATE_MATCH" : "PROTECTED_STATE_MISMATCH",
      operationId: PD_CLEAN_004_VISUAL_R02_RELEASE_002.operationId,
      operationFingerprint: PD_CLEAN_004_VISUAL_R02_RELEASE_002.operationFingerprint,
      listingId: PD_CLEAN_004_VISUAL_R02_RELEASE_002.listingId,
      candidateFingerprint: PD_CLEAN_004_VISUAL_R02_RELEASE_002.candidateFingerprint,
      protectedStateFingerprint: hashOperationRequest(protectedSnapshot(state)),
      galleryCount: state.images.length,
      videoCount: state.videos.length,
      providerReadStatus: state.statuses,
      scope: PD_CLEAN_004_VISUAL_R02_RELEASE_002.operation,
      ETSY_WRITE_COUNT: 0
    }, { status: match ? 200 : 409 });
  } catch {
    return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_PROTECTED_STATE_READ_FAILED", ETSY_WRITE_COUNT: 0 }, { status: 502 });
  }
}

export async function handlePdClean004R02Recovery002AssetChunk(body: Rec, request: Request) {
  const auth = stagingAuthorizationError(request); if (auth) return auth;
  const operationId = typeof body.operationId === "string" ? body.operationId : "";
  const assetSha256 = typeof body.assetSha256 === "string" ? body.assetSha256.toLowerCase() : "";
  const registered = [...PD_CLEAN_004_VISUAL_R02_RELEASE_002.gallery, PD_CLEAN_004_VISUAL_R02_RELEASE_002.video].some((asset) => asset.sha256 === assetSha256);
  if (operationId !== PD_CLEAN_004_VISUAL_R02_RELEASE_002.operationId || !registered) return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_ASSET_NOT_REGISTERED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  const chunkIndex = Number(body.chunkIndex), chunkCount = Number(body.chunkCount), dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";
  try { await stageAuthorizedAssetChunk({ operationId, assetSha256, chunkIndex, chunkCount, dataBase64 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "ASSET_STAGE_FAILED", ETSY_WRITE_COUNT: 0 }, { status: 409 }); }
  return NextResponse.json({ status: "ASSET_CHUNK_STAGED", operationId, assetSha256, chunkIndex, chunkCount, ETSY_WRITE_COUNT: 0 });
}

export async function handlePdClean004R02Recovery002Release(
  protectedStateFingerprint: string,
  authorizationRequestHash: string,
  request: Request,
  runtime: PdClean004VisualR02Runtime = {}
) {
  const auth = writeAuthorizationError(request); if (auth) return auth;
  const protectedSha = protectedStateFingerprint.trim().toLowerCase();
  const authHash = authorizationRequestHash.trim().toLowerCase();
  if (!SHA256.test(protectedSha) || !SHA256.test(authHash)) return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_EXACT_AUTHORIZATION_BINDING_REQUIRED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  const expectedAuthHash = exactPdClean004Recovery002AuthorizationHash(protectedSha);
  if (!secureEqual(expectedAuthHash, authHash)) return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_AUTHORIZATION_REQUEST_HASH_MISMATCH", ETSY_WRITE_COUNT: 0 }, { status: 409 });

  const body = exactPdClean004Recovery002ReleaseBody(protectedSha);
  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  const exactRequestHash = hashOperationRequest(body);
  const existing = await repository.load(PD_CLEAN_004_VISUAL_R02_RELEASE_002.operationId);
  if (existing) {
    if (existing.requestHash !== exactRequestHash) return NextResponse.json({ error: "OPERATION_ID_PAYLOAD_MISMATCH", ETSY_WRITE_COUNT: 0 }, { status: 409 });
    if (existing.status === "SUCCEEDED") return NextResponse.json({ status: "REPLAY", operationId: existing.operationId, receipt: existing.receipt, ETSY_WRITE_COUNT: 0 });
    return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_ALREADY_CLAIMED_DO_NOT_RETRY", ledgerStatus: existing.status, receipt: existing.receipt, ETSY_WRITE_COUNT: Number(existing.receipt?.ETSY_WRITE_COUNT) || 0 }, { status: existing.status === "RECONCILIATION_REQUIRED" ? 202 : 409 });
  }

  let staged: Awaited<ReturnType<typeof loadAndVerifyAllAssets>>;
  try { staged = await loadAndVerifyAllAssets(runtime); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "PD_CLEAN_004_R02_RECOVERY_002_ASSET_ERROR", ETSY_WRITE_COUNT: 0 }, { status: 409 }); }

  const fetchImpl = runtime.fetchImpl ?? fetch;
  const token = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
  let before: State;
  try { before = await readState(token, fetchImpl); }
  catch { return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_PREREAD_FAILED", ETSY_WRITE_COUNT: 0 }, { status: 502 }); }
  if (!exactPreWriteBaselineMatches(before)) return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_PROTECTED_STATE_MISMATCH", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  const actualProtectedSha = hashOperationRequest(protectedSnapshot(before));
  if (!secureEqual(actualProtectedSha, protectedSha)) return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_FRESH_PSV_FINGERPRINT_MISMATCH", actualProtectedStateFingerprint: actualProtectedSha, ETSY_WRITE_COUNT: 0 }, { status: 409 });

  const now = runtime.now?.() ?? new Date().toISOString();
  const begun = await beginOperation(repository, PD_CLEAN_004_VISUAL_R02_RELEASE_002.operationId, body, now);
  if (begun.status === "REPLAY") return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_ALREADY_CLAIMED_DO_NOT_RETRY", ETSY_WRITE_COUNT: 0 }, { status: 409 });

  const bySha = new Map(staged.map((entry) => [entry.asset.sha256, entry.bytes]));
  const uploadedIds: string[] = [];
  let confirmedWrites = 0;
  let writeAttempts = 0;
  const imagesUrl = `https://api.etsy.com/v3/application/shops/${PD_CLEAN_004_VISUAL_R02_RELEASE_002.shopId}/listings/${PD_CLEAN_004_VISUAL_R02_RELEASE_002.listingId}/images`;

  for (const asset of PD_CLEAN_004_VISUAL_R02_RELEASE_002.gallery) {
    const bytes = bySha.get(asset.sha256)!;
    const form = new FormData();
    form.set("image", new File([new Uint8Array(bytes)], asset.fileName, { type: asset.mimeType }), asset.fileName);
    form.set("rank", String(asset.order));
    form.set("overwrite", "true");
    form.set("alt_text", asset.altText);
    let response: Response;
    writeAttempts += 1;
    try { response = await fetchImpl(imagesUrl, { method: "POST", headers: multipartHeaders(token), body: form, cache: "no-store" }); }
    catch {
      await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: `GALLERY_${asset.order}_RESPONSE_AMBIGUOUS`, receipt: { uploadedIds, ETSY_WRITE_COUNT: confirmedWrites, ETSY_WRITE_ATTEMPT_COUNT: writeAttempts } });
      return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_GALLERY_UPLOAD_AMBIGUOUS_DO_NOT_RETRY", uploadedIds, ETSY_WRITE_COUNT: confirmedWrites, ETSY_WRITE_ATTEMPT_COUNT: writeAttempts }, { status: 202 });
    }
    const value = await json(response);
    const imageId = isRec(value) ? Number(value.listing_image_id) : NaN;
    if (!response.ok || !Number.isSafeInteger(imageId) || imageId < 1) {
      const reconciliation = confirmedWrites > 0 || response.status >= 500;
      await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, reconciliation ? "RECONCILIATION_REQUIRED" : "FAILED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: `GALLERY_${asset.order}_REJECTED_OR_UNVERIFIED`, receipt: { uploadedIds, providerStatus: response.status, ETSY_WRITE_COUNT: confirmedWrites, ETSY_WRITE_ATTEMPT_COUNT: writeAttempts } });
      return NextResponse.json({ error: reconciliation ? "PD_CLEAN_004_R02_RECOVERY_002_GALLERY_PARTIAL_DO_NOT_RETRY" : "PD_CLEAN_004_R02_RECOVERY_002_GALLERY_REJECTED", providerStatus: response.status, uploadedIds, ETSY_WRITE_COUNT: confirmedWrites, ETSY_WRITE_ATTEMPT_COUNT: writeAttempts }, { status: reconciliation ? 202 : 502 });
    }
    confirmedWrites += 1;
    uploadedIds.push(String(imageId));
  }

  const afterGallery = await pollState(token, fetchImpl, (state) => finalGalleryMatches(state, uploadedIds) && videoRows(state).length === 0, runtime.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))));
  if (!afterGallery || !finalGalleryMatches(afterGallery, uploadedIds) || videoRows(afterGallery).length !== 0) {
    await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "GALLERY_FINAL_READBACK_UNVERIFIED", receipt: { uploadedIds, ETSY_WRITE_COUNT: confirmedWrites, ETSY_WRITE_ATTEMPT_COUNT: writeAttempts } });
    return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_GALLERY_READBACK_FAILED_DO_NOT_RETRY", uploadedIds, ETSY_WRITE_COUNT: confirmedWrites, ETSY_WRITE_ATTEMPT_COUNT: writeAttempts }, { status: 202 });
  }

  const videoAsset = PD_CLEAN_004_VISUAL_R02_RELEASE_002.video;
  const videoBytes = bySha.get(videoAsset.sha256)!;
  const videoForm = new FormData();
  videoForm.set("name", videoAsset.fileName);
  videoForm.set("video", new File([new Uint8Array(videoBytes)], videoAsset.fileName, { type: videoAsset.mimeType }));
  const videosUrl = `https://api.etsy.com/v3/application/shops/${PD_CLEAN_004_VISUAL_R02_RELEASE_002.shopId}/listings/${PD_CLEAN_004_VISUAL_R02_RELEASE_002.listingId}/videos`;
  let videoResponse: Response;
  writeAttempts += 1;
  try { videoResponse = await fetchImpl(videosUrl, { method: "POST", headers: multipartHeaders(token), body: videoForm, cache: "no-store" }); }
  catch {
    await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "VIDEO_UPLOAD_RESPONSE_AMBIGUOUS", receipt: { uploadedIds, ETSY_WRITE_COUNT: confirmedWrites, ETSY_WRITE_ATTEMPT_COUNT: writeAttempts } });
    return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_VIDEO_UPLOAD_AMBIGUOUS_DO_NOT_RETRY", uploadedIds, ETSY_WRITE_COUNT: confirmedWrites, ETSY_WRITE_ATTEMPT_COUNT: writeAttempts }, { status: 202 });
  }
  const videoValue = await json(videoResponse);
  const videoId = isRec(videoValue) ? Number(videoValue.video_id) : NaN;
  if (videoResponse.status !== 201 || !Number.isSafeInteger(videoId) || videoId < 1) {
    await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "VIDEO_UPLOAD_REJECTED_OR_UNVERIFIED", receipt: { uploadedIds, providerVideoStatus: videoResponse.status, ETSY_WRITE_COUNT: confirmedWrites, ETSY_WRITE_ATTEMPT_COUNT: writeAttempts } });
    return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_VIDEO_UPLOAD_NOT_VERIFIED_DO_NOT_RETRY", providerStatus: videoResponse.status, uploadedIds, ETSY_WRITE_COUNT: confirmedWrites, ETSY_WRITE_ATTEMPT_COUNT: writeAttempts }, { status: 202 });
  }
  confirmedWrites += 1;

  const sleep = runtime.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const final = await pollState(token, fetchImpl, (state) => finalGalleryMatches(state, uploadedIds) && videoRows(state).length === 1 && videoRows(state)[0]?.videoId === videoId, sleep);
  const finalVideo = final ? videoRows(final)[0] : undefined;
  const verifyVideoUrl = runtime.verifyVideoUrl ?? ((url, sha, size) => defaultVerifyVideoUrl(fetchImpl, url, sha, size));
  const binaryVerified = Boolean(finalVideo?.videoUrl) && await verifyVideoUrl(finalVideo!.videoUrl, videoAsset.sha256, videoAsset.byteSize).catch(() => false);
  if (!final || !finalGalleryMatches(final, uploadedIds) || !finalVideo || finalVideo.videoId !== videoId || finalVideo.width !== videoAsset.width || finalVideo.height !== videoAsset.height || !binaryVerified) {
    await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "FINAL_READBACK_UNVERIFIED", receipt: { uploadedIds, videoId, ETSY_WRITE_COUNT: confirmedWrites, ETSY_WRITE_ATTEMPT_COUNT: writeAttempts } });
    return NextResponse.json({ error: "PD_CLEAN_004_R02_RECOVERY_002_FINAL_READBACK_FAILED_DO_NOT_RETRY", uploadedIds, videoId, ETSY_WRITE_COUNT: confirmedWrites, ETSY_WRITE_ATTEMPT_COUNT: writeAttempts }, { status: 202 });
  }

  const done = await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "SUCCEEDED", runtime.now?.() ?? new Date().toISOString(), {
    receipt: {
      authorizationId: PD_CLEAN_004_VISUAL_R02_RELEASE_002.authorizationId,
      operationFingerprint: PD_CLEAN_004_VISUAL_R02_RELEASE_002.operationFingerprint,
      candidateFingerprint: PD_CLEAN_004_VISUAL_R02_RELEASE_002.candidateFingerprint,
      uploadedIds,
      videoId,
      ETSY_WRITE_COUNT: confirmedWrites,
      ETSY_WRITE_ATTEMPT_COUNT: writeAttempts,
      verified: {
        galleryExactOrdered8: "PASS", altTextExact8: "PASS", videoExact1: "PASS",
        title: "PRESERVED", description: "PRESERVED", tags: "PRESERVED", price: "PRESERVED",
        taxonomy: "PRESERVED", quantity: "PRESERVED", buyerFiles: "PRESERVED", attributes: "PRESERVED"
      },
      readBackStatus: final.statuses
    }
  });

  for (const asset of [...PD_CLEAN_004_VISUAL_R02_RELEASE_002.gallery, PD_CLEAN_004_VISUAL_R02_RELEASE_002.video]) {
    try { await (runtime.clearAsset ? runtime.clearAsset(asset) : clearAuthorizedAsset(PD_CLEAN_004_VISUAL_R02_RELEASE_002.operationId, asset.sha256)); } catch { /* verified write is complete; cleanup is best effort */ }
  }

  return NextResponse.json({ status: "UPDATED_AND_VERIFIED", mode: "WRITE_ONCE", operationId: done.operationId, requestHash: done.requestHash, ledgerStatus: done.status, uploadedIds, videoId, ETSY_WRITE_COUNT: confirmedWrites, ETSY_WRITE_ATTEMPT_COUNT: writeAttempts, receipt: done.receipt });
}
