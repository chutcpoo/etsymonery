import { createHash, timingSafeEqual } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { fetchEtsyReadWithRetry } from "../../../../../../../lib/etsy-http";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import {
  verifyEtsyReadBackIdentity,
  type EtsyReadBackObservation
} from "../../../../../../../lib/etsy-readback-normalizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SHOP_ID = 23582741;
const LISTING_ID = 4586179854;
const OPERATION_ID = "PDT-PMC-008-ETSY-MEDIA-V3-R06-R01-20261001";
const AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-PMC-008-ETSY-MEDIA-V3-R06-R01-20261001 LISTING-4586179854 REPLACE-IMAGES-01-10 KEEP-VIDEO KEEP-BUYER-FILES KEEP-DRAFT NO-PUBLISH EXACT-SCOPE-ONLY";
const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const EXPECTED_LISTING_FINGERPRINT =
  "ed829603306698ed67cb56f9bcac9c226b0c7b05b1b09f7c4442187ee4521f29";
const ZIP_SHA256 =
  "2cba0ba337b5412011e4cd144ff656700dd7110d3811861cce285fcfc237accf";
const MEDIA_CANDIDATE_FINGERPRINT = createHash("sha256")
  .update(
    [
      "PDT-PMC-008",
      "LISTING-4586179854",
      "VISUAL-MASTER-V3-PRODUCT-FIRST-R06",
      ZIP_SHA256,
      "REPLACE-IMAGES-01-10",
      "KEEP-VIDEO",
      "KEEP-BUYER-FILES",
      "KEEP-DRAFT",
      "NO-PUBLISH"
    ].join("|"),
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
    fileName: "PDT-PMC-008_GALLERY_01_HERO_V3_R06_2000x2000.png",
    size: 403033,
    sha256: "f773751880cc7a4a01c0f4169e5965385f91c5c644c23a178173357fb8e034a0",
    altText: "Pricing and Margin Calculator V3 hero showing real workbook proof for break-even, markup, target-margin, and target-profit pricing."
  },
  {
    rank: 2,
    fileName: "PDT-PMC-008_GALLERY_02_DASHBOARD_V3_R06_2000x2000.png",
    size: 292656,
    sha256: "614a6549fe71997fd3ae77939b3bf0cd9dbe8920c6ebbfd3304aa4cad88dfe3b",
    altText: "Pricing and Margin Calculator V3 dashboard overview using real workbook pixels with product, pricing status, margin, and monthly profit proof."
  },
  {
    rank: 3,
    fileName: "PDT-PMC-008_GALLERY_03_PRICING_METHODS_V3_R06_2000x2000.png",
    size: 793987,
    sha256: "6def654027864ce1570c1d2bae2a438778375d4febf8d5071218a9fb323da61a",
    altText: "Pricing and Margin Calculator V3 image comparing four real workbook pricing methods: break-even, markup, target margin, and target profit."
  },
  {
    rank: 4,
    fileName: "PDT-PMC-008_GALLERY_04_MAIN_CALCULATOR_V3_R06_2000x2000.png",
    size: 606026,
    sha256: "08039713284ac663e9ca5de24e221004318a7d174e45a94b1e61a7793b708b2f",
    altText: "Pricing and Margin Calculator V3 main calculator with real workbook input and calculated pricing output proof."
  },
  {
    rank: 5,
    fileName: "PDT-PMC-008_GALLERY_05_SETTINGS_V3_R06_2000x2000.png",
    size: 563347,
    sha256: "230f837e5179c9d9a40e95b7b010d64f2506c87d9c4d00539833c3fd921349dc",
    altText: "Pricing and Margin Calculator V3 settings image showing real buyer-controlled labor, fee, margin, profit, and overhead assumptions."
  },
  {
    rank: 6,
    fileName: "PDT-PMC-008_GALLERY_06_COST_LIBRARY_V3_R06_2000x2000.png",
    size: 364220,
    sha256: "03a670b68b66b930757f0595dac5110239175d2909740555e0fa822f9e87202c",
    altText: "Pricing and Margin Calculator V3 cost library using real workbook pixels for materials, packaging, quantities, and cost per unit."
  },
  {
    rank: 7,
    fileName: "PDT-PMC-008_GALLERY_07_PRODUCTS_V3_R06_2000x2000.png",
    size: 491692,
    sha256: "aea221b45181a0b69efb0fe247bc24047bacf78013fd7aaca174723205e5f59a",
    altText: "Pricing and Margin Calculator V3 products view showing real cost, price, profit, margin, monthly profit, and status columns."
  },
  {
    rank: 8,
    fileName: "PDT-PMC-008_GALLERY_08_HOW_IT_WORKS_V3_R06_2000x2000.png",
    size: 582130,
    sha256: "5d11f0e7f0b94d0f28630f1470870cca8c1b944dc3ec50de7462bbf3c44412e1",
    altText: "Pricing and Margin Calculator V3 four-step workflow: set assumptions, enter costs, compare pricing methods, and review the dashboard."
  },
  {
    rank: 9,
    fileName: "PDT-PMC-008_GALLERY_09_WHAT_YOU_RECEIVE_V3_R06_2000x2000.png",
    size: 355269,
    sha256: "1bba443d97a961de5975eb5bfc3e87ddf4294fd8b277b9c91464830181a37020",
    altText: "Pricing and Margin Calculator V3 delivery image: CLEAN workbook, DEMO workbook, Quick Start PDF, six sheets, Excel and Google Sheets, no macros."
  },
  {
    rank: 10,
    fileName: "PDT-PMC-008_GALLERY_10_BOUNDARIES_V3_R06_2000x2000.png",
    size: 256089,
    sha256: "b2976161f31d19df916f472d7e92612c31136e2ec28086052d5a09d07060d604",
    altText: "Pricing and Margin Calculator V3 product boundaries for pricing planning and cost organization, with excluded automation, advice, and guaranteed results."
  }
] as const);

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
  return typeof row[key] === "string"
    ? String(row[key]).normalize("NFC").trim()
    : "";
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

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
      maxRetryDelayMs: 6000
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
  return rows.sort(
    (a, b) => (intField(a, "rank") ?? 0) - (intField(b, "rank") ?? 0)
  );
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

function activeVideoCount(videos: Rec[]) {
  return videos.filter((row) => textField(row, "video_state") === "active").length;
}

function exactV3AtRank(images: Rec[], rank: number) {
  const row = images.find((item) => intField(item, "rank") === rank);
  const expected = IMAGES[rank - 1];
  if (!row || !expected) return false;
  if (textField(row, "alt_text") !== expected.altText) return false;
  const width = Number(row.full_width);
  const height = Number(row.full_height);
  if (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    (width !== 2000 || height !== 2000)
  ) {
    return false;
  }
  return true;
}

function trailingV3Count(images: Rec[]) {
  if (images.length !== 10) return 0;
  let count = 0;
  for (let rank = 10; rank >= 1; rank -= 1) {
    if (!exactV3AtRank(images, rank)) break;
    count += 1;
  }
  return count;
}

function recoveryGapForRank(images: Rec[], rank: number) {
  if (images.length !== 9) return false;
  if (rank < 1 || rank > 10) return false;

  for (let r = 1; r < rank; r += 1) {
    if (!images.some((row) => intField(row, "rank") === r)) return false;
  }

  for (let actualRank = rank; actualRank <= 9; actualRank += 1) {
    const row = images.find((item) => intField(item, "rank") === actualRank);
    const expected = IMAGES[actualRank];
    if (!row || !expected) return false;
    if (textField(row, "alt_text") !== expected.altText) return false;
  }
  return true;
}

function imageProgress(images: Rec[]) {
  if (images.length === 10) {
    const tail = trailingV3Count(images);
    const nextRank = 10 - tail;
    return {
      valid: true,
      imageCount: 10,
      completed: tail,
      nextRank,
      nextStep: nextRank === 0 ? "DONE" : "REPLACE_" + String(nextRank).padStart(2, "0"),
      uploadOnlyRecovery: false
    };
  }

  if (images.length === 9) {
    for (let rank = 10; rank >= 1; rank -= 1) {
      if (recoveryGapForRank(images, rank)) {
        return {
          valid: true,
          imageCount: 9,
          completed: 10 - rank,
          nextRank: rank,
          nextStep: "REPLACE_" + String(rank).padStart(2, "0"),
          uploadOnlyRecovery: true
        };
      }
    }
  }

  return {
    valid: false,
    imageCount: images.length,
    completed: 0,
    nextRank: -1,
    nextStep: "BLOCKED",
    uploadOnlyRecovery: false
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
        altText: textField(row, "alt_text"),
        width: Number(row.full_width ?? 0),
        height: Number(row.full_height ?? 0)
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

function protectedTargetMatches(state: Awaited<ReturnType<typeof readTarget>>) {
  return (
    listingIdentityMatches(state.listing) &&
    buyerFilesMatch(state.files) &&
    activeVideoCount(state.videos) === 1
  );
}

async function deleteImage(token: string, listingImageId: number) {
  const response = await fetch(
    "https://api.etsy.com/v3/application/shops/" +
      String(SHOP_ID) +
      "/listings/" +
      String(LISTING_ID) +
      "/images/" +
      String(listingImageId),
    {
      method: "DELETE",
      headers: etsyApiHeaders(token),
      cache: "no-store"
    }
  );
  if (response.status >= 500) {
    throw new Error("DELETE_AMBIGUOUS_HTTP_" + String(response.status));
  }
  if (response.status !== 204) {
    throw new Error("DELETE_REJECTED_HTTP_" + String(response.status));
  }
}

async function uploadImage(token: string, file: File, expected: (typeof IMAGES)[number]) {
  const body = new FormData();
  body.append("image", file, expected.fileName);
  body.append("rank", String(expected.rank));
  body.append("alt_text", expected.altText);
  const response = await fetch(
    "https://api.etsy.com/v3/application/shops/" +
      String(SHOP_ID) +
      "/listings/" +
      String(LISTING_ID) +
      "/images",
    {
      method: "POST",
      headers: multipartHeaders(token),
      body,
      cache: "no-store"
    }
  );
  if (response.status >= 500) {
    throw new Error("UPLOAD_AMBIGUOUS_HTTP_" + String(response.status));
  }
  if (!response.ok) {
    throw new Error("UPLOAD_REJECTED_HTTP_" + String(response.status));
  }
  const payload = await parseJson(response);
  if (!isRec(payload) || !intField(payload, "listing_image_id")) {
    throw new Error("UPLOAD_RECEIPT_INVALID");
  }
  return {
    listingImageId: intField(payload, "listing_image_id"),
    rank: intField(payload, "rank")
  };
}

async function plan() {
  const token = await getValidEtsyAccessToken();
  const state = await readTarget(token);
  const progress = imageProgress(state.images);
  const targetSafe = protectedTargetMatches(state);
  const complete = progress.valid && progress.nextRank === 0;
  return {
    status:
      targetSafe && progress.valid
        ? complete
          ? "PMC_V3_R06_MEDIA_ALREADY_COMPLETE"
          : "PMC_V3_R06_MEDIA_READY"
        : "PMC_V3_R06_MEDIA_BLOCKED",
    mode: "READ_ONLY",
    operationId: OPERATION_ID,
    listingId: LISTING_ID,
    listingState: textField(state.listing, "state"),
    listingFingerprint: EXPECTED_LISTING_FINGERPRINT,
    mediaCandidateFingerprint: MEDIA_CANDIDATE_FINGERPRINT,
    zipSha256: ZIP_SHA256,
    protectedStateFingerprint: protectedStateFingerprint(state),
    buyerFileCount: state.files.length,
    imageCount: state.images.length,
    activeVideoCount: activeVideoCount(state.videos),
    completedV3ImagesFromTail: progress.completed,
    nextStep: progress.nextStep,
    uploadOnlyRecovery: progress.uploadOnlyRecovery,
    complete,
    targetSafe,
    sequenceSafe: progress.valid,
    images: state.images.map((row) => ({
      id: intField(row, "listing_image_id"),
      rank: intField(row, "rank"),
      width: Number(row.full_width ?? 0),
      height: Number(row.full_height ?? 0),
      altText: textField(row, "alt_text")
    })),
    exactScope: {
      replaceImages: "01-10 ONLY",
      order: "10 DOWN TO 01",
      video: "KEEP / VERIFY ONLY",
      buyerFiles: "KEEP / VERIFY ONLY",
      metadata: "KEEP / VERIFY ONLY",
      state: "KEEP DRAFT",
      publish: false,
      pattern: false
    },
    authorizationRequired: AUTHORIZATION_TEXT,
    gateEnabled: gateEnabled(),
    deploymentCommit: runtimeCommit(),
    ETSY_WRITE_COUNT: 0
  };
}


function extractZipEntry(zip: Buffer, wantedName: string) {
  const eocdSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const localSignature = 0x04034b50;
  const min = Math.max(0, zip.length - 65557);
  let eocd = -1;

  for (let offset = zip.length - 22; offset >= min; offset -= 1) {
    if (zip.readUInt32LE(offset) === eocdSignature) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("PMC_V3_R06_ZIP_EOCD_MISSING");

  const totalEntries = zip.readUInt16LE(eocd + 10);
  let cursor = zip.readUInt32LE(eocd + 16);

  for (let index = 0; index < totalEntries; index += 1) {
    if (zip.readUInt32LE(cursor) !== centralSignature) {
      throw new Error("PMC_V3_R06_ZIP_CENTRAL_INVALID");
    }

    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");

    if (name === wantedName) {
      if (zip.readUInt32LE(localOffset) !== localSignature) {
        throw new Error("PMC_V3_R06_ZIP_LOCAL_INVALID");
      }
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = zip.subarray(dataStart, dataStart + compressedSize);
      let output: Buffer;
      if (method === 0) {
        output = Buffer.from(compressed);
      } else if (method === 8) {
        output = inflateRawSync(compressed);
      } else {
        throw new Error("PMC_V3_R06_ZIP_METHOD_UNSUPPORTED_" + String(method));
      }
      if (output.length !== uncompressedSize) {
        throw new Error("PMC_V3_R06_ZIP_ENTRY_SIZE_MISMATCH");
      }
      return output;
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error("PMC_V3_R06_ZIP_ENTRY_MISSING_" + wantedName);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    if (url.searchParams.get("execute") === "all") {
      const authorizationText =
        url.searchParams.get("authorizationText")?.normalize("NFC").trim() ?? "";
      if (!authorizationText || !secureEqual(authorizationText, AUTHORIZATION_TEXT)) {
        throw new Error("PMC_V3_R06_GET_EXEC_AUTH_INVALID");
      }

      const deploymentCommit =
        url.searchParams.get("deploymentCommit")?.trim().toLowerCase() ?? "";
      if (
        !/^[a-f0-9]{40}$/.test(deploymentCommit) ||
        !secureEqual(deploymentCommit, runtimeCommit())
      ) {
        throw new Error("PMC_V3_R06_GET_EXEC_COMMIT_INVALID");
      }

      const assetUrl = url.searchParams.get("assetUrl")?.trim() ?? "";
      if (!assetUrl.startsWith("https://")) {
        throw new Error("PMC_V3_R06_GET_EXEC_ASSET_URL_INVALID");
      }

      const assetResponse = await fetch(assetUrl, {
        method: "GET",
        cache: "no-store",
        redirect: "follow"
      });
      if (!assetResponse.ok) {
        throw new Error(
          "PMC_V3_R06_GET_EXEC_ZIP_FETCH_HTTP_" + String(assetResponse.status)
        );
      }

      const zip = Buffer.from(await assetResponse.arrayBuffer());
      const zipSha = createHash("sha256").update(zip).digest("hex");
      if (!secureEqual(zipSha, ZIP_SHA256)) {
        throw new Error("PMC_V3_R06_GET_EXEC_ZIP_SHA_MISMATCH");
      }

      const execution: Array<Record<string, unknown>> = [];
      const target = new URL(request.url);
      target.search = "";

      for (let iteration = 0; iteration < 10; iteration += 1) {
        const current = await plan();

        if (!current.targetSafe || !current.sequenceSafe) {
          return NextResponse.json(
            {
              status: "RECONCILIATION_REQUIRED",
              error: "PMC_V3_R06_EXEC_CURRENT_STATE_UNSAFE",
              execution,
              current,
              ETSY_WRITE_COUNT: execution.length
            },
            { status: 202, headers: { "cache-control": "no-store" } }
          );
        }

        if (current.complete || current.nextStep === "DONE") break;

        const step = current.nextStep;
        const rank = Number(step.slice(-2));
        const expected = IMAGES[rank - 1];
        if (!expected) {
          throw new Error("PMC_V3_R06_GET_EXEC_EXPECTED_ASSET_MISSING");
        }

        const entryName = "IMAGES_2000x2000/" + expected.fileName;
        const bytes = extractZipEntry(zip, entryName);

        if (bytes.length !== expected.size) {
          throw new Error(
            "PMC_V3_R06_GET_EXEC_ASSET_SIZE_MISMATCH_" + String(rank)
          );
        }

        const sha = createHash("sha256").update(bytes).digest("hex");
        if (!secureEqual(sha, expected.sha256)) {
          throw new Error(
            "PMC_V3_R06_GET_EXEC_ASSET_SHA_MISMATCH_" + String(rank)
          );
        }

        const fileArrayBuffer = bytes.buffer.slice(\n          bytes.byteOffset,\n          bytes.byteOffset + bytes.byteLength\n        ) as ArrayBuffer;\n        const file = new File([fileArrayBuffer], expected.fileName, { type: "image/png" });
        const body = new FormData();
        body.append("authorizationText", AUTHORIZATION_TEXT);
        body.append("protectedStateFingerprint", current.protectedStateFingerprint);
        body.append("deploymentCommit", current.deploymentCommit);
        body.append("step", step);
        body.append("asset", file, expected.fileName);

        const response = await fetch(target.toString(), {
          method: "POST",
          headers: { [WRITE_HEADER]: AUTHORIZATION_TEXT },
          body,
          cache: "no-store"
        });

        const responseText = await response.text();
        let parsed: unknown = {};
        try {
          parsed = responseText ? JSON.parse(responseText) : {};
        } catch {
          parsed = { raw: responseText };
        }

        execution.push({
          step,
          rank,
          httpStatus: response.status,
          response: parsed
        });

        if (!response.ok) {
          return NextResponse.json(
            {
              status: "RECONCILIATION_REQUIRED",
              error: "PMC_V3_R06_EXEC_STEP_HTTP_" + String(response.status),
              execution,
              ETSY_WRITE_COUNT: execution.length
            },
            { status: 202, headers: { "cache-control": "no-store" } }
          );
        }

        await sleep(1000);
      }

      const final = await plan();
      if (!final.complete || !final.targetSafe || !final.sequenceSafe) {
        return NextResponse.json(
          {
            status: "RECONCILIATION_REQUIRED",
            error: "PMC_V3_R06_EXEC_FINAL_READBACK_FAILED",
            execution,
            final,
            ETSY_WRITE_COUNT: execution.length
          },
          { status: 202, headers: { "cache-control": "no-store" } }
        );
      }

      return NextResponse.json(
        {
          status: "PMC_V3_R06_MEDIA_PASS",
          listingId: LISTING_ID,
          state: "draft",
          imageCount: final.imageCount,
          activeVideoCount: final.activeVideoCount,
          buyerFileCount: final.buyerFileCount,
          completedV3ImagesFromTail: final.completedV3ImagesFromTail,
          zipSha256: ZIP_SHA256,
          publishPerformed: false,
          patternPublicationPerformed: false,
          execution,
          ETSY_WRITE_COUNT: execution.length
        },
        { headers: { "cache-control": "no-store" } }
      );
    }

    const payload = await plan();
    return NextResponse.json(payload, {
      status: payload.targetSafe && payload.sequenceSafe ? 200 : 409,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "PMC_V3_R06_MEDIA_BLOCKED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        listingId: LISTING_ID,
        ETSY_WRITE_COUNT: 0
      },
      { status: 409, headers: { "cache-control": "no-store" } }
    );
  }
}

export async function POST(request: Request) {
  let writes = 0;
  let deletePerformed = false;

  try {
    if (!gateEnabled()) throw new Error("PMC_V3_R06_GATE_DISABLED");
    if (process.env.VERCEL_ENV !== "production") {
      throw new Error("PMC_V3_R06_PRODUCTION_REQUIRED");
    }

    const suppliedHeader =
      request.headers.get(WRITE_HEADER)?.normalize("NFC").trim() ?? "";
    if (!suppliedHeader || !secureEqual(suppliedHeader, AUTHORIZATION_TEXT)) {
      throw new Error("PMC_V3_R06_WRITE_TOKEN_INVALID");
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
        throw new Error("PMC_V3_R06_UNEXPECTED_FIELD_" + key);
      }
    }

    const authorizationText =
      typeof form.get("authorizationText") === "string"
        ? String(form.get("authorizationText")).normalize("NFC").trim()
        : "";
    if (!secureEqual(authorizationText, AUTHORIZATION_TEXT)) {
      throw new Error("PMC_V3_R06_AUTHORIZATION_INVALID");
    }

    const deploymentCommit =
      typeof form.get("deploymentCommit") === "string"
        ? String(form.get("deploymentCommit")).trim().toLowerCase()
        : "";
    if (
      !/^[a-f0-9]{40}$/.test(deploymentCommit) ||
      !secureEqual(deploymentCommit, runtimeCommit())
    ) {
      throw new Error("PMC_V3_R06_DEPLOYMENT_COMMIT_MISMATCH");
    }

    const protectedFingerprint =
      typeof form.get("protectedStateFingerprint") === "string"
        ? String(form.get("protectedStateFingerprint")).trim().toLowerCase()
        : "";
    if (!/^[a-f0-9]{64}$/.test(protectedFingerprint)) {
      throw new Error("PMC_V3_R06_PROTECTED_FP_INVALID");
    }

    const requestedStep =
      typeof form.get("step") === "string"
        ? String(form.get("step")).normalize("NFC").trim()
        : "";

    const token = await getValidEtsyAccessToken();
    const before = await readTarget(token);
    const progress = imageProgress(before.images);

    if (!protectedTargetMatches(before)) {
      throw new Error("PMC_V3_R06_PROTECTED_TARGET_MISMATCH");
    }
    if (!progress.valid) {
      throw new Error("PMC_V3_R06_SEQUENCE_UNSAFE");
    }
    if (!secureEqual(protectedStateFingerprint(before), protectedFingerprint)) {
      throw new Error("PMC_V3_R06_PROTECTED_STATE_DRIFT");
    }

    if (progress.nextRank === 0) {
      return NextResponse.json(
        {
          status: "PMC_V3_R06_MEDIA_ALREADY_COMPLETE",
          listingId: LISTING_ID,
          state: "draft",
          imageCount: before.images.length,
          activeVideoCount: activeVideoCount(before.videos),
          buyerFileCount: before.files.length,
          publishPerformed: false,
          ETSY_WRITE_COUNT: 0
        },
        { headers: { "cache-control": "no-store" } }
      );
    }

    if (requestedStep !== progress.nextStep) {
      throw new Error(
        "PMC_V3_R06_STEP_MISMATCH_EXPECTED_" +
          progress.nextStep +
          "_GOT_" +
          requestedStep
      );
    }

    const expected = IMAGES[progress.nextRank - 1];
    if (!expected) throw new Error("PMC_V3_R06_EXPECTED_ASSET_MISSING");
    const file = await verifyFile(form.get("asset"), expected);

    if (!progress.uploadOnlyRecovery) {
      const oldAtRank = before.images.find(
        (row) => intField(row, "rank") === progress.nextRank
      );
      const oldId = oldAtRank ? intField(oldAtRank, "listing_image_id") : null;
      if (!oldId) throw new Error("PMC_V3_R06_OLD_IMAGE_ID_MISSING");

      await deleteImage(token, oldId);
      writes += 1;
      deletePerformed = true;
      await sleep(1200);

      const afterDelete = await readImages(token);
      if (!recoveryGapForRank(afterDelete, progress.nextRank)) {
        return NextResponse.json(
          {
            status: "RECONCILIATION_REQUIRED",
            error: "PMC_V3_R06_DELETE_READBACK_MISMATCH",
            recoveryPoint: requestedStep + "_AFTER_DELETE",
            listingId: LISTING_ID,
            imageCount: afterDelete.length,
            publishPerformed: false,
            ETSY_WRITE_COUNT: writes
          },
          { status: 202, headers: { "cache-control": "no-store" } }
        );
      }
    }

    let receipt;
    try {
      receipt = await uploadImage(token, file, expected);
      writes += 1;
    } catch (error) {
      if (deletePerformed || progress.uploadOnlyRecovery) {
        return NextResponse.json(
          {
            status: "RECONCILIATION_REQUIRED",
            error: error instanceof Error ? error.message : "UPLOAD_UNKNOWN",
            recoveryPoint: requestedStep + "_UPLOAD",
            listingId: LISTING_ID,
            publishPerformed: false,
            ETSY_WRITE_COUNT: Math.max(writes, 1)
          },
          { status: 202, headers: { "cache-control": "no-store" } }
        );
      }
      throw error;
    }

    await sleep(1800);
    const after = await readTarget(token);
    const afterProgress = imageProgress(after.images);

    if (!protectedTargetMatches(after)) {
      return NextResponse.json(
        {
          status: "RECONCILIATION_REQUIRED",
          error: "PMC_V3_R06_PROTECTED_TARGET_AFTER_WRITE_MISMATCH",
          recoveryPoint: "FINAL_TARGET",
          listingId: LISTING_ID,
          publishPerformed: false,
          ETSY_WRITE_COUNT: writes
        },
        { status: 202, headers: { "cache-control": "no-store" } }
      );
    }

    if (
      after.images.length !== 10 ||
      !exactV3AtRank(after.images, expected.rank) ||
      !afterProgress.valid
    ) {
      return NextResponse.json(
        {
          status: "RECONCILIATION_REQUIRED",
          error: "PMC_V3_R06_IMAGE_FINAL_VERIFY_FAILED",
          recoveryPoint: requestedStep,
          listingId: LISTING_ID,
          imageCount: after.images.length,
          receipt,
          publishPerformed: false,
          ETSY_WRITE_COUNT: writes
        },
        { status: 202, headers: { "cache-control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        status:
          afterProgress.nextRank === 0
            ? "PMC_V3_R06_MEDIA_PASS"
            : "PMC_V3_R06_IMAGE_STEP_PASS",
        operationId: OPERATION_ID,
        listingId: LISTING_ID,
        completedStep: requestedStep,
        replacedRank: expected.rank,
        receipt,
        state: "draft",
        imageCount: after.images.length,
        activeVideoCount: activeVideoCount(after.videos),
        buyerFileCount: after.files.length,
        completedV3ImagesFromTail: afterProgress.completed,
        nextStep: afterProgress.nextStep,
        protectedStateFingerprint: protectedStateFingerprint(after),
        protectedListingIdentityUnchanged: true,
        protectedBuyerFilesUnchanged: true,
        protectedVideoUnchanged: true,
        publishPerformed: false,
        patternPublicationPerformed: false,
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
