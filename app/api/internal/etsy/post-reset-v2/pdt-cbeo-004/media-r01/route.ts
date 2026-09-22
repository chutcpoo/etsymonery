import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { executeReconciledWrite } from "../../../../../../../lib/draft-upload-reconciliation";
import { EtsyDraftAssetProvider } from "../../../../../../../lib/etsy-draft-asset-provider";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "../../../../../../../lib/etsy-readback-normalizer";
import { getEtsySellerStateSnapshot } from "../../../../../../../lib/etsy-seller-state-reconciliation";
import { NeonOperationLedgerRepository } from "../../../../../../../lib/operation-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = 23582741;
const DRAFT_LISTING_ID = 4580126260;
const CANDIDATE_FINGERPRINT =
  "758335490c54ba8a293045867a1344eed4e27aec2a4bef5c8919d026d8edd067";
const LISTING_FINGERPRINT =
  "2c19e1f00b8786f264e6091d9286723f3116dc9810a189ac82557cb38387eafb";
const AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-CBEO-004-V1-ETSY-MEDIA-UPLOAD-R01-20260922 EXACT SCOPE ONLY";
const NONCE_SHA256 =
  "d70832d49fb54950031e2a6682d7d233132701ea0442a3e19783e3c0b816fd33";

const IMAGES = Object.freeze([
  {
    rank: 1,
    key: "image01Url",
    operationId: "PDT-CBEO-004-V1-ETSY-MEDIA-UPLOAD-R01-20260922-IMAGE-01",
    fileName: "PDT-CBEO-004_GALLERY_01.jpg",
    size: 607270,
    sha256: "39a220572cdad5af9fe26eafa27f001ba9b410ad04f1dd6379e472b9dad8a4a7",
    altText:
      "Banquet Event Order template hero image showing the real Excel BEO operational event summary workbook."
  },
  {
    rank: 2,
    key: "image02Url",
    operationId: "PDT-CBEO-004-V1-ETSY-MEDIA-UPLOAD-R01-20260922-IMAGE-02",
    fileName: "PDT-CBEO-004_GALLERY_02.jpg",
    size: 488810,
    sha256: "e97e921f05a5b63a200e1bef5a44509d763bea4d326ddb10c8a860c905b0ddab",
    altText:
      "Real Excel catering dashboard showing upcoming events, guest counts, balances, deposits, and event status."
  },
  {
    rank: 3,
    key: "image03Url",
    operationId: "PDT-CBEO-004-V1-ETSY-MEDIA-UPLOAD-R01-20260922-IMAGE-03",
    fileName: "PDT-CBEO-004_GALLERY_03.jpg",
    size: 572930,
    sha256: "fec231915cfab681f24ccb4b624eb19d8600c3e9db0638c212e4170af1416c91",
    altText:
      "BEO output worksheet showing one selected catering event with operational notes, menu items, requirements, payments, and totals."
  },
  {
    rank: 4,
    key: "image04Url",
    operationId: "PDT-CBEO-004-V1-ETSY-MEDIA-UPLOAD-R01-20260922-IMAGE-04",
    fileName: "PDT-CBEO-004_GALLERY_04.jpg",
    size: 427566,
    sha256: "dceec5eac09e552e0dce0ec408e7c2ee1229fdaf0e326a8bd894a701cb171061",
    altText:
      "Excel master event register showing client, venue, guest count, timing, rates, and event status fields."
  },
  {
    rank: 5,
    key: "image05Url",
    operationId: "PDT-CBEO-004-V1-ETSY-MEDIA-UPLOAD-R01-20260922-IMAGE-05",
    fileName: "PDT-CBEO-004_GALLERY_05.jpg",
    size: 544474,
    sha256: "7d1b8032a264e87a9259ddab613df92f7cfc7614e74a563d796c73214e5636a8",
    altText:
      "Menu and Services worksheet showing billable food, beverage, service, and rental line items by Event ID."
  },
  {
    rank: 6,
    key: "image06Url",
    operationId: "PDT-CBEO-004-V1-ETSY-MEDIA-UPLOAD-R01-20260922-IMAGE-06",
    fileName: "PDT-CBEO-004_GALLERY_06.jpg",
    size: 497720,
    sha256: "06ef9cd07ac09fa6dd5061e0bac7c9ea77c9098a6f28d3a43e119bec99002180",
    altText:
      "Staff and Equipment worksheet showing catering staff, equipment, rental, AV, quantity, and needed-by requirements."
  },
  {
    rank: 7,
    key: "image07Url",
    operationId: "PDT-CBEO-004-V1-ETSY-MEDIA-UPLOAD-R01-20260922-IMAGE-07",
    fileName: "PDT-CBEO-004_GALLERY_07.jpg",
    size: 529804,
    sha256: "5f44bf53979df8f85bba22a76062749c26ea3c2c77b875774c10d6efa0841960",
    altText:
      "Payments worksheet showing manual deposits, payments, refunds, methods, references, and signed amounts by Event ID."
  },
  {
    rank: 8,
    key: "image08Url",
    operationId: "PDT-CBEO-004-V1-ETSY-MEDIA-UPLOAD-R01-20260922-IMAGE-08",
    fileName: "PDT-CBEO-004_GALLERY_08.jpg",
    size: 439194,
    sha256: "01458a9a159971581647d086ef20d12d3ebf81f5f873196f604f1e618edbf962",
    altText:
      "Start Here worksheet and overview of the eight connected Excel tabs in the catering BEO workflow."
  },
  {
    rank: 9,
    key: "image09Url",
    operationId: "PDT-CBEO-004-V1-ETSY-MEDIA-UPLOAD-R01-20260922-IMAGE-09",
    fileName: "PDT-CBEO-004_GALLERY_09.jpg",
    size: 372909,
    sha256: "291ac83f77d6f30d4e72784ff18d0fe479df79749c329585878e5645192952a7",
    altText:
      "Digital product contents showing SAMPLE and CLEAN START Microsoft Excel XLSX workbook files."
  },
  {
    rank: 10,
    key: "image10Url",
    operationId: "PDT-CBEO-004-V1-ETSY-MEDIA-UPLOAD-R01-20260922-IMAGE-10",
    fileName: "PDT-CBEO-004_GALLERY_10.jpg",
    size: 442172,
    sha256: "c6e75dc9cb9a4e79e8051d861752eb1db055865ca5ae55cf56671cd8d6cad1b8",
    altText:
      "Buyer fit and product boundaries for the catering BEO Excel tracker, including supported and unsupported use cases."
  }
] as const);

const BUYER_FILES = Object.freeze([
  {
    rank: 1,
    listingFileId: 1518077137293,
    fileName: "PDT-CBEO-004_V1_Catering_BEO_Event_Planning_Tracker_SAMPLE.xlsx",
    size: 88292
  },
  {
    rank: 2,
    listingFileId: 1516837916828,
    fileName: "PDT-CBEO-004_V1_Catering_BEO_Event_Planning_Tracker_CLEAN_START.xlsx",
    size: 83888
  }
] as const);

const EXISTING = Object.freeze([
  {
    listingId: 4579068925,
    state: "active",
    title: "Recipe Cost Calculator | Restaurant Food Cost & Menu Pricing Excel Template"
  },
  {
    listingId: 4578945050,
    state: "active",
    title:
      "Invoice Payment Tracker Excel | Accounts Receivable Aging & Follow-Up Spreadsheet for Small Business"
  },
  {
    listingId: 4579470012,
    state: "draft",
    title: "Bar Inventory Spreadsheet | Liquor Stock & Pour Cost Tracker"
  },
  {
    listingId: 4580126260,
    state: "draft",
    title: "Banquet Event Order Template | Catering BEO & Event Tracker | Excel Spreadsheet"
  }
] as const);

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function runtimeCommit() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? "";
}

function gateEnabled() {
  // Media R01 was consumed on 2026-09-22. Keep PLAN/readback available only.
  return false;
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

function records(value: unknown, code: string) {
  if (!isRec(value) || !Array.isArray(value.results)) throw new Error(code);
  return value.results.filter(isRec);
}

function textField(value: Rec, key: string) {
  return typeof value[key] === "string" ? value[key].normalize("NFC").trim() : "";
}

function intField(value: Rec, key: string) {
  const n = Number(value[key]);
  return Number.isSafeInteger(n) ? n : null;
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

async function getListing(token: string) {
  return getRecord(
    token,
    "https://api.etsy.com/v3/application/listings/" + DRAFT_LISTING_ID,
    "CBEO_LISTING"
  );
}

async function getFiles(token: string) {
  const value = await getRecord(
    token,
    "https://api.etsy.com/v3/application/shops/" +
      SHOP_ID +
      "/listings/" +
      DRAFT_LISTING_ID +
      "/files",
    "CBEO_FILES"
  );
  return records(value, "CBEO_FILES_INVALID");
}

async function getImages(token: string) {
  const value = await getRecord(
    token,
    "https://api.etsy.com/v3/application/listings/" +
      DRAFT_LISTING_ID +
      "/images",
    "CBEO_IMAGES"
  );
  return records(value, "CBEO_IMAGES_INVALID");
}

function baselineSellerMatches(
  state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
) {
  if (
    state.total !== 4 ||
    state.counts.active !== 2 ||
    state.counts.draft !== 2 ||
    state.counts.inactive !== 0 ||
    state.counts.sold_out !== 0 ||
    state.counts.expired !== 0 ||
    state.listings.length !== 4
  ) {
    return false;
  }
  for (const expected of EXISTING) {
    const row = state.listings.find((item) => item.listingId === expected.listingId);
    if (!row || row.state !== expected.state || row.title !== expected.title) {
      return false;
    }
  }
  return true;
}

function buyerFilesMatch(rows: Rec[]) {
  const ordered = [...rows].sort(
    (a, b) => (intField(a, "rank") ?? 0) - (intField(b, "rank") ?? 0)
  );
  if (ordered.length !== BUYER_FILES.length) return false;
  for (let i = 0; i < BUYER_FILES.length; i += 1) {
    const expected = BUYER_FILES[i];
    const actual = ordered[i];
    if (
      intField(actual, "listing_file_id") !== expected.listingFileId ||
      intField(actual, "rank") !== expected.rank ||
      textField(actual, "filename") !== expected.fileName ||
      Number(actual.size_bytes) !== expected.size
    ) {
      return false;
    }
  }
  return true;
}

function protectedFingerprint(
  state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>,
  fileRows: Rec[],
  imageRows: Rec[]
) {
  const payload = JSON.stringify({
    productId: "PDT-CBEO-004",
    listingId: DRAFT_LISTING_ID,
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    listingFingerprint: LISTING_FINGERPRINT,
    sellerCounts: state.counts,
    listings: state.listings
      .map((item) => ({
        listingId: item.listingId,
        state: item.state,
        title: item.title
      }))
      .sort((a, b) => a.listingId - b.listingId),
    buyerFiles: fileRows
      .map((row) => ({
        id: intField(row, "listing_file_id"),
        rank: intField(row, "rank"),
        filename: textField(row, "filename"),
        size: Number(row.size_bytes ?? 0)
      }))
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
    gallery: imageRows
      .map((row) => ({
        id: intField(row, "listing_image_id"),
        rank: intField(row, "rank"),
        altText: textField(row, "alt_text")
      }))
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function allowedAssetUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("CBEO_MEDIA_ASSET_URL_INVALID");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.hostname.endsWith(".oaiusercontent.com") ||
    !url.pathname.includes("/files/") ||
    !url.pathname.endsWith("/raw")
  ) {
    throw new Error("CBEO_MEDIA_ASSET_URL_NOT_ALLOWED");
  }
  return url.toString();
}

async function fetchAsset(url: string, expectedSize: number, expectedSha: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("CBEO_MEDIA_ASSET_FETCH_HTTP_" + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== expectedSize) throw new Error("CBEO_MEDIA_ASSET_SIZE_MISMATCH");
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (!secureEqual(actual, expectedSha)) throw new Error("CBEO_MEDIA_ASSET_SHA256_MISMATCH");
  return bytes;
}

async function verifyListingIdentity(token: string) {
  const listing = await getListing(token);
  const identity = verifyEtsyReadBackIdentity(
    LISTING_FINGERPRINT,
    toObservation(listing)
  );
  if (identity.status !== "MATCH" || textField(listing, "state") !== "draft") {
    throw new Error("CBEO_MEDIA_LISTING_IDENTITY_MISMATCH");
  }
}

function normalizedAlt(value: string) {
  return value.normalize("NFC").trim();
}

async function verifyFinal(token: string) {
  await verifyListingIdentity(token);
  const [fileRows, imageRows, seller] = await Promise.all([
    getFiles(token),
    getImages(token),
    getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token })
  ]);

  if (!buyerFilesMatch(fileRows)) {
    throw new Error("CBEO_MEDIA_BUYER_FILES_DRIFT");
  }
  if (!baselineSellerMatches(seller)) {
    throw new Error("CBEO_MEDIA_FINAL_SELLER_STATE_MISMATCH");
  }

  const ordered = [...imageRows].sort(
    (a, b) => (intField(a, "rank") ?? 0) - (intField(b, "rank") ?? 0)
  );
  if (ordered.length !== IMAGES.length) {
    throw new Error("CBEO_MEDIA_FINAL_GALLERY_COUNT_MISMATCH");
  }
  for (let i = 0; i < IMAGES.length; i += 1) {
    const expected = IMAGES[i];
    const actual = ordered[i];
    if (
      intField(actual, "rank") !== expected.rank ||
      normalizedAlt(textField(actual, "alt_text")) !== normalizedAlt(expected.altText)
    ) {
      throw new Error("CBEO_MEDIA_FINAL_GALLERY_MISMATCH_" + String(i + 1));
    }
  }

  return {
    galleryCount: ordered.length,
    images: ordered.map((row) => ({
      listingImageId: intField(row, "listing_image_id"),
      rank: intField(row, "rank"),
      altText: textField(row, "alt_text")
    })),
    buyerFileCount: fileRows.length,
    sellerCounts: seller.counts,
    total: seller.total
  };
}

async function plan() {
  const token = await getValidEtsyAccessToken();
  await verifyListingIdentity(token);
  const [fileRows, imageRows, seller] = await Promise.all([
    getFiles(token),
    getImages(token),
    getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token })
  ]);
  return {
    status: "PLAN_ONLY",
    mode: "PDT_CBEO_004_MEDIA_UPLOAD_R01",
    listingId: DRAFT_LISTING_ID,
    listingFingerprint: LISTING_FINGERPRINT,
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    baselineMatches:
      baselineSellerMatches(seller) &&
      buyerFilesMatch(fileRows) &&
      imageRows.length === 0,
    protectedStateFingerprint: protectedFingerprint(seller, fileRows, imageRows),
    sellerCounts: seller.counts,
    total: seller.total,
    currentBuyerFileCount: fileRows.length,
    currentGalleryCount: imageRows.length,
    expectedImages: IMAGES.map((image) => ({
      rank: image.rank,
      fileName: image.fileName,
      size: image.size,
      sha256: image.sha256,
      altText: image.altText
    })),
    authorizationRequired: AUTHORIZATION_TEXT,
    mediaUploadAuthorized: true,
    buyerFileUploadAuthorized: false,
    publishAuthorized: false,
    deploymentCommit: runtimeCommit(),
    ETSY_WRITE_COUNT: 0
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.get("action") !== "execute_relay") {
    try {
      return NextResponse.json(await plan(), {
        headers: { "cache-control": "no-store" }
      });
    } catch (error) {
      return NextResponse.json(
        {
          status: "PLAN_BLOCKED",
          error: error instanceof Error ? error.message : "UNKNOWN",
          ETSY_WRITE_COUNT: 0
        },
        { status: 409, headers: { "cache-control": "no-store" } }
      );
    }
  }

  let writeAttempts = 0;
  try {
    if (!gateEnabled()) {
      throw new Error("CBEO_MEDIA_GATE_DISABLED");
    }

    if (process.env.VERCEL_ENV !== "production") {
      throw new Error("CBEO_MEDIA_PRODUCTION_RUNTIME_REQUIRED");
    }

    const authorization =
      url.searchParams.get("authorizationText")?.normalize("NFC").trim() ?? "";
    if (!secureEqual(authorization, AUTHORIZATION_TEXT)) {
      throw new Error("CBEO_MEDIA_AUTHORIZATION_INVALID");
    }

    const nonce = url.searchParams.get("nonce")?.trim() ?? "";
    if (!nonce || !nonceOk(nonce)) {
      throw new Error("CBEO_MEDIA_NONCE_INVALID");
    }

    const commit = url.searchParams.get("commit")?.trim().toLowerCase() ?? "";
    const deploymentCommit = runtimeCommit();
    if (
      !/^[a-f0-9]{40}$/.test(commit) ||
      !/^[a-f0-9]{40}$/.test(deploymentCommit) ||
      !secureEqual(commit, deploymentCommit)
    ) {
      throw new Error("CBEO_MEDIA_GIT_VERCEL_COMMIT_MISMATCH");
    }

    const suppliedProtected =
      url.searchParams.get("protectedStateFingerprint")?.trim().toLowerCase() ?? "";
    if (!/^[a-f0-9]{64}$/.test(suppliedProtected)) {
      throw new Error("CBEO_MEDIA_PROTECTED_STATE_INVALID");
    }

    const token = await getValidEtsyAccessToken();
    await verifyListingIdentity(token);
    const [beforeFiles, beforeImages, seller] = await Promise.all([
      getFiles(token),
      getImages(token),
      getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token })
    ]);

    if (
      !baselineSellerMatches(seller) ||
      !buyerFilesMatch(beforeFiles) ||
      beforeImages.length !== 0
    ) {
      throw new Error("CBEO_MEDIA_BASELINE_MISMATCH");
    }

    const actualProtected = protectedFingerprint(seller, beforeFiles, beforeImages);
    if (!secureEqual(actualProtected, suppliedProtected)) {
      throw new Error("CBEO_MEDIA_PROTECTED_STATE_DRIFT");
    }

    const staged = new Map<number, Buffer>();
    for (const spec of IMAGES) {
      const sourceUrl = allowedAssetUrl(url.searchParams.get(spec.key) ?? "");
      staged.set(
        spec.rank,
        await fetchAsset(sourceUrl, spec.size, spec.sha256)
      );
    }

    const ledger = new NeonOperationLedgerRepository();
    const results: Array<Record<string, unknown>> = [];

    for (const spec of IMAGES) {
      const bytes = staged.get(spec.rank);
      if (!bytes) throw new Error("CBEO_MEDIA_STAGED_IMAGE_MISSING_" + spec.rank);

      const asset = new File([new Uint8Array(bytes)], spec.fileName, {
        type: "image/jpeg"
      });
      const payload = {
        operationKind: "UPLOAD_IMAGE" as const,
        candidateId: "PDT-CBEO-004-V1",
        candidateFingerprint: CANDIDATE_FINGERPRINT,
        expectedListingFingerprint: LISTING_FINGERPRINT,
        shopId: SHOP_ID,
        draftListingId: DRAFT_LISTING_ID,
        assetSha256: spec.sha256,
        assetName: spec.fileName,
        rank: spec.rank,
        altText: spec.altText
      };
      const provider = new EtsyDraftAssetProvider(token, payload, asset);
      const result = await executeReconciledWrite(ledger, provider, {
        operationId: spec.operationId,
        kind: "UPLOAD_IMAGE",
        payload: { ...payload },
        now: new Date().toISOString()
      });

      if (result.status === "RECONCILIATION_REQUIRED") {
        writeAttempts += 1;
        return NextResponse.json(
          {
            status: "RECONCILIATION_REQUIRED",
            operationId: spec.operationId,
            completed: results,
            mediaUploadPerformed: writeAttempts > 0,
            buyerFileUploadPerformed: false,
            publishPerformed: false,
            ETSY_WRITE_COUNT: writeAttempts
          },
          { status: 202, headers: { "cache-control": "no-store" } }
        );
      }

      if (result.status !== "REPLAY") writeAttempts += 1;
      results.push({
        rank: spec.rank,
        fileName: spec.fileName,
        operationId: spec.operationId,
        status: result.status,
        receipt: result.receipt
      });
    }

    const verified = await verifyFinal(token);

    return NextResponse.json(
      {
        status: "GALLERY_UPLOADED_AND_PERSISTENCE_VERIFIED",
        mode: "PDT_CBEO_004_MEDIA_UPLOAD_R01",
        listingId: DRAFT_LISTING_ID,
        candidateFingerprint: CANDIDATE_FINGERPRINT,
        listingFingerprint: LISTING_FINGERPRINT,
        images: results,
        verified,
        mediaUploadPerformed: true,
        buyerFileUploadPerformed: false,
        publishPerformed: false,
        ETSY_WRITE_COUNT: writeAttempts
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: writeAttempts > 0 ? "RECONCILIATION_REQUIRED" : "BLOCKED_FAIL_CLOSED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        listingId: DRAFT_LISTING_ID,
        mediaUploadPerformed: writeAttempts > 0,
        buyerFileUploadPerformed: false,
        publishPerformed: false,
        ETSY_WRITE_COUNT: writeAttempts
      },
      {
        status: writeAttempts > 0 ? 202 : 400,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
