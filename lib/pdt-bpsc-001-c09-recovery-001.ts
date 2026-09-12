import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { executeReconciledWrite, type ProviderReceipt } from "./draft-upload-reconciliation";
import { EtsyDraftAssetProvider, type EtsyDraftAssetPayload } from "./etsy-draft-asset-provider";
import { EtsyAuthorizedPublishProvider } from "./etsy-authorized-publish-provider";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "./etsy-readback-normalizer";
import { loadAuthorizedAsset } from "./authorized-operation-asset-store";
import {
  beginOperation,
  hashOperationRequest,
  NeonOperationLedgerRepository,
  recordOperationResult,
  type OperationLedgerRecord,
  type OperationLedgerRepository
} from "./operation-ledger";
import { createPublishAuthorization } from "./publish-authorization";
import { executeAuthorizedPublishTransaction } from "./authorized-publish-transaction";
import {
  PDT_BPSC_001_C09,
  PDT_BPSC_001_C09_ASSETS,
  PDT_BPSC_001_C09_LISTING_FINGERPRINT
} from "./pdt-bpsc-001-c09-new-listing";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;
const PARENT_OPERATION_ID = PDT_BPSC_001_C09.operationId;
const PARENT_CREATE_OPERATION_ID = `${PARENT_OPERATION_ID}:CREATE_DRAFT`;
const PARENT_CREATE_REQUEST_HASH = "31099794bf0c24917ec26ab806c10681153cbb1983bb7fb772a8301a1f28d887";
const DRAFT_LISTING_ID = "4573789186";

type Rec = Record<string, unknown>;
type Asset = (typeof PDT_BPSC_001_C09_ASSETS)[number];
type Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  loadAsset?: (asset: Asset) => Promise<Buffer>;
  now?: () => string;
};

type RecoveryState = {
  listing: Rec;
  images: Rec[];
  files: Rec[];
  actualListingFingerprint: string;
  parentCreate: OperationLedgerRecord;
};

export const PDT_BPSC_001_C09_RECOVERY_001 = Object.freeze({
  operation: "COMPLETE_EXISTING_DRAFT_ASSETS_AND_PUBLISH_EXACT_C09_ONLY",
  operationId: "PDT-BPSC-001-C09-RECOVERY-001",
  parentOperationId: PARENT_OPERATION_ID,
  parentCreateOperationId: PARENT_CREATE_OPERATION_ID,
  parentCreateRequestHash: PARENT_CREATE_REQUEST_HASH,
  draftListingId: DRAFT_LISTING_ID,
  productId: PDT_BPSC_001_C09.productId,
  productVersion: PDT_BPSC_001_C09.productVersion,
  shopId: PDT_BPSC_001_C09.shopId,
  candidateId: PDT_BPSC_001_C09.candidateId,
  candidateFingerprint: PDT_BPSC_001_C09.candidateFingerprint,
  buildId: PDT_BPSC_001_C09.buildId,
  buildFingerprint: PDT_BPSC_001_C09.buildFingerprint,
  acceptanceCriteriaId: PDT_BPSC_001_C09.acceptanceCriteriaId,
  acceptanceCriteriaSha256: PDT_BPSC_001_C09.acceptanceCriteriaSha256,
  packageId: PDT_BPSC_001_C09.packageId,
  packageFingerprint: PDT_BPSC_001_C09.packageFingerprint,
  listingFingerprint: PDT_BPSC_001_C09_LISTING_FINGERPRINT,
  expectedInitialGalleryCount: 0,
  expectedInitialBuyerFileCount: 0,
  expectedParentRecoveryPoint: "PROVIDER_READ_BACK",
  recoveryScope: "UPLOAD_EXACT_10_GALLERY_PLUS_5_BUYER_FILES_THEN_PUBLISH_EXISTING_DRAFT_ONLY"
} as const);

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; }
  catch { return {}; }
}

function results(value: unknown) {
  return isRec(value) && Array.isArray(value.results) ? value.results.filter(isRec) : null;
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validateWriteToken(request: Request) {
  const expected = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!expected) throw new Error("ETSY_C09_RECOVERY_WRITE_TOKEN_NOT_CONFIGURED");
  if (!supplied || !secureEqual(supplied, expected)) throw new Error("ETSY_C09_RECOVERY_UNAUTHORIZED");
}

function configuredForWrites() {
  return process.env.PUBLISH_WRITES_ENABLED === "true" && process.env.ETSY_DRAFT_WRITES_ENABLED === "true";
}

function observation(value: Rec): EtsyReadBackObservation {
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

async function fetchListing(fetchImpl: typeof fetch, token: string) {
  const response = await fetchImpl(`https://api.etsy.com/v3/application/listings/${DRAFT_LISTING_ID}`, {
    method: "GET",
    headers: etsyApiHeaders(token),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`ETSY_C09_RECOVERY_LISTING_READ_FAILED:${response.status}`);
  const value = await parseJson(response);
  if (!isRec(value)) throw new Error("ETSY_C09_RECOVERY_LISTING_READ_INVALID");
  return value;
}

async function fetchCollection(fetchImpl: typeof fetch, token: string, url: string, code: string) {
  const response = await fetchImpl(url, { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" });
  if (!response.ok) throw new Error(`${code}:${response.status}`);
  const list = results(await parseJson(response));
  if (!list) throw new Error(`${code}_INVALID`);
  return list;
}

function parentDownstreamOperationIds() {
  return [
    ...PDT_BPSC_001_C09_ASSETS.map((asset) => {
      const kind = asset.kind === "UPLOAD_IMAGE" ? "IMAGE" : "FILE";
      return `${PARENT_OPERATION_ID}:${kind}:${String(asset.rank).padStart(2, "0")}`;
    }),
    `${PARENT_OPERATION_ID}:PUBLISH`
  ];
}

async function parentLedgerMatches(repository: OperationLedgerRepository) {
  const parentCreate = await repository.load(PARENT_CREATE_OPERATION_ID);
  if (!parentCreate) return null;
  if (
    parentCreate.status !== "RECONCILIATION_REQUIRED" ||
    parentCreate.recoveryPoint !== PDT_BPSC_001_C09_RECOVERY_001.expectedParentRecoveryPoint ||
    parentCreate.requestHash !== PARENT_CREATE_REQUEST_HASH
  ) return null;
  const downstream = await Promise.all(parentDownstreamOperationIds().map((id) => repository.load(id)));
  if (downstream.some(Boolean)) return null;
  return parentCreate;
}

async function readRecoveryState(runtime: Runtime = {}): Promise<RecoveryState> {
  const fetchImpl = runtime.fetchImpl ?? fetch;
  const getAccessToken = runtime.getAccessToken ?? getValidEtsyAccessToken;
  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  if ((process.env.ETSY_SHOP_ID?.trim() ?? "") !== PDT_BPSC_001_C09.shopId) {
    throw new Error("ETSY_C09_RECOVERY_SHOP_ID_MISMATCH");
  }
  const parentCreate = await parentLedgerMatches(repository);
  if (!parentCreate) throw new Error("ETSY_C09_RECOVERY_PARENT_RECONCILIATION_MISMATCH");
  const token = await getAccessToken();
  const [listing, images, files] = await Promise.all([
    fetchListing(fetchImpl, token),
    fetchCollection(fetchImpl, token, `https://api.etsy.com/v3/application/listings/${DRAFT_LISTING_ID}/images`, "ETSY_C09_RECOVERY_IMAGES_READ_FAILED"),
    fetchCollection(fetchImpl, token, `https://api.etsy.com/v3/application/shops/${PDT_BPSC_001_C09.shopId}/listings/${DRAFT_LISTING_ID}/files`, "ETSY_C09_RECOVERY_FILES_READ_FAILED")
  ]);
  if (String(listing.listing_id) !== DRAFT_LISTING_ID || String(listing.shop_id) !== PDT_BPSC_001_C09.shopId) {
    throw new Error("ETSY_C09_RECOVERY_DRAFT_IDENTITY_MISMATCH");
  }
  if (listing.state !== "draft") throw new Error("ETSY_C09_RECOVERY_NOT_DRAFT");
  const identity = verifyEtsyReadBackIdentity(PDT_BPSC_001_C09_LISTING_FINGERPRINT, observation(listing));
  if (identity.status !== "MATCH") throw new Error("ETSY_C09_RECOVERY_CORE_METADATA_MISMATCH");
  return { listing, images, files, actualListingFingerprint: identity.actualFingerprint, parentCreate };
}

function protectedSnapshot(state: RecoveryState) {
  return {
    operationId: PDT_BPSC_001_C09_RECOVERY_001.operationId,
    parentOperationId: PARENT_OPERATION_ID,
    parentCreateOperationId: PARENT_CREATE_OPERATION_ID,
    parentCreateRequestHash: state.parentCreate.requestHash,
    parentCreateStatus: state.parentCreate.status,
    parentCreateRecoveryPoint: state.parentCreate.recoveryPoint,
    candidateId: PDT_BPSC_001_C09.candidateId,
    candidateFingerprint: PDT_BPSC_001_C09.candidateFingerprint,
    draftListingId: DRAFT_LISTING_ID,
    listingFingerprint: state.actualListingFingerprint,
    draftState: state.listing.state,
    galleryCount: state.images.length,
    buyerFileCount: state.files.length,
    parentDownstreamOperationCount: 0
  };
}

export async function verifyPdtBpsc001C09Recovery001ProtectedState(runtime: Runtime = {}) {
  try {
    const state = await readRecoveryState(runtime);
    const snapshot = protectedSnapshot(state);
    const fingerprint = hashOperationRequest(snapshot);
    const match =
      state.images.length === PDT_BPSC_001_C09_RECOVERY_001.expectedInitialGalleryCount &&
      state.files.length === PDT_BPSC_001_C09_RECOVERY_001.expectedInitialBuyerFileCount;
    return NextResponse.json({
      status: match ? "PROTECTED_STATE_MATCH" : "PROTECTED_STATE_MISMATCH",
      operationId: PDT_BPSC_001_C09_RECOVERY_001.operationId,
      parentOperationId: PARENT_OPERATION_ID,
      candidateId: PDT_BPSC_001_C09.candidateId,
      candidateFingerprint: PDT_BPSC_001_C09.candidateFingerprint,
      draftListingId: DRAFT_LISTING_ID,
      listingFingerprint: PDT_BPSC_001_C09_LISTING_FINGERPRINT,
      protectedStateFingerprint: fingerprint,
      galleryCount: state.images.length,
      buyerFileCount: state.files.length,
      recoveryScope: PDT_BPSC_001_C09_RECOVERY_001.recoveryScope,
      forbiddenMutation: "CREATE_DRAFT",
      ETSY_WRITE_COUNT: 0
    }, { status: match ? 200 : 409 });
  } catch (error) {
    return NextResponse.json({
      status: "PROTECTED_STATE_BLOCKED",
      error: error instanceof Error ? error.message : "UNKNOWN",
      operationId: PDT_BPSC_001_C09_RECOVERY_001.operationId,
      ETSY_WRITE_COUNT: 0
    }, { status: 409 });
  }
}

export function exactPdtBpsc001C09Recovery001Body(authorizationId: string, protectedStateFingerprint: string) {
  return {
    operation: PDT_BPSC_001_C09_RECOVERY_001.operation,
    operationId: PDT_BPSC_001_C09_RECOVERY_001.operationId,
    authorizationId: authorizationId.normalize("NFC").trim(),
    protectedStateFingerprint: protectedStateFingerprint.toLowerCase().trim(),
    parentOperationId: PARENT_OPERATION_ID,
    parentCreateOperationId: PARENT_CREATE_OPERATION_ID,
    parentCreateRequestHash: PARENT_CREATE_REQUEST_HASH,
    draftListingId: DRAFT_LISTING_ID,
    productId: PDT_BPSC_001_C09.productId,
    productVersion: PDT_BPSC_001_C09.productVersion,
    shopId: PDT_BPSC_001_C09.shopId,
    candidateId: PDT_BPSC_001_C09.candidateId,
    candidateFingerprint: PDT_BPSC_001_C09.candidateFingerprint,
    buildId: PDT_BPSC_001_C09.buildId,
    buildFingerprint: PDT_BPSC_001_C09.buildFingerprint,
    acceptanceCriteriaId: PDT_BPSC_001_C09.acceptanceCriteriaId,
    acceptanceCriteriaSha256: PDT_BPSC_001_C09.acceptanceCriteriaSha256,
    packageId: PDT_BPSC_001_C09.packageId,
    packageFingerprint: PDT_BPSC_001_C09.packageFingerprint,
    listingFingerprint: PDT_BPSC_001_C09_LISTING_FINGERPRINT,
    scope: PDT_BPSC_001_C09_RECOVERY_001.recoveryScope,
    gallerySha256: PDT_BPSC_001_C09.gallery.map((asset) => asset.sha256),
    buyerFileSha256: PDT_BPSC_001_C09.buyerFiles.map((asset) => asset.sha256)
  };
}

export function pdtBpsc001C09Recovery001AuthorizationRequestHash(authorizationId: string, protectedStateFingerprint: string) {
  return hashOperationRequest(exactPdtBpsc001C09Recovery001Body(authorizationId, protectedStateFingerprint));
}

async function preloadAssets(runtime: Runtime) {
  const load = runtime.loadAsset ?? (async (asset: Asset) => loadAuthorizedAsset(PARENT_OPERATION_ID, asset.sha256));
  const loaded = new Map<string, Buffer>();
  for (const asset of PDT_BPSC_001_C09_ASSETS) {
    const bytes = await load(asset);
    if (bytes.length !== asset.sizeBytes) throw new Error(`ETSY_C09_RECOVERY_ASSET_SIZE_MISMATCH:${asset.rank}:${asset.fileName}`);
    const actualSha = createHash("sha256").update(bytes).digest("hex");
    if (actualSha !== asset.sha256) throw new Error(`ETSY_C09_RECOVERY_ASSET_SHA256_MISMATCH:${asset.rank}:${asset.fileName}`);
    loaded.set(asset.sha256, bytes);
  }
  return loaded;
}

function childOperationId(asset: Asset) {
  const kind = asset.kind === "UPLOAD_IMAGE" ? "IMAGE" : "FILE";
  return `${PDT_BPSC_001_C09_RECOVERY_001.operationId}:${kind}:${String(asset.rank).padStart(2, "0")}`;
}

async function uploadAsset(
  asset: Asset,
  bytes: Buffer,
  token: string,
  repository: OperationLedgerRepository,
  now: string,
  fetchImpl: typeof fetch
) {
  const file = new File([new Uint8Array(bytes)], asset.fileName, { type: asset.mimeType });
  const payload: EtsyDraftAssetPayload = {
    operationKind: asset.kind,
    candidateId: PDT_BPSC_001_C09.candidateId,
    candidateFingerprint: PDT_BPSC_001_C09.candidateFingerprint,
    expectedListingFingerprint: PDT_BPSC_001_C09_LISTING_FINGERPRINT,
    shopId: Number(PDT_BPSC_001_C09.shopId),
    draftListingId: Number(DRAFT_LISTING_ID),
    assetSha256: asset.sha256,
    assetName: asset.fileName,
    rank: asset.rank
  };
  const provider = new EtsyDraftAssetProvider(token, payload, file, { fetchImpl });
  const before = await provider.readListing();
  const preIdentity = verifyEtsyReadBackIdentity(PDT_BPSC_001_C09_LISTING_FINGERPRINT, before.observation);
  if (before.observation.state !== "draft" || preIdentity.status !== "MATCH") throw new Error("ETSY_C09_RECOVERY_PRE_ASSET_IDENTITY_MISMATCH");
  const result = await executeReconciledWrite(repository, provider, {
    operationId: childOperationId(asset),
    kind: asset.kind,
    payload: { ...payload },
    now
  });
  if (result.status === "RECONCILIATION_REQUIRED") return { status: "RECONCILIATION_REQUIRED" as const };
  const receipt = result.receipt as ProviderReceipt;
  if (!(await provider.hasResource(receipt.providerResourceId))) throw new Error("ETSY_C09_RECOVERY_ASSET_READBACK_MISMATCH");
  return { status: "CONFIRMED" as const, receipt };
}

async function verifyAssetCompleteness(fetchImpl: typeof fetch, token: string) {
  const [images, files] = await Promise.all([
    fetchCollection(fetchImpl, token, `https://api.etsy.com/v3/application/listings/${DRAFT_LISTING_ID}/images`, "ETSY_C09_RECOVERY_IMAGES_READ_FAILED"),
    fetchCollection(fetchImpl, token, `https://api.etsy.com/v3/application/shops/${PDT_BPSC_001_C09.shopId}/listings/${DRAFT_LISTING_ID}/files`, "ETSY_C09_RECOVERY_FILES_READ_FAILED")
  ]);
  const imageRanks = images.map((item) => Number(item.rank)).sort((a, b) => a - b);
  if (images.length !== 10 || imageRanks.some((rank, index) => rank !== index + 1)) {
    throw new Error("ETSY_C09_RECOVERY_GALLERY_READBACK_MISMATCH");
  }
  const fileNames = files.map((item) => typeof item.filename === "string" ? item.filename.trim() : "");
  if (files.length !== 5 || PDT_BPSC_001_C09.buyerFiles.some((asset) => !fileNames.includes(asset.fileName))) {
    throw new Error("ETSY_C09_RECOVERY_BUYER_FILE_READBACK_MISMATCH");
  }
}

function requestErrorStatus(code: string) {
  if (code.includes("UNAUTHORIZED")) return 401;
  if (code.includes("NOT_CONFIGURED")) return 503;
  if (code.includes("RECONCILIATION_REQUIRED")) return 202;
  return 409;
}

export async function handlePdtBpsc001C09Recovery001(
  body: ReturnType<typeof exactPdtBpsc001C09Recovery001Body>,
  authorizationRequestHash: string,
  request: Request,
  runtime: Runtime = {}
) {
  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  const now = runtime.now?.() ?? new Date().toISOString();
  let topRecord: OperationLedgerRecord | null = null;
  try {
    validateWriteToken(request);
    if (!configuredForWrites()) throw new Error("ETSY_C09_RECOVERY_WRITES_DISABLED");
    if (!body.authorizationId) throw new Error("ETSY_C09_RECOVERY_AUTHORIZATION_ID_REQUIRED");
    if (!SHA256.test(body.protectedStateFingerprint)) throw new Error("ETSY_C09_RECOVERY_PROTECTED_STATE_FINGERPRINT_INVALID");
    if (!SHA256.test(authorizationRequestHash)) throw new Error("ETSY_C09_RECOVERY_AUTHORIZATION_REQUEST_HASH_INVALID");
    const computedRequestHash = hashOperationRequest(body);
    if (!secureEqual(computedRequestHash, authorizationRequestHash)) throw new Error("ETSY_C09_RECOVERY_AUTHORIZATION_REQUEST_HASH_MISMATCH");

    const preState = await readRecoveryState({ ...runtime, repository });
    const freshProtectedStateFingerprint = hashOperationRequest(protectedSnapshot(preState));
    if (!secureEqual(freshProtectedStateFingerprint, body.protectedStateFingerprint)) {
      throw new Error("ETSY_C09_RECOVERY_PROTECTED_STATE_DRIFT");
    }
    if (preState.images.length !== 0 || preState.files.length !== 0) throw new Error("ETSY_C09_RECOVERY_INITIAL_ASSET_STATE_MISMATCH");

    const loadedAssets = await preloadAssets(runtime);
    const begun = await beginOperation(repository, PDT_BPSC_001_C09_RECOVERY_001.operationId, body, now);
    topRecord = begun.record;
    if (begun.status === "REPLAY") {
      if (begun.record.status === "SUCCEEDED") {
        return NextResponse.json({ status: "REPLAY", operationId: begun.record.operationId, receipt: begun.record.receipt, ETSY_WRITE_COUNT: 0 });
      }
      return NextResponse.json({
        status: "BLOCKED_FAIL_CLOSED",
        error: "ETSY_C09_RECOVERY_ALREADY_CLAIMED_DO_NOT_RETRY",
        operationId: begun.record.operationId,
        ledgerStatus: begun.record.status,
        receipt: begun.record.receipt,
        ETSY_WRITE_COUNT: 0
      }, { status: begun.record.status === "RECONCILIATION_REQUIRED" ? 202 : 409 });
    }

    const fetchImpl = runtime.fetchImpl ?? fetch;
    const token = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
    let confirmedAssetWrites = 0;
    for (const asset of PDT_BPSC_001_C09_ASSETS) {
      const bytes = loadedAssets.get(asset.sha256);
      if (!bytes) throw new Error("ETSY_C09_RECOVERY_STAGED_ASSET_MISSING");
      const result = await uploadAsset(asset, bytes, token, repository, now, fetchImpl);
      if (result.status === "RECONCILIATION_REQUIRED") {
        await recordOperationResult(repository, PDT_BPSC_001_C09_RECOVERY_001.operationId, topRecord.requestHash, "RECONCILIATION_REQUIRED", now, {
          receipt: { ETSY_WRITE_COUNT_CONFIRMED_MINIMUM: confirmedAssetWrites },
          recoveryPoint: `ASSET_${asset.kind}_${asset.rank}_READ_BACK`
        });
        return NextResponse.json({ status: "RECONCILIATION_REQUIRED", operationId: PDT_BPSC_001_C09_RECOVERY_001.operationId, ETSY_WRITE_COUNT: confirmedAssetWrites }, { status: 202 });
      }
      confirmedAssetWrites += 1;
    }

    await verifyAssetCompleteness(fetchImpl, token);
    const grant = createPublishAuthorization({
      authorizationId: body.authorizationId,
      candidateId: PDT_BPSC_001_C09.candidateId,
      candidateFingerprint: PDT_BPSC_001_C09.candidateFingerprint,
      channel: "etsy",
      shopId: PDT_BPSC_001_C09.shopId,
      draftListingId: DRAFT_LISTING_ID,
      issuedAt: now
    });
    const publishProvider = new EtsyAuthorizedPublishProvider(PDT_BPSC_001_C09.shopId, { fetchImpl, getAccessToken: runtime.getAccessToken ?? getValidEtsyAccessToken });
    const publishResult = await executeAuthorizedPublishTransaction(repository, publishProvider, {
      operationId: `${PDT_BPSC_001_C09_RECOVERY_001.operationId}:PUBLISH`,
      authorization: grant,
      candidateId: PDT_BPSC_001_C09.candidateId,
      candidateFingerprint: PDT_BPSC_001_C09.candidateFingerprint,
      expectedListingFingerprint: PDT_BPSC_001_C09_LISTING_FINGERPRINT,
      shopId: PDT_BPSC_001_C09.shopId,
      draftListingId: DRAFT_LISTING_ID,
      channel: "etsy",
      now
    });
    if (publishResult.status === "RECONCILIATION_REQUIRED") {
      await recordOperationResult(repository, PDT_BPSC_001_C09_RECOVERY_001.operationId, topRecord.requestHash, "RECONCILIATION_REQUIRED", now, {
        receipt: { ETSY_WRITE_COUNT_CONFIRMED_MINIMUM: confirmedAssetWrites },
        recoveryPoint: "POST_PUBLISH_READ_BACK"
      });
      return NextResponse.json({ status: "RECONCILIATION_REQUIRED", operationId: PDT_BPSC_001_C09_RECOVERY_001.operationId, draftListingId: DRAFT_LISTING_ID, ETSY_WRITE_COUNT: confirmedAssetWrites }, { status: 202 });
    }
    if (publishResult.status === "IDENTITY_MISMATCH" || publishResult.status === "FAILED_REPLAY") {
      throw new Error("ETSY_C09_RECOVERY_PUBLISH_IDENTITY_OR_REPLAY_FAILURE");
    }

    const receipt = {
      draftListingId: DRAFT_LISTING_ID,
      finalState: "active",
      assetReceiptCount: PDT_BPSC_001_C09_ASSETS.length,
      authorizationId: body.authorizationId,
      candidateId: PDT_BPSC_001_C09.candidateId,
      candidateFingerprint: PDT_BPSC_001_C09.candidateFingerprint,
      listingFingerprint: PDT_BPSC_001_C09_LISTING_FINGERPRINT,
      protectedStateFingerprint: body.protectedStateFingerprint,
      authorizationRequestHash,
      ETSY_WRITE_COUNT: confirmedAssetWrites + 1
    };
    await recordOperationResult(repository, PDT_BPSC_001_C09_RECOVERY_001.operationId, topRecord.requestHash, "SUCCEEDED", now, { receipt });
    return NextResponse.json({ status: "PUBLISHED_AND_VERIFIED", operationId: PDT_BPSC_001_C09_RECOVERY_001.operationId, ...receipt });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (topRecord?.status === "PENDING") {
      try {
        await recordOperationResult(repository, PDT_BPSC_001_C09_RECOVERY_001.operationId, topRecord.requestHash, "FAILED", now, { recoveryPoint: code });
      } catch { /* fail closed; preserve original error */ }
    }
    return NextResponse.json({
      status: "BLOCKED_FAIL_CLOSED",
      error: code,
      operationId: PDT_BPSC_001_C09_RECOVERY_001.operationId,
      candidateId: PDT_BPSC_001_C09.candidateId,
      draftListingId: DRAFT_LISTING_ID,
      ETSY_WRITE_COUNT: 0
    }, { status: requestErrorStatus(code) });
  }
}
