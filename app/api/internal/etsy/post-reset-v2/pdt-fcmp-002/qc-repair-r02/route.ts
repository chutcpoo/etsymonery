import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../../../lib/etsy-seller-state-reconciliation";
import {
  PDT_FCMP_002_V1_GALLERY,
  PDT_FCMP_002_V1_LISTING_IDENTITY
} from "../../../../../../../lib/pdt-fcmp-002-v1-manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = 23582741;
const TARGET_LISTING_ID = 4579068925;
const PROTECTED_LISTING_ID = 4578945050;
const GATE = "[GATE_FCMP_QC_REPAIR_R02_EXECUTE]";
const NONCE_SHA256 = "c53547d08886b911c72a91b144970d9f786d049451f386c13c6c8d7558dbaac2";

const NEW_DESCRIPTION = PDT_FCMP_002_V1_LISTING_IDENTITY.description.replace(
  "know your true cost per serving and the price you should charge.",
  "know your true cost per serving and a suggested target price based on your inputs."
);

const ASSETS = Object.freeze([
  { param: "asset01", rank: 1, driveId: "18MD7-ZvcYgbpdKitMDG1Bk0LiuH-YZz-", fileName: "PDT-FCMP-002_GALLERY_01_HERO_MASTER_DNA.png", size: 312791, sha256: "8353ac23aaf894a8a824e57d65e1d3602d2316628885e77b120979fcc2abdaae" },
  { param: "asset02", rank: 2, driveId: "1OGAL4jwhapmhHYJlFETWrPcr9z_GB-5r", fileName: "PDT-FCMP-002_GALLERY_02_OVERVIEW_MASTER_DNA.png", size: 538714, sha256: "71a2cedf6dec17cebd49767b6c5e7c4c937d9051e02b34a0daa818769ddf2a6e" },
  { param: "asset03", rank: 3, driveId: "1pabwnye5cRfuwO9_1v0a597a6rj_BWEw", fileName: "PDT-FCMP-002_GALLERY_03_INGREDIENT_MASTER_DNA.png", size: 270576, sha256: "8cd1f63181a84eaab9a36da99f6b61c4811e18ce925e4a542ac46739f624a18a" },
  { param: "asset04", rank: 4, driveId: "10QBQCsvzTPyLTgIzc6z5OdilP2Ubgxxt", fileName: "PDT-FCMP-002_GALLERY_04_RECIPE_COSTING_MASTER_DNA.png", size: 375695, sha256: "8367f8beadd276361d3917cfc08b40e9642538497d0b69558c4716163663e33b" },
  { param: "asset05", rank: 5, driveId: "1wl6XqE4Lw4L5KNnxas1T2yBWnJUoFmNo", fileName: "PDT-FCMP-002_GALLERY_05_COST_PER_SERVING_MASTER_DNA.png", size: 196947, sha256: "ee014161907d263aa68331d7af36dd0e132aa8e03f904619872508e0a08ea5aa" },
  { param: "asset06", rank: 6, driveId: "1AfOgoYSStHa5LjM9fNU4NqnUtdbl-G8o", fileName: "PDT-FCMP-002_GALLERY_06_FOOD_COST_MASTER_DNA.png", size: 134577, sha256: "9ff1d13eb9b73df5cddd83e14f137c4a1d7644b39f2b105ea3c8a543185c366e" },
  { param: "asset07", rank: 7, driveId: "1EmheZZbTbyaYwayFI-w-bufd2pImA5RQ", fileName: "PDT-FCMP-002_GALLERY_07_TARGET_PRICE_MASTER_DNA.png", size: 124857, sha256: "18bae38e62408bc8ceb65a18df1e0c6d9bc7e3c7e9fbcb7364d4d6edda0901fa" },
  { param: "asset08", rank: 8, driveId: "1yY4i6NOlNXcCv1O02J5Fbrry9bn9UQG9", fileName: "PDT-FCMP-002_GALLERY_08_WORKFLOW_MASTER_DNA.png", size: 103865, sha256: "a8baec6c4a35c6eee287c4df616d9b679f14e047027b060566e40e3c74928d12" },
  { param: "asset09", rank: 9, driveId: "1cycS906whil_CCAI_7qmNAXJBGZW5Q-j", fileName: "PDT-FCMP-002_GALLERY_09_WHATS_INCLUDED_MASTER_DNA.png", size: 407160, sha256: "86e76dc9b9d32269a56e760b189b4157f96f1d4226b0ff87751b92ea099f9e1e" },
  { param: "asset10", rank: 10, driveId: "1rE79l12vs9v5szihRjo2N9T8IqMOfxor", fileName: "PDT-FCMP-002_GALLERY_10_BOUNDARIES_MASTER_DNA.png", size: 128516, sha256: "cf6df3a7e6758e0f009524565bb3cac21881df332c9cf20603e0ac1906bca103" }
] as const);

const CURRENT_ETSY_BUYER_FILENAME =
  "PDT-FCMP-002_Recipe_Cost_Menu_Pricing_Calculator_V1.xlsx" as const;

const BUYER_FILE = Object.freeze({
  param: "buyerFile",
  driveId: "1CCRQCN3XlJ3l17LeNluUMZVCAG70dHH3",
  fileName: "PoonthaiDigital_Restaurant_Recipe_Cost_Menu_Pricing_Calculator_PDT-FCMP-002_V1_R01_FIXED.xlsx",
  size: 16964,
  sha256: "92f6713a6b0ff92baabd21e2e5dde773f747c717b1fbcb6262cd59805a79da18",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
});

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}

function records(value: unknown, code: string) {
  if (!isRec(value) || !Array.isArray(value.results)) throw new Error(code);
  return value.results.filter(isRec);
}

function intField(row: Rec, key: string) {
  const value = row[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function textField(row: Rec, key: string) {
  const value = row[key];
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}

function comparableText(value: string) {
  let out = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  for (let i = 0; i < 2; i += 1) {
    out = out
      .replace(/&quot;|&#34;|&#x22;/gi, '"')
      .replace(/&apos;|&#39;|&#x27;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&");
  }
  return out;
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function nonceOk(value: string) {
  const actual = createHash("sha256").update(value, "utf8").digest("hex");
  return secureEqual(actual, NONCE_SHA256);
}

function gateEnabled() {
  return process.env.VERCEL_ENV === "production" &&
    (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").includes(GATE);
}

function multipartHeaders(token: string) {
  const headers = etsyApiHeaders(token);
  delete headers["content-type"];
  return headers;
}

function allowedAssetUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("ASSET_URL_PROTOCOL");
  if (!/^sdmntpr[a-z0-9-]*\.oaiusercontent\.com$/i.test(url.hostname)) {
    throw new Error("ASSET_URL_HOST");
  }
  return url.toString();
}

async function fetchAsset(url: string, size: number, sha256: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("ASSET_FETCH_HTTP_" + String(response.status));
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== size) throw new Error("ASSET_SIZE_MISMATCH");
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (!secureEqual(actual, sha256)) throw new Error("ASSET_SHA256_MISMATCH");
  return bytes;
}

async function getRecord(token: string, url: string, code: string) {
  const response = await fetch(url, { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" });
  if (!response.ok) throw new Error(code + "_HTTP_" + String(response.status));
  const value = await parseJson(response);
  if (!isRec(value)) throw new Error(code + "_INVALID");
  return value;
}

function exactPriceUsd(price: unknown) {
  if (!isRec(price)) return false;
  const amount = Number(price.amount);
  const divisor = Number(price.divisor);
  return Number.isFinite(amount) && Number.isFinite(divisor) && divisor > 0 &&
    Number((amount / divisor).toFixed(2)) === 9.99 &&
    textField(price, "currency_code").toUpperCase() === "USD";
}

function sameStringArray(value: unknown, expected: readonly string[]) {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((v, i) => typeof v === "string" && v.normalize("NFC").trim() === expected[i]);
}

function listingMatches(listing: Rec, description: string, state: string) {
  const e = PDT_FCMP_002_V1_LISTING_IDENTITY;
  return (
    textField(listing, "title") === e.title &&
    comparableText(textField(listing, "description")) === comparableText(description) &&
    exactPriceUsd(listing.price) &&
    Number(listing.quantity) === e.quantity &&
    textField(listing, "who_made") === e.who_made &&
    textField(listing, "when_made") === e.when_made &&
    Number(listing.taxonomy_id) === e.taxonomy_id &&
    textField(listing, "listing_type") === e.type &&
    textField(listing, "state") === state &&
    sameStringArray(listing.tags, e.tags)
  );
}

async function readAll(token: string) {
  const [listing, imagesPayload, filesPayload, seller] = await Promise.all([
    getRecord(token, "https://api.etsy.com/v3/application/listings/" + TARGET_LISTING_ID, "LISTING"),
    getRecord(token, "https://api.etsy.com/v3/application/listings/" + TARGET_LISTING_ID + "/images", "IMAGES"),
    getRecord(token, "https://api.etsy.com/v3/application/shops/" + SHOP_ID + "/listings/" + TARGET_LISTING_ID + "/files", "FILES"),
    getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token })
  ]);
  return {
    listing,
    images: records(imagesPayload, "IMAGES_INVALID"),
    files: records(filesPayload, "FILES_INVALID"),
    seller
  };
}

function galleryMatches(images: Rec[]) {
  if (images.length !== 10) return false;
  const ordered = [...images].sort((a,b)=>(intField(a,"rank") ?? 0)-(intField(b,"rank") ?? 0));
  return ordered.every((row, index) => {
    const expected = PDT_FCMP_002_V1_GALLERY[index];
    return intField(row,"rank") === expected.rank &&
      textField(row,"alt_text") === (expected.altText ?? "");
  });
}

function baselineMatches(state: Awaited<ReturnType<typeof readAll>>) {
  const protectedListing = state.seller.listings.find(x => x.listingId === PROTECTED_LISTING_ID);
  const target = state.seller.listings.find(x => x.listingId === TARGET_LISTING_ID);
  return (
    state.seller.total === 2 &&
    state.seller.counts.active === 2 &&
    state.seller.counts.draft === 0 &&
    state.seller.counts.inactive === 0 &&
    protectedListing?.state === "active" &&
    target?.state === "active" &&
    listingMatches(state.listing, PDT_FCMP_002_V1_LISTING_IDENTITY.description, "active") &&
    galleryMatches(state.images) &&
    state.files.length === 1 &&
    textField(state.files[0], "filename") === CURRENT_ETSY_BUYER_FILENAME &&
    Number(state.files[0].size_bytes) === 18603
  );
}

async function patchListing(token: string, fields: Record<string,string>) {
  const response = await fetch("https://api.etsy.com/v3/application/listings/" + TARGET_LISTING_ID, {
    method: "PATCH",
    headers: { ...etsyApiHeaders(token), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
    cache: "no-store"
  });
  if (!response.ok) throw new Error("LISTING_PATCH_HTTP_" + String(response.status));
}

async function deleteImage(token: string, imageId: number) {
  const response = await fetch(
    "https://api.etsy.com/v3/application/shops/" + SHOP_ID + "/listings/" + TARGET_LISTING_ID + "/images/" + imageId,
    { method: "DELETE", headers: etsyApiHeaders(token), cache: "no-store" }
  );
  if (!response.ok) throw new Error("IMAGE_DELETE_HTTP_" + String(response.status));
}

async function uploadImage(token: string, rank: number, fileName: string, bytes: Buffer) {
  const expected = PDT_FCMP_002_V1_GALLERY[rank - 1];
  const body = new FormData();
  body.append("image", new File([new Uint8Array(bytes)], fileName, { type: "image/png" }), fileName);
  body.append("rank", String(rank));
  body.append("alt_text", expected.altText ?? "");
  const response = await fetch(
    "https://api.etsy.com/v3/application/shops/" + SHOP_ID + "/listings/" + TARGET_LISTING_ID + "/images",
    { method: "POST", headers: multipartHeaders(token), body, cache: "no-store" }
  );
  if (!response.ok) throw new Error("IMAGE_UPLOAD_HTTP_" + String(response.status));
  const value = await parseJson(response);
  if (!isRec(value) || !intField(value, "listing_image_id")) throw new Error("IMAGE_UPLOAD_RECEIPT_INVALID");
}

async function uploadBuyerFile(token: string, bytes: Buffer) {
  const body = new FormData();
  body.append("file", new File([new Uint8Array(bytes)], BUYER_FILE.fileName, { type: BUYER_FILE.mimeType }), BUYER_FILE.fileName);
  body.append("name", BUYER_FILE.fileName);
  body.append("rank", "1");
  const response = await fetch(
    "https://api.etsy.com/v3/application/shops/" + SHOP_ID + "/listings/" + TARGET_LISTING_ID + "/files",
    { method: "POST", headers: multipartHeaders(token), body, cache: "no-store" }
  );
  if (!response.ok) throw new Error("FILE_UPLOAD_HTTP_" + String(response.status));
  const value = await parseJson(response);
  if (!isRec(value) || !intField(value, "listing_file_id")) throw new Error("FILE_UPLOAD_RECEIPT_INVALID");
  return intField(value, "listing_file_id")!;
}

async function deleteBuyerFile(token: string, fileId: number) {
  const response = await fetch(
    "https://api.etsy.com/v3/application/shops/" + SHOP_ID + "/listings/" + TARGET_LISTING_ID + "/files/" + fileId,
    { method: "DELETE", headers: etsyApiHeaders(token), cache: "no-store" }
  );
  if (!response.ok) throw new Error("FILE_DELETE_HTTP_" + String(response.status));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("action") === "diagnose") {
    try {
      const token = await getValidEtsyAccessToken();
      const state = await readAll(token);
      const expected = PDT_FCMP_002_V1_LISTING_IDENTITY;
      const orderedImages = [...state.images].sort(
        (a,b)=>(intField(a,"rank") ?? 0)-(intField(b,"rank") ?? 0)
      );
      const file = state.files[0] ?? {};
      return NextResponse.json({
        status: "DIAGNOSTIC_READ_ONLY",
        sellerCounts: state.seller.counts,
        total: state.seller.total,
        targetSellerState: state.seller.listings.find(x => x.listingId === TARGET_LISTING_ID)?.state ?? null,
        protectedSellerState: state.seller.listings.find(x => x.listingId === PROTECTED_LISTING_ID)?.state ?? null,
        listing: {
          titleMatches: textField(state.listing, "title") === expected.title,
          descriptionMatchesOld: textField(state.listing, "description") === expected.description,
          priceMatches: exactPriceUsd(state.listing.price),
          quantity: Number(state.listing.quantity),
          quantityMatches: Number(state.listing.quantity) === expected.quantity,
          whoMade: textField(state.listing, "who_made"),
          whoMadeMatches: textField(state.listing, "who_made") === expected.who_made,
          whenMade: textField(state.listing, "when_made"),
          whenMadeMatches: textField(state.listing, "when_made") === expected.when_made,
          taxonomyId: Number(state.listing.taxonomy_id),
          taxonomyMatches: Number(state.listing.taxonomy_id) === expected.taxonomy_id,
          listingType: textField(state.listing, "listing_type"),
          type: textField(state.listing, "type"),
          typeMatches: [textField(state.listing, "listing_type"), textField(state.listing, "type")].includes(expected.type),
          state: textField(state.listing, "state"),
          tags: Array.isArray(state.listing.tags) ? state.listing.tags : [],
          tagsMatchOrdered: sameStringArray(state.listing.tags, expected.tags)
        },
        gallery: {
          count: state.images.length,
          exactAltAndRankMatch: galleryMatches(state.images),
          rows: orderedImages.map(row => ({
            listingImageId: intField(row,"listing_image_id"),
            rank: intField(row,"rank"),
            altText: textField(row,"alt_text"),
            fullWidth: Number(row.full_width),
            fullHeight: Number(row.full_height)
          }))
        },
        buyerFile: {
          count: state.files.length,
          listingFileId: intField(file,"listing_file_id"),
          rank: intField(file,"rank"),
          filename: textField(file,"filename"),
          sizeBytes: Number(file.size_bytes)
        },
        baselineMatches: baselineMatches(state),
        ETSY_WRITE_COUNT: 0
      }, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      return NextResponse.json({
        status:"DIAGNOSTIC_BLOCKED",
        error:error instanceof Error ? error.message : "UNKNOWN",
        ETSY_WRITE_COUNT:0
      }, { status:409, headers: { "cache-control":"no-store" } });
    }
  }
  if (url.searchParams.get("action") !== "execute_relay") {
    return NextResponse.json({
      status: "PLAN_ONLY",
      mode: "CUSTOMER_QC_REPAIR_R02_DRIVE_ONLY",
      targetListingId: TARGET_LISTING_ID,
      protectedListingId: PROTECTED_LISTING_ID,
      repair: {
        listingFields: ["description"],
        imageRanks: ASSETS.map(x => x.rank),
        driveAssets: ASSETS.map(x => ({ rank: x.rank, driveId: x.driveId, fileName: x.fileName, size: x.size, sha256: x.sha256 })),
        buyerFile: { driveId: BUYER_FILE.driveId, fileName: BUYER_FILE.fileName, size: BUYER_FILE.size, sha256: BUYER_FILE.sha256 },
        leaveActiveOnlyAfterFullPersistenceQC: true
      },
      authorizationSource: "FRESH_EXACT_AUTHORIZATION_REQUIRED",
      productionMutationExecuted: false,
      ETSY_WRITE_COUNT: 0
    });
  }

  let writes = 0;
  let madeInactive = false;
  try {
    if (!gateEnabled()) {
      return NextResponse.json({ status:"BLOCKED_FAIL_CLOSED", error:"REPAIR_GATE_DISABLED", ETSY_WRITE_COUNT:0 }, { status:403 });
    }
    const nonce = url.searchParams.get("nonce")?.trim() ?? "";
    if (!nonce || !nonceOk(nonce)) {
      return NextResponse.json({ status:"BLOCKED_FAIL_CLOSED", error:"REPAIR_NONCE_INVALID", ETSY_WRITE_COUNT:0 }, { status:401 });
    }

    const token = await getValidEtsyAccessToken();
    const before = await readAll(token);
    if (!baselineMatches(before)) {
      return NextResponse.json({
        status:"BLOCKED_FAIL_CLOSED",
        error:"REPAIR_BASELINE_MISMATCH",
        counts: before.seller.counts,
        imageCount: before.images.length,
        buyerFileCount: before.files.length,
        ETSY_WRITE_COUNT:0
      }, { status:409 });
    }

    const fetched = new Map<number, Buffer>();
    for (const spec of ASSETS) {
      const raw = url.searchParams.get(spec.param) ?? "";
      fetched.set(spec.rank, await fetchAsset(allowedAssetUrl(raw), spec.size, spec.sha256));
    }
    const buyerBytes = await fetchAsset(
      allowedAssetUrl(url.searchParams.get(BUYER_FILE.param) ?? ""),
      BUYER_FILE.size,
      BUYER_FILE.sha256
    );

    await patchListing(token, { state: "inactive", description: NEW_DESCRIPTION });
    writes += 1;
    madeInactive = true;

    const paused = await readAll(token);
    if (
      paused.seller.counts.active !== 1 ||
      paused.seller.counts.inactive !== 1 ||
      !listingMatches(paused.listing, NEW_DESCRIPTION, "inactive")
    ) {
      throw new Error("REPAIR_PAUSE_OR_DESCRIPTION_VERIFY_FAILED");
    }

    const baselineImagesByRank = new Map<number, number>();
    for (const row of before.images) {
      const rank = intField(row, "rank");
      const id = intField(row, "listing_image_id");
      if (rank && id) baselineImagesByRank.set(rank, id);
    }

    for (const spec of [...ASSETS].sort((a,b)=>b.rank-a.rank)) {
      const oldId = baselineImagesByRank.get(spec.rank);
      const bytes = fetched.get(spec.rank);
      if (!oldId || !bytes) throw new Error("REPAIR_IMAGE_BASELINE_MISSING_" + spec.rank);
      await deleteImage(token, oldId); writes += 1;
      await uploadImage(token, spec.rank, spec.fileName, bytes); writes += 1;
    }

    const oldFileId = intField(before.files[0], "listing_file_id");
    if (!oldFileId) throw new Error("REPAIR_OLD_FILE_ID_MISSING");
    const newFileId = await uploadBuyerFile(token, buyerBytes); writes += 1;
    if (newFileId === oldFileId) throw new Error("REPAIR_NEW_FILE_ID_INVALID");
    await deleteBuyerFile(token, oldFileId); writes += 1;

    const repaired = await readAll(token);
    if (
      !listingMatches(repaired.listing, NEW_DESCRIPTION, "inactive") ||
      !galleryMatches(repaired.images) ||
      repaired.files.length !== 1 ||
      textField(repaired.files[0], "filename") !== BUYER_FILE.fileName ||
      Number(repaired.files[0].size_bytes) !== BUYER_FILE.size ||
      repaired.seller.counts.active !== 1 ||
      repaired.seller.counts.inactive !== 1
    ) {
      throw new Error("REPAIR_FINAL_PERSISTENCE_FAILED");
    }

    await patchListing(token, { state: "active" }); writes += 1;
    const finalState = await readAll(token);
    if (
      finalState.seller.counts.active !== 2 ||
      finalState.seller.counts.inactive !== 0 ||
      !listingMatches(finalState.listing, NEW_DESCRIPTION, "active") ||
      !galleryMatches(finalState.images) ||
      finalState.files.length !== 1 ||
      Number(finalState.files[0].size_bytes) !== BUYER_FILE.size
    ) {
      throw new Error("REPAIR_REACTIVATION_VERIFY_FAILED");
    }

    return NextResponse.json({
      status:"REPAIR_PASS_REACTIVATED",
      targetListingId:TARGET_LISTING_ID,
      descriptionTruthSafe:true,
      imageRanksReplaced:ASSETS.map(x=>x.rank),
      imageCount:finalState.images.length,
      buyerFileName:textField(finalState.files[0],"filename"),
      buyerFileSizeBytes:Number(finalState.files[0].size_bytes),
      sellerCounts:finalState.seller.counts,
      ETSY_WRITE_COUNT:writes
    });
  } catch (error) {
    return NextResponse.json({
      status: madeInactive ? "REPAIR_INCOMPLETE_LISTING_LEFT_INACTIVE" : "BLOCKED_FAIL_CLOSED",
      error: error instanceof Error ? error.message : "UNKNOWN",
      targetListingId: TARGET_LISTING_ID,
      ETSY_WRITE_COUNT:writes
    }, { status: madeInactive ? 202 : 400 });
  }
}
