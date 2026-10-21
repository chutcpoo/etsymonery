import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { etsyApiHeaders } from "./etsy";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "./etsy-readback-normalizer";
import { handleAuthorizedPublishOperation } from "./authorized-publish-api";
import { verifyBuildPrerequisites } from "./product-creation-plan";

const SHA = /^[a-f0-9]{64}$/;
const TOKEN_HEADER = "x-autodigitalpublisher-write-token";

type ReleaseRequest = {
  action: "PREFLIGHT" | "PUBLISH";
  operationId: string;
  productId: string;
  candidateId: string;
  candidateFingerprint: string;
  expectedListingFingerprint: string;
  shopId: number;
  draftListingId: number;
  expectedImageCount: number;
  expectedBuyerFileNames: string[];
  authorization?: Record<string, unknown>;
};
type ReleaseDeps = {
  fetchImpl?: typeof fetch;
  getAccessToken?: (scopes: readonly string[]) => Promise<string>;
  publish?: typeof handleAuthorizedPublishOperation;
  verifyBuild?: typeof verifyBuildPrerequisites;
};
function fail(code: string): never { throw new Error(code); }
function obj(value: unknown, code: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(code);
  return value as Record<string, unknown>;
}
function str(value: unknown, code: string) {
  if (typeof value !== "string" || !value.trim()) return fail(code);
  return value.normalize("NFC").trim();
}
function id(value: unknown, code: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return fail(code);
  return value;
}
function secureEqual(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function auth(request: Request) {
  const expected = process.env.ETSY_DRAFT_WRITE_TOKEN?.trim();
  if (!expected) return NextResponse.json({
    status: "BLOCKED", error: "OPERATOR_AUTH_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0
  }, { status: 503 });
  const supplied = request.headers.get(TOKEN_HEADER)?.trim() ?? "";
  if (!supplied || !secureEqual(supplied, expected)) return NextResponse.json({
    status: "BLOCKED", error: "OPERATOR_AUTH_REQUIRED", ETSY_WRITE_COUNT: 0
  }, { status: 401 });
  return null;
}
export function parseReleaseRequest(raw: unknown): ReleaseRequest {
  const x = obj(raw, "INVALID_RELEASE_BODY");
  const action = str(x.action, "INVALID_RELEASE_ACTION");
  if (action !== "PREFLIGHT" && action !== "PUBLISH") fail("INVALID_RELEASE_ACTION");
  const productId = str(x.productId, "INVALID_PRODUCT_ID");
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(productId)) fail("INVALID_PRODUCT_ID");
  const candidateFingerprint = str(x.candidateFingerprint, "INVALID_CANDIDATE_FINGERPRINT");
  const expectedListingFingerprint = str(x.expectedListingFingerprint, "INVALID_LISTING_FINGERPRINT");
  if (!SHA.test(candidateFingerprint) || !SHA.test(expectedListingFingerprint)) fail("INVALID_RELEASE_FINGERPRINT");
  if (!Array.isArray(x.expectedBuyerFileNames) || x.expectedBuyerFileNames.length < 1 ||
      x.expectedBuyerFileNames.length > 5 ||
      x.expectedBuyerFileNames.some(s => typeof s !== "string" || !s.trim() ||
        s.length > 150 || /[/\\\r\n]/.test(s))) fail("INVALID_EXPECTED_BUYER_FILES");
  const expectedBuyerFileNames = (x.expectedBuyerFileNames as string[]).map(x => x.normalize("NFC").trim()).sort();
  if (new Set(expectedBuyerFileNames).size !== expectedBuyerFileNames.length) fail("DUPLICATE_BUYER_FILENAMES");
  const expectedImageCount = id(x.expectedImageCount, "INVALID_EXPECTED_IMAGE_COUNT");
  if (expectedImageCount > 10) fail("INVALID_EXPECTED_IMAGE_COUNT");
  return {
    action, productId, candidateFingerprint, expectedListingFingerprint,
    candidateId: str(x.candidateId, "INVALID_CANDIDATE_ID"),
    operationId: str(x.operationId, "INVALID_OPERATION_ID"),
    shopId: id(x.shopId, "INVALID_SHOP_ID"),
    draftListingId: id(x.draftListingId, "INVALID_DRAFT_LISTING_ID"),
    expectedImageCount, expectedBuyerFileNames,
    ...(x.authorization !== undefined ? { authorization: obj(x.authorization, "INVALID_PUBLISH_AUTHORIZATION") } : {})
  };
}

type Inventory = {
  status: "READY";
  listingIdentity: "MATCH";
  imageCount: number;
  buyerFileNames: string[];
  assetSetSha256: string;
};
async function readJson(fetchImpl: typeof fetch, url: string, token: string) {
  const response = await fetchImpl(url, {
    method: "GET", headers: etsyApiHeaders(token), cache: "no-store"
  });
  if (!response.ok) fail(`ETSY_RELEASE_READBACK_HTTP_${response.status}`);
  return obj(await response.json(), "INVALID_ETSY_RELEASE_JSON");
}
function results(x: Record<string, unknown>) {
  if (!Array.isArray(x.results)) fail("INVALID_ETSY_ASSET_RESULTS");
  if (typeof x.count === "number" && x.count !== x.results.length) fail("ETSY_ASSET_RESULT_TRUNCATED");
  return x.results.map(r => obj(r, "INVALID_ETSY_ASSET_RESULT"));
}
export async function inspectEtsyDraftAssets(
  input: ReleaseRequest, token: string, fetchImpl: typeof fetch
): Promise<Inventory> {
  const root = "https://api.etsy.com/v3/application";
  const listing = await readJson(fetchImpl, `${root}/listings/${input.draftListingId}`, token);
  if (listing.state !== "draft" ||
      Number(listing.shop_id) !== input.shopId ||
      (listing.listing_type ?? listing.type) !== "download") {
    fail("ETSY_DRAFT_STATE_SHOP_OR_TYPE_MISMATCH");
  }
  const observation: EtsyReadBackObservation = {
    title: listing.title, description: listing.description,
    price: listing.price as EtsyReadBackObservation["price"],
    tags: listing.tags, quantity: listing.quantity,
    who_made: listing.who_made, when_made: listing.when_made,
    taxonomy_id: listing.taxonomy_id,
    type: listing.listing_type ?? listing.type, state: listing.state
  };
  if (verifyEtsyReadBackIdentity(input.expectedListingFingerprint, observation).status !== "MATCH") {
    fail("ETSY_RELEASE_LISTING_FINGERPRINT_MISMATCH");
  }
  const images = results(await readJson(fetchImpl,
    `${root}/listings/${input.draftListingId}/images`, token));
  const files = results(await readJson(fetchImpl,
    `${root}/shops/${input.shopId}/listings/${input.draftListingId}/files`, token));
  if (images.length !== input.expectedImageCount ||
      files.length !== input.expectedBuyerFileNames.length) fail("ETSY_RELEASE_ASSET_COUNT_MISMATCH");
  const fileNames = files.map(x => str(x.filename, "ETSY_FILE_NAME_MISSING")).sort();
  if (JSON.stringify(fileNames) !== JSON.stringify(input.expectedBuyerFileNames)) {
    fail("ETSY_RELEASE_BUYER_FILE_NAMES_MISMATCH");
  }
  const imageIds = images.map(x => id(x.listing_image_id, "ETSY_IMAGE_ID_MISSING")).sort((a,b)=>a-b);
  const fileIds = files.map(x => ({
    id: id(x.listing_file_id, "ETSY_FILE_ID_MISSING"),
    name: str(x.filename, "ETSY_FILE_NAME_MISSING")
  })).sort((a,b)=>a.id-b.id);
  if (new Set(imageIds).size !== imageIds.length ||
      new Set(fileIds.map(f=>f.id)).size !== fileIds.length) fail("ETSY_RELEASE_DUPLICATE_ASSET_ID");
  const assetSetSha256 = createHash("sha256")
    .update(JSON.stringify({
      shopId: input.shopId, draftListingId: input.draftListingId,
      imageIds, fileIds
    })).digest("hex");
  return {
    status: "READY", listingIdentity: "MATCH", imageCount: images.length,
    buyerFileNames: fileNames, assetSetSha256
  };
}

function exactApproval(input: ReleaseRequest, assetSetSha256: string) {
  if (process.env.PUBLISH_WRITES_ENABLED !== "true" ||
      process.env.ETSY_EXACT_PUBLISH_WRITES_ENABLED !== "true") return "PUBLISH_WRITES_DISABLED";
  if (process.env.ETSY_SHOP_ID !== String(input.shopId) ||
      process.env.ETSY_EXACT_PUBLISH_PRODUCT_ID !== input.productId ||
      process.env.ETSY_EXACT_PUBLISH_CANDIDATE_FINGERPRINT !== input.candidateFingerprint ||
      process.env.ETSY_EXACT_PUBLISH_DRAFT_ID !== String(input.draftListingId) ||
      process.env.ETSY_EXACT_PUBLISH_ASSET_SET_SHA256 !== assetSetSha256) {
    return "PUBLISH_EXACT_ASSET_APPROVAL_REQUIRED";
  }
  const authorization = obj(input.authorization, "PUBLISH_AUTHORIZATION_REQUIRED");
  const approval = obj(authorization.authorization, "PUBLISH_AUTHORIZATION_REQUIRED");
  if (approval.scope !== "PUBLISH" || approval.state !== "ACTIVE" ||
      typeof approval.authorizationId !== "string" ||
      process.env.ETSY_EXACT_PUBLISH_AUTHORIZATION_ID !== approval.authorizationId ||
      approval.candidateFingerprint !== input.candidateFingerprint ||
      approval.candidateId !== input.candidateId ||
      authorization.draftListingId !== String(input.draftListingId) ||
      authorization.shopId !== String(input.shopId)) {
    return "PUBLISH_EXACT_AUTHORIZATION_MISMATCH";
  }
  return null;
}

export function createEtsyReleaseCheckpointHandler(deps: ReleaseDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const tokenGetter = deps.getAccessToken ?? getValidEtsyAccessToken;
  const publish = deps.publish ?? handleAuthorizedPublishOperation;
  const verifyBuild = deps.verifyBuild ?? verifyBuildPrerequisites;
  return async (request: Request) => {
    const denied = auth(request);
    if (denied) return denied;
    let input: ReleaseRequest;
    try { input = parseReleaseRequest(await request.json()); }
    catch (error) {
      return NextResponse.json({
        status: "BLOCKED", error: error instanceof Error ? error.message : "INVALID_JSON",
        ETSY_WRITE_COUNT: 0
      }, { status: 400 });
    }
    if (input.action === "PUBLISH" &&
        (process.env.PUBLISH_WRITES_ENABLED !== "true" ||
         process.env.ETSY_EXACT_PUBLISH_WRITES_ENABLED !== "true")) {
      return NextResponse.json({
        status: "BLOCKED", error: "PUBLISH_WRITES_DISABLED", ETSY_WRITE_COUNT: 0
      }, { status: 403 });
    }
    try {
      const token = await tokenGetter(["listings_r", "listings_w"]);
      const assets = await inspectEtsyDraftAssets(input, token, fetchImpl);
      if (input.action === "PREFLIGHT") return NextResponse.json({
        status: "READY_FOR_SELLER_REVIEW", mode: "READ_ONLY",
        productId: input.productId, candidateId: input.candidateId,
        draftListingId: input.draftListingId,
        ...assets, publishAuthorized: false, ETSY_WRITE_COUNT: 0
      }, { headers: { "cache-control": "no-store" } });
      const block = exactApproval(input, assets.assetSetSha256);
      if (block) return NextResponse.json({
        status: "BLOCKED", error: block, ETSY_WRITE_COUNT: 0
      }, { status: 403 });
      const plan = await verifyBuild({productId:input.productId,builder:"ETSY_EXACT_PUBLISH"});
      if (!plan.allowed || plan.status !== "BUILD_PERMITTED") {
        return NextResponse.json({
          status: "BLOCKED", error: "APPROVED_PRODUCT_PLAN_REQUIRED", ETSY_WRITE_COUNT: 0
        }, { status: 409 });
      }
      // The existing exact authorization transaction consumes the grant and
      // verifies the published listing. Never call any generic state patch.
      return publish({
        operationId: input.operationId, candidateId: input.candidateId,
        candidateFingerprint: input.candidateFingerprint,
        expectedListingFingerprint: input.expectedListingFingerprint,
        shopId: String(input.shopId), draftListingId: String(input.draftListingId),
        channel: "etsy", authorization: input.authorization
      }, request);
    } catch (error) {
      return NextResponse.json({
        status: "BLOCKED", error: error instanceof Error ? error.message : "ETSY_RELEASE_PREFLIGHT_FAILED",
        ETSY_WRITE_COUNT: 0
      }, { status: 409 });
    }
  };
}
