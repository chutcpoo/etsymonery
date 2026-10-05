import { createHash, timingSafeEqual } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";

import { enforceBuildGateForRoute } from "../../../../../../../lib/product-creation-plan";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SHOP_ID = 23582741;
const LISTING_ID = 4578945050;
const OPERATION_ID = "PDT-IPT-001-ETSY-SEO-MEDIA-V3-R02-R01-20261001";
const AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-IPT-001-ETSY-SEO-MEDIA-V3-R02-R01-20261001 LISTING-4578945050 TITLE-TAGS-MEDIA-01-10 ONLY KEEP-DESCRIPTION KEEP-PRICE KEEP-CATEGORY KEEP-BUYER-FILES KEEP-VIDEO KEEP-ACTIVE NO-PUBLISH EXACT-SCOPE-ONLY";
const WRITE_HEADER = "x-autodigitalpublisher-write-token";

const OLD_TITLE =
  "Invoice Payment Tracker Excel | Accounts Receivable Aging & Follow-Up Spreadsheet for Small Business";
const TARGET_TITLE =
  "Invoice Tracker Excel | Payment Tracker, Aging & Follow-Up Spreadsheet for Small Business";

const OLD_TAGS = Object.freeze([
  "invoice tracker",
  "payment tracker",
  "accounts receivable",
  "invoice spreadsheet",
  "overdue invoices",
  "partial payments",
  "client payment log",
  "small business excel",
  "ar aging report",
  "follow up tracker",
  "invoice dashboard",
  "outstanding balance",
  "receivable tracker"
] as const);

const TARGET_TAGS = Object.freeze([
  "invoice tracker",
  "payment tracker",
  "invoice payment",
  "receivable tracker",
  "accounts receivable",
  "invoice follow up",
  "overdue invoices",
  "invoice aging",
  "invoice spreadsheet",
  "partial payments",
  "payment follow up",
  "small business excel",
  "excel template"
] as const);

const EXPECTED_TAXONOMY_ID = 12478;
const EXPECTED_PRICE_USD = 7.99;
const EXPECTED_FILES = Object.freeze([
  {
    id: 1517609000937,
    rank: 1,
    name: "PDT-IPT-001_V2_Invoice_Payment_FollowUp_Tracker_CLEAN_START.xlsx",
    size: 80573
  },
  {
    id: 1516372746174,
    rank: 2,
    name: "PDT-IPT-001_V2_Invoice_Payment_FollowUp_Tracker_SAMPLE.xlsx",
    size: 81123
  }
] as const);
const EXPECTED_VIDEO_ID = 843568411;

const ZIP_SHA256 =
  "807c9c0662fdd027f770c560c32c43b8c6ffd31ea3df38509f2efbbebaca4859";

const IMAGES = Object.freeze([
  {
    rank: 1,
    fileName: "PDT-IPT-001_GALLERY_01_HERO_V3_R02_2000x2000.png",
    size: 280328,
    sha256: "e0c2e339a7d817c09cddf325dd50265a9bc7bbe69ca6fdaff0d02e70a878ccb6",
    altText:
      "Invoice Tracker V3 hero showing the real Excel dashboard for invoiced, paid, outstanding, overdue, aging, and follow-up status."
  },
  {
    rank: 2,
    fileName: "PDT-IPT-001_GALLERY_02_DASHBOARD_V3_R02_2000x2000.png",
    size: 270535,
    sha256: "65992b83f8748e27a002631997851765b27ac6b62d6cb44befde3203f6e2f8fb",
    altText:
      "Invoice Tracker V3 dashboard using real workbook pixels for total invoiced, total paid, outstanding, overdue, aging, and invoice status."
  },
  {
    rank: 3,
    fileName: "PDT-IPT-001_GALLERY_03_INVOICES_V3_R02_2000x2000.png",
    size: 272799,
    sha256: "53d5c3dc39464e77dd5ac29fa58fc4ade9a450334f30a558c42c67bffb672623",
    altText:
      "Invoice Tracker V3 invoices view showing real invoice records, balances, status, due alerts, aging, and next follow-up fields."
  },
  {
    rank: 4,
    fileName: "PDT-IPT-001_GALLERY_04_PAYMENTS_V3_R02_2000x2000.png",
    size: 262353,
    sha256: "18bf686faa4353dda42e18ffbd58189b4f54259f4d41de076c95a1bcc1c93b19",
    altText:
      "Invoice Tracker V3 payments view showing real separate payment records linked to invoice IDs for partial and multiple payments."
  },
  {
    rank: 5,
    fileName: "PDT-IPT-001_GALLERY_05_AGING_FOLLOWUP_V3_R02_2000x2000.png",
    size: 246820,
    sha256: "604bfda4f35a7153dc84f9cd99d9a00304b4923e2878b83f2793b6f1402bb9c7",
    altText:
      "Invoice Tracker V3 aging and follow-up view showing real overdue days, aging buckets, follow-up priority, and due alerts."
  },
  {
    rank: 6,
    fileName: "PDT-IPT-001_GALLERY_06_NEXT_ACTION_V3_R02_2000x2000.png",
    size: 201306,
    sha256: "a103d81fa09491a50ded1bee2c87afd53706e7d5c14f411e0ba5c6dfa53088fb",
    altText:
      "Invoice Tracker V3 next-action queue showing real follow-up priority, next follow-up date, promise-to-pay status, and next action."
  },
  {
    rank: 7,
    fileName: "PDT-IPT-001_GALLERY_07_MONTHLY_SUMMARY_V3_R02_2000x2000.png",
    size: 436733,
    sha256: "501fd80c208933b2de3dd371963e05a9be16e6845a7c56becd94db6d24307c33",
    altText:
      "Invoice Tracker V3 monthly summary using real workbook data to compare invoiced amounts, payments received, and net outstanding movement."
  },
  {
    rank: 8,
    fileName: "PDT-IPT-001_GALLERY_08_HOW_IT_WORKS_V3_R02_2000x2000.png",
    size: 309721,
    sha256: "f17493bac0de09a1b621aeea91a12c1480409936cc2e735ae401176759c96e75",
    altText:
      "Invoice Tracker V3 five-step workflow: review settings, enter invoices, record payments, review follow-up, and check the dashboard."
  },
  {
    rank: 9,
    fileName: "PDT-IPT-001_GALLERY_09_WHAT_YOU_RECEIVE_V3_R02_2000x2000.png",
    size: 294301,
    sha256: "ae25acbae8c0ecf0bd3fe6ea3fc4979250760c50db2c556921535cc2d716673b",
    altText:
      "Invoice Tracker V3 what-you-receive image showing two Microsoft Excel workbooks, SAMPLE and CLEAN START, with seven tabs and no Google Sheets files."
  },
  {
    rank: 10,
    fileName: "PDT-IPT-001_GALLERY_10_BOUNDARIES_V3_R02_2000x2000.png",
    size: 311926,
    sha256: "ef68752826722d99f76e532f76e24cfe91a499adc58fef52ac1a79d90dfdd03a",
    altText:
      "Invoice Tracker V3 boundaries: supports invoice, payment, aging, and follow-up tracking but not invoice sending, payment processing, bank sync, CRM automation, or tax advice."
  }
] as const);

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function sameStrings(value: unknown, expected: readonly string[]) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every(
      (item, index) =>
        typeof item === "string" &&
        item.normalize("NFC").trim() === expected[index]
    )
  );
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

function exactPrice(price: unknown) {
  if (!isRec(price)) return false;
  const amount = Number(price.amount);
  const divisor = Number(price.divisor);
  return (
    Number.isFinite(amount) &&
    Number.isFinite(divisor) &&
    divisor > 0 &&
    Number((amount / divisor).toFixed(2)) === EXPECTED_PRICE_USD &&
    textField(price, "currency_code").toUpperCase() === "USD"
  );
}

function multipartHeaders(token: string) {
  const headers = etsyApiHeaders(token);
  delete headers["content-type"];
  return headers;
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

async function getRecord(token: string, url: string, code: string) {
  const waits = [0, 1200, 2500];
  let lastStatus = 0;
  for (const ms of waits) {
    if (ms) await new Promise((resolve) => setTimeout(resolve, ms));
    const response = await fetch(url, {
      method: "GET",
      headers: etsyApiHeaders(token),
      cache: "no-store"
    });
    lastStatus = response.status;
    if (response.status === 429) continue;
    if (!response.ok) throw new Error(code + "_HTTP_" + String(response.status));
    const value = await parseJson(response);
    if (!isRec(value)) throw new Error(code + "_INVALID");
    return value;
  }
  throw new Error(code + "_HTTP_" + String(lastStatus));
}

async function readState(token: string) {
  const base = "https://api.etsy.com/v3/application";
  const [listing, imagePayload, filePayload, videoPayload] = await Promise.all([
    getRecord(token, base + "/listings/" + String(LISTING_ID), "LISTING"),
    getRecord(token, base + "/listings/" + String(LISTING_ID) + "/images", "IMAGES"),
    getRecord(
      token,
      base + "/shops/" + String(SHOP_ID) + "/listings/" + String(LISTING_ID) + "/files",
      "FILES"
    ),
    getRecord(token, base + "/listings/" + String(LISTING_ID) + "/videos", "VIDEOS")
  ]);

  const images = results(imagePayload);
  const files = results(filePayload);
  const videos = results(videoPayload);
  if (!images || !files || !videos) throw new Error("COLLECTION_INVALID");

  return {
    listing,
    images: [...images].sort(
      (a, b) => (intField(a, "rank") ?? 0) - (intField(b, "rank") ?? 0)
    ),
    files: [...files].sort(
      (a, b) => (intField(a, "rank") ?? 0) - (intField(b, "rank") ?? 0)
    ),
    videos
  };
}

function descriptionHash(listing: Rec) {
  return createHash("sha256")
    .update(textField(listing, "description").replace(/\r\n?/g, "\n"), "utf8")
    .digest("hex");
}

function protectedCoreMatches(state: Awaited<ReturnType<typeof readState>>) {
  const listing = state.listing;
  const title = textField(listing, "title");
  const tags = listing.tags;

  const titleTagsSafe =
    (title === OLD_TITLE && sameStrings(tags, OLD_TAGS)) ||
    (title === TARGET_TITLE && sameStrings(tags, TARGET_TAGS));

  return (
    textField(listing, "state") === "active" &&
    exactPrice(listing.price) &&
    Number(listing.taxonomy_id) === EXPECTED_TAXONOMY_ID &&
    Number(listing.quantity) === 999 &&
    textField(listing, "listing_type") === "download" &&
    titleTagsSafe &&
    textField(listing, "description").includes("AI DISCLOSURE") &&
    state.files.length === EXPECTED_FILES.length &&
    state.files.every((row, index) => {
      const expected = EXPECTED_FILES[index];
      return (
        intField(row, "listing_file_id") === expected.id &&
        intField(row, "rank") === expected.rank &&
        textField(row, "filename") === expected.name &&
        Number(row.size_bytes) === expected.size
      );
    }) &&
    state.videos.length === 1 &&
    intField(state.videos[0], "video_id") === EXPECTED_VIDEO_ID &&
    textField(state.videos[0], "video_state") === "active" &&
    state.images.length === 10
  );
}

function exactV3AtRank(images: Rec[], rank: number) {
  const expected = IMAGES[rank - 1];
  const row = images.find((item) => intField(item, "rank") === rank);
  if (!expected || !row) return false;
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

function allV3(images: Rec[]) {
  return (
    images.length === 10 &&
    IMAGES.every((expected) => exactV3AtRank(images, expected.rank))
  );
}

function seoMatches(listing: Rec) {
  return (
    textField(listing, "title") === TARGET_TITLE &&
    sameStrings(listing.tags, TARGET_TAGS)
  );
}

function snapshot(state: Awaited<ReturnType<typeof readState>>) {
  return {
    listing: {
      state: textField(state.listing, "state"),
      title: textField(state.listing, "title"),
      tags: Array.isArray(state.listing.tags) ? state.listing.tags : [],
      taxonomyId: Number(state.listing.taxonomy_id),
      priceMatches: exactPrice(state.listing.price),
      descriptionHash: descriptionHash(state.listing)
    },
    images: state.images.map((row) => ({
      id: intField(row, "listing_image_id"),
      rank: intField(row, "rank"),
      width: Number(row.full_width ?? 0),
      height: Number(row.full_height ?? 0),
      altText: textField(row, "alt_text")
    })),
    files: state.files.map((row) => ({
      id: intField(row, "listing_file_id"),
      rank: intField(row, "rank"),
      name: textField(row, "filename"),
      size: Number(row.size_bytes ?? 0)
    })),
    videos: state.videos.map((row) => ({
      id: intField(row, "video_id"),
      state: textField(row, "video_state")
    }))
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
  if (eocd < 0) throw new Error("ZIP_EOCD_MISSING");

  const totalEntries = zip.readUInt16LE(eocd + 10);
  let cursor = zip.readUInt32LE(eocd + 16);

  for (let index = 0; index < totalEntries; index += 1) {
    if (zip.readUInt32LE(cursor) !== centralSignature) {
      throw new Error("ZIP_CENTRAL_INVALID");
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
        throw new Error("ZIP_LOCAL_INVALID");
      }
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = zip.subarray(dataStart, dataStart + compressedSize);
      let output: Buffer;
      if (method === 0) output = Buffer.from(compressed);
      else if (method === 8) output = inflateRawSync(compressed);
      else throw new Error("ZIP_METHOD_UNSUPPORTED_" + String(method));
      if (output.length !== uncompressedSize) {
        throw new Error("ZIP_ENTRY_SIZE_MISMATCH");
      }
      return output;
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error("ZIP_ENTRY_MISSING_" + wantedName);
}

function fileFromZip(zip: Buffer, expected: (typeof IMAGES)[number]) {
  const entryName = "IMAGES_2000x2000/" + expected.fileName;
  const bytes = extractZipEntry(zip, entryName);
  if (bytes.length !== expected.size) {
    throw new Error("ASSET_SIZE_MISMATCH_" + String(expected.rank));
  }
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (!secureEqual(sha, expected.sha256)) {
    throw new Error("ASSET_SHA_MISMATCH_" + String(expected.rank));
  }
  const fileArrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  return new File([fileArrayBuffer], expected.fileName, { type: "image/png" });
}

async function uploadImage(
  token: string,
  file: File,
  expected: (typeof IMAGES)[number]
) {
  const body = new FormData();
  body.append("image", file, expected.fileName);
  body.append("rank", String(expected.rank));
  body.append("overwrite", "true");
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

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(
      "IMAGE_UPLOAD_HTTP_" + String(response.status) + "_" + responseBody.slice(0, 240)
    );
  }

  let payload: unknown = {};
  try {
    payload = responseBody ? JSON.parse(responseBody) : {};
  } catch {
    payload = {};
  }

  if (!isRec(payload) || !intField(payload, "listing_image_id")) {
    throw new Error("IMAGE_UPLOAD_RECEIPT_INVALID");
  }

  return {
    listingImageId: intField(payload, "listing_image_id"),
    rank: intField(payload, "rank")
  };
}

async function patchSeo(token: string) {
  const body = new URLSearchParams({
    title: TARGET_TITLE,
    tags: TARGET_TAGS.join(",")
  });

  const response = await fetch(
    "https://api.etsy.com/v3/application/shops/" +
      String(SHOP_ID) +
      "/listings/" +
      String(LISTING_ID),
    {
      method: "PATCH",
      headers: {
        ...etsyApiHeaders(token),
        "content-type": "application/x-www-form-urlencoded"
      },
      body,
      cache: "no-store"
    }
  );

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(
      "SEO_PATCH_HTTP_" + String(response.status) + "_" + responseBody.slice(0, 240)
    );
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function plan() {
  const token = await getValidEtsyAccessToken();
  const state = await readState(token);
  const safe = protectedCoreMatches(state);
  const complete = safe && allV3(state.images) && seoMatches(state.listing);

  return {
    status: complete
      ? "IPT_V3_R02_ALREADY_COMPLETE"
      : safe
        ? "IPT_V3_R02_READY"
        : "IPT_V3_R02_BLOCKED",
    mode: "READ_ONLY",
    operationId: OPERATION_ID,
    listingId: LISTING_ID,
    targetTitle: TARGET_TITLE,
    targetTags: TARGET_TAGS,
    zipSha256: ZIP_SHA256,
    complete,
    targetSafe: safe,
    v3ImageCount: state.images.filter((_, index) =>
      exactV3AtRank(state.images, index + 1)
    ).length,
    seoMatches: seoMatches(state.listing),
    gateEnabled: gateEnabled(),
    deploymentCommit: runtimeCommit(),
    exactScope: {
      title: "UPDATE TO ERANK-R04 CANDIDATE",
      tags: "UPDATE 13 TAGS TO ERANK-R04 CANDIDATE",
      images: "OVERWRITE 01-10 WITH V3 R02",
      description: "KEEP",
      price: "KEEP",
      category: "KEEP 12478",
      buyerFiles: "KEEP",
      video: "KEEP",
      state: "KEEP ACTIVE",
      publish: false
    },
    snapshot: snapshot(state),
    ETSY_WRITE_COUNT: 0
  };
}

export async function GET(request: Request) {
  // BLOCKER 1 — CENTRAL BUILD GATE (verifies plan approval; LEGACY_EXEMPT passes through)
  const _buildGateBlock = await enforceBuildGateForRoute("PDT-IPT-001", "IPT_001_SEO_MEDIA_V3_R02");
  if (_buildGateBlock) return _buildGateBlock;

  try {
    const url = new URL(request.url);

    if (url.searchParams.get("execute") === "all") {
      if (!gateEnabled()) throw new Error("IPT_V3_R02_GATE_DISABLED");

      const authorizationText =
        url.searchParams.get("authorizationText")?.normalize("NFC").trim() ?? "";
      if (!authorizationText || !secureEqual(authorizationText, AUTHORIZATION_TEXT)) {
        throw new Error("IPT_V3_R02_AUTH_INVALID");
      }

      const deploymentCommit =
        url.searchParams.get("deploymentCommit")?.trim().toLowerCase() ?? "";
      if (
        !/^[a-f0-9]{40}$/.test(deploymentCommit) ||
        !secureEqual(deploymentCommit, runtimeCommit())
      ) {
        throw new Error("IPT_V3_R02_COMMIT_MISMATCH");
      }

      const assetUrl = url.searchParams.get("assetUrl")?.trim() ?? "";
      if (!assetUrl.startsWith("https://")) {
        throw new Error("IPT_V3_R02_ASSET_URL_INVALID");
      }

      const assetResponse = await fetch(assetUrl, {
        method: "GET",
        cache: "no-store",
        redirect: "follow"
      });
      if (!assetResponse.ok) {
        throw new Error(
          "IPT_V3_R02_ZIP_FETCH_HTTP_" + String(assetResponse.status)
        );
      }

      const zip = Buffer.from(await assetResponse.arrayBuffer());
      const zipSha = createHash("sha256").update(zip).digest("hex");
      if (!secureEqual(zipSha, ZIP_SHA256)) {
        throw new Error("IPT_V3_R02_ZIP_SHA_MISMATCH");
      }

      const token = await getValidEtsyAccessToken();
      let state = await readState(token);
      if (!protectedCoreMatches(state)) {
        throw new Error("IPT_V3_R02_PROTECTED_BASELINE_MISMATCH");
      }

      const frozenDescriptionHash = descriptionHash(state.listing);
      const execution: Array<Record<string, unknown>> = [];

      for (let rank = 10; rank >= 1; rank -= 1) {
        state = await readState(token);

        if (
          !protectedCoreMatches(state) ||
          descriptionHash(state.listing) !== frozenDescriptionHash
        ) {
          return NextResponse.json(
            {
              status: "RECONCILIATION_REQUIRED",
              error: "IPT_V3_R02_STATE_DRIFT_BEFORE_IMAGE",
              rank,
              execution,
              snapshot: snapshot(state),
              ETSY_WRITE_COUNT: execution.length
            },
            { status: 202, headers: { "cache-control": "no-store" } }
          );
        }

        if (exactV3AtRank(state.images, rank)) {
          execution.push({ action: "SKIP_ALREADY_V3", rank });
          continue;
        }

        const expected = IMAGES[rank - 1];
        const file = fileFromZip(zip, expected);
        const receipt = await uploadImage(token, file, expected);

        execution.push({
          action: "OVERWRITE_IMAGE",
          rank,
          listingImageId: receipt.listingImageId
        });

        let verified = false;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          await sleep(1000);
          state = await readState(token);
          if (
            protectedCoreMatches(state) &&
            descriptionHash(state.listing) === frozenDescriptionHash &&
            exactV3AtRank(state.images, rank)
          ) {
            verified = true;
            break;
          }
        }

        if (!verified) {
          return NextResponse.json(
            {
              status: "RECONCILIATION_REQUIRED",
              error: "IPT_V3_R02_IMAGE_READBACK_FAILED",
              rank,
              execution,
              snapshot: snapshot(state),
              ETSY_WRITE_COUNT: execution.filter(
                (item) => item.action === "OVERWRITE_IMAGE"
              ).length
            },
            { status: 202, headers: { "cache-control": "no-store" } }
          );
        }
      }

      state = await readState(token);
      if (!allV3(state.images)) {
        return NextResponse.json(
          {
            status: "RECONCILIATION_REQUIRED",
            error: "IPT_V3_R02_GALLERY_NOT_COMPLETE",
            execution,
            snapshot: snapshot(state),
            ETSY_WRITE_COUNT: execution.filter(
              (item) => item.action === "OVERWRITE_IMAGE"
            ).length
          },
          { status: 202, headers: { "cache-control": "no-store" } }
        );
      }

      if (!seoMatches(state.listing)) {
        await patchSeo(token);
        execution.push({ action: "PATCH_TITLE_TAGS" });

        let verified = false;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          await sleep(1000);
          state = await readState(token);
          if (
            protectedCoreMatches(state) &&
            descriptionHash(state.listing) === frozenDescriptionHash &&
            seoMatches(state.listing) &&
            allV3(state.images)
          ) {
            verified = true;
            break;
          }
        }

        if (!verified) {
          return NextResponse.json(
            {
              status: "RECONCILIATION_REQUIRED",
              error: "IPT_V3_R02_SEO_READBACK_FAILED",
              execution,
              snapshot: snapshot(state),
              ETSY_WRITE_COUNT:
                execution.filter((item) => item.action === "OVERWRITE_IMAGE").length +
                1
            },
            { status: 202, headers: { "cache-control": "no-store" } }
          );
        }
      }

      const final = await readState(token);
      if (
        !protectedCoreMatches(final) ||
        descriptionHash(final.listing) !== frozenDescriptionHash ||
        !allV3(final.images) ||
        !seoMatches(final.listing)
      ) {
        return NextResponse.json(
          {
            status: "RECONCILIATION_REQUIRED",
            error: "IPT_V3_R02_FINAL_READBACK_FAILED",
            execution,
            snapshot: snapshot(final),
            ETSY_WRITE_COUNT:
              execution.filter((item) => item.action === "OVERWRITE_IMAGE").length +
              (execution.some((item) => item.action === "PATCH_TITLE_TAGS") ? 1 : 0)
          },
          { status: 202, headers: { "cache-control": "no-store" } }
        );
      }

      return NextResponse.json(
        {
          status: "IPT_V3_R02_SEO_MEDIA_PASS",
          operationId: OPERATION_ID,
          listingId: LISTING_ID,
          title: TARGET_TITLE,
          tags: TARGET_TAGS,
          state: "active",
          imageCount: 10,
          v3ImageCount: 10,
          buyerFileCount: final.files.length,
          videoCount: final.videos.length,
          taxonomyId: Number(final.listing.taxonomy_id),
          priceUsd: EXPECTED_PRICE_USD,
          descriptionUnchanged: true,
          buyerFilesUnchanged: true,
          videoUnchanged: true,
          categoryUnchanged: true,
          priceUnchanged: true,
          stateUnchanged: true,
          publishPerformed: false,
          execution,
          ETSY_WRITE_COUNT:
            execution.filter((item) => item.action === "OVERWRITE_IMAGE").length +
            (execution.some((item) => item.action === "PATCH_TITLE_TAGS") ? 1 : 0)
        },
        { headers: { "cache-control": "no-store" } }
      );
    }

    const payload = await plan();
    return NextResponse.json(payload, {
      status: payload.targetSafe ? 200 : 409,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "IPT_V3_R02_BLOCKED_FAIL_CLOSED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        listingId: LISTING_ID,
        publishPerformed: false,
        ETSY_WRITE_COUNT: 0
      },
      { status: 409, headers: { "cache-control": "no-store" } }
    );
  }
}
