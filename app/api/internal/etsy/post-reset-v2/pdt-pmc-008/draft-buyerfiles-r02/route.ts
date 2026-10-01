import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createCandidateFingerprint, createListingFingerprint } from "../../../../../../../lib/candidate-fingerprint";
import {
  executeReconciledWrite,
  ProviderAmbiguousResultError,
  type ProviderReceipt,
  type ReconciledWriteProvider
} from "../../../../../../../lib/draft-upload-reconciliation";
import {
  EtsyDraftAssetProvider,
  type EtsyDraftAssetPayload
} from "../../../../../../../lib/etsy-draft-asset-provider";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import {
  verifyEtsyReadBackIdentity,
  type EtsyReadBackObservation
} from "../../../../../../../lib/etsy-readback-normalizer";
import { getEtsySellerStateSnapshot } from "../../../../../../../lib/etsy-seller-state-reconciliation";
import { NeonOperationLedgerRepository } from "../../../../../../../lib/operation-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = 23582741;
const OPERATION_ID = "PDT-PMC-008-ETSY-DRAFT-BUYERFILES-R02-20261001";
const AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-PMC-008-ETSY-DRAFT-BUYERFILES-R02-20261001 ETSYCOM-ONLY TITLE-R01 EXACT SCOPE ONLY";
const WRITE_HEADER = "x-autodigitalpublisher-write-token";

const TITLE =
  "Pricing Calculator Excel & Google Sheets | Small Business Product Cost, Profit Margin and Break-Even Spreadsheet";

const DESCRIPTION = [
  "Pricing Calculator for small businesses that want to organize real cost assumptions and compare break-even, markup, target-margin, and target-profit pricing scenarios in Microsoft Excel or Google Sheets.",
  "",
  "The buyer receives the exact R07 workbook package described below; Google Sheets use is via tested workbook import/readback, not a separate native Sheets file.",
  "",
  "What it helps you do",
  "- Calculate total cost per unit from direct cost, labor, packaging, seller-paid shipping or fulfillment, other variable costs, and allocated overhead.",
  "- Compare break-even, cost-plus markup, target-margin, and target-profit pricing scenarios.",
  "- Review estimated percentage fees, fixed fees, profit per unit, and actual margin from the assumptions you enter.",
  "- Compare a manual/current list price with your break-even and target-margin assumptions.",
  "- Save and compare up to 100 products.",
  "- Review saved products, margin status, and estimated monthly profit on the Dashboard.",
  "",
  "What you receive",
  "- 1 ZIP containing:",
  "  - PDT-PMC-008_V1_Pricing_Margin_Calculator_CLEAN_FINAL_R07.xlsx",
  "  - PDT-PMC-008_V1_Pricing_Margin_Calculator_DEMO_FINAL_R07.xlsx",
  "- PDT-PMC-008_V1_Quick_Start_Guide_FINAL.pdf",
  "",
  "The workbooks contain 6 sheets:",
  "START HERE, SETTINGS, COSTS, PRICING CALCULATOR, PRODUCTS, and DASHBOARD.",
  "",
  "Compatibility",
  "- Microsoft Excel",
  "- Google Sheets",
  "- Tested on Microsoft 365 Excel and native Google Sheets import/readback",
  "- No macros",
  "",
  "Important",
  "This is a digital download. No physical product will be shipped.",
  "",
  "This workbook is a planning and organization tool. It does not provide accounting, tax, legal, or financial advice. Marketplace and payment fees can change, so enter and verify your own current assumptions. Results depend on the information you enter and do not guarantee sales, profit, revenue, savings, or other business outcomes.",
  "",
  "AI DISCLOSURE",
  "AI-assisted tools were used during parts of development and design. The final workbook formulas, compatibility, buyer files, and listing visuals were reviewed and tested before release. Product screenshots show the actual workbook."
].join("\n");

const TAGS = Object.freeze([
  "pricing calculator",
  "product cost calc",
  "profit margin",
  "break even",
  "pricing spreadsheet",
  "small biz pricing",
  "cost calculator",
  "margin calculator",
  "price calculator",
  "excel pricing",
  "google sheets",
  "product pricing",
  "markup calculator"
] as const);

const LISTING = Object.freeze({
  title: TITLE,
  description: DESCRIPTION,
  priceUsd: 3.49,
  tags: [...TAGS],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2026",
  taxonomy_id: 12478,
  type: "download",
  state: "draft"
});

const LISTING_FINGERPRINT = createListingFingerprint(LISTING);
const CANDIDATE_FINGERPRINT = createCandidateFingerprint({
  operationId: OPERATION_ID,
  productId: "PDT-PMC-008",
  productVersion: "R07",
  scope: "DRAFT_CREATE_PLUS_BUYER_FILES_ONLY",
  listing: LISTING,
  publishAuthorized: false,
  imageUploadAuthorized: false,
  buyerFileUploadAuthorized: true
});

const BUYER_FILES = Object.freeze([
  {
    rank: 1,
    field: "zipFile",
    name: "PDT-PMC-008_V1_Pricing_Margin_Calculator_R07.zip",
    size: 76582,
    sha256: "d9815c5aa612a1a62ee8aef87351a916b0b3b57c6b0eda7df9b73c4ecf3db426",
    mime: "application/zip"
  },
  {
    rank: 2,
    field: "guideFile",
    name: "PDT-PMC-008_V1_Quick_Start_Guide_FINAL.pdf",
    size: 29755,
    sha256: "02ef68dc82b58bdb3aa4e20f9694fdf70dfd91070db09a7e5572a962b0060909",
    mime: "application/pdf"
  }
] as const);

const EXPECTED_ACTIVE_IDS = Object.freeze([
  4578945050,
  4579068925,
  4580126260,
  4580303015,
  4581821318
] as const);
const EXISTING_DRAFT_ID = 4579470012;
const EXISTING_DRAFT_TITLE =
  "Bar Inventory Spreadsheet | Liquor Stock & Pour Cost Tracker";
const SUPERSEDED_TITLE =
  "Pricing Calculator Excel & Google Sheets | Small Business Product Cost, Profit Margin & Break-Even Spreadsheet";

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseJson(response: Response) {
  const body = await response.text();
  if (!body) return {};
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return {};
  }
}

function results(value: unknown) {
  return isRec(value) && Array.isArray(value.results)
    ? value.results.filter(isRec)
    : null;
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function runtimeCommit() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? "";
}

function gateEnabled() {
  return false;
}

function toObservation(value: Rec): EtsyReadBackObservation {
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

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}

function sellerStateFingerprint(
  state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
) {
  const payload = {
    operationId: OPERATION_ID,
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    listingFingerprint: LISTING_FINGERPRINT,
    counts: state.counts,
    total: state.total,
    listings: state.listings
      .map((item) => ({
        listingId: item.listingId,
        state: item.state,
        title: item.title
      }))
      .sort((a, b) => a.listingId - b.listingId)
  };
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

function baselineSafe(
  state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
) {
  if (
    state.total !== 6 ||
    state.counts.active !== 5 ||
    state.counts.draft !== 1 ||
    state.counts.inactive !== 0 ||
    state.counts.sold_out !== 0 ||
    state.counts.expired !== 0
  ) {
    return false;
  }

  const expectedActive = new Set<number>(EXPECTED_ACTIVE_IDS);
  const activeRows = state.listings.filter((item) => item.state === "active");
  if (
    activeRows.length !== EXPECTED_ACTIVE_IDS.length ||
    activeRows.some((item) => !expectedActive.has(item.listingId))
  ) {
    return false;
  }

  const draft = state.listings.find((item) => item.listingId === EXISTING_DRAFT_ID);
  if (
    !draft ||
    draft.state !== "draft" ||
    draft.title !== EXISTING_DRAFT_TITLE
  ) {
    return false;
  }

  return !state.listings.some((item) => {
    const title = (item.title ?? "").normalize("NFC").trim();
    return title === TITLE || title === SUPERSEDED_TITLE;
  });
}

async function fetchListing(token: string, listingId: number) {
  const response = await fetch(
    "https://api.etsy.com/v3/application/listings/" + String(listingId),
    {
      method: "GET",
      headers: etsyApiHeaders(token),
      cache: "no-store"
    }
  );
  if (!response.ok) {
    throw new Error("PMC_LISTING_READ_HTTP_" + String(response.status));
  }
  const payload = await parseJson(response);
  if (!isRec(payload)) throw new Error("PMC_LISTING_READ_INVALID");
  return payload;
}

class PmcDraftProvider implements ReconciledWriteProvider {
  constructor(private readonly token: string) {}

  private async exactDraftMatches() {
    const response = await fetch(
      "https://api.etsy.com/v3/application/shops/" +
        String(SHOP_ID) +
        "/listings?state=draft&limit=100",
      {
        method: "GET",
        headers: etsyApiHeaders(this.token),
        cache: "no-store"
      }
    );
    const payload = await parseJson(response);
    const rows = results(payload);
    if (!response.ok || !rows) {
      throw new Error("PMC_DRAFT_LIST_READ_FAILED");
    }

    const matches: number[] = [];
    for (const row of rows) {
      const listingId = Number(row.listing_id);
      if (!Number.isSafeInteger(listingId) || listingId <= 0) continue;
      const detail = await fetchListing(this.token, listingId);
      const identity = verifyEtsyReadBackIdentity(
        LISTING_FINGERPRINT,
        toObservation(detail)
      );
      if (identity.status === "MATCH" && detail.state === "draft") {
        matches.push(listingId);
      }
    }
    return matches;
  }

  async apply(): Promise<ProviderReceipt> {
    if ((await this.exactDraftMatches()).length !== 0) {
      throw new Error("PMC_DRAFT_COLLISION");
    }

    const body = new URLSearchParams({
      quantity: String(LISTING.quantity),
      title: LISTING.title,
      description: LISTING.description,
      price: LISTING.priceUsd.toFixed(2),
      who_made: LISTING.who_made,
      when_made: LISTING.when_made,
      taxonomy_id: String(LISTING.taxonomy_id),
      type: LISTING.type,
      tags: LISTING.tags.join(",")
    });

    let response: Response;
    try {
      response = await fetch(
        "https://api.etsy.com/v3/application/shops/" +
          String(SHOP_ID) +
          "/listings",
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
    if (!response.ok) {
      throw new Error("PMC_DRAFT_CREATE_REJECTED_" + String(response.status));
    }

    const payload = await parseJson(response);
    const listingId = isRec(payload) ? Number(payload.listing_id) : NaN;
    if (!Number.isSafeInteger(listingId) || listingId <= 0) {
      throw new ProviderAmbiguousResultError();
    }

    const detail = await fetchListing(this.token, listingId);
    const identity = verifyEtsyReadBackIdentity(
      LISTING_FINGERPRINT,
      toObservation(detail)
    );
    if (identity.status !== "MATCH" || detail.state !== "draft") {
      throw new ProviderAmbiguousResultError();
    }

    return {
      providerResourceId: String(listingId),
      kind: "CREATE_DRAFT",
      metadata: {
        state: "draft",
        listingFingerprint: identity.actualFingerprint
      }
    };
  }

  async reconcile(): Promise<ProviderReceipt | null> {
    const matches = await this.exactDraftMatches();
    if (matches.length !== 1) return null;
    return {
      providerResourceId: String(matches[0]),
      kind: "CREATE_DRAFT",
      metadata: { state: "draft", readBack: true }
    };
  }
}

async function readListingAssets(token: string, listingId: number) {
  const [imagesResponse, filesResponse, videosResponse] = await Promise.all([
    fetch(
      "https://api.etsy.com/v3/application/listings/" +
        String(listingId) +
        "/images",
      { headers: etsyApiHeaders(token), cache: "no-store" }
    ),
    fetch(
      "https://api.etsy.com/v3/application/shops/" +
        String(SHOP_ID) +
        "/listings/" +
        String(listingId) +
        "/files",
      { headers: etsyApiHeaders(token), cache: "no-store" }
    ),
    fetch(
      "https://api.etsy.com/v3/application/listings/" +
        String(listingId) +
        "/videos",
      { headers: etsyApiHeaders(token), cache: "no-store" }
    )
  ]);

  const images = results(await parseJson(imagesResponse));
  const files = results(await parseJson(filesResponse));
  const videos = results(await parseJson(videosResponse));

  if (!imagesResponse.ok || !images) throw new Error("PMC_IMAGES_READ_FAILED");
  if (!filesResponse.ok || !files) throw new Error("PMC_FILES_READ_FAILED");
  if (!videosResponse.ok || !videos) throw new Error("PMC_VIDEOS_READ_FAILED");
  return { images, files, videos };
}

async function verifyExactFile(file: File, expected: (typeof BUYER_FILES)[number]) {
  if (file.name.normalize("NFC").trim() !== expected.name) {
    throw new Error("PMC_FILE_NAME_MISMATCH_" + String(expected.rank));
  }
  if (file.size !== expected.size) {
    throw new Error("PMC_FILE_SIZE_MISMATCH_" + String(expected.rank));
  }
  const actualSha = createHash("sha256")
    .update(Buffer.from(await file.arrayBuffer()))
    .digest("hex");
  if (!secureEqual(actualSha, expected.sha256)) {
    throw new Error("PMC_FILE_SHA256_MISMATCH_" + String(expected.rank));
  }
}

function writeHeaderError(request: Request) {
  const expected = process.env.ETSY_POST_RESET_V2_WRITE_TOKEN?.trim() ?? "";
  if (!expected) return "PMC_WRITE_TOKEN_NOT_CONFIGURED";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!supplied || !secureEqual(supplied, expected)) {
    return "PMC_WRITE_TOKEN_UNAUTHORIZED";
  }
  return null;
}

async function planPayload() {
  const token = await getValidEtsyAccessToken();
  const state = await getEtsySellerStateSnapshot({
    shopId: SHOP_ID,
    accessToken: token
  });
  const safe = baselineSafe(state);

  return {
    status: safe ? "PMC_R02_PREVIEW_PASS" : "PMC_R02_PREVIEW_BLOCKED",
    mode: "READ_ONLY",
    productId: "PDT-PMC-008",
    productVersion: "R07",
    operationId: OPERATION_ID,
    title: TITLE,
    titleLength: TITLE.length,
    taxonomyId: LISTING.taxonomy_id,
    priceUsd: LISTING.priceUsd,
    tags: LISTING.tags,
    sellerCounts: state.counts,
    total: state.total,
    listingIds: state.listings.map((item) => item.listingId),
    existingDraftId: EXISTING_DRAFT_ID,
    baselineSafe: safe,
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    listingFingerprint: LISTING_FINGERPRINT,
    protectedStateFingerprint: sellerStateFingerprint(state),
    buyerFiles: BUYER_FILES.map((item) => ({
      rank: item.rank,
      fileName: item.name,
      sizeBytes: item.size,
      sha256: item.sha256
    })),
    imageUploadAuthorized: false,
    videoUploadAuthorized: false,
    publishAuthorized: false,
    patternPublicationAuthorized: false,
    authorizationRequired: AUTHORIZATION_TEXT,
    gateEnabled: gateEnabled(),
    deploymentCommit: runtimeCommit(),
    ETSY_WRITE_COUNT: 0
  };
}

export async function GET() {
  try {
    const payload = await planPayload();
    return NextResponse.json(payload, {
      status: payload.baselineSafe ? 200 : 409,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "PMC_R02_PREVIEW_BLOCKED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        ETSY_WRITE_COUNT: 0
      },
      { status: 409, headers: { "cache-control": "no-store" } }
    );
  }
}

export async function POST(request: Request) {
  let writes = 0;
  try {
    if (!gateEnabled()) {
      throw new Error("PMC_R02_WRITE_GATE_DISABLED");
    }
    if (process.env.VERCEL_ENV !== "production") {
      throw new Error("PMC_R02_PRODUCTION_RUNTIME_REQUIRED");
    }

    const headerError = writeHeaderError(request);
    if (headerError) throw new Error(headerError);

    const form = await request.formData();
    const allowed = new Set([
      "authorizationText",
      "protectedStateFingerprint",
      "deploymentCommit",
      "zipFile",
      "guideFile"
    ]);
    for (const key of form.keys()) {
      if (!allowed.has(key)) {
        throw new Error("PMC_UNEXPECTED_FORM_FIELD_" + key);
      }
    }

    const authorizationText = normalizedText(form.get("authorizationText"));
    if (!secureEqual(authorizationText, AUTHORIZATION_TEXT)) {
      throw new Error("PMC_AUTHORIZATION_INVALID");
    }

    const suppliedCommit = normalizedText(form.get("deploymentCommit")).toLowerCase();
    if (
      !/^[a-f0-9]{40}$/.test(suppliedCommit) ||
      !secureEqual(suppliedCommit, runtimeCommit())
    ) {
      throw new Error("PMC_DEPLOYMENT_COMMIT_MISMATCH");
    }

    const suppliedProtectedState = normalizedText(
      form.get("protectedStateFingerprint")
    ).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(suppliedProtectedState)) {
      throw new Error("PMC_PROTECTED_STATE_FINGERPRINT_INVALID");
    }

    const files = new Map<number, File>();
    for (const expected of BUYER_FILES) {
      const value = form.get(expected.field);
      if (!(value instanceof File)) {
        throw new Error("PMC_MISSING_FILE_" + expected.field);
      }
      await verifyExactFile(value, expected);
      files.set(expected.rank, value);
    }

    const token = await getValidEtsyAccessToken();
    const before = await getEtsySellerStateSnapshot({
      shopId: SHOP_ID,
      accessToken: token
    });
    if (!baselineSafe(before)) {
      throw new Error("PMC_BASELINE_UNSAFE");
    }

    const actualProtectedState = sellerStateFingerprint(before);
    if (!secureEqual(actualProtectedState, suppliedProtectedState)) {
      throw new Error("PMC_PROTECTED_STATE_DRIFT");
    }

    const repository = new NeonOperationLedgerRepository();
    const draftProvider = new PmcDraftProvider(token);
    const draftResult = await executeReconciledWrite(repository, draftProvider, {
      operationId: OPERATION_ID + ":CREATE_DRAFT",
      kind: "CREATE_DRAFT",
      payload: {
        productId: "PDT-PMC-008",
        candidateFingerprint: CANDIDATE_FINGERPRINT,
        listingFingerprint: LISTING_FINGERPRINT,
        authorizationText: AUTHORIZATION_TEXT,
        protectedStateFingerprint: actualProtectedState,
        deploymentCommit: runtimeCommit()
      },
      now: new Date().toISOString()
    });

    if (draftResult.status === "RECONCILIATION_REQUIRED") {
      return NextResponse.json(
        {
          status: "RECONCILIATION_REQUIRED",
          recoveryPoint: "CREATE_DRAFT",
          ETSY_WRITE_COUNT: 1
        },
        { status: 202, headers: { "cache-control": "no-store" } }
      );
    }
    if (draftResult.status !== "REPLAY") writes += 1;

    const draftListingId = Number(draftResult.receipt.providerResourceId);
    if (!Number.isSafeInteger(draftListingId) || draftListingId <= 0) {
      throw new Error("PMC_DRAFT_ID_INVALID");
    }

    for (const expected of BUYER_FILES) {
      const file = files.get(expected.rank);
      if (!file) throw new Error("PMC_STAGED_FILE_MISSING_" + String(expected.rank));

      const payload: EtsyDraftAssetPayload = {
        operationKind: "UPLOAD_FILE",
        candidateId: "PDT-PMC-008-R07",
        candidateFingerprint: CANDIDATE_FINGERPRINT,
        expectedListingFingerprint: LISTING_FINGERPRINT,
        shopId: SHOP_ID,
        draftListingId,
        assetSha256: expected.sha256,
        assetName: expected.name,
        rank: expected.rank
      };

      const provider = new EtsyDraftAssetProvider(token, payload, file);
      const result = await executeReconciledWrite(repository, provider, {
        operationId:
          OPERATION_ID +
          ":UPLOAD_FILE:" +
          String(expected.rank).padStart(2, "0"),
        kind: "UPLOAD_FILE",
        payload: { ...payload },
        now: new Date().toISOString()
      });

      if (result.status === "RECONCILIATION_REQUIRED") {
        return NextResponse.json(
          {
            status: "RECONCILIATION_REQUIRED",
            recoveryPoint: "UPLOAD_FILE_" + String(expected.rank),
            draftListingId,
            ETSY_WRITE_COUNT: writes + 1
          },
          { status: 202, headers: { "cache-control": "no-store" } }
        );
      }
      if (result.status !== "REPLAY") writes += 1;
    }

    const detail = await fetchListing(token, draftListingId);
    const identity = verifyEtsyReadBackIdentity(
      LISTING_FINGERPRINT,
      toObservation(detail)
    );
    if (identity.status !== "MATCH" || detail.state !== "draft") {
      throw new Error("PMC_FINAL_LISTING_IDENTITY_MISMATCH");
    }

    const assets = await readListingAssets(token, draftListingId);
    if (assets.images.length !== 0 || assets.videos.length !== 0) {
      throw new Error("PMC_UNAUTHORIZED_MEDIA_PRESENT");
    }

    const orderedFiles = [...assets.files].sort(
      (a, b) => Number(a.rank) - Number(b.rank)
    );
    if (orderedFiles.length !== BUYER_FILES.length) {
      throw new Error("PMC_FINAL_FILE_COUNT_MISMATCH");
    }
    for (let index = 0; index < BUYER_FILES.length; index += 1) {
      const expected = BUYER_FILES[index];
      const actual = orderedFiles[index];
      if (
        Number(actual.rank) !== expected.rank ||
        normalizedText(actual.filename) !== expected.name ||
        Number(actual.size_bytes) !== expected.size
      ) {
        throw new Error("PMC_FINAL_FILE_MISMATCH_" + String(expected.rank));
      }
    }

    const after = await getEtsySellerStateSnapshot({
      shopId: SHOP_ID,
      accessToken: token
    });
    if (
      after.total !== 7 ||
      after.counts.active !== 5 ||
      after.counts.draft !== 2 ||
      after.counts.inactive !== 0 ||
      after.counts.sold_out !== 0 ||
      after.counts.expired !== 0
    ) {
      throw new Error("PMC_FINAL_SELLER_COUNTS_MISMATCH");
    }

    for (const existing of before.listings) {
      const row = after.listings.find(
        (item) => item.listingId === existing.listingId
      );
      if (
        !row ||
        row.state !== existing.state ||
        row.title !== existing.title
      ) {
        throw new Error(
          "PMC_PROTECTED_LISTING_DRIFT_" + String(existing.listingId)
        );
      }
    }

    const created = after.listings.find(
      (item) => item.listingId === draftListingId
    );
    if (
      !created ||
      created.state !== "draft" ||
      created.title !== TITLE
    ) {
      throw new Error("PMC_FINAL_DRAFT_STATE_MISMATCH");
    }

    return NextResponse.json(
      {
        status: "PMC_R02_DRAFT_BUYERFILES_PASS",
        operationId: OPERATION_ID,
        productId: "PDT-PMC-008",
        draftListingId,
        title: TITLE,
        taxonomyId: LISTING.taxonomy_id,
        priceUsd: LISTING.priceUsd,
        tagCount: LISTING.tags.length,
        buyerFileCount: orderedFiles.length,
        imageCount: assets.images.length,
        videoCount: assets.videos.length,
        sellerCounts: after.counts,
        publishPerformed: false,
        patternPublicationAuthorized: false,
        channelUiReadbackRequiredBeforeAnyLaterPublish: true,
        listingFingerprint: identity.actualFingerprint,
        candidateFingerprint: CANDIDATE_FINGERPRINT,
        ETSY_WRITE_COUNT: writes
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: writes > 0 ? "RECONCILIATION_REQUIRED" : "BLOCKED_FAIL_CLOSED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        operationId: OPERATION_ID,
        publishPerformed: false,
        ETSY_WRITE_COUNT: writes
      },
      {
        status: writes > 0 ? 202 : 409,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
