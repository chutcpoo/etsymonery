import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createListingFingerprint } from "./candidate-fingerprint";
import {
  executeReconciledWrite,
  ProviderAmbiguousResultError,
  type ProviderReceipt,
  type ReconciledWriteProvider
} from "./draft-upload-reconciliation";
import { EtsyDraftAssetProvider, type EtsyDraftAssetPayload } from "./etsy-draft-asset-provider";
import { EtsyAuthorizedPublishProvider } from "./etsy-authorized-publish-provider";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "./etsy-readback-normalizer";
import { loadAuthorizedAsset } from "./authorized-operation-asset-store";
import {
  beginOperation,
  recordOperationResult,
  NeonOperationLedgerRepository,
  type OperationLedgerRepository
} from "./operation-ledger";
import { createPublishAuthorization } from "./publish-authorization";
import { executeAuthorizedPublishTransaction } from "./authorized-publish-transaction";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;

type Rec = Record<string, unknown>;
type AssetKind = "UPLOAD_IMAGE" | "UPLOAD_FILE" | "UPLOAD_VIDEO";
export type PdtPcpc001Asset = {
  kind: AssetKind;
  rank: number;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  driveId: string;
  mimeType: string;
};

type Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  loadAsset?: (asset: PdtPcpc001Asset) => Promise<Buffer>;
  now?: () => string;
};

const DESCRIPTION = `Stop guessing your prices. This Pricing Calculator is a Microsoft Excel spreadsheet built for private chefs, personal chefs, and small chef-service operators who need to price jobs with confidence and protect their profit margin.

Enter your food and material costs, labor, travel, and overhead — the calculator builds a transparent price using both markup and margin methods, plus a price-per-guest breakdown. Compare up to three pricing scenarios (A/B/C) side by side, then prepare a traceable quote summary that ties back to your selected scenario.

What's included (10-sheet Excel workbook): START HERE (7-step workflow), SETTINGS, SERVICE TYPES (private dinner, meal prep, small event), FOOD & MATERIAL COSTS, LABOR TRAVEL & ADD-ONS, PRICING CALCULATOR (markup & margin), SCENARIO COMPARE (A/B/C), QUOTE SUMMARY, PRICE HISTORY, DASHBOARD.

Format: Microsoft Excel (.xlsx).

Please note: internal quote-preparation tool — not tax, legal, or accounting advice, and it does not guarantee profit. Sample rows can be replaced with your own figures.`;

const TAGS = Object.freeze([
  "pricing calculator",
  "food cost calculator",
  "pricing spreadsheet",
  "profit calculator",
  "cost calculator",
  "excel spreadsheet",
  "excel template",
  "pricing guide",
  "quote calculator",
  "private chef",
  "service pricing",
  "small business",
  "pricing template"
] as const);

const GALLERY = Object.freeze([
  { kind: "UPLOAD_IMAGE", rank: 1, fileName: "PDT-PCPC-001_GALLERY_G01_01.png", sizeBytes: 196601, sha256: "6773302188c3fd35324d4cbc46bb3c75ea7a19a572125e1759b3cae9dcfe330b", driveId: "11Duv5oeXlXOT4-exDLOS3bbhN_KF-iPy", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 2, fileName: "PDT-PCPC-001_GALLERY_G01_02.png", sizeBytes: 442725, sha256: "bc050bd4e9b1087f30484b3a0a45522360d1001a462abcca3813e1c79b4bb7df", driveId: "1hFdgbAMjaW6Q8N3qsrIgHXrVY5xuuMMI", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 3, fileName: "PDT-PCPC-001_GALLERY_G01_03.png", sizeBytes: 154456, sha256: "8db65c692dc04f8bcaf9972e0fff1083241ca6a310b58a1dd60cdc99aec87b8c", driveId: "1V3dGHNLjAreIzW97JqMuxuLG5sYW7vO4", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 4, fileName: "PDT-PCPC-001_GALLERY_G01_04.png", sizeBytes: 201891, sha256: "9dd5f78cf7339abb9a215f822f1b1b92f8ab6ae53efdde5f81c083c1b18a1262", driveId: "1lg0jJjAf6lv0Cnal3UwvoaFLb1ZbVj52", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 5, fileName: "PDT-PCPC-001_GALLERY_G01_05.png", sizeBytes: 237464, sha256: "776e54aff3c88fa3a56c2670dff123223c4be271b401514b3acf9fdb9ba94d0a", driveId: "14FwjjLxK8uAw0dShK2QD28e3vYCBg0qK", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 6, fileName: "PDT-PCPC-001_GALLERY_G01_06.png", sizeBytes: 250095, sha256: "91fc2267618162b8d395351890c986002a8a152566a0df54248aa699fab91688", driveId: "1sTh8FXVAqr41g0U_uUczYUuz-KGcOZcr", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 7, fileName: "PDT-PCPC-001_GALLERY_G01_07.png", sizeBytes: 364858, sha256: "110553886c374bbd0e29ce33f7afdc015f1d538afb1a3ba42d3d386f4e296210", driveId: "1wVVDqVMVeLA3KhP6iAso0U-3TrV7QSDi", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 8, fileName: "PDT-PCPC-001_GALLERY_G01_08.png", sizeBytes: 117461, sha256: "322e239ce0f5019fc0846912a6aeb8087cb00c8f3b5ae5b2c4e7f48010276b65", driveId: "1b2T6ch6wmRzmKZMikh-2T9Fz14CZ1_ee", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 9, fileName: "PDT-PCPC-001_GALLERY_G01_09.png", sizeBytes: 203799, sha256: "5390c3d2b2e96a753026e4067988498b2af55fe5cd8913e7bbde2c8476cbb852", driveId: "1828TDRnjTNby5E0ocFJ0p3mmRAzIr-D3", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 10, fileName: "PDT-PCPC-001_GALLERY_G01_10.png", sizeBytes: 423076, sha256: "d2f7c594913edccb1fe23e5255c2120692315f65f3a6ce322912778a9103850f", driveId: "1klX41251qo5OJxp92shTUmGLCLmUdK-r", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 11, fileName: "PDT-PCPC-001_GALLERY_G01_11.png", sizeBytes: 179373, sha256: "107f97f1fc53613bbeb7dc14f68beece8222412375aa3493d073fd140a8ce758", driveId: "1szoNWtFCp_gX0iICkii7eF_3hDd1JpTF", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 12, fileName: "PDT-PCPC-001_GALLERY_G01_12.png", sizeBytes: 421584, sha256: "9b98d4db8e877a0bd98a7ee0ae88adf58d948ee29ab183508edd5fe9c8f7814a", driveId: "1Qx_D7PeV3mbUWJoG_CeMkvTo_4NvfY52", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 13, fileName: "PDT-PCPC-001_GALLERY_G01_13.png", sizeBytes: 225963, sha256: "8a7fea86ce02a38933bb64f9433b67fec65691c3f464a86a75ae65cf56817eda", driveId: "1qPzMcSdaialtQoF6797nJTNtrfjAXFeP", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 14, fileName: "PDT-PCPC-001_GALLERY_G01_14.png", sizeBytes: 332679, sha256: "0421f8ff0d8cba32427556bedf21165668e0c7527dc9893ae44f23ce3a9aa95f", driveId: "1OiJJRrLPlAdnkP04O0JYv1TJsjUS1cWl", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 15, fileName: "PDT-PCPC-001_GALLERY_G01_15.png", sizeBytes: 215036, sha256: "20bf152d0e354e1cfb0130b3e18e11a5f38a68bd27b6c2ffaab9f0709ba25ede", driveId: "1cmIgwvudoiZ2LXcZ7tWpQkUV6wSU8MAH", mimeType: "image/png" }
] as const satisfies readonly PdtPcpc001Asset[]);

const VIDEO = Object.freeze({
  kind: "UPLOAD_VIDEO",
  rank: 1,
  fileName: "PDT-PCPC-001_VIDEO_V01.mp4",
  sizeBytes: 256748,
  sha256: "c449ad743cb64d1437504f028d106f491216b8ca77f49b7aef3a74bd196982d2",
  driveId: "1m-lK-n7gNoUfgBID95g71pEm5b_6Neqm",
  mimeType: "video/mp4"
} as const satisfies PdtPcpc001Asset);

const BUYER_FILES = Object.freeze([
  { kind: "UPLOAD_FILE", rank: 1, fileName: "PDT-PCPC-001_V1_Private_Chef_Pricing_Calculator.xlsx", sizeBytes: 44253, sha256: "5abfadf42becc1a5f30d9bbcbf6ed4fd81b87fc4e6895e24ec468faa32710491", driveId: "1hoBbdqffqRXfM5wZ93En_9eKrFGTfl3F", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { kind: "UPLOAD_FILE", rank: 2, fileName: "PDT-PCPC-001_V1_Quick_Start.pdf", sizeBytes: 2952, sha256: "ebea9de45991dedae9edc6e2178cf9f28be72fdd1ec6792e6a398a7958b32194", driveId: "10V6U2n_13VBmFnZL5YGJgfwx9qXFrIGC", mimeType: "application/pdf" },
  { kind: "UPLOAD_FILE", rank: 3, fileName: "PDT-PCPC-001_V1_Read_Me_License.pdf", sizeBytes: 2442, sha256: "c36a8fbfd120ad4eb100b74bd7b93cc856718a69b8c9dc77a17ea5b5eeb8d162", driveId: "1TSBBUtgUiTwTT25ZeLT5v9lh0wgOtgdf", mimeType: "application/pdf" },
  { kind: "UPLOAD_FILE", rank: 4, fileName: "PDT-PCPC-001_V1_Buyer_Package.zip", sizeBytes: 35287, sha256: "2096a78e280b721b40cda25b91c1bbee795e4f1ed9286781296b504e03c7c85f", driveId: "1LJqRCGZV3KgvemKgJDLExGfIvcX9E-Eu", mimeType: "application/zip" }
] as const satisfies readonly PdtPcpc001Asset[]);

export const PDT_PCPC_001_G01_V01 = Object.freeze({
  operation: "CREATE_NEW_DIGITAL_LISTING_EXACT_G01_V01_ONLY",
  operationId: "PDT-PCPC-001-G01-V01-NEW-LISTING-20260912-01",
  operationFingerprint: "82c1a37bc01a0453f4bf9a499416dc784025fc8006fa2b8b4836e1ae55a2aea3",
  authorizationId: "PDT-PCPC-001-G01-V01-PROD-AUTH-20260912-01",
  authorizationRequestHash: "c78beb7ee8cfef3ec4a47f49b4955957651b6c0563d6ca5e934fae8fbc71619f",
  protectedStateFingerprint: "6356ee89530373d2946229abd0d00ce63707ed19da464bc1e4d389855cf1c937",
  productId: "PDT-PCPC-001",
  productVersion: "V1",
  shopId: "23582741",
  shopName: "PoonthaiDigital",
  currency: "USD",
  parentBuildId: "PDT-PCPC-001-BUILD-20260911-B01",
  parentBuildFingerprint: "7ef1f686fe20524230764fa0b1d30b269a9cd96782a3653b3b44c0f1a885adff",
  galleryCandidateId: "PDT-PCPC-001-GALLERY-CANDIDATE-20260912-G01",
  galleryCandidateFingerprint: "da7f471767ad9f4b7270b05125d0358ee6518b9b38353f61804472b0ff219f39",
  videoCandidateId: "PDT-PCPC-001-VIDEO-CANDIDATE-20260912-V01",
  videoCandidateFingerprint: "6331f8a3a463925738b3e9e7732bd0ea80a5681561e09866ef2552b2c32f1613",
  acceptanceCriteriaId: "PDT-PCPC-001-GALLERY-VIDEO-AC-20260912-G01-V01",
  acceptanceCriteriaSha256: "8ff9ce9b64663399a789310971bcc9098e3523c2fe4d00dea90d1042bc60b1b1",
  title: "Pricing Calculator for Private Chefs | Excel Food Cost, Labor, Profit Margin & Scenario Tool",
  description: DESCRIPTION,
  priceUsd: 12.9,
  taxonomyId: 12476,
  quantity: 999,
  whoMade: "i_did",
  whenMade: "2020_2026",
  listingType: "download",
  tags: TAGS,
  gallery: GALLERY,
  video: VIDEO,
  buyerFiles: BUYER_FILES,
  expectedActiveListingIds: Object.freeze([
    "4560696421","4561793463","4561795303","4561819638",
    "4561821192","4566738686","4568730165","4569445414"
  ])
} as const);

export const PDT_PCPC_001_G01_V01_ASSETS = Object.freeze([
  ...GALLERY, VIDEO, ...BUYER_FILES
]) as readonly PdtPcpc001Asset[];

const LISTING_IDENTITY = Object.freeze({
  title: PDT_PCPC_001_G01_V01.title,
  description: PDT_PCPC_001_G01_V01.description,
  priceUsd: PDT_PCPC_001_G01_V01.priceUsd,
  tags: [...PDT_PCPC_001_G01_V01.tags],
  quantity: PDT_PCPC_001_G01_V01.quantity,
  who_made: PDT_PCPC_001_G01_V01.whoMade,
  when_made: PDT_PCPC_001_G01_V01.whenMade,
  taxonomy_id: PDT_PCPC_001_G01_V01.taxonomyId,
  type: "download",
  state: "draft"
});

export const PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT = createListingFingerprint(LISTING_IDENTITY);

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}

function results(value: unknown) {
  return isRec(value) && Array.isArray(value.results) ? value.results.filter(isRec) : null;
}

function listingId(value: Rec) {
  const raw = value.listing_id;
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0) return String(raw);
  if (typeof raw === "string" && /^[1-9]\d*$/.test(raw.trim())) return raw.trim();
  return null;
}

function observation(value: Rec): EtsyReadBackObservation {
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

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validateWriteToken(request: Request) {
  const expected = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!expected) throw new Error("PDT_PCPC_001_WRITE_TOKEN_NOT_CONFIGURED");
  if (!supplied || !secureEqual(supplied, expected)) throw new Error("PDT_PCPC_001_WRITE_UNAUTHORIZED");
}

function configuredForWrites() {
  return process.env.PUBLISH_WRITES_ENABLED === "true" && process.env.ETSY_DRAFT_WRITES_ENABLED === "true";
}

async function fetchListing(fetchImpl: typeof fetch, token: string, id: string) {
  const response = await fetchImpl(`https://api.etsy.com/v3/application/listings/${encodeURIComponent(id)}`, {
    method: "GET", headers: etsyApiHeaders(token), cache: "no-store"
  });
  if (!response.ok) throw new Error(`PDT_PCPC_001_LISTING_READ_FAILED:${response.status}`);
  const value = await parseJson(response);
  if (!isRec(value)) throw new Error("PDT_PCPC_001_LISTING_READ_INVALID");
  return value;
}

async function listByState(fetchImpl: typeof fetch, token: string, state: "active" | "draft") {
  const url = new URL(`https://api.etsy.com/v3/application/shops/${PDT_PCPC_001_G01_V01.shopId}/listings`);
  url.searchParams.set("state", state);
  url.searchParams.set("limit", "100");
  const response = await fetchImpl(url, { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" });
  if (!response.ok) throw new Error(`PDT_PCPC_001_${state.toUpperCase()}_READ_FAILED:${response.status}`);
  const value = await parseJson(response);
  const list = results(value);
  if (!list) throw new Error(`PDT_PCPC_001_${state.toUpperCase()}_READ_INVALID`);
  const count = isRec(value) && typeof value.count === "number" ? value.count : list.length;
  if (count > list.length) throw new Error("PDT_PCPC_001_PROTECTED_STATE_PAGINATION_REQUIRED");
  return list;
}

async function readShop(fetchImpl: typeof fetch, token: string) {
  const response = await fetchImpl(`https://api.etsy.com/v3/application/shops/${PDT_PCPC_001_G01_V01.shopId}`, {
    method: "GET", headers: etsyApiHeaders(token), cache: "no-store"
  });
  if (!response.ok) throw new Error(`PDT_PCPC_001_SHOP_READ_FAILED:${response.status}`);
  const value = await parseJson(response);
  if (!isRec(value)) throw new Error("PDT_PCPC_001_SHOP_READ_INVALID");
  return value;
}

async function protectedState(runtime: Runtime = {}) {
  const fetchImpl = runtime.fetchImpl ?? fetch;
  const getAccessToken = runtime.getAccessToken ?? getValidEtsyAccessToken;
  const configuredShopId = process.env.ETSY_SHOP_ID?.trim() ?? "";
  if (configuredShopId !== PDT_PCPC_001_G01_V01.shopId) throw new Error("PDT_PCPC_001_SHOP_ID_MISMATCH");
  const token = await getAccessToken();
  const [shop, active, draft] = await Promise.all([
    readShop(fetchImpl, token),
    listByState(fetchImpl, token, "active"),
    listByState(fetchImpl, token, "draft")
  ]);
  const shopName = typeof shop.shop_name === "string" ? shop.shop_name.trim() : "";
  const currency = typeof shop.currency_code === "string" ? shop.currency_code.trim().toUpperCase() : "";
  if (shopName !== PDT_PCPC_001_G01_V01.shopName || currency !== PDT_PCPC_001_G01_V01.currency) {
    throw new Error("PDT_PCPC_001_SHOP_IDENTITY_MISMATCH");
  }
  const activeIds = active.map(listingId).filter((id): id is string => Boolean(id)).sort();
  const expectedActiveIds = [...PDT_PCPC_001_G01_V01.expectedActiveListingIds].sort();
  if (JSON.stringify(activeIds) !== JSON.stringify(expectedActiveIds)) {
    throw new Error("PDT_PCPC_001_ACTIVE_SET_DRIFT");
  }
  const draftIds = draft.map(listingId).filter((id): id is string => Boolean(id)).sort();
  const collisions = [...active, ...draft]
    .filter((item) => typeof item.title === "string" && item.title.trim() === PDT_PCPC_001_G01_V01.title)
    .map(listingId).filter((id): id is string => Boolean(id)).sort();
  if (collisions.length > 0) throw new Error("PDT_PCPC_001_TARGET_COLLISION");
  return {
    fingerprint: PDT_PCPC_001_G01_V01.protectedStateFingerprint,
    activeIds, draftIds, collisions
  };
}

export async function verifyPdtPcpc001ProtectedState(runtime: Runtime = {}) {
  try {
    const state = await protectedState(runtime);
    return NextResponse.json({
      status: "PROTECTED_STATE_MATCH",
      operationId: PDT_PCPC_001_G01_V01.operationId,
      operationFingerprint: PDT_PCPC_001_G01_V01.operationFingerprint,
      productId: PDT_PCPC_001_G01_V01.productId,
      parentBuildId: PDT_PCPC_001_G01_V01.parentBuildId,
      galleryCandidateId: PDT_PCPC_001_G01_V01.galleryCandidateId,
      videoCandidateId: PDT_PCPC_001_G01_V01.videoCandidateId,
      acceptanceCriteriaId: PDT_PCPC_001_G01_V01.acceptanceCriteriaId,
      listingFingerprint: PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT,
      protectedStateFingerprint: state.fingerprint,
      activeListingIds: state.activeIds,
      draftListingIds: state.draftIds,
      targetCollision: "NONE",
      ETSY_WRITE_COUNT: 0
    });
  } catch (error) {
    return NextResponse.json({
      status: "PROTECTED_STATE_BLOCKED",
      error: error instanceof Error ? error.message : "UNKNOWN",
      operationId: PDT_PCPC_001_G01_V01.operationId,
      ETSY_WRITE_COUNT: 0
    }, { status: 409 });
  }
}

export function exactPdtPcpc001Body() {
  return {
    operation: PDT_PCPC_001_G01_V01.operation,
    operationId: PDT_PCPC_001_G01_V01.operationId,
    operationFingerprint: PDT_PCPC_001_G01_V01.operationFingerprint,
    authorizationId: PDT_PCPC_001_G01_V01.authorizationId,
    authorizationRequestHash: PDT_PCPC_001_G01_V01.authorizationRequestHash,
    protectedStateFingerprint: PDT_PCPC_001_G01_V01.protectedStateFingerprint,
    productId: PDT_PCPC_001_G01_V01.productId,
    productVersion: PDT_PCPC_001_G01_V01.productVersion,
    shopId: PDT_PCPC_001_G01_V01.shopId,
    parentBuildId: PDT_PCPC_001_G01_V01.parentBuildId,
    parentBuildFingerprint: PDT_PCPC_001_G01_V01.parentBuildFingerprint,
    galleryCandidateId: PDT_PCPC_001_G01_V01.galleryCandidateId,
    galleryCandidateFingerprint: PDT_PCPC_001_G01_V01.galleryCandidateFingerprint,
    videoCandidateId: PDT_PCPC_001_G01_V01.videoCandidateId,
    videoCandidateFingerprint: PDT_PCPC_001_G01_V01.videoCandidateFingerprint,
    acceptanceCriteriaId: PDT_PCPC_001_G01_V01.acceptanceCriteriaId,
    acceptanceCriteriaSha256: PDT_PCPC_001_G01_V01.acceptanceCriteriaSha256,
    listingFingerprint: PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT,
    scope: "CREATE_NEW_DIGITAL_LISTING_EXACT_G01_V01_ONLY",
    gallerySha256: PDT_PCPC_001_G01_V01.gallery.map((asset) => asset.sha256),
    videoSha256: PDT_PCPC_001_G01_V01.video.sha256,
    buyerFileSha256: PDT_PCPC_001_G01_V01.buyerFiles.map((asset) => asset.sha256)
  };
}

class DraftProvider implements ReconciledWriteProvider {
  constructor(private readonly token: string, private readonly fetchImpl: typeof fetch) {}
  private async exactDraftMatches() {
    const drafts = await listByState(this.fetchImpl, this.token, "draft");
    const candidates = drafts.filter((item) => typeof item.title === "string" && item.title.trim() === PDT_PCPC_001_G01_V01.title);
    const matches: string[] = [];
    for (const item of candidates) {
      const id = listingId(item);
      if (!id) continue;
      const detail = await fetchListing(this.fetchImpl, this.token, id);
      const identity = verifyEtsyReadBackIdentity(PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT, observation(detail));
      if (identity.status === "MATCH") matches.push(id);
    }
    return matches;
  }
  async apply(): Promise<ProviderReceipt> {
    if ((await this.exactDraftMatches()).length > 0) throw new Error("PDT_PCPC_001_DRAFT_COLLISION");
    const body = new URLSearchParams({
      quantity: String(PDT_PCPC_001_G01_V01.quantity),
      title: PDT_PCPC_001_G01_V01.title,
      description: PDT_PCPC_001_G01_V01.description,
      price: PDT_PCPC_001_G01_V01.priceUsd.toFixed(2),
      who_made: PDT_PCPC_001_G01_V01.whoMade,
      when_made: PDT_PCPC_001_G01_V01.whenMade,
      taxonomy_id: String(PDT_PCPC_001_G01_V01.taxonomyId),
      type: "download",
      tags: PDT_PCPC_001_G01_V01.tags.join(",")
    });
    let response: Response;
    try {
      response = await this.fetchImpl(`https://api.etsy.com/v3/application/shops/${PDT_PCPC_001_G01_V01.shopId}/listings`, {
        method: "POST",
        headers: { ...etsyApiHeaders(this.token), "content-type": "application/x-www-form-urlencoded" },
        body, cache: "no-store"
      });
    } catch { throw new ProviderAmbiguousResultError(); }
    if (response.status >= 500) throw new ProviderAmbiguousResultError();
    if (!response.ok) throw new Error(`PDT_PCPC_001_DRAFT_CREATE_REJECTED:${response.status}`);
    const value = await parseJson(response);
    if (!isRec(value)) throw new ProviderAmbiguousResultError();
    const id = listingId(value);
    if (!id) throw new ProviderAmbiguousResultError();
    const detail = await fetchListing(this.fetchImpl, this.token, id);
    const identity = verifyEtsyReadBackIdentity(PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT, observation(detail));
    if (identity.status !== "MATCH") throw new ProviderAmbiguousResultError();
    return { providerResourceId: id, kind: "CREATE_DRAFT", metadata: { listingFingerprint: identity.actualFingerprint } };
  }
  async reconcile(): Promise<ProviderReceipt | null> {
    let matches: string[];
    try { matches = await this.exactDraftMatches(); } catch { return null; }
    if (matches.length !== 1) return null;
    return { providerResourceId: matches[0], kind: "CREATE_DRAFT", metadata: { readBack: true } };
  }
}

async function preloadAssets(runtime: Runtime) {
  const load = runtime.loadAsset ?? (async (asset: PdtPcpc001Asset) => loadAuthorizedAsset(PDT_PCPC_001_G01_V01.operationId, asset.sha256));
  const loaded = new Map<string, Buffer>();
  for (const asset of PDT_PCPC_001_G01_V01_ASSETS) {
    const bytes = await load(asset);
    if (bytes.length !== asset.sizeBytes) throw new Error(`PDT_PCPC_001_ASSET_SIZE_MISMATCH:${asset.kind}:${asset.rank}:${asset.fileName}`);
    const actualSha = createHash("sha256").update(bytes).digest("hex");
    if (actualSha !== asset.sha256) throw new Error(`PDT_PCPC_001_ASSET_SHA256_MISMATCH:${asset.kind}:${asset.rank}:${asset.fileName}`);
    loaded.set(asset.sha256, bytes);
  }
  return loaded;
}

function childOperationId(asset: PdtPcpc001Asset) {
  const kind = asset.kind === "UPLOAD_IMAGE" ? "IMAGE" : asset.kind === "UPLOAD_FILE" ? "FILE" : "VIDEO";
  return `${PDT_PCPC_001_G01_V01.operationId}:${kind}:${String(asset.rank).padStart(2, "0")}`;
}

async function uploadImageOrFile(
  asset: PdtPcpc001Asset,
  bytes: Buffer,
  draftListingId: number,
  token: string,
  repository: OperationLedgerRepository,
  now: string,
  fetchImpl: typeof fetch
) {
  if (asset.kind === "UPLOAD_VIDEO") throw new Error("PDT_PCPC_001_INVALID_IMAGE_FILE_ASSET");
  const file = new File([new Uint8Array(bytes)], asset.fileName, { type: asset.mimeType });
  const payload: EtsyDraftAssetPayload = {
    operationKind: asset.kind,
    candidateId: PDT_PCPC_001_G01_V01.operationId,
    candidateFingerprint: PDT_PCPC_001_G01_V01.operationFingerprint,
    expectedListingFingerprint: PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT,
    shopId: Number(PDT_PCPC_001_G01_V01.shopId),
    draftListingId,
    assetSha256: asset.sha256,
    assetName: asset.fileName,
    rank: asset.rank
  };
  const provider = new EtsyDraftAssetProvider(token, payload, file, { fetchImpl });
  const before = await provider.readListing();
  const preIdentity = verifyEtsyReadBackIdentity(PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT, before.observation);
  if (before.observation.state !== "draft" || preIdentity.status !== "MATCH") throw new Error("PDT_PCPC_001_PRE_ASSET_IDENTITY_MISMATCH");
  const result = await executeReconciledWrite(repository, provider, {
    operationId: childOperationId(asset), kind: asset.kind, payload: { ...payload }, now
  });
  if (result.status === "RECONCILIATION_REQUIRED") throw new Error("PDT_PCPC_001_ASSET_RECONCILIATION_REQUIRED");
  const receipt = result.receipt as ProviderReceipt;
  if (!(await provider.hasResource(receipt.providerResourceId))) throw new Error("PDT_PCPC_001_ASSET_READBACK_MISMATCH");
  return receipt;
}

async function listVideos(fetchImpl: typeof fetch, token: string, listingIdValue: number) {
  const response = await fetchImpl(`https://api.etsy.com/v3/application/listings/${listingIdValue}/videos`, {
    method: "GET", headers: etsyApiHeaders(token), cache: "no-store"
  });
  if (!response.ok) throw new Error(`PDT_PCPC_001_VIDEO_READ_FAILED:${response.status}`);
  const list = results(await parseJson(response));
  if (!list) throw new Error("PDT_PCPC_001_VIDEO_READ_INVALID");
  return list;
}

function videoId(value: Rec) {
  const raw = value.video_id;
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0) return String(raw);
  if (typeof raw === "string" && /^[1-9]\d*$/.test(raw.trim())) return raw.trim();
  return null;
}

type VideoReceipt = { providerResourceId: string; kind: "UPLOAD_VIDEO"; metadata?: Record<string, unknown> };

async function uploadVideo(
  asset: PdtPcpc001Asset,
  bytes: Buffer,
  draftListingId: number,
  token: string,
  repository: OperationLedgerRepository,
  now: string,
  fetchImpl: typeof fetch
): Promise<VideoReceipt> {
  if (asset.kind !== "UPLOAD_VIDEO") throw new Error("PDT_PCPC_001_INVALID_VIDEO_ASSET");
  const detail = await fetchListing(fetchImpl, token, String(draftListingId));
  const identity = verifyEtsyReadBackIdentity(PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT, observation(detail));
  if (detail.state !== "draft" || identity.status !== "MATCH") throw new Error("PDT_PCPC_001_PRE_VIDEO_IDENTITY_MISMATCH");

  const operationId = childOperationId(asset);
  const payload = {
    kind: "UPLOAD_VIDEO",
    payload: {
      candidateId: PDT_PCPC_001_G01_V01.operationId,
      candidateFingerprint: PDT_PCPC_001_G01_V01.operationFingerprint,
      expectedListingFingerprint: PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT,
      shopId: Number(PDT_PCPC_001_G01_V01.shopId),
      draftListingId,
      assetSha256: asset.sha256,
      assetName: asset.fileName
    }
  };
  const begun = await beginOperation(repository, operationId, payload, now);
  if (begun.status === "REPLAY") {
    if (begun.record.status === "SUCCEEDED" && begun.record.receipt) {
      const rid = typeof begun.record.receipt.providerResourceId === "string" ? begun.record.receipt.providerResourceId : "";
      if (!/^[1-9]\d*$/.test(rid)) throw new Error("PDT_PCPC_001_VIDEO_REPLAY_RECEIPT_INVALID");
      const videos = await listVideos(fetchImpl, token, draftListingId);
      if (!videos.some((item) => videoId(item) === rid)) throw new Error("PDT_PCPC_001_VIDEO_REPLAY_READBACK_MISMATCH");
      return { providerResourceId: rid, kind: "UPLOAD_VIDEO", metadata: { replay: true } };
    }
    if (begun.record.status === "RECONCILIATION_REQUIRED") {
      const videos = await listVideos(fetchImpl, token, draftListingId);
      if (videos.length !== 1) throw new Error("PDT_PCPC_001_VIDEO_RECONCILIATION_REQUIRED");
      const rid = videoId(videos[0]);
      if (!rid) throw new Error("PDT_PCPC_001_VIDEO_RECONCILIATION_REQUIRED");
      const receipt: VideoReceipt = { providerResourceId: rid, kind: "UPLOAD_VIDEO", metadata: { reconciled: true } };
      await recordOperationResult(repository, operationId, begun.record.requestHash, "SUCCEEDED", now, { receipt });
      return receipt;
    }
    throw new Error("PDT_PCPC_001_VIDEO_FAILED_REPLAY");
  }

  const existing = await listVideos(fetchImpl, token, draftListingId);
  if (existing.length > 0) {
    await recordOperationResult(repository, operationId, begun.record.requestHash, "FAILED", now, { recoveryPoint: "VIDEO_COLLISION" });
    throw new Error("PDT_PCPC_001_VIDEO_COLLISION");
  }

  const file = new File([new Uint8Array(bytes)], asset.fileName, { type: asset.mimeType });
  const form = new FormData();
  form.set("video", file);
  form.set("name", asset.fileName);
  let response: Response;
  try {
    response = await fetchImpl(
      `https://api.etsy.com/v3/application/shops/${PDT_PCPC_001_G01_V01.shopId}/listings/${draftListingId}/videos`,
      { method: "POST", headers: etsyApiHeaders(token), body: form, cache: "no-store" }
    );
  } catch {
    const videos = await listVideos(fetchImpl, token, draftListingId).catch(() => []);
    if (videos.length === 1) {
      const rid = videoId(videos[0]);
      if (rid) {
        const receipt: VideoReceipt = { providerResourceId: rid, kind: "UPLOAD_VIDEO", metadata: { reconciled: true } };
        await recordOperationResult(repository, operationId, begun.record.requestHash, "SUCCEEDED", now, { receipt });
        return receipt;
      }
    }
    await recordOperationResult(repository, operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", now, { recoveryPoint: "VIDEO_PROVIDER_READ_BACK" });
    throw new Error("PDT_PCPC_001_VIDEO_RECONCILIATION_REQUIRED");
  }

  if (response.status >= 500) {
    const videos = await listVideos(fetchImpl, token, draftListingId).catch(() => []);
    if (videos.length === 1) {
      const rid = videoId(videos[0]);
      if (rid) {
        const receipt: VideoReceipt = { providerResourceId: rid, kind: "UPLOAD_VIDEO", metadata: { reconciled: true } };
        await recordOperationResult(repository, operationId, begun.record.requestHash, "SUCCEEDED", now, { receipt });
        return receipt;
      }
    }
    await recordOperationResult(repository, operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", now, { recoveryPoint: "VIDEO_PROVIDER_READ_BACK" });
    throw new Error("PDT_PCPC_001_VIDEO_RECONCILIATION_REQUIRED");
  }

  if (!response.ok) {
    await recordOperationResult(repository, operationId, begun.record.requestHash, "FAILED", now, { recoveryPoint: "RETRY_SAME_OPERATION_ID" });
    throw new Error(`PDT_PCPC_001_VIDEO_UPLOAD_REJECTED:${response.status}`);
  }

  const value = await parseJson(response);
  if (!isRec(value)) {
    await recordOperationResult(repository, operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", now, { recoveryPoint: "VIDEO_PROVIDER_READ_BACK" });
    throw new Error("PDT_PCPC_001_VIDEO_RECONCILIATION_REQUIRED");
  }
  const rid = videoId(value);
  if (!rid) {
    await recordOperationResult(repository, operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", now, { recoveryPoint: "VIDEO_PROVIDER_READ_BACK" });
    throw new Error("PDT_PCPC_001_VIDEO_RECONCILIATION_REQUIRED");
  }
  const readback = await listVideos(fetchImpl, token, draftListingId);
  if (!readback.some((item) => videoId(item) === rid)) {
    await recordOperationResult(repository, operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", now, { recoveryPoint: "VIDEO_PROVIDER_READ_BACK" });
    throw new Error("PDT_PCPC_001_VIDEO_RECONCILIATION_REQUIRED");
  }
  const receipt: VideoReceipt = { providerResourceId: rid, kind: "UPLOAD_VIDEO", metadata: { listingId: draftListingId } };
  await recordOperationResult(repository, operationId, begun.record.requestHash, "SUCCEEDED", now, { receipt });
  return receipt;
}

async function verifyAssetCompleteness(fetchImpl: typeof fetch, token: string, draftListingId: string) {
  const [imageResponse, fileResponse, videos] = await Promise.all([
    fetchImpl(`https://api.etsy.com/v3/application/listings/${draftListingId}/images`, {
      method: "GET", headers: etsyApiHeaders(token), cache: "no-store"
    }),
    fetchImpl(`https://api.etsy.com/v3/application/shops/${PDT_PCPC_001_G01_V01.shopId}/listings/${draftListingId}/files`, {
      method: "GET", headers: etsyApiHeaders(token), cache: "no-store"
    }),
    listVideos(fetchImpl, token, Number(draftListingId))
  ]);
  if (!imageResponse.ok || !fileResponse.ok) throw new Error("PDT_PCPC_001_ASSET_COLLECTION_READBACK_FAILED");
  const images = results(await parseJson(imageResponse));
  const files = results(await parseJson(fileResponse));
  if (!images || !files) throw new Error("PDT_PCPC_001_ASSET_COLLECTION_READBACK_INVALID");
  const imageRanks = images.map((item) => Number(item.rank)).sort((a, b) => a - b);
  if (images.length !== 15 || imageRanks.some((rank, index) => rank !== index + 1)) throw new Error("PDT_PCPC_001_GALLERY_READBACK_MISMATCH");
  const fileNames = files.map((item) => typeof item.filename === "string" ? item.filename.trim() : "");
  if (files.length !== 4 || PDT_PCPC_001_G01_V01.buyerFiles.some((asset) => !fileNames.includes(asset.fileName))) {
    throw new Error("PDT_PCPC_001_BUYER_FILE_READBACK_MISMATCH");
  }
  if (videos.length !== 1 || !videoId(videos[0])) throw new Error("PDT_PCPC_001_VIDEO_READBACK_MISMATCH");
}

function requestErrorStatus(code: string) {
  if (code.includes("UNAUTHORIZED")) return 401;
  if (code.includes("NOT_CONFIGURED")) return 503;
  if (code.includes("RECONCILIATION_REQUIRED")) return 202;
  return 409;
}

export async function handlePdtPcpc001NewListing(
  body: ReturnType<typeof exactPdtPcpc001Body>,
  request: Request,
  runtime: Runtime = {}
) {
  try {
    validateWriteToken(request);
    if (!configuredForWrites()) throw new Error("PDT_PCPC_001_WRITES_DISABLED");
    if (body.authorizationId !== PDT_PCPC_001_G01_V01.authorizationId) throw new Error("PDT_PCPC_001_AUTHORIZATION_ID_MISMATCH");
    if (!SHA256.test(body.protectedStateFingerprint) || body.protectedStateFingerprint !== PDT_PCPC_001_G01_V01.protectedStateFingerprint) {
      throw new Error("PDT_PCPC_001_PROTECTED_STATE_FINGERPRINT_MISMATCH");
    }
    if (!SHA256.test(body.authorizationRequestHash) || body.authorizationRequestHash !== PDT_PCPC_001_G01_V01.authorizationRequestHash) {
      throw new Error("PDT_PCPC_001_AUTHORIZATION_REQUEST_HASH_MISMATCH");
    }
    if (body.operationFingerprint !== PDT_PCPC_001_G01_V01.operationFingerprint) throw new Error("PDT_PCPC_001_OPERATION_FINGERPRINT_MISMATCH");

    const fetchImpl = runtime.fetchImpl ?? fetch;
    const getAccessToken = runtime.getAccessToken ?? getValidEtsyAccessToken;
    const repository = runtime.repository ?? new NeonOperationLedgerRepository();
    const now = runtime.now?.() ?? new Date().toISOString();

    const state = await protectedState({ ...runtime, fetchImpl, getAccessToken });
    if (!secureEqual(state.fingerprint, body.protectedStateFingerprint)) throw new Error("PDT_PCPC_001_PROTECTED_STATE_DRIFT");

    const loadedAssets = await preloadAssets(runtime);
    const token = await getAccessToken();

    const createOperationId = `${PDT_PCPC_001_G01_V01.operationId}:CREATE_DRAFT`;
    const draftProvider = new DraftProvider(token, fetchImpl);
    const draftResult = await executeReconciledWrite(repository, draftProvider, {
      operationId: createOperationId,
      kind: "CREATE_DRAFT",
      payload: {
        operationFingerprint: PDT_PCPC_001_G01_V01.operationFingerprint,
        listingFingerprint: PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT,
        protectedStateFingerprint: body.protectedStateFingerprint
      },
      now
    });
    if (draftResult.status === "RECONCILIATION_REQUIRED") {
      return NextResponse.json({ status: "RECONCILIATION_REQUIRED", operationId: PDT_PCPC_001_G01_V01.operationId, ETSY_WRITE_COUNT: 0 }, { status: 202 });
    }
    const draftReceipt = draftResult.receipt as ProviderReceipt;
    if (!/^[1-9]\d*$/.test(draftReceipt.providerResourceId)) throw new Error("PDT_PCPC_001_DRAFT_ID_INVALID");
    const draftListingId = Number(draftReceipt.providerResourceId);

    const receipts: Array<ProviderReceipt | VideoReceipt> = [];
    for (const asset of PDT_PCPC_001_G01_V01_ASSETS) {
      const bytes = loadedAssets.get(asset.sha256);
      if (!bytes) throw new Error("PDT_PCPC_001_STAGED_ASSET_MISSING");
      receipts.push(asset.kind === "UPLOAD_VIDEO"
        ? await uploadVideo(asset, bytes, draftListingId, token, repository, now, fetchImpl)
        : await uploadImageOrFile(asset, bytes, draftListingId, token, repository, now, fetchImpl));
    }

    await verifyAssetCompleteness(fetchImpl, token, String(draftListingId));

    const grant = createPublishAuthorization({
      authorizationId: body.authorizationId,
      candidateId: PDT_PCPC_001_G01_V01.operationId,
      candidateFingerprint: PDT_PCPC_001_G01_V01.operationFingerprint,
      channel: "etsy",
      shopId: PDT_PCPC_001_G01_V01.shopId,
      draftListingId: String(draftListingId),
      issuedAt: now
    });
    const publishProvider = new EtsyAuthorizedPublishProvider(PDT_PCPC_001_G01_V01.shopId, { fetchImpl, getAccessToken });
    const publishResult = await executeAuthorizedPublishTransaction(repository, publishProvider, {
      operationId: `${PDT_PCPC_001_G01_V01.operationId}:PUBLISH`,
      authorization: grant,
      candidateId: PDT_PCPC_001_G01_V01.operationId,
      candidateFingerprint: PDT_PCPC_001_G01_V01.operationFingerprint,
      expectedListingFingerprint: PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT,
      shopId: PDT_PCPC_001_G01_V01.shopId,
      draftListingId: String(draftListingId),
      channel: "etsy",
      now
    });
    if (publishResult.status === "RECONCILIATION_REQUIRED") {
      return NextResponse.json({ status: "RECONCILIATION_REQUIRED", operationId: PDT_PCPC_001_G01_V01.operationId, listingId: draftListingId }, { status: 202 });
    }
    if (publishResult.status === "IDENTITY_MISMATCH" || publishResult.status === "FAILED_REPLAY") {
      throw new Error("PDT_PCPC_001_PUBLISH_IDENTITY_OR_REPLAY_FAILURE");
    }

    return NextResponse.json({
      status: "PUBLISHED_AND_VERIFIED",
      operationId: PDT_PCPC_001_G01_V01.operationId,
      operationFingerprint: PDT_PCPC_001_G01_V01.operationFingerprint,
      authorizationId: body.authorizationId,
      authorizationRequestHash: body.authorizationRequestHash,
      protectedStateFingerprint: body.protectedStateFingerprint,
      listingFingerprint: PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT,
      listingId: draftListingId,
      assetReceiptCount: receipts.length,
      exactGalleryCount: 15,
      exactBuyerFileCount: 4,
      exactVideoCount: 1
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({
      status: "BLOCKED_FAIL_CLOSED",
      error: code,
      operationId: PDT_PCPC_001_G01_V01.operationId,
      ETSY_WRITE_COUNT: 0
    }, { status: requestErrorStatus(code) });
  }
}
