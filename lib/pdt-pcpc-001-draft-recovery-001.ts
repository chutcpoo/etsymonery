import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { fetchEtsyReadWithRetry } from "./etsy-http";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "./etsy-readback-normalizer";
import {
  hashOperationRequest,
  NeonOperationLedgerRepository,
  type OperationLedgerRepository
} from "./operation-ledger";
import {
  PDT_PCPC_001_G01_V01,
  PDT_PCPC_001_G01_V01_ASSETS,
  PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT
} from "./pdt-pcpc-001-g01-v01-new-listing";

export const PDT_PCPC_001_DRAFT_RECOVERY_001 = Object.freeze({
  operation: "RECOVER_EXISTING_DRAFT_EXACT_G01_V01_ONLY",
  operationId: "PDT-PCPC-001-G01-V01-DRAFT-RECOVERY-001",
  parentOperationId: PDT_PCPC_001_G01_V01.operationId,
  parentCreateOperationId: `${PDT_PCPC_001_G01_V01.operationId}:CREATE_DRAFT`,
  parentCreateRequestHash: "7795ba526b477051a2dc03266c05a2f73ce47c926c3b48392a925ebb64b989c6",
  draftListingId: "4574349198",
  expectedInitialGalleryCount: 0,
  expectedInitialBuyerFileCount: 0,
  expectedInitialVideoCount: 0,
  forbiddenMutation: "CREATE_DRAFT",
  recoveryScope: "UPLOAD_EXACT_15_GALLERY_PLUS_4_BUYER_FILES_PLUS_1_VIDEO_THEN_PUBLISH_EXISTING_DRAFT_ONLY"
} as const);

type Rec = Record<string, unknown>;
type Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
};

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseJson(response: Response, code: string) {
  const text = await response.text();
  if (!text) throw new Error(`${code}_EMPTY`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${code}_INVALID_JSON`);
  }
}

function results(value: unknown, code: string) {
  if (!isRec(value) || !Array.isArray(value.results)) throw new Error(`${code}_INVALID`);
  return value.results.filter(isRec);
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

function originalDownstreamOperationIds() {
  return [
    ...PDT_PCPC_001_G01_V01_ASSETS.map((asset) => {
      const kind = asset.kind === "UPLOAD_IMAGE" ? "IMAGE" : asset.kind === "UPLOAD_FILE" ? "FILE" : "VIDEO";
      return `${PDT_PCPC_001_G01_V01.operationId}:${kind}:${String(asset.rank).padStart(2, "0")}`;
    }),
    `${PDT_PCPC_001_G01_V01.operationId}:PUBLISH`
  ];
}

async function fetchRecord(
  fetchImpl: typeof fetch,
  token: string,
  url: string,
  code: string
) {
  const response = await fetchEtsyReadWithRetry(
    fetchImpl,
    url,
    { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" }
  );
  if (!response.ok) throw new Error(`${code}:${response.status}`);
  const value = await parseJson(response, code);
  if (!isRec(value)) throw new Error(`${code}_INVALID`);
  return value;
}

async function fetchResults(
  fetchImpl: typeof fetch,
  token: string,
  url: string,
  code: string
) {
  const response = await fetchEtsyReadWithRetry(
    fetchImpl,
    url,
    { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" }
  );
  if (!response.ok) throw new Error(`${code}:${response.status}`);
  return results(await parseJson(response, code), code);
}

export async function readPdtPcpc001DraftRecovery001State(runtime: Runtime = {}) {
  const fetchImpl = runtime.fetchImpl ?? fetch;
  const getAccessToken = runtime.getAccessToken ?? getValidEtsyAccessToken;
  const repository = runtime.repository ?? new NeonOperationLedgerRepository();

  const configuredShopId = process.env.ETSY_SHOP_ID?.trim() ?? "";
  if (configuredShopId !== PDT_PCPC_001_G01_V01.shopId) {
    throw new Error("PDT_PCPC_001_RECOVERY_SHOP_ID_MISMATCH");
  }

  const parentCreate = await repository.load(PDT_PCPC_001_DRAFT_RECOVERY_001.parentCreateOperationId);
  if (!parentCreate) throw new Error("PDT_PCPC_001_RECOVERY_PARENT_CREATE_MISSING");
  if (parentCreate.requestHash !== PDT_PCPC_001_DRAFT_RECOVERY_001.parentCreateRequestHash) {
    throw new Error("PDT_PCPC_001_RECOVERY_PARENT_REQUEST_HASH_MISMATCH");
  }
  if (parentCreate.status !== "SUCCEEDED") {
    throw new Error("PDT_PCPC_001_RECOVERY_PARENT_CREATE_NOT_RECONCILED");
  }
  const receipt = parentCreate.receipt;
  if (
    receipt?.kind !== "CREATE_DRAFT" ||
    receipt.providerResourceId !== PDT_PCPC_001_DRAFT_RECOVERY_001.draftListingId ||
    !isRec(receipt.metadata) ||
    receipt.metadata.readBack !== true
  ) {
    throw new Error("PDT_PCPC_001_RECOVERY_PARENT_RECEIPT_MISMATCH");
  }

  const downstreamIds = originalDownstreamOperationIds();
  const downstream = await Promise.all(downstreamIds.map((id) => repository.load(id)));
  const existingDownstreamOperationIds = downstreamIds.filter((_, index) => Boolean(downstream[index]));
  if (existingDownstreamOperationIds.length > 0) {
    throw new Error("PDT_PCPC_001_RECOVERY_PARENT_DOWNSTREAM_ALREADY_STARTED");
  }

  const token = await getAccessToken();
  const draftListingId = PDT_PCPC_001_DRAFT_RECOVERY_001.draftListingId;
  const shopId = PDT_PCPC_001_G01_V01.shopId;
  const [listing, images, files, videos] = await Promise.all([
    fetchRecord(
      fetchImpl,
      token,
      `https://api.etsy.com/v3/application/listings/${draftListingId}`,
      "PDT_PCPC_001_RECOVERY_LISTING_READ_FAILED"
    ),
    fetchResults(
      fetchImpl,
      token,
      `https://api.etsy.com/v3/application/listings/${draftListingId}/images`,
      "PDT_PCPC_001_RECOVERY_IMAGES_READ_FAILED"
    ),
    fetchResults(
      fetchImpl,
      token,
      `https://api.etsy.com/v3/application/shops/${shopId}/listings/${draftListingId}/files`,
      "PDT_PCPC_001_RECOVERY_FILES_READ_FAILED"
    ),
    fetchResults(
      fetchImpl,
      token,
      `https://api.etsy.com/v3/application/listings/${draftListingId}/videos`,
      "PDT_PCPC_001_RECOVERY_VIDEOS_READ_FAILED"
    )
  ]);

  if (String(listing.listing_id) !== draftListingId || String(listing.shop_id) !== shopId) {
    throw new Error("PDT_PCPC_001_RECOVERY_DRAFT_IDENTITY_MISMATCH");
  }
  if (listing.state !== "draft") throw new Error("PDT_PCPC_001_RECOVERY_NOT_DRAFT");

  const identity = verifyEtsyReadBackIdentity(
    PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT,
    observation(listing)
  );
  if (identity.status !== "MATCH") {
    throw new Error("PDT_PCPC_001_RECOVERY_CORE_METADATA_MISMATCH");
  }

  if (
    images.length !== PDT_PCPC_001_DRAFT_RECOVERY_001.expectedInitialGalleryCount ||
    files.length !== PDT_PCPC_001_DRAFT_RECOVERY_001.expectedInitialBuyerFileCount ||
    videos.length !== PDT_PCPC_001_DRAFT_RECOVERY_001.expectedInitialVideoCount
  ) {
    throw new Error("PDT_PCPC_001_RECOVERY_INITIAL_ASSET_STATE_MISMATCH");
  }

  return {
    listing,
    identity,
    parentCreate,
    existingDownstreamOperationIds,
    galleryCount: images.length,
    buyerFileCount: files.length,
    videoCount: videos.length
  };
}

export function pdtPcpc001DraftRecovery001ProtectedSnapshot(input: Awaited<ReturnType<typeof readPdtPcpc001DraftRecovery001State>>) {
  return {
    recoveryOperationId: PDT_PCPC_001_DRAFT_RECOVERY_001.operationId,
    parentOperationId: PDT_PCPC_001_DRAFT_RECOVERY_001.parentOperationId,
    parentCreateOperationId: PDT_PCPC_001_DRAFT_RECOVERY_001.parentCreateOperationId,
    parentCreateRequestHash: input.parentCreate.requestHash,
    parentCreateStatus: input.parentCreate.status,
    parentProviderResourceId: input.parentCreate.receipt?.providerResourceId,
    draftListingId: PDT_PCPC_001_DRAFT_RECOVERY_001.draftListingId,
    shopId: PDT_PCPC_001_G01_V01.shopId,
    productId: PDT_PCPC_001_G01_V01.productId,
    productVersion: PDT_PCPC_001_G01_V01.productVersion,
    operationFingerprint: PDT_PCPC_001_G01_V01.operationFingerprint,
    parentBuildId: PDT_PCPC_001_G01_V01.parentBuildId,
    parentBuildFingerprint: PDT_PCPC_001_G01_V01.parentBuildFingerprint,
    galleryCandidateId: PDT_PCPC_001_G01_V01.galleryCandidateId,
    galleryCandidateFingerprint: PDT_PCPC_001_G01_V01.galleryCandidateFingerprint,
    videoCandidateId: PDT_PCPC_001_G01_V01.videoCandidateId,
    videoCandidateFingerprint: PDT_PCPC_001_G01_V01.videoCandidateFingerprint,
    acceptanceCriteriaId: PDT_PCPC_001_G01_V01.acceptanceCriteriaId,
    acceptanceCriteriaSha256: PDT_PCPC_001_G01_V01.acceptanceCriteriaSha256,
    listingFingerprint: input.identity.actualFingerprint,
    draftState: input.listing.state,
    galleryCount: input.galleryCount,
    buyerFileCount: input.buyerFileCount,
    videoCount: input.videoCount,
    parentDownstreamOperationCount: input.existingDownstreamOperationIds.length,
    recoveryScope: PDT_PCPC_001_DRAFT_RECOVERY_001.recoveryScope,
    forbiddenMutation: PDT_PCPC_001_DRAFT_RECOVERY_001.forbiddenMutation
  };
}

export async function verifyPdtPcpc001DraftRecovery001ProtectedState(runtime: Runtime = {}) {
  try {
    const state = await readPdtPcpc001DraftRecovery001State(runtime);
    const snapshot = pdtPcpc001DraftRecovery001ProtectedSnapshot(state);
    const protectedStateFingerprint = hashOperationRequest(snapshot);
    return NextResponse.json({
      status: "PROTECTED_STATE_MATCH",
      mode: "READ_ONLY",
      ETSY_WRITE_COUNT: 0,
      recoveryOperationId: PDT_PCPC_001_DRAFT_RECOVERY_001.operationId,
      parentOperationId: PDT_PCPC_001_DRAFT_RECOVERY_001.parentOperationId,
      parentCreateOperationId: PDT_PCPC_001_DRAFT_RECOVERY_001.parentCreateOperationId,
      draftListingId: PDT_PCPC_001_DRAFT_RECOVERY_001.draftListingId,
      productId: PDT_PCPC_001_G01_V01.productId,
      productVersion: PDT_PCPC_001_G01_V01.productVersion,
      operationFingerprint: PDT_PCPC_001_G01_V01.operationFingerprint,
      parentBuildId: PDT_PCPC_001_G01_V01.parentBuildId,
      parentBuildFingerprint: PDT_PCPC_001_G01_V01.parentBuildFingerprint,
      galleryCandidateId: PDT_PCPC_001_G01_V01.galleryCandidateId,
      galleryCandidateFingerprint: PDT_PCPC_001_G01_V01.galleryCandidateFingerprint,
      videoCandidateId: PDT_PCPC_001_G01_V01.videoCandidateId,
      videoCandidateFingerprint: PDT_PCPC_001_G01_V01.videoCandidateFingerprint,
      acceptanceCriteriaId: PDT_PCPC_001_G01_V01.acceptanceCriteriaId,
      acceptanceCriteriaSha256: PDT_PCPC_001_G01_V01.acceptanceCriteriaSha256,
      listingFingerprint: PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT,
      protectedStateFingerprint,
      galleryCount: state.galleryCount,
      buyerFileCount: state.buyerFileCount,
      videoCount: state.videoCount,
      parentDownstreamOperationCount: state.existingDownstreamOperationIds.length,
      recoveryScope: PDT_PCPC_001_DRAFT_RECOVERY_001.recoveryScope,
      forbiddenMutation: PDT_PCPC_001_DRAFT_RECOVERY_001.forbiddenMutation
    }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      status: "PROTECTED_STATE_BLOCKED",
      mode: "READ_ONLY",
      ETSY_WRITE_COUNT: 0,
      recoveryOperationId: PDT_PCPC_001_DRAFT_RECOVERY_001.operationId,
      draftListingId: PDT_PCPC_001_DRAFT_RECOVERY_001.draftListingId,
      error: error instanceof Error ? error.message : "UNKNOWN"
    }, { status: 409, headers: { "cache-control": "no-store" } });
  }
}
