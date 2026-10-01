import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  executeReconciledWrite,
  type ProviderReceipt
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
export const maxDuration = 300;

const SHOP_ID = 23582741;
const LISTING_ID = 4586179854;
const EXISTING_DRAFT_ID = 4579470012;
const OPERATION_ID = "PDT-PMC-008-ETSY-MEDIA-R01-20261001";
const AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-PMC-008-ETSY-MEDIA-R01-20261001 LISTING-4586179854 10IMAGES-1VIDEO NO-PUBLISH EXACT SCOPE ONLY";
const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const EXPECTED_LISTING_FINGERPRINT =
  "ed829603306698ed67cb56f9bcac9c226b0c7b05b1b09f7c4442187ee4521f29";
const MEDIA_CANDIDATE_FINGERPRINT = createHash("sha256")
  .update(
    "PDT-PMC-008|LISTING-4586179854|COMMERCE-VISUAL-FINAL-V06|10IMAGES|1VIDEO|NO-PUBLISH",
    "utf8"
  )
  .digest("hex");

const EXPECTED_ACTIVE_IDS = Object.freeze([
  4578945050,
  4579068925,
  4580126260,
  4580303015,
  4581821318
] as const);

const BUYER_FILES = Object.freeze([
  {
    rank: 1,
    name: "PDT-PMC-008_V1_Pricing_Margin_Calculator_R07.zip",
    size: 76582
  },
  {
    rank: 2,
    name: "PDT-PMC-008_V1_Quick_Start_Guide_FINAL.pdf",
    size: 29755
  }
] as const);

const IMAGES = Object.freeze([
  {
    rank: 1,
    field: "image01",
    fileName: "PDT-PMC-008_GALLERY_01_HERO_V06_2000x2000.png",
    size: 396423,
    sha256: "0e614f47bb481aa78e67cbc870915871aeab072bf0b1c30fe89503ca83a4c83b",
    altText: "Small Business Pricing and Margin Calculator showing real workbook pricing outputs for break-even, markup, target-margin, and target-profit methods."
  },
  {
    rank: 2,
    field: "image02",
    fileName: "PDT-PMC-008_GALLERY_02_DASHBOARD_V06_2000x2000.png",
    size: 258659,
    sha256: "ae19b60de3ee26b6bd495ed1f0377eb09463f36a0495012719b2bd00e58447b3",
    altText: "Real demo dashboard showing saved products, pricing status counts, average margin, and estimated monthly profit."
  },
  {
    rank: 3,
    field: "image03",
    fileName: "PDT-PMC-008_GALLERY_03_SETTINGS_V06_2000x2000.png",
    size: 408694,
    sha256: "49ecdd55fde1c592e64204beb5604c9a809d44146e2059c3d9c4ee9eba20bfa5",
    altText: "Settings worksheet showing editable planning assumptions for labor rate, fees, discount, target margin, target profit, overhead, and expected units."
  },
  {
    rank: 4,
    field: "image04",
    fileName: "PDT-PMC-008_GALLERY_04_PRICING_METHODS_V06_2000x2000.png",
    size: 661143,
    sha256: "c1530ca0ccb4b995f92ecae239134e1068c1284c4e905444a72abb1570bd68af",
    altText: "Real pricing output worksheet comparing break-even, markup, target-margin, and target-profit list prices side by side."
  },
  {
    rank: 5,
    field: "image05",
    fileName: "PDT-PMC-008_GALLERY_05_MAIN_CALCULATOR_V06_2000x2000.png",
    size: 513684,
    sha256: "8d8cea7ccfad9550aad629efe872901383e6123870ba6f4d7df30afcd794e9a8",
    altText: "Main pricing calculator showing buyer inputs on the left and calculated pricing outputs on the right in one worksheet."
  },
  {
    rank: 6,
    field: "image06",
    fileName: "PDT-PMC-008_GALLERY_06_COST_LIBRARY_V06_2000x2000.png",
    size: 229163,
    sha256: "b4c0935237e7c800ffdba4ad013cac673ce864f16dc4c3f8c88939015d2dcde0",
    altText: "Cost library worksheet showing materials, suppliers, package costs, quantities, units, and calculated cost per unit."
  },
  {
    rank: 7,
    field: "image07",
    fileName: "PDT-PMC-008_GALLERY_07_PRODUCTS_V06_2000x2000.png",
    size: 423807,
    sha256: "b211fbccd8db1236fb75ee63e7e79770fee8adf159bd7b8cd9de3a01c4be7575",
    altText: "Products workflow showing product inputs and calculated comparison columns for cost, price, profit, margin, monthly profit, and status."
  },
  {
    rank: 8,
    field: "image08",
    fileName: "PDT-PMC-008_GALLERY_08_HOW_IT_WORKS_V06_2000x2000.png",
    size: 498680,
    sha256: "5bf5a3a22c921276df9f68bf462cc0d621fae5c060495e40a250dc7468d72fd3",
    altText: "Four-step workflow using real workbook screenshots: set assumptions, enter costs, compare pricing methods, and review the dashboard."
  },
  {
    rank: 9,
    field: "image09",
    fileName: "PDT-PMC-008_GALLERY_09_WHAT_YOU_RECEIVE_V06_2000x2000.png",
    size: 438641,
    sha256: "ad321b01e8e08ae4af24ddb146ff953573502e5f5d28b663cee35d9a07b114ad",
    altText: "What You Receive image showing CLEAN workbook, DEMO workbook, Quick Start PDF, Microsoft Excel plus Google Sheets compatibility, six sheets, and no macros."
  },
  {
    rank: 10,
    field: "image10",
    fileName: "PDT-PMC-008_GALLERY_10_BOUNDARIES_V06_2000x2000.png",
    size: 468981,
    sha256: "f52864ff80f12b833b428f1f0969a76cb7d2132b2f0fa60bc603ec2586f7c6bd",
    altText: "Product boundaries image explaining supported pricing planning and cost organization uses and excluded services such as financial advice, bank sync, ecommerce integration, automatic fee updates, and guaranteed results."
  }
] as const);

const VIDEO = Object.freeze({
  field: "video01",
  fileName: "PDT-PMC-008_ETSY_VIDEO_01_FINAL_V06_1080x2160.mp4",
  size: 3903185,
  sha256: "351ffb4d68371a2c4fc8cbdf70c4883da89668d8fba0e80475eca021724f89c3",
  mimeType: "video/mp4"
});

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

function textField(row: Rec, key: string) {
  return typeof row[key] === "string" ? String(row[key]).normalize("NFC").trim() : "";
}

function intField(row: Rec, key: string) {
  const n = Number(row[key]);
  return Number.isSafeInteger(n) ? n : null;
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

function multipartHeaders(token: string) {
  const headers = etsyApiHeaders(token);
  delete headers["content-type"];
  return headers;
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

async function getRecord(token: string, url: string, code: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: etsyApiHeaders(token),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(code + "_HTTP_" + String(response.status));
  const value = await parseJson(response);
  if (!isRec(value)) throw new Error(code + "_INVALID");
  return value;
}

async function readAll(token: string) {
  const base = "https://api.etsy.com/v3/application";
  const [listing, imagesPayload, filesPayload, videosPayload, seller] =
    await Promise.all([
      getRecord(token, base + "/listings/" + String(LISTING_ID), "LISTING"),
      getRecord(token, base + "/listings/" + String(LISTING_ID) + "/images", "IMAGES"),
      getRecord(
        token,
        base + "/shops/" + String(SHOP_ID) + "/listings/" + String(LISTING_ID) + "/files",
        "FILES"
      ),
      getRecord(token, base + "/listings/" + String(LISTING_ID) + "/videos", "VIDEOS"),
      getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token })
    ]);

  const images = results(imagesPayload);
  const files = results(filesPayload);
  const videos = results(videosPayload);
  if (!images || !files || !videos) throw new Error("ASSET_COLLECTION_INVALID");

  return { listing, images, files, videos, seller };
}

function listingIdentityMatches(listing: Rec) {
  const identity = verifyEtsyReadBackIdentity(
    EXPECTED_LISTING_FINGERPRINT,
    toObservation(listing)
  );
  return identity.status === "MATCH" && textField(listing, "state") === "draft";
}

function sellerMatches(
  seller: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
) {
  if (
    seller.total !== 7 ||
    seller.counts.active !== 5 ||
    seller.counts.draft !== 2 ||
    seller.counts.inactive !== 0 ||
    seller.counts.sold_out !== 0 ||
    seller.counts.expired !== 0
  ) {
    return false;
  }

  const active = new Set(
    seller.listings
      .filter((item) => item.state === "active")
      .map((item) => item.listingId)
  );
  if (EXPECTED_ACTIVE_IDS.some((id) => !active.has(id))) return false;

  return (
    seller.listings.some(
      (item) => item.listingId === EXISTING_DRAFT_ID && item.state === "draft"
    ) &&
    seller.listings.some(
      (item) => item.listingId === LISTING_ID && item.state === "draft"
    )
  );
}

function buyerFilesMatch(files: Rec[]) {
  const ordered = [...files].sort(
    (a, b) => (intField(a, "rank") ?? 0) - (intField(b, "rank") ?? 0)
  );
  if (ordered.length !== BUYER_FILES.length) return false;
  return BUYER_FILES.every((expected, index) => {
    const actual = ordered[index];
    return (
      intField(actual, "rank") === expected.rank &&
      textField(actual, "filename") === expected.name &&
      Number(actual.size_bytes) === expected.size
    );
  });
}

function baselineMatches(state: Awaited<ReturnType<typeof readAll>>) {
  return (
    listingIdentityMatches(state.listing) &&
    buyerFilesMatch(state.files) &&
    state.images.length === 0 &&
    state.videos.length === 0 &&
    sellerMatches(state.seller)
  );
}

function finalMediaMatches(state: Awaited<ReturnType<typeof readAll>>) {
  if (
    !listingIdentityMatches(state.listing) ||
    !buyerFilesMatch(state.files) ||
    !sellerMatches(state.seller)
  ) {
    return false;
  }

  const orderedImages = [...state.images].sort(
    (a, b) => (intField(a, "rank") ?? 0) - (intField(b, "rank") ?? 0)
  );
  if (orderedImages.length !== IMAGES.length) return false;

  for (let index = 0; index < IMAGES.length; index += 1) {
    const expected = IMAGES[index];
    const actual = orderedImages[index];
    if (
      intField(actual, "rank") !== expected.rank ||
      textField(actual, "alt_text") !== expected.altText
    ) {
      return false;
    }
    const width = Number(actual.full_width);
    const height = Number(actual.full_height);
    if (
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      (width !== 2000 || height !== 2000)
    ) {
      return false;
    }
  }

  return (
    state.videos.length === 1 &&
    textField(state.videos[0], "video_state") === "active"
  );
}

function protectedStateFingerprint(
  state: Awaited<ReturnType<typeof readAll>>
) {
  const payload = {
    operationId: OPERATION_ID,
    listingId: LISTING_ID,
    listingFingerprint: EXPECTED_LISTING_FINGERPRINT,
    mediaCandidateFingerprint: MEDIA_CANDIDATE_FINGERPRINT,
    sellerCounts: state.seller.counts,
    listingIds: state.seller.listings
      .map((item) => ({ id: item.listingId, state: item.state, title: item.title }))
      .sort((a, b) => a.id - b.id),
    files: state.files
      .map((row) => ({
        rank: intField(row, "rank"),
        filename: textField(row, "filename"),
        size: Number(row.size_bytes ?? 0)
      }))
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
    images: state.images
      .map((row) => ({
        id: intField(row, "listing_image_id"),
        rank: intField(row, "rank"),
        altText: textField(row, "alt_text")
      }))
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
    videos: state.videos
      .map((row) => ({
        id: intField(row, "video_id"),
        state: textField(row, "video_state")
      }))
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
  };
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

async function verifyFile(
  value: FormDataEntryValue | null,
  expected: { fileName: string; size: number; sha256: string }
) {
  if (!(value instanceof File)) throw new Error("MEDIA_ASSET_MISSING_" + expected.fileName);
  if (value.name.normalize("NFC").trim() !== expected.fileName) {
    throw new Error("MEDIA_ASSET_NAME_MISMATCH_" + expected.fileName);
  }
  if (value.size !== expected.size) {
    throw new Error("MEDIA_ASSET_SIZE_MISMATCH_" + expected.fileName);
  }
  const actual = createHash("sha256")
    .update(Buffer.from(await value.arrayBuffer()))
    .digest("hex");
  if (!secureEqual(actual, expected.sha256)) {
    throw new Error("MEDIA_ASSET_SHA256_MISMATCH_" + expected.fileName);
  }
  return value;
}

async function uploadVideo(token: string, file: File) {
  const body = new FormData();
  body.append("video", file, VIDEO.fileName);
  const response = await fetch(
    "https://api.etsy.com/v3/application/shops/" +
      String(SHOP_ID) +
      "/listings/" +
      String(LISTING_ID) +
      "/videos",
    {
      method: "POST",
      headers: multipartHeaders(token),
      body,
      cache: "no-store"
    }
  );
  if (response.status >= 500) {
    throw new Error("PMC_VIDEO_UPLOAD_AMBIGUOUS_HTTP_" + String(response.status));
  }
  if (!response.ok) {
    throw new Error("PMC_VIDEO_UPLOAD_REJECTED_HTTP_" + String(response.status));
  }
  const payload = await parseJson(response);
  if (!isRec(payload) || !intField(payload, "video_id")) {
    throw new Error("PMC_VIDEO_UPLOAD_RECEIPT_INVALID");
  }
  return {
    videoId: intField(payload, "video_id"),
    videoState: textField(payload, "video_state")
  };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function plan() {
  const token = await getValidEtsyAccessToken();
  const state = await readAll(token);
  const baselineSafe = baselineMatches(state);
  return {
    status: baselineSafe ? "PMC_MEDIA_R01_PREVIEW_PASS" : "PMC_MEDIA_R01_PREVIEW_BLOCKED",
    mode: "READ_ONLY",
    operationId: OPERATION_ID,
    listingId: LISTING_ID,
    listingFingerprint: EXPECTED_LISTING_FINGERPRINT,
    mediaCandidateFingerprint: MEDIA_CANDIDATE_FINGERPRINT,
    protectedStateFingerprint: protectedStateFingerprint(state),
    sellerCounts: state.seller.counts,
    total: state.seller.total,
    buyerFileCount: state.files.length,
    currentImageCount: state.images.length,
    currentVideoCount: state.videos.length,
    baselineSafe,
    media: {
      imageCount: IMAGES.length,
      videoCount: 1,
      images: IMAGES.map((asset) => ({
        rank: asset.rank,
        fileName: asset.fileName,
        sizeBytes: asset.size,
        sha256: asset.sha256,
        altText: asset.altText
      })),
      video: {
        fileName: VIDEO.fileName,
        sizeBytes: VIDEO.size,
        sha256: VIDEO.sha256
      }
    },
    exactScope: {
      uploadImages: 10,
      uploadVideo: 1,
      buyerFiles: "VERIFY_ONLY",
      metadata: "VERIFY_ONLY",
      listingState: "KEEP_DRAFT",
      publish: false,
      patternPublication: false,
      protectedListings: "VERIFY_ONLY"
    },
    authorizationRequired: AUTHORIZATION_TEXT,
    gateEnabled: gateEnabled(),
    deploymentCommit: runtimeCommit(),
    ETSY_WRITE_COUNT: 0
  };
}

export async function GET() {
  try {
    const payload = await plan();
    return NextResponse.json(payload, {
      status: payload.baselineSafe ? 200 : 409,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "PMC_MEDIA_R01_PREVIEW_BLOCKED",
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
    if (!gateEnabled()) throw new Error("PMC_MEDIA_R01_GATE_DISABLED");
    if (process.env.VERCEL_ENV !== "production") {
      throw new Error("PMC_MEDIA_R01_PRODUCTION_REQUIRED");
    }

    const suppliedHeader =
      request.headers.get(WRITE_HEADER)?.normalize("NFC").trim() ?? "";
    if (!suppliedHeader || !secureEqual(suppliedHeader, AUTHORIZATION_TEXT)) {
      throw new Error("PMC_MEDIA_R01_WRITE_TOKEN_INVALID");
    }

    const form = await request.formData();
    const allowed = new Set([
      "authorizationText",
      "protectedStateFingerprint",
      "deploymentCommit",
      ...IMAGES.map((asset) => asset.field),
      VIDEO.field
    ]);
    for (const key of form.keys()) {
      if (!allowed.has(key)) {
        throw new Error("PMC_MEDIA_R01_UNEXPECTED_FIELD_" + key);
      }
    }

    const authorizationText =
      typeof form.get("authorizationText") === "string"
        ? String(form.get("authorizationText")).normalize("NFC").trim()
        : "";
    if (!secureEqual(authorizationText, AUTHORIZATION_TEXT)) {
      throw new Error("PMC_MEDIA_R01_AUTHORIZATION_INVALID");
    }

    const deploymentCommit =
      typeof form.get("deploymentCommit") === "string"
        ? String(form.get("deploymentCommit")).trim().toLowerCase()
        : "";
    if (
      !/^[a-f0-9]{40}$/.test(deploymentCommit) ||
      !secureEqual(deploymentCommit, runtimeCommit())
    ) {
      throw new Error("PMC_MEDIA_R01_DEPLOYMENT_COMMIT_MISMATCH");
    }

    const protectedFingerprint =
      typeof form.get("protectedStateFingerprint") === "string"
        ? String(form.get("protectedStateFingerprint")).trim().toLowerCase()
        : "";
    if (!/^[a-f0-9]{64}$/.test(protectedFingerprint)) {
      throw new Error("PMC_MEDIA_R01_PROTECTED_FP_INVALID");
    }

    const stagedImages = new Map<number, File>();
    for (const asset of IMAGES) {
      stagedImages.set(
        asset.rank,
        await verifyFile(form.get(asset.field), asset)
      );
    }
    const stagedVideo = await verifyFile(form.get(VIDEO.field), VIDEO);

    const token = await getValidEtsyAccessToken();
    const before = await readAll(token);
    if (!baselineMatches(before)) {
      throw new Error("PMC_MEDIA_R01_BASELINE_MISMATCH");
    }
    if (!secureEqual(protectedStateFingerprint(before), protectedFingerprint)) {
      throw new Error("PMC_MEDIA_R01_PROTECTED_STATE_DRIFT");
    }

    const repository = new NeonOperationLedgerRepository();

    for (const asset of IMAGES) {
      const file = stagedImages.get(asset.rank);
      if (!file) throw new Error("PMC_MEDIA_R01_STAGED_IMAGE_MISSING_" + String(asset.rank));
      const payload: EtsyDraftAssetPayload = {
        operationKind: "UPLOAD_IMAGE",
        candidateId: "PDT-PMC-008-V06",
        candidateFingerprint: MEDIA_CANDIDATE_FINGERPRINT,
        expectedListingFingerprint: EXPECTED_LISTING_FINGERPRINT,
        shopId: SHOP_ID,
        draftListingId: LISTING_ID,
        assetSha256: asset.sha256,
        assetName: asset.fileName,
        rank: asset.rank,
        altText: asset.altText
      };
      const provider = new EtsyDraftAssetProvider(token, payload, file);
      const result = await executeReconciledWrite(repository, provider, {
        operationId:
          OPERATION_ID +
          ":UPLOAD_IMAGE:" +
          String(asset.rank).padStart(2, "0"),
        kind: "UPLOAD_IMAGE",
        payload: { ...payload },
        now: new Date().toISOString()
      });
      if (result.status === "RECONCILIATION_REQUIRED") {
        return NextResponse.json(
          {
            status: "RECONCILIATION_REQUIRED",
            recoveryPoint: "UPLOAD_IMAGE_" + String(asset.rank),
            listingId: LISTING_ID,
            ETSY_WRITE_COUNT: writes + 1
          },
          { status: 202, headers: { "cache-control": "no-store" } }
        );
      }
      if (result.status !== "REPLAY") writes += 1;
      const receipt = result.receipt as ProviderReceipt;
      if (!(await provider.hasResource(receipt.providerResourceId))) {
        throw new Error("PMC_MEDIA_R01_IMAGE_READBACK_MISMATCH_" + String(asset.rank));
      }
    }

    const immediatelyBeforeVideo = await readAll(token);
    if (
      !listingIdentityMatches(immediatelyBeforeVideo.listing) ||
      !buyerFilesMatch(immediatelyBeforeVideo.files) ||
      !sellerMatches(immediatelyBeforeVideo.seller) ||
      immediatelyBeforeVideo.images.length !== 10 ||
      immediatelyBeforeVideo.videos.length !== 0
    ) {
      throw new Error("PMC_MEDIA_R01_PRE_VIDEO_BASELINE_MISMATCH");
    }

    const videoReceipt = await uploadVideo(token, stagedVideo);
    writes += 1;

    let after = await readAll(token);
    for (let index = 0; index < 8; index += 1) {
      if (finalMediaMatches(after)) break;
      await sleep(1200);
      after = await readAll(token);
    }

    if (!finalMediaMatches(after)) {
      return NextResponse.json(
        {
          status: "RECONCILIATION_REQUIRED",
          error: "PMC_MEDIA_R01_FINAL_VERIFY_FAILED",
          listingId: LISTING_ID,
          imageCount: after.images.length,
          videoCount: after.videos.length,
          videoReceipt,
          sellerCounts: after.seller.counts,
          ETSY_WRITE_COUNT: writes
        },
        { status: 202, headers: { "cache-control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        status: "PMC_MEDIA_R01_PASS",
        operationId: OPERATION_ID,
        listingId: LISTING_ID,
        state: "draft",
        imageCount: after.images.length,
        videoCount: after.videos.length,
        buyerFileCount: after.files.length,
        sellerCounts: after.seller.counts,
        protectedListingIdentityUnchanged: true,
        protectedBuyerFilesUnchanged: true,
        protectedListingsUnchanged: true,
        publishPerformed: false,
        patternPublicationPerformed: false,
        videoReceipt,
        authorizationConsumed: true,
        ETSY_WRITE_COUNT: writes
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: writes > 0 ? "RECONCILIATION_REQUIRED" : "BLOCKED_FAIL_CLOSED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        listingId: LISTING_ID,
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
