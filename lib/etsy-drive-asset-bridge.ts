import { timingSafeEqual } from "node:crypto";
import { hasServerVerifiedQc } from "./etsy-server-qc-gate";
import { NextResponse } from "next/server";
import {
  fetchVerifiedGoogleDriveAsset,
  type DriveAssetSpec,
  type VerifiedDriveAsset
} from "./google-drive-asset-source";
import { createDraftAssetsPostHandler } from "./etsy-draft-assets-api";
import { verifyBuildPrerequisites } from "./product-creation-plan";

const SHA = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_-]{10,200}$/;
const WRITE_HEADER = "x-autodigitalpublisher-write-token";

export type DriveBridgeRequest = DriveAssetSpec & {
  action: "PREFLIGHT" | "UPLOAD";
  operationId: string;
  productId: string;
  candidateId: string;
  candidateFingerprint: string;
  expectedListingFingerprint: string;
  shopId: number;
  draftListingId: number;
  rank: number;
  qc: {
    productTruthVerified: boolean;
    testerFingerprint: string;
    independentFinalQcFingerprint: string;
    state: "QC_PASSED";
  };
};

type BridgeDependencies = {
  fetchAsset?: typeof fetchVerifiedGoogleDriveAsset;
  assetPostHandler?: (request: Request) => Promise<Response>;
  verifyBuild?: typeof verifyBuildPrerequisites;
};

function invalid(value: unknown, code: string): never {
  void value;
  throw new Error(code);
}
function nonempty(value: unknown, code: string) {
  if (typeof value !== "string" || !value.trim()) return invalid(value, code);
  return value.normalize("NFC").trim();
}
function positive(value: unknown, code: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    return invalid(value, code);
  }
  return value;
}
export function parseDriveBridgeRequest(raw: unknown): DriveBridgeRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("INVALID_DRIVE_BRIDGE_BODY");
  const x = raw as Record<string, unknown>;
  const action = nonempty(x.action, "INVALID_DRIVE_BRIDGE_ACTION");
  const kind = nonempty(x.kind, "INVALID_DRIVE_BRIDGE_KIND");
  if (action !== "PREFLIGHT" && action !== "UPLOAD") throw new Error("INVALID_DRIVE_BRIDGE_ACTION");
  if (kind !== "UPLOAD_FILE" && kind !== "UPLOAD_IMAGE") throw new Error("INVALID_DRIVE_BRIDGE_KIND");
  const candidateFingerprint = nonempty(x.candidateFingerprint, "INVALID_CANDIDATE_FINGERPRINT");
  const expectedListingFingerprint = nonempty(x.expectedListingFingerprint, "INVALID_LISTING_FINGERPRINT");
  const expectedSha256 = nonempty(x.expectedSha256, "INVALID_ASSET_SHA256");
  if (![candidateFingerprint, expectedListingFingerprint, expectedSha256].every(z => SHA.test(z))) {
    throw new Error("INVALID_DRIVE_BRIDGE_FINGERPRINT");
  }
  const qc = x.qc;
  if (!qc || typeof qc !== "object" || Array.isArray(qc)) {
    throw new Error("QC_EVIDENCE_REQUIRED");
  }
  const q = qc as Record<string, unknown>;
  const productId = nonempty(x.productId, "INVALID_PRODUCT_ID");
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(productId)) throw new Error("INVALID_PRODUCT_ID");
  const rank = positive(x.rank, "INVALID_ASSET_RANK");
  if (rank > (kind === "UPLOAD_IMAGE" ? 10 : 5)) throw new Error("INVALID_ASSET_RANK");
  return {
    action, kind,
    operationId: nonempty(x.operationId, "INVALID_OPERATION_ID"),
    productId,
    candidateId: nonempty(x.candidateId, "INVALID_CANDIDATE_ID"),
    candidateFingerprint,
    expectedListingFingerprint,
    driveFileId: nonempty(x.driveFileId, "INVALID_GOOGLE_DRIVE_FILE_ID"),
    assetName: nonempty(x.assetName, "INVALID_DRIVE_ASSET_NAME"),
    expectedSha256,
    expectedBytes: positive(x.expectedBytes, "INVALID_ASSET_SIZE"),
    shopId: positive(x.shopId, "INVALID_SHOP_ID"),
    draftListingId: positive(x.draftListingId, "INVALID_DRAFT_LISTING_ID"),
    rank,
    qc: {
      productTruthVerified: q.productTruthVerified === true,
      testerFingerprint: nonempty(q.testerFingerprint, "QC_TESTER_IDENTITY_REQUIRED"),
      independentFinalQcFingerprint: nonempty(q.independentFinalQcFingerprint, "QC_FINAL_IDENTITY_REQUIRED"),
      state: q.state === "QC_PASSED" ? "QC_PASSED" : invalid(q.state, "QC_NOT_PASSED")
    }
  };
}

function equal(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function authError(request: Request) {
  const expected = process.env.ETSY_DRAFT_WRITE_TOKEN?.trim();
  if (!expected) return NextResponse.json({
    status: "BLOCKED", error: "ETSY_DRAFT_WRITE_AUTH_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0
  }, { status: 503 });
  const actual = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!actual || !equal(expected, actual)) return NextResponse.json({
    status: "BLOCKED", error: "ETSY_BRIDGE_UNAUTHORIZED", ETSY_WRITE_COUNT: 0
  }, { status: 401 });
  return null;
}
function assertQc(input: DriveBridgeRequest) {
  if (!input.qc.productTruthVerified || input.qc.state !== "QC_PASSED" ||
      input.qc.testerFingerprint !== input.candidateFingerprint ||
      input.qc.independentFinalQcFingerprint !== input.candidateFingerprint) {
    throw new Error("QC_CURRENT_FINGERPRINT_NOT_PASSED");
  }
}
function writeApprovalGate(input: DriveBridgeRequest) {
  if (process.env.ETSY_DRIVE_ASSET_WRITES_ENABLED !== "true" ||
      process.env.ETSY_DRAFT_WRITES_ENABLED !== "true") return "ETSY_DRIVE_ASSET_WRITES_DISABLED";
  if (!hasServerVerifiedQc(input)) return "INDEPENDENT_QC_SERVER_APPROVAL_REQUIRED";
  if (process.env.ETSY_DRIVE_APPROVED_CANDIDATE_FINGERPRINT !== input.candidateFingerprint ||
      process.env.ETSY_DRIVE_APPROVED_DRAFT_LISTING_ID !== String(input.draftListingId) ||
      process.env.ETSY_DRIVE_APPROVED_PRODUCT_ID !== input.productId) {
    return "ETSY_DRIVE_EXACT_APPROVAL_REQUIRED";
  }
  if (process.env.ETSY_SHOP_ID !== String(input.shopId)) return "ETSY_SHOP_ID_MISMATCH";
  return null;
}

export function createEtsyDriveAssetBridgeHandler(deps: BridgeDependencies = {}) {
  const getAsset = deps.fetchAsset ?? fetchVerifiedGoogleDriveAsset;
  const assetHandler = deps.assetPostHandler ?? createDraftAssetsPostHandler();
  const verifyBuild = deps.verifyBuild ?? verifyBuildPrerequisites;

  return async (request: Request) => {
    const denied = authError(request);
    if (denied) return denied;
    let input: DriveBridgeRequest;
    try { input = parseDriveBridgeRequest(await request.json()); }
    catch (error) { return NextResponse.json({
      status: "BLOCKED",
      error: error instanceof Error ? error.message : "INVALID_JSON",
      ETSY_WRITE_COUNT: 0
    }, { status: 400 }); }

    // Upload cannot reach Google Drive, Etsy OAuth or any provider while locked.
    if (input.action === "UPLOAD") {
      const block = writeApprovalGate(input);
      if (block) return NextResponse.json({
        status: "BLOCKED", error: block, ETSY_WRITE_COUNT: 0
      }, { status: 403 });
      try {
        assertQc(input);
        const plan = await verifyBuild({
          productId: input.productId, builder: "ETSY_DRIVE_ASSET_BRIDGE"
        });
        if (!plan.allowed || plan.status === "LEGACY_EXEMPT") {
          return NextResponse.json({
            status: "BLOCKED", error: "EXPLICIT_APPROVED_PRODUCT_PLAN_REQUIRED",
            ETSY_WRITE_COUNT: 0
          }, { status: 409 });
        }
      } catch {
        return NextResponse.json({
          status: "BLOCKED", error: "QC_OR_PLAN_EVIDENCE_INVALID", ETSY_WRITE_COUNT: 0
        }, { status: 409 });
      }
    }
    let asset: VerifiedDriveAsset;
    try {
      asset = await getAsset({
        kind: input.kind, driveFileId: input.driveFileId,
        assetName: input.assetName, expectedSha256: input.expectedSha256,
        expectedBytes: input.expectedBytes
      });
      if (asset.sha256 !== input.expectedSha256 ||
          asset.sizeBytes !== input.expectedBytes ||
          asset.assetName !== input.assetName ||
          asset.driveFileId !== input.driveFileId) {
        throw new Error("DRIVE_ASSET_READBACK_IDENTITY_MISMATCH");
      }
    } catch (error) {
      const err = error instanceof Error ? error.message : "DRIVE_ASSET_VERIFICATION_FAILED";
      return NextResponse.json({
        status: "BLOCKED", error: err, ETSY_WRITE_COUNT: 0
      }, { status: err.includes("NOT_CONFIGURED") ? 503 : 409 });
    }
    const evidence = {
      productId: input.productId,
      candidateId: input.candidateId,
      candidateFingerprint: input.candidateFingerprint,
      driveFileId: asset.driveFileId,
      assetName: asset.assetName,
      sha256: asset.sha256,
      sizeBytes: asset.sizeBytes
    };
    if (input.action === "PREFLIGHT") {
      return NextResponse.json({
        status: "ASSET_VERIFIED",
        mode: "READ_ONLY",
        qcAssertionReceived: input.qc.state,
        finalQcIndependentlyVerified: false,
        action: "PREFLIGHT",
        ...evidence,
        publishAuthorized: false,
        ETSY_WRITE_COUNT: 0
      }, { headers: { "cache-control": "no-store" } });
    }
    const form = new FormData();
    const fields = {
      operationId: input.operationId, kind: input.kind,
      candidateId: input.candidateId, candidateFingerprint: input.candidateFingerprint,
      expectedListingFingerprint: input.expectedListingFingerprint,
      shopId: String(input.shopId), draftListingId: String(input.draftListingId),
      assetSha256: input.expectedSha256, assetName: input.assetName, rank: String(input.rank)
    };
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    const mime = input.kind === "UPLOAD_IMAGE"
      ? (input.assetName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg")
      : (input.assetName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/zip");
    form.set("asset", new Blob([new Uint8Array(asset.bytes)], { type: mime }), input.assetName);
    // Reuse the exact existing adapter: shop, draft state, fingerprint, idempotent
    // operation ledger and remote asset read-back all remain enforced there.
    const response = await assetHandler(new Request(request.url, {
      method: "POST",
      headers: { [WRITE_HEADER]: request.headers.get(WRITE_HEADER) ?? "" },
      body: form
    }));
    let result: Record<string, unknown>;
    try { result = await response.json() as Record<string, unknown>; }
    catch { return NextResponse.json({
      status: "RECONCILIATION_REQUIRED", error: "ASSET_UPLOAD_RESPONSE_INVALID",
      ...evidence, ETSY_WRITE_COUNT: "UNKNOWN"
    }, { status: 502 }); }
    return NextResponse.json({
      ...result, ...evidence, action: "UPLOAD",
      ETSY_WRITE_COUNT: response.ok
        ? result.status === "APPLIED" ? 1 : 0
        : "UNKNOWN",
      publishAuthorized: false
    }, { status: response.status, headers: { "cache-control": "no-store" } });
  };
}

export function getEtsyDriveBridgeStatus() {
  const writeGates = {
    draftWritesEnabled: process.env.ETSY_DRAFT_WRITES_ENABLED === "true",
    bridgeWritesEnabled: process.env.ETSY_DRIVE_ASSET_WRITES_ENABLED === "true",
    publishWritesEnabled: process.env.PUBLISH_WRITES_ENABLED === "true"
  };
  return {
    status: "CONFIGURATION_SNAPSHOT",
    mode: "READ_ONLY",
    source: "google-drive-service-account",
    driveServiceAccountConfigured: Boolean(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim()),
    driveCanonicalRootConfigured: Boolean(process.env.GOOGLE_DRIVE_SOURCE_ROOT_ID?.trim()),
    exactCandidateApprovalConfigured:
      Boolean(process.env.ETSY_DRIVE_APPROVED_CANDIDATE_FINGERPRINT?.trim()) &&
      Boolean(process.env.ETSY_DRIVE_APPROVED_DRAFT_LISTING_ID?.trim()) &&
      Boolean(process.env.ETSY_DRIVE_APPROVED_PRODUCT_ID?.trim()),
    writeGates,
    allWriteGatesClosed: Object.values(writeGates).every(value => !value),
    chatConnectorCredentialsReusedByServer: false,
    ETSY_WRITE_COUNT: 0
  };
}
