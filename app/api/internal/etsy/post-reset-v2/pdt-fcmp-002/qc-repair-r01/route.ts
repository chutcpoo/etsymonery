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
const GATE = "[GATE_FCMP_QC_REPAIR_EXECUTE]";
const NONCE_SHA256 = "3735a94b3d325f9b79d2e737bc1713c94c17c065518f9c543755e9ee1aad19b9";

const NEW_DESCRIPTION = PDT_FCMP_002_V1_LISTING_IDENTITY.description.replace(
  "know your true cost per serving and the price you should charge.",
  "know your true cost per serving and a suggested target price based on your inputs."
);

const ASSETS = Object.freeze([
  { param: "asset01", rank: 1, fileName: "PDT-FCMP-002_01_hero.png", size: 49553, sha256: "603093057ab157cb4a3b2ed6fdf17305bef03f0aa0978f96a65c62993806fac4" },
  { param: "asset02", rank: 2, fileName: "PDT-FCMP-002_02_dashboard.png", size: 52058, sha256: "b268f8ea4bcde3ea1930b10a2634836d94c6b02ec4532564b000ac9f11f573a8" },
  { param: "asset03", rank: 3, fileName: "PDT-FCMP-002_03_ingredient.png", size: 49009, sha256: "4b0a9477974382ac39e451cebc209b51707eaf5a8635f5ac135a804010a0b66f" },
  { param: "asset04", rank: 4, fileName: "PDT-FCMP-002_04_recipe.png", size: 46079, sha256: "ff2df9c01f5007db757263a889e8ef1ad2685edcd10eb89d8e55f8d584f37877" },
  { param: "asset09", rank: 9, fileName: "PDT-FCMP-002_09_receive.png", size: 50606, sha256: "d61cf205a21d36b80f5014bc6c069711b2a48ff2c54b08fe06b45b0499b1be05" },
  { param: "asset10", rank: 10, fileName: "PDT-FCMP-002_10_boundaries.png", size: 59908, sha256: "77f98dfb50b10c1af3151e663751e3ef2fa2a7ae87dce98285efeda84ce2d65c" }
] as const);

const CURRENT_ETSY_BUYER_FILENAME =
  "PDT-FCMP-002_Recipe_Cost_Menu_Pricing_Calculator_V1.xlsx" as const;

const BUYER_FILE = Object.freeze({
  param: "buyerFile",
  fileName: "PoonthaiDigital_Restaurant_Recipe_Cost_Menu_Pricing_Calculator_PDT-FCMP-002_V1.xlsx",
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
  let out = value.normalize("NFC").trim();
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
      mode: "CUSTOMER_QC_REPAIR_R01",
      targetListingId: TARGET_LISTING_ID,
      protectedListingId: PROTECTED_LISTING_ID,
      repair: {
        listingFields: ["description"],
        imageRanks: ASSETS.map(x => x.rank),
        buyerFile: BUYER_FILE.fileName,
        leaveActiveOnlyAfterFullPersistenceQC: true
      },
      authorizationSource: "USER_DIRECT_REPAIR_ALL_REQUEST_2026-09-21",
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
