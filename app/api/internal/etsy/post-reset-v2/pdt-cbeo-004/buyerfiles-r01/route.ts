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
  "AUTHORIZE PDT-CBEO-004-V1-ETSY-BUYERFILES-UPLOAD-R01-20260922 EXACT SCOPE ONLY";
const NONCE_SHA256 =
  "64429591366840fae8ee758b0f33be6e4ba8a6476e77e08c18f8bcd18d2e919f";

const FILES = Object.freeze([
  {
    rank: 1,
    key: "sampleUrl",
    operationId: "PDT-CBEO-004-V1-ETSY-BUYERFILES-UPLOAD-R01-20260922-FILE-01",
    fileName: "PDT-CBEO-004_V1_Catering_BEO_Event_Planning_Tracker_SAMPLE.xlsx",
    size: 88292,
    sha256: "208f6d32925b9127811a276cb57ffaf5e8d384735b29cecfdb3b5f37bd688fb7",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  },
  {
    rank: 2,
    key: "cleanUrl",
    operationId: "PDT-CBEO-004-V1-ETSY-BUYERFILES-UPLOAD-R01-20260922-FILE-02",
    fileName: "PDT-CBEO-004_V1_Catering_BEO_Event_Planning_Tracker_CLEAN_START.xlsx",
    size: 83888,
    sha256: "90f3156c4b99a3cc0cf837f3544e28df2ef0c2b740448b9a05f13d5541e09f48",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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

function baselineMatches(
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
        rank: intField(row, "rank")
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
    throw new Error("CBEO_ASSET_URL_INVALID");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.hostname.endsWith(".oaiusercontent.com") ||
    !url.pathname.includes("/files/") ||
    !url.pathname.endsWith("/raw")
  ) {
    throw new Error("CBEO_ASSET_URL_NOT_ALLOWED");
  }
  return url.toString();
}

async function fetchAsset(url: string, expectedSize: number, expectedSha: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("CBEO_ASSET_FETCH_HTTP_" + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== expectedSize) throw new Error("CBEO_ASSET_SIZE_MISMATCH");
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (!secureEqual(actual, expectedSha)) throw new Error("CBEO_ASSET_SHA256_MISMATCH");
  return bytes;
}

async function verifyListingIdentity(token: string) {
  const listing = await getListing(token);
  const identity = verifyEtsyReadBackIdentity(
    LISTING_FINGERPRINT,
    toObservation(listing)
  );
  if (identity.status !== "MATCH" || textField(listing, "state") !== "draft") {
    throw new Error("CBEO_LISTING_IDENTITY_MISMATCH");
  }
  return listing;
}

async function verifyFinal(token: string) {
  await verifyListingIdentity(token);
  const [fileRows, imageRows, seller] = await Promise.all([
    getFiles(token),
    getImages(token),
    getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token })
  ]);

  const ordered = [...fileRows].sort(
    (a, b) => (intField(a, "rank") ?? 0) - (intField(b, "rank") ?? 0)
  );
  if (ordered.length !== FILES.length) {
    throw new Error("CBEO_FINAL_FILE_COUNT_MISMATCH");
  }
  for (let i = 0; i < FILES.length; i += 1) {
    const expected = FILES[i];
    const actual = ordered[i];
    if (
      intField(actual, "rank") !== expected.rank ||
      textField(actual, "filename") !== expected.fileName ||
      Number(actual.size_bytes) !== expected.size
    ) {
      throw new Error("CBEO_FINAL_FILE_MISMATCH_" + String(i + 1));
    }
  }

  if (imageRows.length !== 0) {
    throw new Error("CBEO_GALLERY_DRIFT_DURING_BUYERFILE_SCOPE");
  }

  if (!baselineMatches(seller)) {
    throw new Error("CBEO_FINAL_SELLER_STATE_MISMATCH");
  }

  return {
    buyerFileCount: ordered.length,
    buyerFiles: ordered.map((row) => ({
      listingFileId: intField(row, "listing_file_id"),
      rank: intField(row, "rank"),
      filename: textField(row, "filename"),
      sizeBytes: Number(row.size_bytes)
    })),
    galleryCount: imageRows.length,
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
    mode: "PDT_CBEO_004_BUYERFILES_UPLOAD_R01",
    listingId: DRAFT_LISTING_ID,
    listingFingerprint: LISTING_FINGERPRINT,
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    baselineMatches:
      baselineMatches(seller) && fileRows.length === 0 && imageRows.length === 0,
    protectedStateFingerprint: protectedFingerprint(seller, fileRows, imageRows),
    sellerCounts: seller.counts,
    total: seller.total,
    currentBuyerFileCount: fileRows.length,
    currentGalleryCount: imageRows.length,
    expectedFiles: FILES.map((file) => ({
      rank: file.rank,
      fileName: file.fileName,
      size: file.size,
      sha256: file.sha256
    })),
    authorizationRequired: AUTHORIZATION_TEXT,
    buyerFileUploadAuthorized: true,
    galleryUploadAuthorized: false,
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
    if (process.env.VERCEL_ENV !== "production") {
      throw new Error("CBEO_BUYERFILES_PRODUCTION_RUNTIME_REQUIRED");
    }

    const authorization =
      url.searchParams.get("authorizationText")?.normalize("NFC").trim() ?? "";
    if (!secureEqual(authorization, AUTHORIZATION_TEXT)) {
      throw new Error("CBEO_BUYERFILES_AUTHORIZATION_INVALID");
    }

    const nonce = url.searchParams.get("nonce")?.trim() ?? "";
    if (!nonce || !nonceOk(nonce)) {
      throw new Error("CBEO_BUYERFILES_NONCE_INVALID");
    }

    const commit = url.searchParams.get("commit")?.trim().toLowerCase() ?? "";
    const deploymentCommit = runtimeCommit();
    if (
      !/^[a-f0-9]{40}$/.test(commit) ||
      !/^[a-f0-9]{40}$/.test(deploymentCommit) ||
      !secureEqual(commit, deploymentCommit)
    ) {
      throw new Error("CBEO_BUYERFILES_GIT_VERCEL_COMMIT_MISMATCH");
    }

    const suppliedProtected =
      url.searchParams.get("protectedStateFingerprint")?.trim().toLowerCase() ?? "";
    if (!/^[a-f0-9]{64}$/.test(suppliedProtected)) {
      throw new Error("CBEO_BUYERFILES_PROTECTED_STATE_INVALID");
    }

    const token = await getValidEtsyAccessToken();
    await verifyListingIdentity(token);
    const [beforeFiles, beforeImages, seller] = await Promise.all([
      getFiles(token),
      getImages(token),
      getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token })
    ]);

    if (!baselineMatches(seller) || beforeFiles.length !== 0 || beforeImages.length !== 0) {
      throw new Error("CBEO_BUYERFILES_BASELINE_MISMATCH");
    }

    const actualProtected = protectedFingerprint(seller, beforeFiles, beforeImages);
    if (!secureEqual(actualProtected, suppliedProtected)) {
      throw new Error("CBEO_BUYERFILES_PROTECTED_STATE_DRIFT");
    }

    const staged = new Map<number, Buffer>();
    for (const spec of FILES) {
      const sourceUrl = allowedAssetUrl(url.searchParams.get(spec.key) ?? "");
      staged.set(
        spec.rank,
        await fetchAsset(sourceUrl, spec.size, spec.sha256)
      );
    }

    const ledger = new NeonOperationLedgerRepository();
    const results: Array<Record<string, unknown>> = [];

    for (const spec of FILES) {
      const bytes = staged.get(spec.rank);
      if (!bytes) throw new Error("CBEO_STAGED_FILE_MISSING_" + spec.rank);

      const asset = new File(
        [new Uint8Array(bytes)],
        spec.fileName,
        { type: spec.mimeType }
      );
      const payload = {
        operationKind: "UPLOAD_FILE" as const,
        candidateId: "PDT-CBEO-004-V1",
        candidateFingerprint: CANDIDATE_FINGERPRINT,
        expectedListingFingerprint: LISTING_FINGERPRINT,
        shopId: SHOP_ID,
        draftListingId: DRAFT_LISTING_ID,
        assetSha256: spec.sha256,
        assetName: spec.fileName,
        rank: spec.rank
      };
      const provider = new EtsyDraftAssetProvider(token, payload, asset);
      const result = await executeReconciledWrite(ledger, provider, {
        operationId: spec.operationId,
        kind: "UPLOAD_FILE",
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
            buyerFileUploadPerformed: writeAttempts > 0,
            galleryUploadPerformed: false,
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
        status: "BUYER_FILES_UPLOADED_AND_PERSISTENCE_VERIFIED",
        mode: "PDT_CBEO_004_BUYERFILES_UPLOAD_R01",
        listingId: DRAFT_LISTING_ID,
        candidateFingerprint: CANDIDATE_FINGERPRINT,
        listingFingerprint: LISTING_FINGERPRINT,
        files: results,
        verified,
        buyerFileUploadPerformed: true,
        galleryUploadPerformed: false,
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
        buyerFileUploadPerformed: writeAttempts > 0,
        galleryUploadPerformed: false,
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
