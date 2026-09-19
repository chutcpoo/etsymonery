import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createListingFingerprint } from "./candidate-fingerprint";
import {
  clearAuthorizedAsset,
  loadAuthorizedAsset
} from "./authorized-operation-asset-store";
import {
  executeReconciledWrite,
  ProviderAmbiguousResultError,
  type ProviderReceipt,
  type ReconciledWriteProvider
} from "./draft-upload-reconciliation";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import {
  EtsyDraftAssetProvider,
  type EtsyDraftAssetPayload
} from "./etsy-draft-asset-provider";
import { getEtsySellerStateSnapshot } from "./etsy-seller-state-reconciliation";
import {
  verifyEtsyReadBackIdentity,
  type EtsyReadBackObservation
} from "./etsy-readback-normalizer";
import {
  beginOperation,
  hashOperationRequest,
  NeonOperationLedgerRepository,
  recordOperationResult,
  type OperationLedgerRepository
} from "./operation-ledger";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;
const AUTHORIZATION_ID = /^PDT-IPT-001-R03-DRAFT-AUTH-20260919-[0-9]{2}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;

type Rec = Record<string, unknown>;
type Asset = {
  kind: "UPLOAD_IMAGE" | "UPLOAD_FILE";
  rank: number;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  driveId: string;
  mimeType: string;
  altText?: string;
};
type VideoAsset = {
  fileName: string;
  sizeBytes: number;
  sha256: string;
  driveId: string;
  mimeType: "video/mp4";
  width: number;
  height: number;
};

type Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  loadAsset?: (asset: Asset | VideoAsset) => Promise<Buffer>;
  clearAsset?: (asset: Asset | VideoAsset) => Promise<void>;
  verifyAsset?: (bytes: Buffer, asset: Asset | VideoAsset) => boolean;
  now?: () => string;
};

const DESCRIPTION = `Keep issued invoices and incoming payments organized in one clear Excel workbook. This invoice tracker is built for freelancers, independent service providers, and solo or small businesses that already create invoices elsewhere and need a simple way to see what has been invoiced, what has been paid, what is still outstanding, and what needs follow-up.

Use the workbook to record issued invoices, log incoming payments by Invoice ID, track partial or full payments, review remaining balances and due dates, identify overdue items, and see monthly invoiced-versus-paid activity in one place.

WHAT THIS WORKBOOK HELPS YOU TRACK
• Issued invoice records
• Incoming payments linked by Invoice ID
• Partial and full payment status
• Remaining balances
• Due dates and overdue days
• Aging and follow-up priorities
• Monthly invoiced vs. payments summary
• Dashboard totals for invoiced, paid, outstanding, overdue, and aging buckets

7 INCLUDED WORKSHEETS
1. START HERE
2. SETTINGS
3. INVOICES
4. PAYMENTS
5. AGING & FOLLOW-UP
6. MONTHLY SUMMARY
7. DASHBOARD

HOW IT WORKS
1. Add issued invoices in the INVOICES sheet.
2. Record incoming payments in PAYMENTS using the related Invoice ID.
3. Review remaining balances, payment status, overdue days, and follow-up priority.
4. Use MONTHLY SUMMARY and DASHBOARD to review invoiced, paid, outstanding, and aging totals.

WHAT YOU RECEIVE
• 1 Microsoft Excel .xlsx workbook
• Digital product only — no physical item is shipped

COMPATIBILITY
Microsoft Excel .xlsx format.
Google Sheets compatibility has not been verified and is not claimed for this product.

IMPORTANT SCOPE
This is an invoice and payment tracking workbook. It does not create or send invoices, process payments, connect to bank accounts, provide bookkeeping or accounting records, calculate taxes, provide tax advice, automate CRM workflows, run payroll, or manage inventory.

Designed as a transparent tracking layer for businesses that already issue invoices elsewhere and want a clearer view of payments, outstanding balances, aging, and follow-up priorities.`;

const TAGS = Object.freeze([
  "invoice tracker",
  "payment tracker",
  "invoice spreadsheet",
  "invoice organizer",
  "payment log",
  "invoice log",
  "payment spreadsheet",
  "business tracker",
  "excel spreadsheet",
  "small business",
  "invoice dashboard",
  "spreadsheet template",
  "billing tracker"
] as const);

const GALLERY = Object.freeze([
  {
    kind: "UPLOAD_IMAGE",
    rank: 1,
    fileName: "PDT-IPT-001_01_HERO_invoice-payment-tracker.jpg",
    sizeBytes: 177177,
    sha256: "4b6f8ea1f7af1c6e44bf5290ef8ffd01a37f7a632c4f192703ae6dab0bc0a94a",
    driveId: "167x2Z8YpycssfP22Lf3B7usKdCyJtC3p",
    mimeType: "image/jpeg",
    altText: "Invoice and payment tracker hero showing a real Excel dashboard preview with totals for invoiced, paid, outstanding balance and aging or overdue status."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 2,
    fileName: "PDT-IPT-001_02_PROBLEM_invoice-payment-tracker.jpg",
    sizeBytes: 209141,
    sha256: "2759a32d7c7074ea4ad46e422482af80139c07947b0165054fd1ecfddf6cbe7b",
    driveId: "1OnUjJhwb2C6T5PgDGar7Dp7-y5C2xaPn",
    mimeType: "image/jpeg",
    altText: "Problem slide showing the real Monthly Summary worksheet with columns for month, invoice amount, payments received and net outstanding movement."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 3,
    fileName: "PDT-IPT-001_03_WHATS-INCLUDED_7-tabs-real.jpg",
    sizeBytes: 198158,
    sha256: "ec6e6ecfa5fc4f9886a63f93d6ddd792649d2111452fc4837457361617b0ebe6",
    driveId: "1YpwlcjUCoiERsY9fObqu5JhTyDkcTkML",
    mimeType: "image/jpeg",
    altText: "What’s included slide showing a real Invoices worksheet preview from the seven-tab Excel invoice and payment tracker workbook."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 4,
    fileName: "PDT-IPT-001_04_DASHBOARD-PREVIEW_invoice-payment-tracker.jpg",
    sizeBytes: 165426,
    sha256: "bd950cfdfa8b353fcf875f5d50b3c57c5adc16498d3dbbdd7dd222efa28e3e96",
    driveId: "15AzITt0XqvyNC3kSzU5RYNDuL5U_omY1",
    mimeType: "image/jpeg",
    altText: "Dashboard preview slide showing the real Excel dashboard with total invoiced, total paid, outstanding balance and aging bucket fields."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 5,
    fileName: "PDT-IPT-001_05_AGING-FOLLOW-UP_invoice-payment-tracker.jpg",
    sizeBytes: 162326,
    sha256: "89cbf7a2e51d500e30be5b1f0e328f1f6adbb636d1477b1b21939160b1941f4d",
    driveId: "13BaMUGK43-rGEbUbXoH7EtU1AZEoygkI",
    mimeType: "image/jpeg",
    altText: "Aging and follow-up slide showing the real AGING & FOLLOW-UP worksheet used to review overdue invoices and follow-up priorities."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 6,
    fileName: "PDT-IPT-001_06_HOW-IT-WORKS_invoice-payment-tracker.jpg",
    sizeBytes: 160127,
    sha256: "bc8720fd3da8a756781fd3fb39b56c74127075a7a99cf3b6a6a94bdea4c43465",
    driveId: "16dhTmGWrMoCsK89qJ3I0TkX9GsNCV792",
    mimeType: "image/jpeg",
    altText: "How it works slide showing the real dashboard preview used to review invoice totals, payments, outstanding balances and aging status."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 7,
    fileName: "PDT-IPT-001_07_USE-CASES_freelancer-solo-business.jpg",
    sizeBytes: 238572,
    sha256: "2042318613643839408bf4d4f45d3bc995e3e9ea3889d81fb31676b6dcf2e60a",
    driveId: "1ew3rXTPu-ztTTC5jT7rT52dwdm21Taru",
    mimeType: "image/jpeg",
    altText: "Freelancer and solo business use-case slide showing the real Monthly Summary worksheet with invoice amount, payments received and outstanding movement by month."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 8,
    fileName: "PDT-IPT-001_08_COMPATIBILITY_excel-xlsx.jpg",
    sizeBytes: 208638,
    sha256: "f11460175a130706e2028f739c34d1c98f5c7ec11042560fb0d069b3c7f71a95",
    driveId: "1yOHUuvdgRi9v5idFKLW1d9wn1WsUVQVg",
    mimeType: "image/jpeg",
    altText: "Excel XLSX compatibility slide showing a real Invoices worksheet preview from the Microsoft Excel workbook; Google Sheets compatibility is not claimed."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 9,
    fileName: "PDT-IPT-001_09_TRUST_not-accounting-tax.jpg",
    sizeBytes: 164911,
    sha256: "d7e5a16d0a0ac0e740bcdb6c8f87197da633ec21250f931e9db943453475492b",
    driveId: "12mkgbUDqChP6dDmoMI_GaRksxwMcElcN",
    mimeType: "image/jpeg",
    altText: "Trust slide showing a real Payments worksheet preview and clarifying that the workbook is for invoice tracking, not accounting or tax advice."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 10,
    fileName: "PDT-IPT-001_10_CTA_invoice-payment-tracker.jpg",
    sizeBytes: 182512,
    sha256: "0c72b9e1b57b3c82c0e1df1ababc96381a46b7df3840ce202fa9b8b7b1750c4a",
    driveId: "1zRQVT6hLSxaK9S8pup49AokmwkyEk_x-",
    mimeType: "image/jpeg",
    altText: "Call-to-action slide showing the real AGING & FOLLOW-UP worksheet preview for reviewing outstanding invoices and follow-up priorities."
  }
] as const satisfies readonly Asset[]);

const BUYER_FILE = Object.freeze({
  kind: "UPLOAD_FILE",
  rank: 1,
  fileName: "PDT-IPT-001_V1_Invoice_Payment_Tracker.xlsx",
  sizeBytes: 48595,
  sha256: "5ba3ec9bd23630f086145633557021e273ba0a7b61ed9db2c97a233a3e94c8c4",
  driveId: "1Jd9327N6-FxOo1nd1bLgcCeeeeSHqGKt",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
} as const satisfies Asset);

const VIDEO = Object.freeze({
  fileName: "PDT-IPT-001_VIDEO_invoice-payment-tracker.mp4",
  sizeBytes: 167314,
  sha256: "5899c51bf70a201b8267ea64aa24378cbefd9e91aa9467abbf154eb74815830c",
  driveId: "1WejcpyANCS7Umfb3-py_5bvitU-8OLAt",
  mimeType: "video/mp4",
  width: 1920,
  height: 1080
} as const satisfies VideoAsset);

export const PDT_IPT_001_R03_DRAFT = Object.freeze({
  operation: "CREATE_NEW_DIGITAL_DRAFT_EXACT_R03_ONLY",
  operationId: "PDT-IPT-001-R03-DRAFT-001",
  productId: "PDT-IPT-001",
  productVersion: "V1",
  shopId: "23582741",
  shopName: "PoonthaiDigital",
  candidateId: "ETSY-LISTING-CANDIDATE-PDT-IPT-001-V1-20260917-R03",
  candidateFingerprint: "fb30b800390d52506e5a5a6a2d2f9d7e2fb70502da2c7767e3f93dd63239fa36",
  listingFingerprint: "099976dd679b2e08938ffeed91ddcbbc0ff5ca34f1186d6bb56b0e87f040f3f7",
  title: "Invoice & Payment Tracker Spreadsheet | Excel Small Business Invoice Tracker with Payments, Aging & Dashboard",
  description: DESCRIPTION,
  priceUsd: 6.9,
  taxonomyId: 12476,
  quantity: 999,
  whoMade: "i_did",
  whenMade: "2020_2026",
  listingType: "download",
  sku: "PDT-IPT-001",
  tags: TAGS,
  gallery: GALLERY,
  buyerFile: BUYER_FILE,
  video: VIDEO
} as const);

export const PDT_IPT_001_R03_DRAFT_ASSETS = Object.freeze([
  ...GALLERY,
  BUYER_FILE,
  VIDEO
]) as readonly (Asset | VideoAsset)[];

const LISTING_IDENTITY = Object.freeze({
  title: PDT_IPT_001_R03_DRAFT.title,
  description: PDT_IPT_001_R03_DRAFT.description,
  priceUsd: PDT_IPT_001_R03_DRAFT.priceUsd,
  tags: [...PDT_IPT_001_R03_DRAFT.tags],
  quantity: PDT_IPT_001_R03_DRAFT.quantity,
  who_made: PDT_IPT_001_R03_DRAFT.whoMade,
  when_made: PDT_IPT_001_R03_DRAFT.whenMade,
  taxonomy_id: PDT_IPT_001_R03_DRAFT.taxonomyId,
  type: "download",
  state: "draft"
});

export const PDT_IPT_001_R03_LISTING_FINGERPRINT =
  createListingFingerprint(LISTING_IDENTITY);

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
function positiveId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d*$/.test(value.trim())) return value.trim();
  return null;
}
function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function multipartHeaders(token: string) {
  const h = etsyApiHeaders(token);
  delete h["content-type"];
  return h;
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
function authError(request: Request) {
  const expected = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!expected) return NextResponse.json({ error: "PDT_IPT_R03_WRITE_TOKEN_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0 }, { status: 503 });
  if (!supplied || !secureEqual(supplied, expected)) {
    return NextResponse.json({ error: "PDT_IPT_R03_WRITE_UNAUTHORIZED", ETSY_WRITE_COUNT: 0 }, { status: 401 });
  }
  return null;
}
function configuredForWrites() {
  return process.env.PUBLISH_WRITES_ENABLED === "true" &&
    process.env.ETSY_DRAFT_WRITES_ENABLED === "true";
}
function currentCommit() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? "";
}

async function fetchListing(fetchImpl: typeof fetch, token: string, listingId: string) {
  const response = await fetchImpl(
    `https://api.etsy.com/v3/application/listings/${listingId}`,
    { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" }
  );
  if (!response.ok) throw new Error(`PDT_IPT_R03_LISTING_READ_FAILED:${response.status}`);
  const value = await parseJson(response);
  if (!isRec(value)) throw new Error("PDT_IPT_R03_LISTING_READ_INVALID");
  return value;
}

async function protectedState(runtime: Runtime = {}) {
  const fetchImpl = runtime.fetchImpl ?? fetch;
  const getAccessToken = runtime.getAccessToken ?? getValidEtsyAccessToken;
  const configuredShopId = process.env.ETSY_SHOP_ID?.trim() ?? "";
  if (configuredShopId !== PDT_IPT_001_R03_DRAFT.shopId) throw new Error("PDT_IPT_R03_SHOP_ID_MISMATCH");
  const token = await getAccessToken();
  const state = await getEtsySellerStateSnapshot({
    shopId: Number(PDT_IPT_001_R03_DRAFT.shopId),
    accessToken: token,
    dependencies: { fetchImpl }
  });
  const collisions = state.listings.filter((item) =>
    item.title?.normalize("NFC").trim() === PDT_IPT_001_R03_DRAFT.title ||
    item.skus.some((sku) => sku.normalize("NFC").trim() === PDT_IPT_001_R03_DRAFT.sku)
  );
  const snapshot = {
    operationId: PDT_IPT_001_R03_DRAFT.operationId,
    candidateId: PDT_IPT_001_R03_DRAFT.candidateId,
    candidateFingerprint: PDT_IPT_001_R03_DRAFT.candidateFingerprint,
    listingFingerprint: PDT_IPT_001_R03_DRAFT.listingFingerprint,
    shopId: PDT_IPT_001_R03_DRAFT.shopId,
    stateCounts: state.counts,
    listingIds: state.listings.map((item) => item.listingId).sort((a, b) => a - b),
    collisionListingIds: collisions.map((item) => item.listingId).sort((a, b) => a - b)
  };
  return {
    snapshot,
    fingerprint: hashOperationRequest(snapshot),
    collisions
  };
}

export async function verifyPdtIpt001R03DraftProtectedState(runtime: Runtime = {}) {
  try {
    const state = await protectedState(runtime);
    return NextResponse.json({
      status: state.collisions.length === 0 ? "PROTECTED_STATE_MATCH" : "PROTECTED_STATE_MISMATCH",
      operationId: PDT_IPT_001_R03_DRAFT.operationId,
      candidateId: PDT_IPT_001_R03_DRAFT.candidateId,
      candidateFingerprint: PDT_IPT_001_R03_DRAFT.candidateFingerprint,
      listingFingerprint: PDT_IPT_001_R03_DRAFT.listingFingerprint,
      protectedStateFingerprint: state.fingerprint,
      targetCollisionIds: state.collisions.map((item) => item.listingId),
      ETSY_WRITE_COUNT: 0
    }, { status: state.collisions.length === 0 ? 200 : 409 });
  } catch (error) {
    return NextResponse.json({
      status: "PROTECTED_STATE_BLOCKED",
      error: error instanceof Error ? error.message : "UNKNOWN",
      operationId: PDT_IPT_001_R03_DRAFT.operationId,
      ETSY_WRITE_COUNT: 0
    }, { status: 409 });
  }
}

export function exactPdtIpt001R03DraftBody(
  authorizationId: string,
  protectedStateFingerprint: string,
  productionCommit: string
) {
  return {
    operation: PDT_IPT_001_R03_DRAFT.operation,
    operationId: PDT_IPT_001_R03_DRAFT.operationId,
    authorizationId: authorizationId.normalize("NFC").trim(),
    protectedStateFingerprint: protectedStateFingerprint.trim().toLowerCase(),
    productionCommit: productionCommit.trim().toLowerCase(),
    productId: PDT_IPT_001_R03_DRAFT.productId,
    productVersion: PDT_IPT_001_R03_DRAFT.productVersion,
    shopId: PDT_IPT_001_R03_DRAFT.shopId,
    candidateId: PDT_IPT_001_R03_DRAFT.candidateId,
    candidateFingerprint: PDT_IPT_001_R03_DRAFT.candidateFingerprint,
    listingFingerprint: PDT_IPT_001_R03_DRAFT.listingFingerprint,
    scope: PDT_IPT_001_R03_DRAFT.operation,
    sku: PDT_IPT_001_R03_DRAFT.sku,
    gallerySha256: PDT_IPT_001_R03_DRAFT.gallery.map((asset) => asset.sha256),
    galleryAltText: PDT_IPT_001_R03_DRAFT.gallery.map((asset) => asset.altText),
    buyerFileSha256: PDT_IPT_001_R03_DRAFT.buyerFile.sha256,
    videoSha256: PDT_IPT_001_R03_DRAFT.video.sha256,
    publishAuthorized: false
  };
}

export function pdtIpt001R03AuthorizationRequestHash(
  authorizationId: string,
  protectedStateFingerprint: string,
  productionCommit: string
) {
  return hashOperationRequest(
    exactPdtIpt001R03DraftBody(authorizationId, protectedStateFingerprint, productionCommit)
  );
}

class R03DraftProvider implements ReconciledWriteProvider {
  constructor(private readonly token: string, private readonly fetchImpl: typeof fetch) {}

  private async exactDraftMatches() {
    const response = await this.fetchImpl(
      `https://api.etsy.com/v3/application/shops/${PDT_IPT_001_R03_DRAFT.shopId}/listings?state=draft&limit=100`,
      { method: "GET", headers: etsyApiHeaders(this.token), cache: "no-store" }
    );
    const payload = await parseJson(response);
    const list = results(payload);
    if (!response.ok || !list) throw new Error("PDT_IPT_R03_DRAFT_LIST_READ_FAILED");
    const matches: string[] = [];
    for (const item of list) {
      if (item.title !== PDT_IPT_001_R03_DRAFT.title) continue;
      const id = positiveId(item.listing_id);
      if (!id) continue;
      const detail = await fetchListing(this.fetchImpl, this.token, id);
      const identity = verifyEtsyReadBackIdentity(
        PDT_IPT_001_R03_DRAFT.listingFingerprint,
        observation(detail)
      );
      if (identity.status === "MATCH") matches.push(id);
    }
    return matches;
  }

  async apply(): Promise<ProviderReceipt> {
    if ((await this.exactDraftMatches()).length > 0) throw new Error("PDT_IPT_R03_DRAFT_COLLISION");
    const body = new URLSearchParams({
      quantity: String(PDT_IPT_001_R03_DRAFT.quantity),
      title: PDT_IPT_001_R03_DRAFT.title,
      description: PDT_IPT_001_R03_DRAFT.description,
      price: PDT_IPT_001_R03_DRAFT.priceUsd.toFixed(2),
      who_made: PDT_IPT_001_R03_DRAFT.whoMade,
      when_made: PDT_IPT_001_R03_DRAFT.whenMade,
      taxonomy_id: String(PDT_IPT_001_R03_DRAFT.taxonomyId),
      type: "download",
      tags: PDT_IPT_001_R03_DRAFT.tags.join(",")
    });
    let response: Response;
    try {
      response = await this.fetchImpl(
        `https://api.etsy.com/v3/application/shops/${PDT_IPT_001_R03_DRAFT.shopId}/listings`,
        {
          method: "POST",
          headers: {
            ...etsyApiHeaders(this.token),
            "content-type": "application/x-www-form-urlencoded"
          },
          body,
          cache: "no-store"
        }
      );
    } catch {
      throw new ProviderAmbiguousResultError();
    }
    if (response.status >= 500) throw new ProviderAmbiguousResultError();
    if (!response.ok) throw new Error(`PDT_IPT_R03_DRAFT_CREATE_REJECTED:${response.status}`);
    const value = await parseJson(response);
    if (!isRec(value)) throw new ProviderAmbiguousResultError();
    const id = positiveId(value.listing_id);
    if (!id) throw new ProviderAmbiguousResultError();
    const detail = await fetchListing(this.fetchImpl, this.token, id);
    const identity = verifyEtsyReadBackIdentity(
      PDT_IPT_001_R03_DRAFT.listingFingerprint,
      observation(detail)
    );
    if (identity.status !== "MATCH") throw new ProviderAmbiguousResultError();
    return {
      providerResourceId: id,
      kind: "CREATE_DRAFT",
      metadata: { listingFingerprint: identity.actualFingerprint }
    };
  }

  async reconcile(): Promise<ProviderReceipt | null> {
    let matches: string[];
    try { matches = await this.exactDraftMatches(); } catch { return null; }
    if (matches.length !== 1) return null;
    return {
      providerResourceId: matches[0],
      kind: "CREATE_DRAFT",
      metadata: { readBack: true }
    };
  }
}

async function preloadAssets(runtime: Runtime) {
  const load = runtime.loadAsset ??
    (async (asset: Asset | VideoAsset) =>
      loadAuthorizedAsset(PDT_IPT_001_R03_DRAFT.operationId, asset.sha256));
  const loaded = new Map<string, Buffer>();
  for (const asset of PDT_IPT_001_R03_DRAFT_ASSETS) {
    const bytes = await load(asset);
    const verified = runtime.verifyAsset
      ? runtime.verifyAsset(bytes, asset)
      : bytes.length === asset.sizeBytes &&
        createHash("sha256").update(bytes).digest("hex") === asset.sha256;
    if (!verified) {
      throw new Error(`PDT_IPT_R03_ASSET_IDENTITY_MISMATCH:${asset.fileName}`);
    }
    loaded.set(asset.sha256, bytes);
  }
  return loaded;
}

function childOperationId(asset: Asset) {
  return `${PDT_IPT_001_R03_DRAFT.operationId}:${asset.kind === "UPLOAD_IMAGE" ? "IMAGE" : "FILE"}:${String(asset.rank).padStart(2, "0")}`;
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
    candidateId: PDT_IPT_001_R03_DRAFT.candidateId,
    candidateFingerprint: PDT_IPT_001_R03_DRAFT.candidateFingerprint,
    expectedListingFingerprint: PDT_IPT_001_R03_DRAFT.listingFingerprint,
    shopId: Number(PDT_IPT_001_R03_DRAFT.shopId),
    draftListingId,
    assetSha256: asset.sha256,
    assetName: asset.fileName,
    rank: asset.rank,
    ...(asset.altText ? { altText: asset.altText } : {})
  };
  const provider = new EtsyDraftAssetProvider(token, payload, file, { fetchImpl });
  const before = await provider.readListing();
  const identity = verifyEtsyReadBackIdentity(
    PDT_IPT_001_R03_DRAFT.listingFingerprint,
    before.observation
  );
  if (before.observation.state !== "draft" || identity.status !== "MATCH") {
    throw new Error("PDT_IPT_R03_PRE_ASSET_LISTING_IDENTITY_MISMATCH");
  }
  const result = await executeReconciledWrite(repository, provider, {
    operationId: childOperationId(asset),
    kind: asset.kind,
    payload: { ...payload },
    now
  });
  if (result.status === "RECONCILIATION_REQUIRED") {
    throw new Error("PDT_IPT_R03_ASSET_RECONCILIATION_REQUIRED");
  }
  const receipt = result.receipt as ProviderReceipt;
  if (!(await provider.hasResource(receipt.providerResourceId))) {
    throw new Error("PDT_IPT_R03_ASSET_READBACK_MISMATCH");
  }
  return receipt;
}

function moneyDecimal(value: unknown) {
  if (!isRec(value)) throw new Error("PDT_IPT_R03_INVENTORY_PRICE_INVALID");
  const amount = Number(value.amount);
  const divisor = Number(value.divisor);
  if (!Number.isFinite(amount) || !Number.isFinite(divisor) || divisor <= 0) {
    throw new Error("PDT_IPT_R03_INVENTORY_PRICE_INVALID");
  }
  return amount / divisor;
}

type InventoryRecord = Rec & { products: Rec[] };

async function readInventory(fetchImpl: typeof fetch, token: string, listingId: number): Promise<InventoryRecord> {
  const response = await fetchImpl(
    `https://api.etsy.com/v3/application/listings/${listingId}/inventory`,
    { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" }
  );
  const value = await parseJson(response);
  if (!response.ok || !isRec(value) || !Array.isArray(value.products)) {
    throw new Error(`PDT_IPT_R03_INVENTORY_READ_FAILED:${response.status}`);
  }
  return { ...value, products: value.products.filter(isRec) } as InventoryRecord;
}

async function ensureSku(
  draftListingId: number,
  token: string,
  repository: OperationLedgerRepository,
  now: string,
  fetchImpl: typeof fetch
) {
  const operationId = `${PDT_IPT_001_R03_DRAFT.operationId}:SKU`;
  const payload = {
    draftListingId,
    sku: PDT_IPT_001_R03_DRAFT.sku,
    candidateFingerprint: PDT_IPT_001_R03_DRAFT.candidateFingerprint
  };
  const existing = await repository.load(operationId);
  if (existing?.status === "SUCCEEDED") return existing.receipt ?? {};
  if (existing) throw new Error("PDT_IPT_R03_SKU_OPERATION_ALREADY_CLAIMED");

  const before = await readInventory(fetchImpl, token, draftListingId);
  const products = before.products.filter(isRec);
  if (products.length !== 1) throw new Error("PDT_IPT_R03_SIMPLE_INVENTORY_EXPECTED");
  const product = products[0];
  const propertyValues = Array.isArray(product.property_values)
    ? product.property_values.filter(isRec)
    : [];
  if (propertyValues.length !== 0) throw new Error("PDT_IPT_R03_UNEXPECTED_VARIATIONS");
  const offerings = Array.isArray(product.offerings) ? product.offerings.filter(isRec) : [];
  if (offerings.length !== 1) throw new Error("PDT_IPT_R03_SINGLE_OFFERING_EXPECTED");
  const offering = offerings[0];
  const body = {
    products: [{
      sku: PDT_IPT_001_R03_DRAFT.sku,
      property_values: [],
      offerings: [{
        price: moneyDecimal(offering.price),
        quantity: Number(offering.quantity),
        is_enabled: offering.is_enabled !== false,
        ...(Number.isSafeInteger(Number(offering.readiness_state_id)) &&
          Number(offering.readiness_state_id) > 0
          ? { readiness_state_id: Number(offering.readiness_state_id) }
          : {})
      }]
    }],
    price_on_property: [],
    quantity_on_property: [],
    sku_on_property: [],
    readiness_state_on_property: []
  };
  if (body.products[0].offerings[0].quantity !== PDT_IPT_001_R03_DRAFT.quantity ||
      Math.abs(body.products[0].offerings[0].price - PDT_IPT_001_R03_DRAFT.priceUsd) > 0.005) {
    throw new Error("PDT_IPT_R03_INVENTORY_BASELINE_MISMATCH");
  }

  const begun = await beginOperation(repository, operationId, payload, now);
  if (begun.status !== "STARTED") throw new Error("PDT_IPT_R03_SKU_OPERATION_ALREADY_CLAIMED");

  let response: Response;
  try {
    response = await fetchImpl(
      `https://api.etsy.com/v3/application/listings/${draftListingId}/inventory`,
      {
        method: "PUT",
        headers: {
          ...etsyApiHeaders(token),
          "content-type": "application/json"
        },
        body: JSON.stringify(body),
        cache: "no-store"
      }
    );
  } catch {
    await recordOperationResult(
      repository,
      operationId,
      begun.record.requestHash,
      "RECONCILIATION_REQUIRED",
      now,
      { recoveryPoint: "SKU_UPDATE_RESPONSE_AMBIGUOUS" }
    );
    throw new Error("PDT_IPT_R03_SKU_RECONCILIATION_REQUIRED");
  }
  if (!response.ok) {
    await recordOperationResult(
      repository,
      operationId,
      begun.record.requestHash,
      response.status >= 500 ? "RECONCILIATION_REQUIRED" : "FAILED",
      now,
      { recoveryPoint: `SKU_UPDATE_HTTP_${response.status}` }
    );
    throw new Error(`PDT_IPT_R03_SKU_UPDATE_FAILED:${response.status}`);
  }
  const after = await readInventory(fetchImpl, token, draftListingId);
  const afterProducts = after.products.filter(isRec);
  if (afterProducts.length !== 1 || afterProducts[0].sku !== PDT_IPT_001_R03_DRAFT.sku) {
    await recordOperationResult(
      repository,
      operationId,
      begun.record.requestHash,
      "RECONCILIATION_REQUIRED",
      now,
      { recoveryPoint: "SKU_READBACK_MISMATCH" }
    );
    throw new Error("PDT_IPT_R03_SKU_READBACK_MISMATCH");
  }
  return (await recordOperationResult(
    repository,
    operationId,
    begun.record.requestHash,
    "SUCCEEDED",
    now,
    { receipt: { sku: PDT_IPT_001_R03_DRAFT.sku } }
  )).receipt ?? {};
}

async function readVideos(fetchImpl: typeof fetch, token: string, listingId: number) {
  const response = await fetchImpl(
    `https://api.etsy.com/v3/application/listings/${listingId}/videos`,
    { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" }
  );
  const value = await parseJson(response);
  const list = results(value);
  if (!response.ok || !list) {
    throw new Error(`PDT_IPT_R03_VIDEO_READ_FAILED:${response.status}`);
  }
  return list;
}

async function uploadVideo(
  bytes: Buffer,
  draftListingId: number,
  token: string,
  repository: OperationLedgerRepository,
  now: string,
  fetchImpl: typeof fetch
) {
  const operationId = `${PDT_IPT_001_R03_DRAFT.operationId}:VIDEO:01`;
  const payload = {
    draftListingId,
    candidateFingerprint: PDT_IPT_001_R03_DRAFT.candidateFingerprint,
    assetSha256: VIDEO.sha256,
    assetName: VIDEO.fileName
  };
  const existing = await repository.load(operationId);
  if (existing?.status === "SUCCEEDED") return existing.receipt ?? {};
  if (existing) throw new Error("PDT_IPT_R03_VIDEO_OPERATION_ALREADY_CLAIMED");
  const before = await readVideos(fetchImpl, token, draftListingId);
  if (before.length !== 0) throw new Error("PDT_IPT_R03_VIDEO_BASELINE_NOT_EMPTY");

  const begun = await beginOperation(repository, operationId, payload, now);
  if (begun.status !== "STARTED") throw new Error("PDT_IPT_R03_VIDEO_OPERATION_ALREADY_CLAIMED");
  const form = new FormData();
  form.set("name", VIDEO.fileName);
  form.set("video", new File([new Uint8Array(bytes)], VIDEO.fileName, { type: VIDEO.mimeType }));
  let response: Response;
  try {
    response = await fetchImpl(
      `https://api.etsy.com/v3/application/shops/${PDT_IPT_001_R03_DRAFT.shopId}/listings/${draftListingId}/videos`,
      {
        method: "POST",
        headers: multipartHeaders(token),
        body: form,
        cache: "no-store"
      }
    );
  } catch {
    await recordOperationResult(
      repository,
      operationId,
      begun.record.requestHash,
      "RECONCILIATION_REQUIRED",
      now,
      { recoveryPoint: "VIDEO_UPLOAD_RESPONSE_AMBIGUOUS" }
    );
    throw new Error("PDT_IPT_R03_VIDEO_RECONCILIATION_REQUIRED");
  }
  const value = await parseJson(response);
  const videoId = isRec(value) ? positiveId(value.video_id) : null;
  if (response.status !== 201 || !videoId) {
    await recordOperationResult(
      repository,
      operationId,
      begun.record.requestHash,
      response.status >= 500 ? "RECONCILIATION_REQUIRED" : "FAILED",
      now,
      { recoveryPoint: `VIDEO_UPLOAD_HTTP_${response.status}` }
    );
    throw new Error(`PDT_IPT_R03_VIDEO_UPLOAD_FAILED:${response.status}`);
  }
  const after = await readVideos(fetchImpl, token, draftListingId);
  const found = after.find((item) => String(item.video_id ?? "") === videoId);
  if (!found || Number(found.width) !== VIDEO.width || Number(found.height) !== VIDEO.height) {
    await recordOperationResult(
      repository,
      operationId,
      begun.record.requestHash,
      "RECONCILIATION_REQUIRED",
      now,
      { recoveryPoint: "VIDEO_READBACK_MISMATCH" }
    );
    throw new Error("PDT_IPT_R03_VIDEO_READBACK_MISMATCH");
  }
  return (await recordOperationResult(
    repository,
    operationId,
    begun.record.requestHash,
    "SUCCEEDED",
    now,
    {
      receipt: {
        videoId,
        width: Number(found.width),
        height: Number(found.height),
        videoState: String(found.video_state ?? "")
      }
    }
  )).receipt ?? {};
}

async function verifyFinal(
  fetchImpl: typeof fetch,
  token: string,
  draftListingId: number
) {
  const listing = await fetchListing(fetchImpl, token, String(draftListingId));
  const identity = verifyEtsyReadBackIdentity(
    PDT_IPT_001_R03_DRAFT.listingFingerprint,
    observation(listing)
  );
  if (listing.state !== "draft" || identity.status !== "MATCH") {
    throw new Error("PDT_IPT_R03_FINAL_LISTING_IDENTITY_MISMATCH");
  }

  const [imagesResponse, filesResponse, inventory, videos] = await Promise.all([
    fetchImpl(
      `https://api.etsy.com/v3/application/listings/${draftListingId}/images`,
      { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" }
    ),
    fetchImpl(
      `https://api.etsy.com/v3/application/shops/${PDT_IPT_001_R03_DRAFT.shopId}/listings/${draftListingId}/files`,
      { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" }
    ),
    readInventory(fetchImpl, token, draftListingId),
    readVideos(fetchImpl, token, draftListingId)
  ]);
  const images = results(await parseJson(imagesResponse));
  const files = results(await parseJson(filesResponse));
  if (!imagesResponse.ok || !filesResponse.ok || !images || !files) {
    throw new Error("PDT_IPT_R03_FINAL_ASSET_READBACK_FAILED");
  }
  const ordered = [...images].sort((a, b) => Number(a.rank) - Number(b.rank));
  if (ordered.length !== 10) throw new Error("PDT_IPT_R03_FINAL_GALLERY_COUNT_MISMATCH");
  for (let index = 0; index < GALLERY.length; index += 1) {
    const expected = GALLERY[index];
    const actual = ordered[index];
    if (Number(actual.rank) !== expected.rank ||
        String(actual.alt_text ?? "").normalize("NFC").trim() !== expected.altText) {
      throw new Error(`PDT_IPT_R03_FINAL_GALLERY_MISMATCH_${expected.rank}`);
    }
  }
  if (files.length !== 1 ||
      String(files[0].filename ?? "").normalize("NFC").trim() !== BUYER_FILE.fileName ||
      Number(files[0].size_bytes) !== BUYER_FILE.sizeBytes) {
    throw new Error("PDT_IPT_R03_FINAL_BUYER_FILE_MISMATCH");
  }
  const products = inventory.products.filter(isRec);
  if (products.length !== 1 || products[0].sku !== PDT_IPT_001_R03_DRAFT.sku) {
    throw new Error("PDT_IPT_R03_FINAL_SKU_MISMATCH");
  }
  if (videos.length !== 1 ||
      Number(videos[0].width) !== VIDEO.width ||
      Number(videos[0].height) !== VIDEO.height) {
    throw new Error("PDT_IPT_R03_FINAL_VIDEO_MISMATCH");
  }

  return {
    listingFingerprint: identity.actualFingerprint,
    galleryCount: ordered.length,
    altTextCount: ordered.filter((item) => String(item.alt_text ?? "").trim()).length,
    buyerFileCount: files.length,
    sku: products[0].sku,
    videoCount: videos.length,
    videoId: Number(videos[0].video_id),
    state: String(listing.state)
  };
}

function errorStatus(code: string) {
  if (code.includes("UNAUTHORIZED")) return 401;
  if (code.includes("NOT_CONFIGURED")) return 503;
  if (code.includes("RECONCILIATION_REQUIRED")) return 202;
  return 409;
}

export async function handlePdtIpt001R03Draft(
  body: ReturnType<typeof exactPdtIpt001R03DraftBody>,
  authorizationRequestHash: string,
  request: Request,
  runtime: Runtime = {}
) {
  const writeAuth = authError(request);
  if (writeAuth) return writeAuth;
  try {
    if (!configuredForWrites()) throw new Error("PDT_IPT_R03_WRITES_DISABLED");
    if (!AUTHORIZATION_ID.test(body.authorizationId)) {
      throw new Error("PDT_IPT_R03_AUTHORIZATION_ID_INVALID");
    }
    if (!SHA256.test(body.protectedStateFingerprint)) {
      throw new Error("PDT_IPT_R03_PROTECTED_STATE_FINGERPRINT_INVALID");
    }
    if (!SHA256.test(authorizationRequestHash)) {
      throw new Error("PDT_IPT_R03_AUTHORIZATION_REQUEST_HASH_INVALID");
    }
    if (!COMMIT_SHA.test(body.productionCommit) || body.productionCommit !== currentCommit()) {
      throw new Error("PDT_IPT_R03_PRODUCTION_COMMIT_MISMATCH");
    }
    if (PDT_IPT_001_R03_LISTING_FINGERPRINT !== PDT_IPT_001_R03_DRAFT.listingFingerprint) {
      throw new Error("PDT_IPT_R03_COMPILED_LISTING_FINGERPRINT_MISMATCH");
    }
    const exactBody = exactPdtIpt001R03DraftBody(
      body.authorizationId,
      body.protectedStateFingerprint,
      body.productionCommit
    );
    const requestHash = hashOperationRequest(body);
    if (requestHash !== hashOperationRequest(exactBody) ||
        !secureEqual(requestHash, authorizationRequestHash)) {
      throw new Error("PDT_IPT_R03_AUTHORIZATION_CONTRACT_MISMATCH");
    }

    const repository = runtime.repository ?? new NeonOperationLedgerRepository();
    const existing = await repository.load(PDT_IPT_001_R03_DRAFT.operationId);
    if (existing?.status === "SUCCEEDED") {
      return NextResponse.json({
        status: "REPLAY",
        operationId: existing.operationId,
        requestHash: existing.requestHash,
        receipt: existing.receipt,
        DAY03_OPERATION_WRITE_COUNT: 0,
        ETSY_WRITE_COUNT: 0
      });
    }
    if (existing) {
      throw new Error("PDT_IPT_R03_OPERATION_ALREADY_CLAIMED_DO_NOT_RETRY");
    }

    const loadedAssets = await preloadAssets(runtime);
    const fetchImpl = runtime.fetchImpl ?? fetch;
    const getAccessToken = runtime.getAccessToken ?? getValidEtsyAccessToken;
    const state = await protectedState({ ...runtime, fetchImpl, getAccessToken });
    if (state.collisions.length > 0) throw new Error("PDT_IPT_R03_TARGET_COLLISION");
    if (!secureEqual(state.fingerprint, body.protectedStateFingerprint)) {
      throw new Error("PDT_IPT_R03_PROTECTED_STATE_DRIFT");
    }

    const now = runtime.now?.() ?? new Date().toISOString();
    const parent = await beginOperation(
      repository,
      PDT_IPT_001_R03_DRAFT.operationId,
      body,
      now
    );
    if (parent.status !== "STARTED") {
      throw new Error("PDT_IPT_R03_OPERATION_ALREADY_CLAIMED_DO_NOT_RETRY");
    }

    try {
      const token = await getAccessToken();
      const draftProvider = new R03DraftProvider(token, fetchImpl);
      const draftResult = await executeReconciledWrite(repository, draftProvider, {
        operationId: `${PDT_IPT_001_R03_DRAFT.operationId}:CREATE_DRAFT`,
        kind: "CREATE_DRAFT",
        payload: {
          candidateId: PDT_IPT_001_R03_DRAFT.candidateId,
          candidateFingerprint: PDT_IPT_001_R03_DRAFT.candidateFingerprint,
          listingFingerprint: PDT_IPT_001_R03_DRAFT.listingFingerprint,
          protectedStateFingerprint: body.protectedStateFingerprint
        },
        now
      });
      if (draftResult.status === "RECONCILIATION_REQUIRED") {
        throw new Error("PDT_IPT_R03_DRAFT_RECONCILIATION_REQUIRED");
      }
      const draftReceipt = draftResult.receipt as ProviderReceipt;
      const draftId = positiveId(draftReceipt.providerResourceId);
      if (!draftId) throw new Error("PDT_IPT_R03_DRAFT_ID_INVALID");
      const draftListingId = Number(draftId);

      await ensureSku(draftListingId, token, repository, now, fetchImpl);

      const assetReceipts: ProviderReceipt[] = [];
      for (const asset of [...GALLERY, BUYER_FILE]) {
        const bytes = loadedAssets.get(asset.sha256);
        if (!bytes) throw new Error("PDT_IPT_R03_STAGED_ASSET_MISSING");
        assetReceipts.push(
          await uploadAsset(asset, bytes, draftListingId, token, repository, now, fetchImpl)
        );
      }
      const videoBytes = loadedAssets.get(VIDEO.sha256);
      if (!videoBytes) throw new Error("PDT_IPT_R03_STAGED_VIDEO_MISSING");
      const videoReceipt = await uploadVideo(
        videoBytes,
        draftListingId,
        token,
        repository,
        now,
        fetchImpl
      );

      const verified = await verifyFinal(fetchImpl, token, draftListingId);
      const done = await recordOperationResult(
        repository,
        parent.record.operationId,
        parent.record.requestHash,
        "SUCCEEDED",
        runtime.now?.() ?? new Date().toISOString(),
        {
          receipt: {
            authorizationId: body.authorizationId,
            candidateId: PDT_IPT_001_R03_DRAFT.candidateId,
            candidateFingerprint: PDT_IPT_001_R03_DRAFT.candidateFingerprint,
            listingFingerprint: PDT_IPT_001_R03_DRAFT.listingFingerprint,
            productionCommit: body.productionCommit,
            protectedStateFingerprint: body.protectedStateFingerprint,
            authorizationRequestHash,
            draftListingId,
            assetReceiptCount: assetReceipts.length,
            videoReceipt,
            verified,
            publishPerformed: false,
            DAY03_OPERATION_WRITE_COUNT: 1,
            ETSY_PROVIDER_WRITE_COUNT: 14,
            sellerUiFieldsPending: [
              "creation disclosure / ai_gen",
              "renewal Automatic if not exposed by listing readback",
              "Featured OFF if not exposed by listing readback",
              "Restock Requests OFF if not exposed by listing readback",
              "Digital Made-to-Order OFF if not exposed by listing readback"
            ]
          }
        }
      );

      for (const asset of PDT_IPT_001_R03_DRAFT_ASSETS) {
        try {
          await (runtime.clearAsset
            ? runtime.clearAsset(asset)
            : clearAuthorizedAsset(PDT_IPT_001_R03_DRAFT.operationId, asset.sha256));
        } catch {
          // Exact draft is already verified; staging cleanup is best effort only.
        }
      }

      return NextResponse.json({
        status: "DRAFT_CREATED_VERIFIED_API_SCOPE",
        mode: "WRITE_ONCE_DRAFT_ONLY",
        operationId: done.operationId,
        requestHash: done.requestHash,
        authorizationId: body.authorizationId,
        candidateId: PDT_IPT_001_R03_DRAFT.candidateId,
        candidateFingerprint: PDT_IPT_001_R03_DRAFT.candidateFingerprint,
        listingFingerprint: PDT_IPT_001_R03_DRAFT.listingFingerprint,
        draftListingId,
        verified,
        publishPerformed: false,
        DAY03_OPERATION_WRITE_COUNT: 1,
        ETSY_PROVIDER_WRITE_COUNT: 14,
        sellerUiGateRequired: true,
        sellerUiFieldsPending: done.receipt?.sellerUiFieldsPending
      });
    } catch (error) {
      await recordOperationResult(
        repository,
        parent.record.operationId,
        parent.record.requestHash,
        "RECONCILIATION_REQUIRED",
        runtime.now?.() ?? new Date().toISOString(),
        {
          recoveryPoint: error instanceof Error ? error.message : "UNKNOWN",
          receipt: {
            authorizationId: body.authorizationId,
            candidateFingerprint: PDT_IPT_001_R03_DRAFT.candidateFingerprint,
            publishPerformed: false
          }
        }
      );
      throw error;
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({
      status: "BLOCKED_FAIL_CLOSED",
      error: code,
      operationId: PDT_IPT_001_R03_DRAFT.operationId,
      candidateId: PDT_IPT_001_R03_DRAFT.candidateId,
      publishPerformed: false,
      DAY03_OPERATION_WRITE_COUNT: 0,
      ETSY_WRITE_COUNT: 0
    }, { status: errorStatus(code) });
  }
}
