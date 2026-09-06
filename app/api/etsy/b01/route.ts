import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../lib/etsy-auth";
import { verifyEtsyReadBackIdentity } from "../../../../lib/etsy-readback-normalizer";
import {
  beginOperation,
  NeonOperationLedgerRepository,
  recordOperationResult
} from "../../../../lib/operation-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = 23582741;
const LISTING_ID = 4560696421;
const BUILD_ID = "ETSY-RESET-V1-PDT-BOBA-001-BUILD-20260906-B01";
const BUILD_FREEZE_SHA256 = "9b9b0b070d01cb272bad5463dc91592cbd6304794c6ad125f0b9ddfce22d5038";
const ACCEPTANCE_CRITERIA_SHA256 = "2933a096363420086b941cd24dcf3d04285deaa0ffd40beffabcf4598233b66e";
const CANDIDATE_FINGERPRINT = "e478bf31dc1a4c92ed0be9318d076db047c17afbd38b58cad0e7f2557eb40041";
const WRITE_HEADER = "x-autodigitalpublisher-b01-token";

const GALLERY = {
  1: ["PDT-BOBA-001_RESET_V1_GALLERY_01.png", "608ae3875ee0a833a3ce311a8dbb234c76634ad85760c03a907985ae0748e5d5"],
  2: ["PDT-BOBA-001_RESET_V1_GALLERY_02.png", "bb50094ae1760d0520e03a7c7c3f385e191227bdd318c14028f87e5628466f6c"],
  3: ["PDT-BOBA-001_RESET_V1_GALLERY_03.png", "25459e39a12efa0fab9b17dcd0f6bfc813008f7d3b2c9bcce8073f1751f84be6"],
  4: ["PDT-BOBA-001_RESET_V1_GALLERY_04.png", "460e61139f6ae8c0109c28c888c9d0131d48625bb4eda75d373dbdb35c1503c6"],
  5: ["PDT-BOBA-001_RESET_V1_GALLERY_05.png", "2539da54698551b37c53ade4b87af7aeed617e43819ac378c6d081a7fa2fd496"],
  6: ["PDT-BOBA-001_RESET_V1_GALLERY_06.png", "bd333195cb2c9fa5cad966329c59115b5c64ba327219c8f2d7e0cd28e50e86da"],
  7: ["PDT-BOBA-001_RESET_V1_GALLERY_07.png", "1d688b51043f288d836eb95bd684c0083dd71e6751e3305d7f529d3704f2ee93"],
  8: ["PDT-BOBA-001_RESET_V1_GALLERY_08.png", "621959b4c7ebec997d4d7541a2caae3243a6c15916bf71fa8496c8e3d22fffde"],
  9: ["PDT-BOBA-001_RESET_V1_GALLERY_09.png", "806a8035d2e60b5cd232d0670b65eeb5e55c6f4450babb4fe10cf1e82cd962a7"],
  10: ["PDT-BOBA-001_RESET_V1_GALLERY_10.png", "fe9e6c202c96be7c67d41669bb1bec712a09c3e893cb203add25183094d4e845"]
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}

function toObservation(value: Record<string, unknown>) {
  return {
    title: value.title,
    description: value.description,
    price: value.price as { amount?: number; divisor?: number; currency_code?: string },
    tags: value.tags,
    quantity: value.quantity,
    who_made: value.who_made,
    when_made: value.when_made,
    taxonomy_id: value.taxonomy_id,
    type: value.listing_type ?? value.type ?? "download",
    state: "draft"
  };
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authError(request: Request) {
  const expected = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!expected) return NextResponse.json({ error: "ETSY_B01_WRITE_AUTH_NOT_CONFIGURED" }, { status: 503 });
  if (!supplied || !secureEqual(supplied, expected)) {
    return NextResponse.json({ error: "ETSY_B01_WRITE_UNAUTHORIZED" }, { status: 401 });
  }
  return null;
}

async function fetchListing(accessToken: string) {
  const response = await fetch(`https://api.etsy.com/v3/application/listings/${LISTING_ID}`, {
    method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store"
  });
  const value = await parseJson(response);
  if (!response.ok || !isRecord(value)) throw new Error(`ETSY_B01_READ_FAILED:${response.status}`);
  return value;
}

async function fetchImages(accessToken: string) {
  const response = await fetch(`https://api.etsy.com/v3/application/listings/${LISTING_ID}/images`, {
    method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store"
  });
  const value = await parseJson(response);
  if (!response.ok || !isRecord(value) || !Array.isArray(value.results)) {
    throw new Error(`ETSY_B01_IMAGE_READ_FAILED:${response.status}`);
  }
  return value.results.filter(isRecord);
}

function imageSummary(images: Record<string, unknown>[]) {
  return images.map((image) => ({
    listingImageId: image.listing_image_id,
    rank: image.rank,
    fullWidth: image.full_width,
    fullHeight: image.full_height,
    url: image.url_fullxfull
  }));
}

export async function GET() {
  try {
    const accessToken = await getValidEtsyAccessToken();
    const [listing, images] = await Promise.all([fetchListing(accessToken), fetchImages(accessToken)]);
    return NextResponse.json({
      status: "PASS",
      mode: "READ_ONLY",
      generatedAt: new Date().toISOString(),
      buildId: BUILD_ID,
      buildFreezeSha256: BUILD_FREEZE_SHA256,
      acceptanceCriteriaSha256: ACCEPTANCE_CRITERIA_SHA256,
      candidateFingerprint: CANDIDATE_FINGERPRINT,
      listing: {
        listingId: listing.listing_id,
        shopId: listing.shop_id,
        title: listing.title,
        description: listing.description,
        price: listing.price,
        tags: listing.tags,
        quantity: listing.quantity,
        whoMade: listing.who_made,
        whenMade: listing.when_made,
        taxonomyId: listing.taxonomy_id,
        type: listing.listing_type ?? listing.type ?? "download",
        state: listing.state
      },
      images: imageSummary(images)
    });
  } catch (error) {
    return NextResponse.json({ status: "BLOCKED", mode: "READ_ONLY", error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (process.env.PUBLISH_WRITES_ENABLED !== "true") {
    return NextResponse.json({ error: "ETSY_B01_WRITES_DISABLED" }, { status: 403 });
  }
  const authorization = authError(request);
  if (authorization) return authorization;

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "INVALID_MULTIPART_FORM_DATA" }, { status: 400 }); }

  const rankValue = form.get("rank");
  const expectedFingerprint = form.get("expectedListingFingerprint");
  const assetName = form.get("assetName");
  const assetSha256 = form.get("assetSha256");
  const asset = form.get("asset");
  const rank = typeof rankValue === "string" ? Number(rankValue) : NaN;
  if (!Number.isSafeInteger(rank) || rank < 1 || rank > 10 || !(rank in GALLERY)) {
    return NextResponse.json({ error: "INVALID_B01_IMAGE_RANK" }, { status: 400 });
  }
  if (typeof expectedFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(expectedFingerprint)) {
    return NextResponse.json({ error: "INVALID_EXPECTED_LISTING_FINGERPRINT" }, { status: 400 });
  }
  if (!(asset instanceof File) || typeof assetName !== "string" || typeof assetSha256 !== "string") {
    return NextResponse.json({ error: "INVALID_B01_IMAGE_PAYLOAD" }, { status: 400 });
  }
  const [expectedName, expectedSha] = GALLERY[rank as keyof typeof GALLERY];
  if (assetName !== expectedName || assetSha256 !== expectedSha) {
    return NextResponse.json({ error: "B01_IMAGE_IDENTITY_MISMATCH" }, { status: 409 });
  }
  const actualSha = createHash("sha256").update(Buffer.from(await asset.arrayBuffer())).digest("hex");
  if (actualSha !== expectedSha) {
    return NextResponse.json({ error: "B01_IMAGE_BYTES_MISMATCH", expectedSha256: expectedSha, actualSha256: actualSha }, { status: 409 });
  }

  const accessToken = await getValidEtsyAccessToken();
  const beforeListing = await fetchListing(accessToken);
  if (String(beforeListing.state ?? "").toLowerCase() !== "active") {
    return NextResponse.json({ error: "ETSY_TARGET_NOT_ACTIVE" }, { status: 409 });
  }
  const listingIdentity = verifyEtsyReadBackIdentity(expectedFingerprint, toObservation(beforeListing));
  if (listingIdentity.status !== "MATCH") {
    return NextResponse.json({ error: "ETSY_B01_LISTING_IDENTITY_MISMATCH", listingIdentity: listingIdentity.status }, { status: 409 });
  }

  const operationId = `B01-IMAGE-${String(rank).padStart(2, "0")}`;
  const operationPayload = {
    operation: "OVERWRITE_ACTIVE_LISTING_IMAGE",
    operationId,
    buildId: BUILD_ID,
    buildFreezeSha256: BUILD_FREEZE_SHA256,
    acceptanceCriteriaSha256: ACCEPTANCE_CRITERIA_SHA256,
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    shopId: String(SHOP_ID),
    listingId: String(LISTING_ID),
    expectedListingFingerprint: expectedFingerprint,
    assetName,
    assetSha256,
    rank
  };
  const ledger = new NeonOperationLedgerRepository();
  const now = new Date().toISOString();
  const begun = await beginOperation(ledger, operationId, operationPayload, now);
  if (begun.status === "REPLAY") {
    if (begun.record.status === "SUCCEEDED") {
      return NextResponse.json({ status: "REPLAY", operationId, requestHash: begun.record.requestHash, receipt: begun.record.receipt });
    }
    return NextResponse.json({ error: "B01_IMAGE_ALREADY_CLAIMED", operationId, requestHash: begun.record.requestHash, ledgerStatus: begun.record.status }, { status: 409 });
  }

  const beforeImages = await fetchImages(accessToken);
  const priorAtRank = beforeImages.find((image) => Number(image.rank) === rank);
  const priorImageId = priorAtRank?.listing_image_id ?? null;
  const body = new FormData();
  body.append("image", asset, assetName);
  body.append("rank", String(rank));
  body.append("overwrite", "true");

  let uploadResponse: Response;
  try {
    const headers = etsyApiHeaders(accessToken);
    delete headers["content-type"];
    uploadResponse = await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${LISTING_ID}/images`, {
      method: "POST", headers, body, cache: "no-store"
    });
  } catch {
    const afterImages = await fetchImages(accessToken).catch(() => [] as Record<string, unknown>[]);
    const afterAtRank = afterImages.find((image) => Number(image.rank) === rank);
    if (afterAtRank?.listing_image_id && afterAtRank.listing_image_id !== priorImageId) {
      const completed = await recordOperationResult(ledger, operationId, begun.record.requestHash, "SUCCEEDED", new Date().toISOString(), {
        receipt: { providerResourceId: String(afterAtRank.listing_image_id), rank, assetName, assetSha256, reconciled: true }
      });
      return NextResponse.json({ status: "RECONCILED", operationId, requestHash: completed.requestHash, receipt: completed.receipt });
    }
    const pending = await recordOperationResult(ledger, operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", new Date().toISOString(), { recoveryPoint: "IMAGE_UPLOAD_READBACK" });
    return NextResponse.json({ error: "B01_IMAGE_UPLOAD_AMBIGUOUS", operationId, requestHash: pending.requestHash, ledgerStatus: pending.status }, { status: 202 });
  }

  const uploadJson = await parseJson(uploadResponse);
  if (!uploadResponse.ok || !isRecord(uploadJson)) {
    const failed = await recordOperationResult(ledger, operationId, begun.record.requestHash, "FAILED", new Date().toISOString(), { recoveryPoint: "IMAGE_UPLOAD_REJECTED" });
    return NextResponse.json({ error: "B01_IMAGE_UPLOAD_REJECTED", statusCode: uploadResponse.status, operationId, requestHash: failed.requestHash, ledgerStatus: failed.status }, { status: 502 });
  }
  const uploadedImageId = uploadJson.listing_image_id;
  const afterImages = await fetchImages(accessToken);
  const afterAtRank = afterImages.find((image) => Number(image.rank) === rank);
  if (!uploadedImageId || String(afterAtRank?.listing_image_id ?? "") !== String(uploadedImageId)) {
    const pending = await recordOperationResult(ledger, operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", new Date().toISOString(), { recoveryPoint: "IMAGE_POSTREAD_MISMATCH" });
    return NextResponse.json({ error: "B01_IMAGE_POSTREAD_MISMATCH", operationId, requestHash: pending.requestHash, ledgerStatus: pending.status }, { status: 202 });
  }
  const completed = await recordOperationResult(ledger, operationId, begun.record.requestHash, "SUCCEEDED", new Date().toISOString(), {
    receipt: { providerResourceId: String(uploadedImageId), rank, assetName, assetSha256, overwrite: true }
  });
  return NextResponse.json({ status: "UPDATED_AND_VERIFIED", operationId, requestHash: completed.requestHash, receipt: completed.receipt });
}
