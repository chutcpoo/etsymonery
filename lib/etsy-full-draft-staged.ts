/** Staged Etsy draft orchestration: never publishes and never bypasses existing write gates. */
import { createHash } from "node:crypto";
import {
  parseFullDraftRequest, FULL_DRAFT_MANIFEST_SCHEMA,
  type FullDraftAsset, type FullDraftRequest
} from "./etsy-full-draft-contract";

export type FullDraftReadback = {
  listingId: number; shopId: number; listingState: string;
  listingIdentity: "MATCH" | "IDENTITY_MISMATCH";
  images: {rank: number; resourceId: string}[];
  buyerFiles: {rank: number; resourceId: string; filename: string; sizeBytes: number | null}[];
};
export type FullDraftStageDeps = {
  validateListing: (data: FullDraftRequest) => void;
  verifyDriveAsset: (asset: FullDraftAsset) => Promise<{
    sha256: string; sizeBytes: number; assetName: string; driveFileId: string
  }>;
  isManifestApproved: (fingerprint: string) => boolean;
  createDraft: (request: Request) => Promise<Response>;
  uploadAsset: (request: Request) => Promise<Response>;
  readBackAssets: (data: FullDraftRequest) => Promise<FullDraftReadback>;
};
const ALLOWED = new Set(["APPLIED", "REPLAY", "RECONCILED"]);
const HEADERS = {"cache-control": "no-store"};
function reply(data: Record<string, unknown>, status = 200) {
  return Response.json({...data, publishAuthorized: false, livePublishPerformed: false},
    {status, headers: HEADERS});
}
function post(parent: Request, data: unknown) {
  return new Request(parent.url, {method: "POST", headers: parent.headers, body: JSON.stringify(data)});
}
function sortedAssets(assets: FullDraftAsset[]) {
  return [...assets].sort((a, b) =>
    a.kind === b.kind ? a.rank - b.rank : a.kind === "UPLOAD_IMAGE" ? -1 : 1);
}
function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("PROVIDER_RESPONSE_INVALID");
  return input as Record<string, unknown>;
}
async function readResponse(response: Response) { return asRecord(await response.json()); }
function providerId(value: unknown): number | null {
  const n = typeof value === "number" ? value :
    typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
function receiptId(value: Record<string, unknown>, kind: string): number | null {
  const receipt = value.receipt;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return null;
  const r = receipt as Record<string, unknown>;
  return r.kind === kind ? providerId(r.providerResourceId) : null;
}
export function createFullDraftManifestFingerprint(data: FullDraftRequest): string {
  const identity = {
    schemaVersion: FULL_DRAFT_MANIFEST_SCHEMA,
    shopId: data.shopId, productId: data.productId,
    candidateId: data.candidateId, candidateFingerprint: data.candidateFingerprint,
    expectedListingFingerprint: data.expectedListingFingerprint,
    assets: sortedAssets(data.assets).map(a => ({
      kind: a.kind, rank: a.rank, driveFileId: a.driveFileId,
      assetName: a.assetName, expectedSha256: a.expectedSha256, expectedBytes: a.expectedBytes
    }))
  };
  return createHash("sha256").update(JSON.stringify(identity), "utf8").digest("hex");
}
export function createStagedFullDraftHandler(deps: FullDraftStageDeps) {
  return async (request: Request): Promise<Response> => {
    let data: FullDraftRequest;
    try {
      data = parseFullDraftRequest(await request.json());
      deps.validateListing(data); // Existing strict canonical metadata/fingerprint parser.
    } catch (e) {
      return reply({status: "BLOCKED", stage: "VALIDATION",
        error: e instanceof Error ? e.message : "INVALID_JSON", ETSY_WRITE_COUNT: 0}, 400);
    }
    const assets = sortedAssets(data.assets);
    const manifestFingerprint = createFullDraftManifestFingerprint(data);
    if (data.manifestFingerprint && data.manifestFingerprint !== manifestFingerprint) {
      return reply({status: "BLOCKED", stage: "MANIFEST", error: "MANIFEST_FINGERPRINT_MISMATCH",
        ETSY_WRITE_COUNT: 0}, 409);
    }
    if (data.action === "PREFLIGHT") {
      return reply({status: "PREFLIGHT_SHAPE_VALID", mode: "READ_ONLY", manifestFingerprint,
        imageCount: assets.filter(x => x.kind === "UPLOAD_IMAGE").length,
        fileCount: assets.filter(x => x.kind === "UPLOAD_FILE").length,
        driveFilesVerified: false, serverQcApproved: false, ETSY_WRITE_COUNT: 0,
        nextAction: "CREATE_DRAFT"});
    }
    if (data.action === "CREATE_DRAFT") {
      // Check every source byte/hash BEFORE attempting the first Etsy mutation.
      try {
        for (const asset of assets) {
          const seen = await deps.verifyDriveAsset(asset);
          if (seen.sha256 !== asset.expectedSha256 || seen.sizeBytes !== asset.expectedBytes ||
              seen.assetName !== asset.assetName || seen.driveFileId !== asset.driveFileId) {
            throw new Error("DRIVE_ASSET_IDENTITY_MISMATCH");
          }
        }
      } catch (e) {
        return reply({status: "BLOCKED", stage: "SOURCE_VERIFICATION",
          error: e instanceof Error ? e.message : "DRIVE_VERIFICATION_FAILED", ETSY_WRITE_COUNT: 0}, 409);
      }
      let response: Response, result: Record<string, unknown>;
      try {
        response = await deps.createDraft(post(request, {
          action: "CREATE_DRAFT", operationId: data.operationId + "-draft",
          shopId: data.shopId, productId: data.productId, candidateId: data.candidateId,
          candidateFingerprint: data.candidateFingerprint,
          expectedListingFingerprint: data.expectedListingFingerprint,
          listing: data.listing, qc: data.qc
        }));
        result = await readResponse(response);
      } catch {
        return reply({status: "RECONCILIATION_REQUIRED", stage: "DRAFT_CREATE",
          ETSY_WRITE_COUNT: "UNKNOWN"}, 409);
      }
      if (!response.ok || !ALLOWED.has(String(result.status))) {
        const ambiguous = result.status === "RECONCILIATION_REQUIRED" ||
          result.ETSY_WRITE_COUNT === "UNKNOWN" || response.status >= 500;
        return reply({status: ambiguous ? "RECONCILIATION_REQUIRED" : "BLOCKED",
          stage: "DRAFT_CREATE", error: result.error ?? "DRAFT_CREATE_FAILED",
          ETSY_WRITE_COUNT: ambiguous ? "UNKNOWN" : result.ETSY_WRITE_COUNT ?? 0},
          response.ok ? 409 : response.status);
      }
      const id = receiptId(result, "CREATE_DRAFT");
      if (!id || result.livePublishPerformed === true || result.publishAuthorized === true) {
        return reply({status: "RECONCILIATION_REQUIRED", stage: "DRAFT_CREATE",
          error: "DRAFT_RECEIPT_INVALID", ETSY_WRITE_COUNT: "UNKNOWN"}, 409);
      }
      return reply({status: "AWAITING_EXACT_DRAFT_APPROVAL", draftListingId: id,
        manifestFingerprint, ETSY_WRITE_COUNT: result.status === "APPLIED" ? 1 : 0,
        nextAction: "UPLOAD_APPROVED_ASSETS"});
    }
    const draftListingId = data.draftListingId!;
    if (data.action === "VERIFY_DRAFT_ASSETS") {
      try {
        const result = await deps.readBackAssets(data);
        const images = assets.filter(a => a.kind === "UPLOAD_IMAGE");
        const files = assets.filter(a => a.kind === "UPLOAD_FILE");
        const match = result.shopId === data.shopId && result.listingId === draftListingId &&
          result.listingState === "draft" && result.listingIdentity === "MATCH" &&
          result.images.length === images.length && result.buyerFiles.length === files.length &&
          images.every(a => result.images.some(x => x.rank === a.rank && providerId(x.resourceId))) &&
          files.every(a => result.buyerFiles.some(x => x.rank === a.rank && x.filename === a.assetName &&
            providerId(x.resourceId) && (x.sizeBytes === null || x.sizeBytes === a.expectedBytes)));
        if (!match) {
          return reply({status: "READBACK_MISMATCH", stage: "FINAL_READBACK",
            draftListingId, manifestFingerprint, ETSY_WRITE_COUNT: 0}, 409);
        }
        return reply({status: "READBACK_METADATA_MATCH", mode: "READ_ONLY",
          draftListingId, manifestFingerprint, imageCount: images.length,
          buyerFileCount: files.length,
          originalImageHashesVerifiedByEtsy: false,
          originalBuyerFileHashesVerifiedByEtsy: false,
          independentHumanFinalQcPassed: false,
          evidenceGaps: ["ETSY_IMAGE_ORIGINAL_SHA256_UNAVAILABLE",
            "ETSY_BUYER_FILE_ORIGINAL_SHA256_UNAVAILABLE",
            ...(result.buyerFiles.some(x => x.sizeBytes === null) ?
              ["ETSY_BUYER_FILE_SIZE_UNAVAILABLE"] : [])],
          ETSY_WRITE_COUNT: 0, nextAction: "INDEPENDENT_HUMAN_FINAL_QC"});
      } catch {
        return reply({status: "READBACK_BLOCKED", stage: "FINAL_READBACK",
          draftListingId, error: "ETSY_PROVIDER_READBACK_UNAVAILABLE", ETSY_WRITE_COUNT: 0}, 409);
      }
    }
    // Server pin is independently administered; the client may not approve its own asset inventory.
    if (!deps.isManifestApproved(manifestFingerprint)) {
      return reply({status: "BLOCKED", stage: "MANIFEST_APPROVAL",
        error: "SERVER_MANIFEST_APPROVAL_REQUIRED", draftListingId, ETSY_WRITE_COUNT: 0}, 403);
    }
    let writes = 0;
    const uploaded: {kind: string; rank: number; status: string}[] = [];
    for (const asset of assets) {
      let response: Response, result: Record<string, unknown>;
      try {
        response = await deps.uploadAsset(post(request, {
          action: "UPLOAD", operationId: data.operationId + "-" + asset.kind + "-" + asset.rank,
          productId: data.productId, candidateId: data.candidateId,
          candidateFingerprint: data.candidateFingerprint,
          expectedListingFingerprint: data.expectedListingFingerprint,
          shopId: data.shopId, draftListingId,
          rank: asset.rank, kind: asset.kind,
          driveFileId: asset.driveFileId, assetName: asset.assetName,
          expectedSha256: asset.expectedSha256, expectedBytes: asset.expectedBytes, qc: data.qc
        }));
        result = await readResponse(response);
      } catch {
        return reply({status: "RECONCILIATION_REQUIRED", stage: "ASSET_UPLOAD",
          failedAsset: {kind: asset.kind, rank: asset.rank}, uploadedSoFar: uploaded,
          draftListingId, ETSY_WRITE_COUNT: "UNKNOWN"}, 409);
      }
      if (!response.ok || !ALLOWED.has(String(result.status))) {
        const ambiguous = result.status === "RECONCILIATION_REQUIRED" ||
          result.ETSY_WRITE_COUNT === "UNKNOWN" || response.status >= 500;
        return reply({status: ambiguous ? "RECONCILIATION_REQUIRED" : "BLOCKED",
          stage: "ASSET_UPLOAD", failedAsset: {kind: asset.kind, rank: asset.rank},
          error: result.error ?? "ASSET_UPLOAD_FAILED", uploadedSoFar: uploaded,
          draftListingId, ETSY_WRITE_COUNT: ambiguous ? "UNKNOWN" : writes},
          response.ok ? 409 : response.status);
      }
      if (!receiptId(result, asset.kind) || result.listingIdentity !== "MATCH" ||
          result.assetReadBack !== "MATCH" ||
          result.draftListingId !== draftListingId ||
          result.assetSha256 !== asset.expectedSha256 ||
          result.assetName !== asset.assetName || result.rank !== asset.rank ||
          result.livePublishPerformed === true || result.publishAuthorized === true) {
        return reply({status: "RECONCILIATION_REQUIRED", stage: "ASSET_UPLOAD",
          error: "ASSET_RECEIPT_INCOMPLETE", failedAsset: {kind: asset.kind, rank: asset.rank},
          uploadedSoFar: uploaded, draftListingId, ETSY_WRITE_COUNT: "UNKNOWN"}, 409);
      }
      uploaded.push({kind: asset.kind, rank: asset.rank, status: String(result.status)});
      if (result.status === "APPLIED") writes++;
    }
    return reply({status: "ASSET_UPLOADS_REPORTED", draftListingId,
      manifestFingerprint, assetsReported: uploaded, independentReadBackVerified: false,
      ETSY_WRITE_COUNT: writes, nextAction: "VERIFY_DRAFT_ASSETS"});
  };
}
