import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHOP_ID = 23582741;
const TARGET_LISTING_ID = 4579068925;
const PROTECTED_LISTING_ID = 4578945050;

const GATE = "[GATE_FCMP_MEDIA_POLICY_R02_EXECUTE]";
const AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-FCMP-002-ETSY-MEDIA-POLICY-R02-20260921 EXACT SCOPE ONLY" as const;
const NONCE_SHA256 =
  "1d5ce775b1604d2bc354834073e0d8cc9b48ac078f00b4fa545a86ef15a4bccf";

const EXPECTED_TITLE =
  "Restaurant Food Cost Calculator | Recipe & Menu Pricing Excel Template" as const;
const EXPECTED_IMAGE_IDS = Object.freeze([
  8555013614, 8555013608, 8555020368, 8602882579, 8602883389,
  8555021168, 8602884443, 8555022246, 8602885725, 8602885699
] as const);
const EXPECTED_VIDEO_ID = 843525230 as const;
const EXPECTED_BUYER_FILE_ID = 1517668972461 as const;
const EXPECTED_BUYER_FILE_NAME =
  "PDT-FCMP-002_Recipe_Cost_Menu_Pricing_Calculator_V1.xlsx" as const;
const EXPECTED_BUYER_FILE_SIZE = 18603 as const;

const EXPECTED_TAGS = Object.freeze([
  "recipe cost sheet",
  "food cost calculator",
  "food cost template",
  "menu pricing",
  "recipe costing",
  "cafe cost sheet",
  "cost per serving",
  "cafe spreadsheet",
  "food cost excel",
  "menu price sheet",
  "catering pricing",
  "food business tool",
  "restaurant excel"
] as const);

const AI_DISCLOSURE = [
  "AI DISCLOSURE",
  "",
  "AI tools were used to assist with planning, visual presentation, and workflow refinement. The final workbook files were reviewed, edited, and prepared by PoonthaiDigital."
].join("\n");

const ASSETS = Object.freeze([
  {
    param: "asset01", rank: 1,
    fileName: "PDT-FCMP-002_ETSY_01_HERO.png",
    size: 387252,
    sha256: "2bb1bca045da442db5815222b85ce11ee6e5c156dc7294680a0866c05c1c6617",
    altText: "Restaurant recipe cost and menu pricing calculator Excel template with real workbook preview"
  },
  {
    param: "asset02", rank: 2,
    fileName: "PDT-FCMP-002_ETSY_02_OVERVIEW.png",
    size: 538714,
    sha256: "71a2cedf6dec17cebd49767b6c5e7c4c937d9051e02b34a0daa818769ddf2a6e",
    altText: "Restaurant menu health dashboard showing food cost percent selling price target price and action"
  },
  {
    param: "asset03", rank: 3,
    fileName: "PDT-FCMP-002_ETSY_03_INGREDIENT_MASTER.png",
    size: 270576,
    sha256: "8cd1f63181a84eaab9a36da99f6b61c4811e18ce925e4a542ac46739f624a18a",
    altText: "Ingredient Master Excel sheet for package cost quantity yield percent and usable cost per unit"
  },
  {
    param: "asset04", rank: 4,
    fileName: "PDT-FCMP-002_ETSY_04_RECIPE_COSTING.png",
    size: 375695,
    sha256: "8367f8beadd276361d3917cfc08b40e9642538497d0b69558c4716163663e33b",
    altText: "Recipe Costing Excel sheet showing Butter Croissant batch cost and cost per serving calculation"
  },
  {
    param: "asset05", rank: 5,
    fileName: "PDT-FCMP-002_ETSY_05_COST_PER_SERVING.png",
    size: 196947,
    sha256: "ee014161907d263aa68331d7af36dd0e132aa8e03f904619872508e0a08ea5aa",
    altText: "Butter Croissant sample showing nine dollars four cents batch cost and seventy five cents cost per serving"
  },
  {
    param: "asset06", rank: 6,
    fileName: "PDT-FCMP-002_ETSY_06_FOOD_COST.png",
    size: 134577,
    sha256: "9ff1d13eb9b73df5cddd83e14f137c4a1d7644b39f2b105ea3c8a543185c366e",
    altText: "Menu pricing sample showing thirty point one percent food cost versus twenty eight percent target"
  },
  {
    param: "asset07", rank: 7,
    fileName: "PDT-FCMP-002_ETSY_07_TARGET_PRICE.png",
    size: 124857,
    sha256: "18bae38e62408bc8ceb65a18df1e0c6d9bc7e3c7e9fbcb7364d4d6edda0901fa",
    altText: "Suggested target menu price of two dollars sixty nine cents based on sample recipe costs"
  },
  {
    param: "asset08", rank: 8,
    fileName: "PDT-FCMP-002_ETSY_08_WORKFLOW.png",
    size: 103865,
    sha256: "a8baec6c4a35c6eee287c4df616d9b679f14e047027b060566e40e3c74928d12",
    altText: "Four step restaurant costing workflow from ingredient costs to recipe costing menu pricing and dashboard"
  },
  {
    param: "asset09", rank: 9,
    fileName: "PDT-FCMP-002_ETSY_09_WHATS_INCLUDED.png",
    size: 372360,
    sha256: "c401037bccbfb713bc01aecb6838d4928d5bf91b02d1aff96db56e67f2b58961",
    altText: "One Excel workbook with six tabs including Start Here Ingredient Master Recipe Costing Menu Pricing Dashboard and Sample"
  },
  {
    param: "asset10", rank: 10,
    fileName: "PDT-FCMP-002_ETSY_10_BOUNDARIES.png",
    size: 128516,
    sha256: "cf6df3a7e6758e0f009524565bb3cac21881df332c9cf20603e0ac1906bca103",
    altText: "Excel template compatibility and product boundaries including manual entry and no POS or supplier price sync"
  }
] as const);

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  return (
    process.env.VERCEL_ENV === "production" &&
    (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").includes(GATE)
  );
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

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
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

function records(value: unknown, code: string) {
  if (!isRec(value) || !Array.isArray(value.results)) throw new Error(code);
  return value.results.filter(isRec);
}

function exactPriceUsd(price: unknown) {
  if (!isRec(price)) return false;
  const amount = Number(price.amount);
  const divisor = Number(price.divisor);
  return (
    Number.isFinite(amount) &&
    Number.isFinite(divisor) &&
    divisor > 0 &&
    Number((amount / divisor).toFixed(2)) === 9.99 &&
    textField(price, "currency_code").toUpperCase() === "USD"
  );
}

function sameStringArray(value: unknown, expected: readonly string[]) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every(
      (v, i) =>
        typeof v === "string" &&
        v.normalize("NFC").trim() === expected[i]
    )
  );
}

async function readAll(token: string) {
  const base = "https://api.etsy.com/v3/application";
  const [listing, imagesPayload, filesPayload, videosPayload, protectedListing] =
    await Promise.all([
      getRecord(token, base + "/listings/" + TARGET_LISTING_ID, "LISTING"),
      getRecord(token, base + "/listings/" + TARGET_LISTING_ID + "/images", "IMAGES"),
      getRecord(
        token,
        base + "/shops/" + SHOP_ID + "/listings/" + TARGET_LISTING_ID + "/files",
        "FILES"
      ),
      getRecord(token, base + "/listings/" + TARGET_LISTING_ID + "/videos", "VIDEOS"),
      getRecord(token, base + "/listings/" + PROTECTED_LISTING_ID, "PROTECTED_LISTING")
    ]);

  return {
    listing,
    images: records(imagesPayload, "IMAGES_INVALID"),
    files: records(filesPayload, "FILES_INVALID"),
    videos: records(videosPayload, "VIDEOS_INVALID"),
    protectedListing
  };
}

function orderedImages(images: Rec[]) {
  return [...images].sort(
    (a, b) => (intField(a, "rank") ?? 0) - (intField(b, "rank") ?? 0)
  );
}

function protectedFieldsMatch(state: Awaited<ReturnType<typeof readAll>>) {
  const listing = state.listing;
  const file = state.files[0] ?? {};
  return (
    textField(listing, "state") === "active" &&
    textField(listing, "title") === EXPECTED_TITLE &&
    exactPriceUsd(listing.price) &&
    Number(listing.quantity) === 999 &&
    textField(listing, "who_made") === "i_did" &&
    textField(listing, "listing_type") === "download" &&
    sameStringArray(listing.tags, EXPECTED_TAGS) &&
    comparableText(textField(listing, "description")).endsWith(
      comparableText(AI_DISCLOSURE)
    ) &&
    state.files.length === 1 &&
    intField(file, "listing_file_id") === EXPECTED_BUYER_FILE_ID &&
    textField(file, "filename") === EXPECTED_BUYER_FILE_NAME &&
    Number(file.size_bytes) === EXPECTED_BUYER_FILE_SIZE &&
    state.videos.length === 1 &&
    intField(state.videos[0], "video_id") === EXPECTED_VIDEO_ID &&
    textField(state.videos[0], "video_state") === "active"
  );
}

function baselineMatches(state: Awaited<ReturnType<typeof readAll>>) {
  if (!protectedFieldsMatch(state)) return false;
  const images = orderedImages(state.images);
  return (
    images.length === 10 &&
    images.every(
      (row, index) =>
        intField(row, "rank") === index + 1 &&
        intField(row, "listing_image_id") === EXPECTED_IMAGE_IDS[index] &&
        Number(row.full_width) === 2000 &&
        Number(row.full_height) === 2000
    )
  );
}

function finalGalleryMatches(images: Rec[]) {
  const ordered = orderedImages(images);
  return (
    ordered.length === 10 &&
    ordered.every((row, index) => {
      const expected = ASSETS[index];
      return (
        intField(row, "rank") === expected.rank &&
        textField(row, "alt_text") === expected.altText &&
        Number(row.full_width) === 2000 &&
        Number(row.full_height) === 2000
      );
    })
  );
}

async function overwriteImage(
  token: string,
  rank: number,
  fileName: string,
  altText: string,
  bytes: Buffer
) {
  const body = new FormData();
  body.append(
    "image",
    new File([new Uint8Array(bytes)], fileName, { type: "image/png" }),
    fileName
  );
  body.append("rank", String(rank));
  body.append("overwrite", "true");
  body.append("alt_text", altText);

  const response = await fetch(
    "https://api.etsy.com/v3/application/shops/" +
      SHOP_ID +
      "/listings/" +
      TARGET_LISTING_ID +
      "/images",
    {
      method: "POST",
      headers: multipartHeaders(token),
      body,
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error("IMAGE_OVERWRITE_" + rank + "_HTTP_" + String(response.status));
  }
  const value = await parseJson(response);
  if (!isRec(value) || !intField(value, "listing_image_id")) {
    throw new Error("IMAGE_OVERWRITE_" + rank + "_RECEIPT_INVALID");
  }
  return {
    rank,
    listingImageId: intField(value, "listing_image_id"),
    altText: textField(value, "alt_text")
  };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function diagnosticPayload(state: Awaited<ReturnType<typeof readAll>>) {
  const ordered = orderedImages(state.images);
  const file = state.files[0] ?? {};
  const video = state.videos[0] ?? {};
  return {
    listing: {
      state: textField(state.listing, "state"),
      title: textField(state.listing, "title"),
      priceMatches: exactPriceUsd(state.listing.price),
      quantity: Number(state.listing.quantity),
      whoMade: textField(state.listing, "who_made"),
      listingType: textField(state.listing, "listing_type"),
      tags: Array.isArray(state.listing.tags) ? state.listing.tags : [],
      aiDisclosureTextPresent: comparableText(
        textField(state.listing, "description")
      ).endsWith(comparableText(AI_DISCLOSURE))
    },
    gallery: {
      count: ordered.length,
      rows: ordered.map((row) => ({
        listingImageId: intField(row, "listing_image_id"),
        rank: intField(row, "rank"),
        altText: textField(row, "alt_text"),
        fullWidth: Number(row.full_width),
        fullHeight: Number(row.full_height)
      }))
    },
    buyerFile: {
      count: state.files.length,
      listingFileId: intField(file, "listing_file_id"),
      filename: textField(file, "filename"),
      sizeBytes: Number(file.size_bytes)
    },
    video: {
      count: state.videos.length,
      videoId: intField(video, "video_id"),
      videoState: textField(video, "video_state"),
      width: Number(video.width),
      height: Number(video.height)
    },
    protectedInvoiceListing: {
      listingId: PROTECTED_LISTING_ID,
      state: textField(state.protectedListing, "state"),
      title: textField(state.protectedListing, "title")
    }
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "plan";

  if (action === "diagnose") {
    try {
      const token = await getValidEtsyAccessToken();
      const state = await readAll(token);
      return NextResponse.json(
        {
          status: "DIAGNOSTIC_READ_ONLY",
          mode: "PDT_FCMP_002_MEDIA_POLICY_R02",
          ...diagnosticPayload(state),
          baselineMatches: baselineMatches(state),
          finalGalleryMatches: finalGalleryMatches(state.images),
          controlledWriteSequenceCount: 0,
          etsyProviderWriteCalls: 0,
          ETSY_WRITE_COUNT: 0
        },
        { headers: { "cache-control": "no-store" } }
      );
    } catch (error) {
      return NextResponse.json(
        {
          status: "DIAGNOSTIC_BLOCKED",
          error: error instanceof Error ? error.message : "UNKNOWN",
          controlledWriteSequenceCount: 0,
          etsyProviderWriteCalls: 0,
          ETSY_WRITE_COUNT: 0
        },
        { status: 409, headers: { "cache-control": "no-store" } }
      );
    }
  }

  if (action !== "execute") {
    return NextResponse.json({
      status: "PLAN_ONLY",
      mode: "PDT_FCMP_002_MEDIA_POLICY_R02",
      targetListingId: TARGET_LISTING_ID,
      protectedListingId: PROTECTED_LISTING_ID,
      exactScope: {
        listingFieldsToModify: [],
        imageRanksToOverwrite: ASSETS.map((asset) => asset.rank),
        videoAction: "VERIFY_EXISTING_ONLY",
        buyerFileAction: "VERIFY_ONLY_DO_NOT_TOUCH",
        aiDisclosureTextAction: "VERIFY_EXISTING_ONLY",
        aiGeneratorSetting:
          "NOT_EXPOSED_BY_CURRENT_OPEN_API_EXECUTOR_UI_VERIFICATION_RETAINED"
      },
      authorizationRequired: AUTHORIZATION_TEXT,
      gateEnabled: gateEnabled(),
      productionMutationExecuted: false,
      controlledWriteSequenceCount: 0,
      etsyProviderWriteCalls: 0,
      ETSY_WRITE_COUNT: 0
    });
  }

  let providerWrites = 0;
  try {
    if (!gateEnabled()) {
      return NextResponse.json(
        {
          status: "BLOCKED_FAIL_CLOSED",
          error: "MEDIA_POLICY_R02_GATE_DISABLED",
          ETSY_WRITE_COUNT: 0
        },
        { status: 403 }
      );
    }

    const authorizationText =
      url.searchParams.get("authorizationText")?.normalize("NFC").trim() ?? "";
    if (!secureEqual(authorizationText, AUTHORIZATION_TEXT)) {
      return NextResponse.json(
        {
          status: "BLOCKED_FAIL_CLOSED",
          error: "MEDIA_POLICY_R02_AUTHORIZATION_INVALID",
          ETSY_WRITE_COUNT: 0
        },
        { status: 401 }
      );
    }

    const nonce = url.searchParams.get("nonce")?.trim() ?? "";
    if (!nonce || !nonceOk(nonce)) {
      return NextResponse.json(
        {
          status: "BLOCKED_FAIL_CLOSED",
          error: "MEDIA_POLICY_R02_NONCE_INVALID",
          ETSY_WRITE_COUNT: 0
        },
        { status: 401 }
      );
    }

    const token = await getValidEtsyAccessToken();

    const before = await readAll(token);
    if (!baselineMatches(before)) {
      return NextResponse.json(
        {
          status: "BLOCKED_FAIL_CLOSED",
          error: "MEDIA_POLICY_R02_BASELINE_MISMATCH",
          ...diagnosticPayload(before),
          controlledWriteSequenceCount: 0,
          etsyProviderWriteCalls: 0,
          ETSY_WRITE_COUNT: 0
        },
        { status: 409 }
      );
    }

    const protectedBefore = {
      state: textField(before.protectedListing, "state"),
      title: textField(before.protectedListing, "title")
    };
    const baselineDescription = comparableText(
      textField(before.listing, "description")
    );

    const fetched = new Map<number, Buffer>();
    for (const asset of ASSETS) {
      const raw = url.searchParams.get(asset.param) ?? "";
      fetched.set(
        asset.rank,
        await fetchAsset(allowedAssetUrl(raw), asset.size, asset.sha256)
      );
    }

    // Fresh protected-state verification immediately before the first Etsy write.
    const immediatelyBefore = await readAll(token);
    if (!baselineMatches(immediatelyBefore)) {
      return NextResponse.json(
        {
          status: "BLOCKED_FAIL_CLOSED",
          error: "MEDIA_POLICY_R02_FRESH_BASELINE_MISMATCH",
          ...diagnosticPayload(immediatelyBefore),
          controlledWriteSequenceCount: 0,
          etsyProviderWriteCalls: 0,
          ETSY_WRITE_COUNT: 0
        },
        { status: 409 }
      );
    }

    const receipts: Array<{
      rank: number;
      listingImageId: number | null;
      altText: string;
    }> = [];

    for (const asset of ASSETS) {
      const bytes = fetched.get(asset.rank);
      if (!bytes) throw new Error("ASSET_BYTES_MISSING_" + asset.rank);
      const receipt = await overwriteImage(
        token,
        asset.rank,
        asset.fileName,
        asset.altText,
        bytes
      );
      providerWrites += 1;
      receipts.push(receipt);
    }

    let finalState = await readAll(token);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (finalGalleryMatches(finalState.images)) break;
      await sleep(1000);
      finalState = await readAll(token);
    }

    const protectedAfter = {
      state: textField(finalState.protectedListing, "state"),
      title: textField(finalState.protectedListing, "title")
    };

    const nonMediaInvariant =
      protectedFieldsMatch(finalState) &&
      comparableText(textField(finalState.listing, "description")) ===
        baselineDescription &&
      protectedAfter.state === protectedBefore.state &&
      protectedAfter.title === protectedBefore.title;

    if (!finalGalleryMatches(finalState.images) || !nonMediaInvariant) {
      return NextResponse.json(
        {
          status: "MEDIA_POLICY_R02_INCOMPLETE_RECOVERY_REQUIRED",
          error: !finalGalleryMatches(finalState.images)
            ? "FINAL_GALLERY_VERIFY_FAILED"
            : "NON_MEDIA_INVARIANT_FAILED",
          receipts,
          ...diagnosticPayload(finalState),
          controlledWriteSequenceCount: 1,
          etsyProviderWriteCalls: providerWrites,
          ETSY_WRITE_COUNT: 1
        },
        { status: 202, headers: { "cache-control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        status: "MEDIA_POLICY_R02_PASS",
        targetListingId: TARGET_LISTING_ID,
        receipts,
        ...diagnosticPayload(finalState),
        finalGalleryMatches: true,
        titleUnchanged: true,
        tagsUnchanged: true,
        priceUnchanged: true,
        buyerFileUnchanged: true,
        videoVerifiedExisting: true,
        aiDisclosureTextVerifiedExisting: true,
        aiGeneratorSetting:
          "PREVIOUS_UI_VERIFIED_SELECTED_NOT_MUTATED_BY_OPEN_API_ROUTE",
        protectedInvoiceListingUnchanged: true,
        authorizationTokenConsumed: true,
        controlledWriteSequenceCount: 1,
        etsyProviderWriteCalls: providerWrites,
        ETSY_WRITE_COUNT: 1
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status:
          providerWrites > 0
            ? "MEDIA_POLICY_R02_INCOMPLETE_RECOVERY_REQUIRED"
            : "BLOCKED_FAIL_CLOSED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        controlledWriteSequenceCount: providerWrites > 0 ? 1 : 0,
        etsyProviderWriteCalls: providerWrites,
        ETSY_WRITE_COUNT: providerWrites > 0 ? 1 : 0
      },
      {
        status: providerWrites > 0 ? 202 : 400,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
