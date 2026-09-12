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
  hashOperationRequest,
  NeonOperationLedgerRepository,
  type OperationLedgerRepository
} from "./operation-ledger";
import { createPublishAuthorization } from "./publish-authorization";
import { executeAuthorizedPublishTransaction } from "./authorized-publish-transaction";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;

type Rec = Record<string, unknown>;
type Asset = {
  kind: "UPLOAD_IMAGE" | "UPLOAD_FILE";
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
  loadAsset?: (asset: Asset) => Promise<Buffer>;
  now?: () => string;
};

const DESCRIPTION = `Bakery Production Schedule & Capacity Planner — a manual Microsoft Excel planning workbook for bake days.

Plan bakery production tasks against order deadlines and the daily/weekly capacity you set. Enter orders, calculate batches, turn them into task-level production plans, and see your workload against capacity — with clear deadline and conflict signals so you can reschedule manually before problems happen.

WHAT IT DOES
- Enter orders and deadlines; the workbook calculates batches required and recommended production dates.
- Turn orders into task-level plans (prep, bake, cool, decorate, pack) with per-task durations.
- Daily Production Board: scheduled labor and optional oven workload for the selected day vs. effective capacity.
- Weekly Capacity View: planned workload vs. buyer-set weekday capacity, including date-specific overrides.
- Overload & Conflicts: surfaces OVER_CAPACITY, LATE_RISK, MISSING_SCHEDULE and OVERDUE_TASK signals.
- Dashboard & Next Actions: KPIs plus a next-action queue to guide manual rescheduling.
- Nine connected tabs; formulas update the views when you change inputs.

WHAT'S INCLUDED (5 buyer files)
- Excel workbook (9 tabs) + Quick Start + Read Me/License + A4 and US Letter production-planning printables.

COMPATIBILITY & LIMITS
- Tested in Microsoft Excel; Google Sheets not verified.
- Manual planning / decision-support tool — no macros, scripts, sync, or automatic optimization.
- Does not include inventory management, recipe costing, bookkeeping, payments, pickup/delivery workflow, or waste logs.
- Not professional advice.`;

const TAGS = Object.freeze([
  "production schedule",
  "bakery production",
  "bakery schedule",
  "baking schedule",
  "bake day planner",
  "bake day workflow",
  "bakery workflow",
  "bakery spreadsheet",
  "bakery order planner",
  "bakery capacity",
  "production planner",
  "production planning",
  "excel template"
] as const);

const GALLERY = Object.freeze([
  { kind: "UPLOAD_IMAGE", rank: 1, fileName: "01_HERO_SINGLE_PRODUCT.png", sizeBytes: 305108, sha256: "8056236c3095eeadfbe692552c4f7242eab8852d032b11c4a5c489cdbc056db9", driveId: "1wIV0Nkbi6WinRpgS8SHC2ysXekyGTjlA", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 2, fileName: "02_DAILY_WORKLOAD_CAPACITY.png", sizeBytes: 317428, sha256: "88e32431ccae26dbaa5787a33e06b3ce373a4a6d430b944608ec0f8205766872", driveId: "1GnAhE2JTlXaAcG-MhJ61QK1ryBXWr7PB", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 3, fileName: "03_WEEKLY_CAPACITY_VIEW.png", sizeBytes: 302390, sha256: "91e73edd2df0f74fc49fc314ac0994af821d878c1351f3c150a0ac996d09accd", driveId: "1Otalq0j5EAh3WbsyUmYzHJr6RTbZU2jT", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 4, fileName: "04_DEADLINE_CONFLICTS.png", sizeBytes: 288058, sha256: "8866828d5a8c3b243022a0ad81ef91b3446a84873cf2059bed33246307142f9d", driveId: "1WBHMtoeMXMRxZpy_jbwgoRz0j4MSE3Tg", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 5, fileName: "05_ORDER_TO_TASK_WORKFLOW.png", sizeBytes: 476657, sha256: "af9b762bfd1962689888eded8013931f009055226ec4e0ff84b33f295071c258", driveId: "182ydHWrmPxiorkXy3i-wxiq3WCuxxiod", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 6, fileName: "06_CAPACITY_SETUP.png", sizeBytes: 294992, sha256: "009e971942a5e93ab5b9505c2212c633db3220dd9bd8a56b44a7398c7d76898c", driveId: "1D6X0cpCjIBzXRd50mkpAilikYd-3Nc2_", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 7, fileName: "07_NINE_TAB_WORKFLOW.png", sizeBytes: 206942, sha256: "ee85ea0988cd6e4a7093b6f2f16321a7a98f64150bfba4d2b55bf0c08f5198b3", driveId: "1RFnq8S1oD5scLcY-ZrPbC6VgBzPw_oLa", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 8, fileName: "08_FIVE_BUYER_FILES.png", sizeBytes: 336386, sha256: "e84a81b8b9d7feef633425b7d810d9e83c35944a827586820168199bbfc08fdc", driveId: "1QEvF4nzHS8LJmy3_avNCW55pPwvBKDTM", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 9, fileName: "09_COMPATIBILITY_LIMITS.png", sizeBytes: 346621, sha256: "9ebf684a4b69ddc4d6165b36d323b4b62f046617c184847f8c2322c53837dab3", driveId: "1a0jchtA2Fa_3VCei2kuEplRv710xrroX", mimeType: "image/png" },
  { kind: "UPLOAD_IMAGE", rank: 10, fileName: "10_PRINTABLE_COMPANIONS.png", sizeBytes: 246733, sha256: "91ae273ad3da2f82137296f7dc56c88ed345dce2c00e73b20832526462430b9a", driveId: "1vGGOkt5Y8yCpgvTavMwCQhoGffzdMU6F", mimeType: "image/png" }
] as const satisfies readonly Asset[]);

const BUYER_FILES = Object.freeze([
  { kind: "UPLOAD_FILE", rank: 1, fileName: "PDT-BPSC-001_V1_Excel_Workbook.zip", sizeBytes: 69622, sha256: "da0a6e1439613a19366cc6e8c223761fad5d7c8fcf247a83c0402ff2d351fa8b", driveId: "1IoE7QANB0qeiMW-pRYom_4nsSNRe1k2s", mimeType: "application/zip" },
  { kind: "UPLOAD_FILE", rank: 2, fileName: "PDT-BPSC-001_V1_Quick_Start.pdf", sizeBytes: 8616, sha256: "19247730ac872eaec8d491942b943ff9cf572683168d9934230dd31f99fa58ef", driveId: "1cZZmisoRnzR_Nifx6whTg4NbGMi2sFK8", mimeType: "application/pdf" },
  { kind: "UPLOAD_FILE", rank: 3, fileName: "PDT-BPSC-001_V1_Read_Me_License.pdf", sizeBytes: 4308, sha256: "fb025d8c9d01ae9759cfd1822932ad067e7e88e46f8c09e469a3bd998da9b418", driveId: "1zXWd6XIB869GdaDuuCzY85whVpAk9Kzq", mimeType: "application/pdf" },
  { kind: "UPLOAD_FILE", rank: 4, fileName: "PDT-BPSC-001_V1_A4_Production_Planning_Printables.pdf", sizeBytes: 4903, sha256: "18d59ecaac2294ae8c6c21e415bed4e2c1b25de33d24a703c03704f87a3f8d7c", driveId: "19gGwvRX9GGYsHODo3yIrTIWm3RHPh0VW", mimeType: "application/pdf" },
  { kind: "UPLOAD_FILE", rank: 5, fileName: "PDT-BPSC-001_V1_US_Letter_Production_Planning_Printables.pdf", sizeBytes: 4882, sha256: "3ea246518c0ec40aa0929206977a464608a9ab58af32f5e9a08601a5a1cc6bcd", driveId: "1k_gb1xVcwNOv0a5UZPPLjmVvlA6INn9x", mimeType: "application/pdf" }
] as const satisfies readonly Asset[]);

export const PDT_BPSC_001_C09 = Object.freeze({
  operation: "CREATE_NEW_DIGITAL_LISTING_EXACT_C09_ONLY",
  operationId: "PDT-BPSC-001-C09-NEW-LISTING-001",
  productId: "PDT-BPSC-001",
  productVersion: "V1",
  shopId: "23582741",
  shopName: "PoonthaiDigital",
  currency: "USD",
  candidateId: "ETSY-LISTING-CANDIDATE-PDT-BPSC-001-V1-B04-20260912-C09",
  candidateFingerprint: "4fe93e0ea22a9151f413e366ee0282072199e3ec215ff0c1a6d00acb12bb81fa",
  candidateDriveId: "1wLaZh31TiJdacut75C_wbaTqDnYnHYKy",
  buildId: "PDT-BPSC-001-BUILD-20260911-B04",
  buildFingerprint: "a093bfbe9e12b8d48f2738564e5562709b984cdece9d673eb2087b4f9ddf94bc",
  acceptanceCriteriaId: "PDT-BPSC-001-V1-AC-20260911-B04",
  acceptanceCriteriaSha256: "da0ae8f6300d348c053254521a86657cb4a3e7f3a8c776f3e80c063965681ed8",
  packageId: "PDT-BPSC-001-ETSY-PACKAGE-B04-Z01-20260912-A",
  packageFingerprint: "88f4840fe4c0a3eb748153f59a0b7663fcbe577057022a56bd4b043643ae720f",
  title: "Bakery Production Schedule, Excel Workbook for Bake Days, Capacity, Workload & Deadlines",
  description: DESCRIPTION,
  priceUsd: 12.9,
  taxonomyId: 12476,
  quantity: 999,
  whoMade: "i_did",
  whenMade: "2020_2026",
  listingType: "download",
  tags: TAGS,
  gallery: GALLERY,
  buyerFiles: BUYER_FILES
} as const);

export const PDT_BPSC_001_C09_ASSETS = Object.freeze([...GALLERY, ...BUYER_FILES]) as readonly Asset[];

const LISTING_IDENTITY = Object.freeze({
  title: PDT_BPSC_001_C09.title,
  description: PDT_BPSC_001_C09.description,
  priceUsd: PDT_BPSC_001_C09.priceUsd,
  tags: [...PDT_BPSC_001_C09.tags],
  quantity: PDT_BPSC_001_C09.quantity,
  who_made: PDT_BPSC_001_C09.whoMade,
  when_made: PDT_BPSC_001_C09.whenMade,
  taxonomy_id: PDT_BPSC_001_C09.taxonomyId,
  type: "download",
  state: "draft"
});

export const PDT_BPSC_001_C09_LISTING_FINGERPRINT = createListingFingerprint(LISTING_IDENTITY);

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; }
  catch { return {}; }
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
  if (!expected) throw new Error("AUTHORIZED_ETSY_WRITE_TOKEN_NOT_CONFIGURED");
  if (!supplied || !secureEqual(supplied, expected)) throw new Error("AUTHORIZED_ETSY_WRITE_UNAUTHORIZED");
}

function configuredForWrites() {
  return process.env.PUBLISH_WRITES_ENABLED === "true" && process.env.ETSY_DRAFT_WRITES_ENABLED === "true";
}

async function fetchListing(fetchImpl: typeof fetch, token: string, id: string) {
  const response = await fetchImpl(`https://api.etsy.com/v3/application/listings/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: etsyApiHeaders(token),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`ETSY_C09_LISTING_READ_FAILED:${response.status}`);
  const value = await parseJson(response);
  if (!isRec(value)) throw new Error("ETSY_C09_LISTING_READ_INVALID");
  return value;
}

async function listByState(fetchImpl: typeof fetch, token: string, state: "active" | "draft") {
  const url = new URL(`https://api.etsy.com/v3/application/shops/${PDT_BPSC_001_C09.shopId}/listings`);
  url.searchParams.set("state", state);
  url.searchParams.set("limit", "100");
  const response = await fetchImpl(url, { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" });
  if (!response.ok) throw new Error(`ETSY_C09_${state.toUpperCase()}_READ_FAILED:${response.status}`);
  const value = await parseJson(response);
  const list = results(value);
  if (!list) throw new Error(`ETSY_C09_${state.toUpperCase()}_READ_INVALID`);
  const count = isRec(value) && typeof value.count === "number" ? value.count : list.length;
  if (count > list.length) throw new Error("ETSY_C09_PROTECTED_STATE_PAGINATION_REQUIRED");
  return list;
}

async function readShop(fetchImpl: typeof fetch, token: string) {
  const response = await fetchImpl(`https://api.etsy.com/v3/application/shops/${PDT_BPSC_001_C09.shopId}`, {
    method: "GET",
    headers: etsyApiHeaders(token),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`ETSY_C09_SHOP_READ_FAILED:${response.status}`);
  const value = await parseJson(response);
  if (!isRec(value)) throw new Error("ETSY_C09_SHOP_READ_INVALID");
  return value;
}

function protectedFingerprint(snapshot: Record<string, unknown>) {
  return hashOperationRequest(snapshot);
}

async function protectedState(runtime: Runtime = {}) {
  const fetchImpl = runtime.fetchImpl ?? fetch;
  const getAccessToken = runtime.getAccessToken ?? getValidEtsyAccessToken;
  const configuredShopId = process.env.ETSY_SHOP_ID?.trim() ?? "";
  if (configuredShopId !== PDT_BPSC_001_C09.shopId) throw new Error("ETSY_C09_SHOP_ID_MISMATCH");
  const token = await getAccessToken();
  const [shop, active, draft] = await Promise.all([
    readShop(fetchImpl, token),
    listByState(fetchImpl, token, "active"),
    listByState(fetchImpl, token, "draft")
  ]);
  const shopName = typeof shop.shop_name === "string" ? shop.shop_name.trim() : "";
  const currency = typeof shop.currency_code === "string" ? shop.currency_code.trim().toUpperCase() : "";
  if (shopName !== PDT_BPSC_001_C09.shopName || currency !== PDT_BPSC_001_C09.currency) {
    throw new Error("ETSY_C09_SHOP_IDENTITY_MISMATCH");
  }
  const activeIds = active.map(listingId).filter((id): id is string => Boolean(id)).sort();
  const draftIds = draft.map(listingId).filter((id): id is string => Boolean(id)).sort();
  const collisions = [...active, ...draft]
    .filter((item) => typeof item.title === "string" && item.title.trim() === PDT_BPSC_001_C09.title)
    .map(listingId)
    .filter((id): id is string => Boolean(id))
    .sort();
  const snapshot = {
    operationId: PDT_BPSC_001_C09.operationId,
    candidateId: PDT_BPSC_001_C09.candidateId,
    candidateFingerprint: PDT_BPSC_001_C09.candidateFingerprint,
    shopId: PDT_BPSC_001_C09.shopId,
    shopName,
    currency,
    activeListingIds: activeIds,
    draftListingIds: draftIds,
    targetTitleCollisionIds: collisions
  };
  return { snapshot, fingerprint: protectedFingerprint(snapshot), activeIds, draftIds, collisions };
}

export async function verifyPdtBpsc001C09ProtectedState(runtime: Runtime = {}) {
  try {
    const state = await protectedState(runtime);
    if (state.collisions.length > 0) {
      return NextResponse.json({
        status: "PROTECTED_STATE_MISMATCH",
        operationId: PDT_BPSC_001_C09.operationId,
        candidateId: PDT_BPSC_001_C09.candidateId,
        targetCollisionIds: state.collisions,
        protectedStateFingerprint: state.fingerprint,
        ETSY_WRITE_COUNT: 0
      }, { status: 409 });
    }
    return NextResponse.json({
      status: "PROTECTED_STATE_MATCH",
      operationId: PDT_BPSC_001_C09.operationId,
      candidateId: PDT_BPSC_001_C09.candidateId,
      candidateFingerprint: PDT_BPSC_001_C09.candidateFingerprint,
      buildId: PDT_BPSC_001_C09.buildId,
      acceptanceCriteriaId: PDT_BPSC_001_C09.acceptanceCriteriaId,
      packageId: PDT_BPSC_001_C09.packageId,
      listingFingerprint: PDT_BPSC_001_C09_LISTING_FINGERPRINT,
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
      operationId: PDT_BPSC_001_C09.operationId,
      ETSY_WRITE_COUNT: 0
    }, { status: 409 });
  }
}

export function exactPdtBpsc001C09Body(authorizationId: string, protectedStateFingerprint: string) {
  return {
    operation: PDT_BPSC_001_C09.operation,
    operationId: PDT_BPSC_001_C09.operationId,
    authorizationId: authorizationId.normalize("NFC").trim(),
    protectedStateFingerprint: protectedStateFingerprint.toLowerCase().trim(),
    productId: PDT_BPSC_001_C09.productId,
    productVersion: PDT_BPSC_001_C09.productVersion,
    shopId: PDT_BPSC_001_C09.shopId,
    candidateId: PDT_BPSC_001_C09.candidateId,
    candidateFingerprint: PDT_BPSC_001_C09.candidateFingerprint,
    buildId: PDT_BPSC_001_C09.buildId,
    buildFingerprint: PDT_BPSC_001_C09.buildFingerprint,
    acceptanceCriteriaId: PDT_BPSC_001_C09.acceptanceCriteriaId,
    acceptanceCriteriaSha256: PDT_BPSC_001_C09.acceptanceCriteriaSha256,
    packageId: PDT_BPSC_001_C09.packageId,
    packageFingerprint: PDT_BPSC_001_C09.packageFingerprint,
    listingFingerprint: PDT_BPSC_001_C09_LISTING_FINGERPRINT,
    scope: "CREATE_NEW_DIGITAL_LISTING_EXACT_C09_ONLY",
    gallerySha256: PDT_BPSC_001_C09.gallery.map((asset) => asset.sha256),
    buyerFileSha256: PDT_BPSC_001_C09.buyerFiles.map((asset) => asset.sha256)
  };
}

export function pdtBpsc001C09AuthorizationRequestHash(authorizationId: string, protectedStateFingerprint: string) {
  return hashOperationRequest(exactPdtBpsc001C09Body(authorizationId, protectedStateFingerprint));
}

class C09DraftProvider implements ReconciledWriteProvider {
  constructor(private readonly token: string, private readonly fetchImpl: typeof fetch) {}

  private async exactDraftMatches() {
    const drafts = await listByState(this.fetchImpl, this.token, "draft");
    const candidates = drafts.filter((item) => typeof item.title === "string" && item.title.trim() === PDT_BPSC_001_C09.title);
    const matches: string[] = [];
    for (const item of candidates) {
      const id = listingId(item);
      if (!id) continue;
      const detail = await fetchListing(this.fetchImpl, this.token, id);
      const identity = verifyEtsyReadBackIdentity(PDT_BPSC_001_C09_LISTING_FINGERPRINT, observation(detail));
      if (identity.status === "MATCH") matches.push(id);
    }
    return matches;
  }

  async apply(): Promise<ProviderReceipt> {
    if ((await this.exactDraftMatches()).length > 0) throw new Error("ETSY_C09_DRAFT_COLLISION");
    const body = new URLSearchParams({
      quantity: String(PDT_BPSC_001_C09.quantity),
      title: PDT_BPSC_001_C09.title,
      description: PDT_BPSC_001_C09.description,
      price: PDT_BPSC_001_C09.priceUsd.toFixed(2),
      who_made: PDT_BPSC_001_C09.whoMade,
      when_made: PDT_BPSC_001_C09.whenMade,
      taxonomy_id: String(PDT_BPSC_001_C09.taxonomyId),
      type: "download",
      tags: PDT_BPSC_001_C09.tags.join(",")
    });
    let response: Response;
    try {
      response = await this.fetchImpl(`https://api.etsy.com/v3/application/shops/${PDT_BPSC_001_C09.shopId}/listings`, {
        method: "POST",
        headers: { ...etsyApiHeaders(this.token), "content-type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store"
      });
    } catch {
      throw new ProviderAmbiguousResultError();
    }
    if (response.status >= 500) throw new ProviderAmbiguousResultError();
    if (!response.ok) throw new Error(`ETSY_C09_DRAFT_CREATE_REJECTED:${response.status}`);
    const value = await parseJson(response);
    if (!isRec(value)) throw new ProviderAmbiguousResultError();
    const id = listingId(value);
    if (!id) throw new ProviderAmbiguousResultError();
    const detail = await fetchListing(this.fetchImpl, this.token, id);
    const identity = verifyEtsyReadBackIdentity(PDT_BPSC_001_C09_LISTING_FINGERPRINT, observation(detail));
    if (identity.status !== "MATCH") throw new ProviderAmbiguousResultError();
    return { providerResourceId: id, kind: "CREATE_DRAFT", metadata: { listingFingerprint: identity.actualFingerprint } };
  }

  async reconcile(): Promise<ProviderReceipt | null> {
    let matches: string[];
    try { matches = await this.exactDraftMatches(); }
    catch { return null; }
    if (matches.length !== 1) return null;
    return { providerResourceId: matches[0], kind: "CREATE_DRAFT", metadata: { readBack: true } };
  }
}

async function preloadAssets(runtime: Runtime) {
  const load = runtime.loadAsset ?? (async (asset: Asset) => loadAuthorizedAsset(PDT_BPSC_001_C09.operationId, asset.sha256));
  const loaded = new Map<string, Buffer>();
  for (const asset of PDT_BPSC_001_C09_ASSETS) {
    const bytes = await load(asset);
    if (bytes.length !== asset.sizeBytes) throw new Error(`ETSY_C09_ASSET_SIZE_MISMATCH:${asset.rank}:${asset.fileName}`);
    const actualSha = createHash("sha256").update(bytes).digest("hex");
    if (actualSha !== asset.sha256) throw new Error(`ETSY_C09_ASSET_SHA256_MISMATCH:${asset.rank}:${asset.fileName}`);
    loaded.set(asset.sha256, bytes);
  }
  return loaded;
}

function childOperationId(asset: Asset) {
  const kind = asset.kind === "UPLOAD_IMAGE" ? "IMAGE" : "FILE";
  return `${PDT_BPSC_001_C09.operationId}:${kind}:${String(asset.rank).padStart(2, "0")}`;
}

async function uploadAsset(
  asset: Asset,
  bytes: Buffer,
  draftListingId: number,
  token: string,
  repository: OperationLedgerRepository,
  now: string,
  fetchImpl: typeof fetch
) {
  const file = new File([new Uint8Array(bytes)], asset.fileName, { type: asset.mimeType });
  const payload: EtsyDraftAssetPayload = {
    operationKind: asset.kind,
    candidateId: PDT_BPSC_001_C09.candidateId,
    candidateFingerprint: PDT_BPSC_001_C09.candidateFingerprint,
    expectedListingFingerprint: PDT_BPSC_001_C09_LISTING_FINGERPRINT,
    shopId: Number(PDT_BPSC_001_C09.shopId),
    draftListingId,
    assetSha256: asset.sha256,
    assetName: asset.fileName,
    rank: asset.rank
  };
  const provider = new EtsyDraftAssetProvider(token, payload, file, { fetchImpl });
  const before = await provider.readListing();
  const preIdentity = verifyEtsyReadBackIdentity(PDT_BPSC_001_C09_LISTING_FINGERPRINT, before.observation);
  if (before.observation.state !== "draft" || preIdentity.status !== "MATCH") throw new Error("ETSY_C09_PRE_ASSET_IDENTITY_MISMATCH");
  const result = await executeReconciledWrite(repository, provider, {
    operationId: childOperationId(asset),
    kind: asset.kind,
    payload: { ...payload },
    now
  });
  if (result.status === "RECONCILIATION_REQUIRED") throw new Error("ETSY_C09_ASSET_RECONCILIATION_REQUIRED");
  const receipt = result.receipt as ProviderReceipt;
  if (!(await provider.hasResource(receipt.providerResourceId))) throw new Error("ETSY_C09_ASSET_READBACK_MISMATCH");
  return receipt;
}

async function verifyAssetCompleteness(fetchImpl: typeof fetch, token: string, draftListingId: string) {
  const imageResponse = await fetchImpl(`https://api.etsy.com/v3/application/listings/${draftListingId}/images`, {
    method: "GET", headers: etsyApiHeaders(token), cache: "no-store"
  });
  const fileResponse = await fetchImpl(`https://api.etsy.com/v3/application/shops/${PDT_BPSC_001_C09.shopId}/listings/${draftListingId}/files`, {
    method: "GET", headers: etsyApiHeaders(token), cache: "no-store"
  });
  if (!imageResponse.ok || !fileResponse.ok) throw new Error("ETSY_C09_ASSET_COLLECTION_READBACK_FAILED");
  const images = results(await parseJson(imageResponse));
  const files = results(await parseJson(fileResponse));
  if (!images || !files) throw new Error("ETSY_C09_ASSET_COLLECTION_READBACK_INVALID");
  const imageRanks = images.map((item) => Number(item.rank)).sort((a, b) => a - b);
  if (images.length !== 10 || imageRanks.some((rank, index) => rank !== index + 1)) throw new Error("ETSY_C09_GALLERY_READBACK_MISMATCH");
  const fileNames = files.map((item) => typeof item.filename === "string" ? item.filename.trim() : "");
  if (files.length !== 5 || PDT_BPSC_001_C09.buyerFiles.some((asset) => !fileNames.includes(asset.fileName))) {
    throw new Error("ETSY_C09_BUYER_FILE_READBACK_MISMATCH");
  }
}

function requestErrorStatus(code: string) {
  if (code.includes("UNAUTHORIZED")) return 401;
  if (code.includes("NOT_CONFIGURED")) return 503;
  if (code.includes("RECONCILIATION_REQUIRED")) return 202;
  return 409;
}

export async function handlePdtBpsc001C09NewListing(
  body: ReturnType<typeof exactPdtBpsc001C09Body>,
  authorizationRequestHash: string,
  request: Request,
  runtime: Runtime = {}
) {
  try {
    validateWriteToken(request);
    if (!configuredForWrites()) throw new Error("ETSY_C09_WRITES_DISABLED");
    if (!body.authorizationId) throw new Error("ETSY_C09_AUTHORIZATION_ID_REQUIRED");
    if (!SHA256.test(body.protectedStateFingerprint)) throw new Error("ETSY_C09_PROTECTED_STATE_FINGERPRINT_INVALID");
    if (!SHA256.test(authorizationRequestHash)) throw new Error("ETSY_C09_AUTHORIZATION_REQUEST_HASH_INVALID");
    const computedRequestHash = hashOperationRequest(body);
    if (!secureEqual(computedRequestHash, authorizationRequestHash)) throw new Error("ETSY_C09_AUTHORIZATION_REQUEST_HASH_MISMATCH");

    const fetchImpl = runtime.fetchImpl ?? fetch;
    const getAccessToken = runtime.getAccessToken ?? getValidEtsyAccessToken;
    const repository = runtime.repository ?? new NeonOperationLedgerRepository();
    const now = runtime.now?.() ?? new Date().toISOString();

    const state = await protectedState({ ...runtime, fetchImpl, getAccessToken });
    const createOperationId = `${PDT_BPSC_001_C09.operationId}:CREATE_DRAFT`;
    const existingCreate = await repository.load(createOperationId);
    const recoveryMode = Boolean(existingCreate && existingCreate.status !== "FAILED");
    if (!recoveryMode) {
      if (state.collisions.length > 0) throw new Error("ETSY_C09_TARGET_COLLISION");
      if (!secureEqual(state.fingerprint, body.protectedStateFingerprint)) throw new Error("ETSY_C09_PROTECTED_STATE_DRIFT");
    }

    const loadedAssets = await preloadAssets(runtime);
    const token = await getAccessToken();
    const draftProvider = new C09DraftProvider(token, fetchImpl);
    const draftResult = await executeReconciledWrite(repository, draftProvider, {
      operationId: createOperationId,
      kind: "CREATE_DRAFT",
      payload: {
        candidateId: PDT_BPSC_001_C09.candidateId,
        candidateFingerprint: PDT_BPSC_001_C09.candidateFingerprint,
        listingFingerprint: PDT_BPSC_001_C09_LISTING_FINGERPRINT,
        protectedStateFingerprint: body.protectedStateFingerprint
      },
      now
    });
    if (draftResult.status === "RECONCILIATION_REQUIRED") {
      return NextResponse.json({ status: "RECONCILIATION_REQUIRED", operationId: PDT_BPSC_001_C09.operationId, ETSY_WRITE_COUNT: 0 }, { status: 202 });
    }
    const draftReceipt = draftResult.receipt as ProviderReceipt;
    if (!/^[1-9]\d*$/.test(draftReceipt.providerResourceId)) throw new Error("ETSY_C09_DRAFT_ID_INVALID");
    const draftListingId = Number(draftReceipt.providerResourceId);

    const receipts: ProviderReceipt[] = [];
    for (const asset of PDT_BPSC_001_C09_ASSETS) {
      const bytes = loadedAssets.get(asset.sha256);
      if (!bytes) throw new Error("ETSY_C09_STAGED_ASSET_MISSING");
      receipts.push(await uploadAsset(asset, bytes, draftListingId, token, repository, now, fetchImpl));
    }
    await verifyAssetCompleteness(fetchImpl, token, String(draftListingId));

    const grant = createPublishAuthorization({
      authorizationId: body.authorizationId,
      candidateId: PDT_BPSC_001_C09.candidateId,
      candidateFingerprint: PDT_BPSC_001_C09.candidateFingerprint,
      channel: "etsy",
      shopId: PDT_BPSC_001_C09.shopId,
      draftListingId: String(draftListingId),
      issuedAt: now
    });
    const publishProvider = new EtsyAuthorizedPublishProvider(PDT_BPSC_001_C09.shopId, { fetchImpl, getAccessToken });
    const publishResult = await executeAuthorizedPublishTransaction(repository, publishProvider, {
      operationId: `${PDT_BPSC_001_C09.operationId}:PUBLISH`,
      authorization: grant,
      candidateId: PDT_BPSC_001_C09.candidateId,
      candidateFingerprint: PDT_BPSC_001_C09.candidateFingerprint,
      expectedListingFingerprint: PDT_BPSC_001_C09_LISTING_FINGERPRINT,
      shopId: PDT_BPSC_001_C09.shopId,
      draftListingId: String(draftListingId),
      channel: "etsy",
      now
    });
    if (publishResult.status === "RECONCILIATION_REQUIRED") {
      return NextResponse.json({ status: "RECONCILIATION_REQUIRED", operationId: PDT_BPSC_001_C09.operationId, draftListingId, ETSY_WRITE_COUNT: 16 }, { status: 202 });
    }
    if (publishResult.status === "IDENTITY_MISMATCH" || publishResult.status === "FAILED_REPLAY") {
      throw new Error("ETSY_C09_PUBLISH_IDENTITY_OR_REPLAY_FAILURE");
    }

    return NextResponse.json({
      status: "PUBLISHED_AND_VERIFIED",
      operationId: PDT_BPSC_001_C09.operationId,
      authorizationId: body.authorizationId,
      candidateId: PDT_BPSC_001_C09.candidateId,
      candidateFingerprint: PDT_BPSC_001_C09.candidateFingerprint,
      listingFingerprint: PDT_BPSC_001_C09_LISTING_FINGERPRINT,
      protectedStateFingerprint: body.protectedStateFingerprint,
      authorizationRequestHash,
      listingId: draftListingId,
      assetReceiptCount: receipts.length,
      ETSY_WRITE_COUNT: 17
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({
      status: "BLOCKED_FAIL_CLOSED",
      error: code,
      operationId: PDT_BPSC_001_C09.operationId,
      candidateId: PDT_BPSC_001_C09.candidateId,
      ETSY_WRITE_COUNT: 0
    }, { status: requestErrorStatus(code) });
  }
}
