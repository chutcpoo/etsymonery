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
import { fetchEtsyReadWithRetry } from "../../../../../../../lib/etsy-http";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import {
  verifyEtsyReadBackIdentity,
  type EtsyReadBackObservation
} from "../../../../../../../lib/etsy-readback-normalizer";
import { NeonOperationLedgerRepository } from "../../../../../../../lib/operation-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SHOP_ID = 23582741;
const LISTING_ID = 4586179854;
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
  return true;
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
  const response = await fetchEtsyReadWithRetry(
    fetch,
    url,
    {
      method: "GET",
      headers: etsyApiHeaders(token),
      cache: "no-store"
    },
    {
      maxAttempts: 3,
      baseDelayMs: 750,
      maxRetryDelayMs: 5000
    }
  );
  if (!response.ok) throw new Error(code + "_HTTP_" + String(response.status));
  const value = await parseJson(response);
  if (!isRec(value)) throw new Error(code + "_INVALID");
  return value;
}

async function readImages(token: string) {
  const payload = await getRecord(
    token,
    "https://api.etsy.com/v3/application/listings/" + String(LISTING_ID) + "/images",
    "IMAGES"
  );
  const rows = results(payload);
  if (!rows) throw new Error("IMAGES_COLLECTION_INVALID");
  return rows;
}

async function readFiles(token: string) {
  const payload = await getRecord(
    token,
    "https://api.etsy.com/v3/application/shops/" +
      String(SHOP_ID) +
      "/listings/" +
      String(LISTING_ID) +
      "/files",
    "FILES"
  );
  const rows = results(payload);
  if (!rows) throw new Error("FILES_COLLECTION_INVALID");
  return rows;
}

async function readVideos(token: string) {
  const payload = await getRecord(
    token,
    "https://api.etsy.com/v3/application/listings/" + String(LISTING_ID) + "/videos",
    "VIDEOS"
  );
  const rows = results(payload);
  if (!rows) throw new Error("VIDEOS_COLLECTION_INVALID");
  return rows;
}

async function readTarget(token: string) {
  const listing = await getRecord(
    token,
    "https://api.etsy.com/v3/application/listings/" + String(LISTING_ID),
    "LISTING"
  );
  await sleep(250);
  const images = await readImages(token);
  await sleep(250);
  const files = await readFiles(token);
  await sleep(250);
  const videos = await readVideos(token);
  return { listing, images, files, videos };
}

function listingIdentityMatches(listing: Rec) {
  const identity = verifyEtsyReadBackIdentity(
    EXPECTED_LISTING_FINGERPRINT,
    toObservation(listing)
  );
  return identity.status === "MATCH" && textField(listing, "state") === "draft";
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

function imageRowsPrefixMatch(rows: Rec[], count: number) {
  if (count < 0 || count > IMAGES.length) return false;
  const ordered = [...rows].sort(
    (a, b) => (intField(a, "rank") ?? 0) - (intField(b, "rank") ?? 0)
  );
  if (ordered.length !== count) return false;
  for (let index = 0; index < count; index += 1) {
    const expected = IMAGES[index];
    const actual = ordered[index];
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
  return true;
}

function mediaProgress(state: Awaited<ReturnType<typeof readTarget>>) {
  if (!listingIdentityMatches(state.listing) || !buyerFilesMatch(state.files)) {
    return {
      valid: false,
      imageCount: state.images.length,
      videoCount: state.videos.length,
      nextStep: "BLOCKED",
      complete: false,
      reason: "TARGET_PROTECTED_STATE_MISMATCH"
    };
  }

  const imageCount = state.images.length;
  const videoCount = state.videos.length;
  if (
    imageCount < 0 ||
    imageCount > IMAGES.length ||
    videoCount < 0 ||
    videoCount > 1 ||
    !imageRowsPrefixMatch(state.images, imageCount) ||
    (videoCount > 0 && imageCount !== IMAGES.length)
  ) {
    return {
      valid: false,
      imageCount,
      videoCount,
      nextStep: "BLOCKED",
      complete: false,
      reason: "MEDIA_SEQUENCE_MISMATCH"
    };
  }

  if (videoCount === 1 && textField(state.videos[0], "video_state") !== "active") {
    return {
      valid: false,
      imageCount,
      videoCount,
      nextStep: "BLOCKED",
      complete: false,
      reason: "VIDEO_NOT_ACTIVE"
    };
  }

  const nextStep =
    imageCount < IMAGES.length
      ? "IMAGE_" + String(imageCount + 1).padStart(2, "0")
      : videoCount === 0
        ? "VIDEO"
        : "DONE";

  return {
    valid: true,
    imageCount,
    videoCount,
    nextStep,
    complete: nextStep === "DONE",
    reason: null
  };
}

function protectedStateFingerprint(
  state: Awaited<ReturnType<typeof readTarget>>
) {
  const payload = {
    operationId: OPERATION_ID,
    listingId: LISTING_ID,
    listingFingerprint: EXPECTED_LISTING_FINGERPRINT,
    mediaCandidateFingerprint: MEDIA_CANDIDATE_FINGERPRINT,
    listingState: textField(state.listing, "state"),
    listingTitle: textField(state.listing, "title"),
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
  if (!(value instanceof File)) {
    throw new Error("MEDIA_ASSET_MISSING_" + expected.fileName);
  }
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

class AmbiguousVideoUploadError extends Error {}

async function uploadVideo(token: string, file: File) {
  const body = new FormData();
  body.append("video", file, VIDEO.fileName);
  body.append("name", VIDEO.fileName);
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
    throw new AmbiguousVideoUploadError(
      "PMC_VIDEO_UPLOAD_AMBIGUOUS_HTTP_" + String(response.status)
    );
  }
  if (!response.ok) {
    throw new Error("PMC_VIDEO_UPLOAD_REJECTED_HTTP_" + String(response.status));
  }
  const payload = await parseJson(response);
  if (!isRec(payload) || !intField(payload, "video_id")) {
    throw new AmbiguousVideoUploadError("PMC_VIDEO_UPLOAD_RECEIPT_INVALID");
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
  const state = await readTarget(token);
  const progress = mediaProgress(state);
  return {
    status: progress.valid
      ? "PMC_MEDIA_R01_SEQUENCE_PASS"
      : "PMC_MEDIA_R01_SEQUENCE_BLOCKED",
    mode: "READ_ONLY",
    transport: "SEQUENTIAL_RATE_EFFICIENT",
    operationId: OPERATION_ID,
    listingId: LISTING_ID,
    listingFingerprint: EXPECTED_LISTING_FINGERPRINT,
    mediaCandidateFingerprint: MEDIA_CANDIDATE_FINGERPRINT,
    protectedStateFingerprint: protectedStateFingerprint(state),
    buyerFileCount: state.files.length,
    currentImageCount: progress.imageCount,
    currentVideoCount: progress.videoCount,
    nextStep: progress.nextStep,
    complete: progress.complete,
    sequenceSafe: progress.valid,
    sequenceReason: progress.reason,
    protectedSellerStateVerification: "FINAL_UI_READBACK_REQUIRED",
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
      protectedListings: "FINAL_UI_VERIFY_ONLY"
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
      status: payload.sequenceSafe ? 200 : 409,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "PMC_MEDIA_R01_SEQUENCE_BLOCKED",
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
      "step",
      "asset"
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

    const requestedStep =
      typeof form.get("step") === "string"
        ? String(form.get("step")).normalize("NFC").trim()
        : "";
    if (!requestedStep) throw new Error("PMC_MEDIA_R01_STEP_REQUIRED");

    const token = await getValidEtsyAccessToken();
    const before = await readTarget(token);
    const progress = mediaProgress(before);
    if (!progress.valid) {
      throw new Error("PMC_MEDIA_R01_SEQUENCE_UNSAFE_" + String(progress.reason));
    }

    if (!secureEqual(protectedStateFingerprint(before), protectedFingerprint)) {
      throw new Error("PMC_MEDIA_R01_PROTECTED_STATE_DRIFT");
    }

    if (progress.complete) {
      return NextResponse.json(
        {
          status: "PMC_MEDIA_R01_ALREADY_COMPLETE",
          listingId: LISTING_ID,
          imageCount: progress.imageCount,
          videoCount: progress.videoCount,
          publishPerformed: false,
          authorizationConsumed: true,
          ETSY_WRITE_COUNT: 0
        },
        { headers: { "cache-control": "no-store" } }
      );
    }

    if (requestedStep !== progress.nextStep) {
      throw new Error(
        "PMC_MEDIA_R01_STEP_MISMATCH_EXPECTED_" +
          progress.nextStep +
          "_GOT_" +
          requestedStep
      );
    }

    if (requestedStep.startsWith("IMAGE_")) {
      const rank = progress.imageCount + 1;
      const expected = IMAGES[rank - 1];
      if (!expected) throw new Error("PMC_MEDIA_R01_IMAGE_RANK_INVALID");
      const file = await verifyFile(form.get("asset"), expected);

      const payload: EtsyDraftAssetPayload = {
        operationKind: "UPLOAD_IMAGE",
        candidateId: "PDT-PMC-008-V06",
        candidateFingerprint: MEDIA_CANDIDATE_FINGERPRINT,
        expectedListingFingerprint: EXPECTED_LISTING_FINGERPRINT,
        shopId: SHOP_ID,
        draftListingId: LISTING_ID,
        assetSha256: expected.sha256,
        assetName: expected.fileName,
        rank: expected.rank,
        altText: expected.altText
      };

      await sleep(1250);
      const repository = new NeonOperationLedgerRepository();
      const provider = new EtsyDraftAssetProvider(token, payload, file);
      const result = await executeReconciledWrite(repository, provider, {
        operationId:
          OPERATION_ID +
          ":UPLOAD_IMAGE:" +
          String(expected.rank).padStart(2, "0"),
        kind: "UPLOAD_IMAGE",
        payload: { ...payload },
        now: new Date().toISOString()
      });

      if (result.status === "RECONCILIATION_REQUIRED") {
        return NextResponse.json(
          {
            status: "RECONCILIATION_REQUIRED",
            recoveryPoint: requestedStep,
            listingId: LISTING_ID,
            ETSY_WRITE_COUNT: 1
          },
          { status: 202, headers: { "cache-control": "no-store" } }
        );
      }

      if (result.status !== "REPLAY") writes = 1;
      await sleep(1500);
      const imageRows = await readImages(token);
      if (!imageRowsPrefixMatch(imageRows, rank)) {
        return NextResponse.json(
          {
            status: "RECONCILIATION_REQUIRED",
            error: "PMC_MEDIA_R01_IMAGE_FINAL_VERIFY_FAILED",
            recoveryPoint: requestedStep,
            listingId: LISTING_ID,
            imageCount: imageRows.length,
            ETSY_WRITE_COUNT: Math.max(writes, 1)
          },
          { status: 202, headers: { "cache-control": "no-store" } }
        );
      }

      return NextResponse.json(
        {
          status: "PMC_MEDIA_R01_IMAGE_STEP_PASS",
          listingId: LISTING_ID,
          completedStep: requestedStep,
          imageCount: rank,
          videoCount: 0,
          nextStep:
            rank < IMAGES.length
              ? "IMAGE_" + String(rank + 1).padStart(2, "0")
              : "VIDEO",
          protectedListingIdentityVerifiedBeforeWrite: true,
          protectedBuyerFilesVerifiedBeforeWrite: true,
          publishPerformed: false,
          authorizationConsumed: false,
          ETSY_WRITE_COUNT: writes
        },
        { headers: { "cache-control": "no-store" } }
      );
    }

    if (requestedStep !== "VIDEO") {
      throw new Error("PMC_MEDIA_R01_UNKNOWN_STEP_" + requestedStep);
    }
    if (progress.imageCount !== IMAGES.length || progress.videoCount !== 0) {
      throw new Error("PMC_MEDIA_R01_VIDEO_PRECONDITION_FAILED");
    }

    const videoFile = await verifyFile(form.get("asset"), VIDEO);
    await sleep(1250);
    let videoReceipt;
    try {
      videoReceipt = await uploadVideo(token, videoFile);
      writes = 1;
    } catch (error) {
      if (error instanceof AmbiguousVideoUploadError) {
        return NextResponse.json(
          {
            status: "RECONCILIATION_REQUIRED",
            error: error.message,
            recoveryPoint: "VIDEO",
            listingId: LISTING_ID,
            ETSY_WRITE_COUNT: 1
          },
          { status: 202, headers: { "cache-control": "no-store" } }
        );
      }
      throw error;
    }

    let videoRows: Rec[] = [];
    for (let index = 0; index < 15; index += 1) {
      await sleep(1500);
      videoRows = await readVideos(token);
      if (
        videoRows.length === 1 &&
        textField(videoRows[0], "video_state") === "active"
      ) {
        break;
      }
    }

    if (
      videoRows.length !== 1 ||
      textField(videoRows[0], "video_state") !== "active"
    ) {
      return NextResponse.json(
        {
          status: "RECONCILIATION_REQUIRED",
          error: "PMC_MEDIA_R01_VIDEO_FINAL_VERIFY_FAILED",
          recoveryPoint: "VIDEO",
          listingId: LISTING_ID,
          videoCount: videoRows.length,
          videoReceipt,
          ETSY_WRITE_COUNT: 1
        },
        { status: 202, headers: { "cache-control": "no-store" } }
      );
    }

    await sleep(750);
    const finalState = await readTarget(token);
    const finalProgress = mediaProgress(finalState);
    if (!finalProgress.valid || !finalProgress.complete) {
      return NextResponse.json(
        {
          status: "RECONCILIATION_REQUIRED",
          error: "PMC_MEDIA_R01_FINAL_TARGET_VERIFY_FAILED",
          recoveryPoint: "FINAL_TARGET",
          listingId: LISTING_ID,
          imageCount: finalState.images.length,
          videoCount: finalState.videos.length,
          ETSY_WRITE_COUNT: 1
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
        imageCount: finalProgress.imageCount,
        videoCount: finalProgress.videoCount,
        buyerFileCount: finalState.files.length,
        protectedListingIdentityUnchanged: true,
        protectedBuyerFilesUnchanged: true,
        protectedSellerStateVerification: "FINAL_UI_READBACK_REQUIRED",
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
