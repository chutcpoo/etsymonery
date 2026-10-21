import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createDraftAssetsPostHandler } from "./etsy-draft-assets-api";
import { parseDriveBridgeRequest, type DriveBridgeRequest } from "./etsy-drive-asset-bridge";
import { hasServerVerifiedQc } from "./etsy-server-qc-gate";
import { buyerFilenameIssue } from "./etsy-digital-delivery-policy";
import { verifyBuildPrerequisites } from "./product-creation-plan";

const TOKEN_HEADER = "x-autodigitalpublisher-write-token";
// Vercel Functions have a bounded request body; never buffer unbounded media.
export const CHAT_ASSET_MAX_BYTES = 3 * 1024 * 1024;
export const CHAT_REQUEST_MAX_BYTES = 4 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{10,200}$/;
const SHA = /^[a-f0-9]{64}$/;

type IntakeDependencies = {
  assetPostHandler?: (request: Request) => Promise<Response>;
  verifyBuild?: typeof verifyBuildPrerequisites;
};
type AssetPin = Pick<DriveBridgeRequest,
  "driveFileId" | "assetName" | "expectedSha256" |
  "expectedBytes" | "kind" | "rank">;

function reply(status: number, error: string) {
  return NextResponse.json({
    status: "BLOCKED", error, publishAuthorized: false, ETSY_WRITE_COUNT: 0
  }, { status, headers: { "cache-control": "no-store" } });
}
function secureEqual(a: string, b: string) {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function operatorAuth(req: Request) {
  const actual = req.headers.get(TOKEN_HEADER)?.trim() ?? "";
  const expected = process.env.ETSY_DRAFT_WRITE_TOKEN?.trim();
  if (!expected) return reply(503, "ETSY_OPERATOR_TOKEN_NOT_CONFIGURED");
  if (!actual || !secureEqual(actual, expected)) return reply(401, "ETSY_OPERATOR_TOKEN_INVALID");
  return null;
}
export function validateChatSourceBytes(
  input: Pick<DriveBridgeRequest, "driveFileId" | "assetName" | "expectedSha256" | "expectedBytes" | "kind">,
  file: File, bytes: Uint8Array
) {
  if (!ID.test(input.driveFileId)) return "INVALID_ASSERTED_DRIVE_FILE_ID";
  if (!input.assetName || input.assetName.length > 150 ||
      input.assetName.includes("/") || input.assetName.includes("\\") ||
      /[\r\n]/.test(input.assetName)) return "INVALID_ASSET_NAME";
  if (file.name !== input.assetName) return "ASSET_FILENAME_MISMATCH";
  if (file.size !== input.expectedBytes) return "ASSET_SIZE_MISMATCH";
  if (file.size < 1 || file.size > CHAT_ASSET_MAX_BYTES) return "CHAT_ASSET_TOO_LARGE";
  if (!SHA.test(input.expectedSha256)) return "INVALID_ASSET_SHA";
  const lower = input.assetName.toLowerCase();
  if (input.kind === "UPLOAD_FILE") {
    const buyerNameIssue = buyerFilenameIssue(input.assetName);
    if (buyerNameIssue) return buyerNameIssue;
    if (lower.endsWith(".pdf")) {
      if (file.type !== "application/pdf" ||
          !Buffer.from(bytes.subarray(0, 5)).equals(Buffer.from("%PDF-"))) return "INVALID_PDF_BYTES_OR_TYPE";
    } else if (lower.endsWith(".zip")) {
      if (file.type !== "application/zip" ||
          bytes[0] !== 0x50 || bytes[1] !== 0x4b ||
          ![3,5,7].includes(bytes[2]) || ![4,6,8].includes(bytes[3])) return "INVALID_ZIP_BYTES_OR_TYPE";
    } else return "UNSUPPORTED_BUYER_FILE";
  } else if (input.kind === "UPLOAD_IMAGE") {
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
      if (file.type !== "image/jpeg" || bytes[0] !== 0xff || bytes[1] !== 0xd8) return "INVALID_JPG_BYTES_OR_TYPE";
    } else if (lower.endsWith(".png")) {
      const magic = Buffer.from([137,80,78,71,13,10,26,10]);
      if (file.type !== "image/png" ||
          !Buffer.from(bytes.subarray(0,8)).equals(magic)) return "INVALID_PNG_BYTES_OR_TYPE";
    } else return "UNSUPPORTED_LISTING_IMAGE";
  } else return "UNSUPPORTED_ASSET_KIND";
  if (createHash("sha256").update(bytes).digest("hex") !== input.expectedSha256) {
    return "CHAT_SOURCE_SHA256_MISMATCH";
  }
  return null;
}

function approvedAsset(input: DriveBridgeRequest) {
  const raw = process.env.ETSY_CHAT_APPROVED_ASSETS_JSON?.trim();
  if (!raw || raw.length > 32768) return false;
  let m: unknown;
  try { m = JSON.parse(raw); } catch { return false; }
  if (!m || typeof m !== "object" || Array.isArray(m)) return false;
  const manifest = m as Record<string, unknown>;
  if (!ID.test(String(manifest.rootId ?? "")) ||
      manifest.rootId !== process.env.GOOGLE_DRIVE_SOURCE_ROOT_ID ||
      manifest.productId !== input.productId ||
      manifest.candidateFingerprint !== input.candidateFingerprint ||
      manifest.expectedListingFingerprint !== input.expectedListingFingerprint ||
      !Array.isArray(manifest.assets) || manifest.assets.length < 1 ||
      manifest.assets.length > 15) return false;
  const matches = manifest.assets.filter((row): row is AssetPin => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const a = row as Record<string, unknown>;
    return a.driveFileId === input.driveFileId &&
      a.assetName === input.assetName &&
      a.expectedSha256 === input.expectedSha256 &&
      a.expectedBytes === input.expectedBytes &&
      a.kind === input.kind && a.rank === input.rank;
  });
  return matches.length === 1;
}
function uploadGate(input: DriveBridgeRequest) {
  if (process.env.ETSY_CHAT_ASSET_WRITES_ENABLED !== "true" ||
      process.env.ETSY_DRAFT_WRITES_ENABLED !== "true") return "ETSY_CHAT_ASSET_WRITES_DISABLED";
  if (process.env.ETSY_SHOP_ID !== String(input.shopId)) return "ETSY_SHOP_ID_MISMATCH";
  if (!hasServerVerifiedQc(input)) return "INDEPENDENT_QC_SERVER_APPROVAL_REQUIRED";
  if (process.env.ETSY_CHAT_APPROVED_PRODUCT_ID !== input.productId ||
      process.env.ETSY_CHAT_APPROVED_CANDIDATE_FINGERPRINT !== input.candidateFingerprint ||
      process.env.ETSY_CHAT_APPROVED_DRAFT_LISTING_ID !== String(input.draftListingId)) {
    return "ETSY_CHAT_EXACT_DRAFT_APPROVAL_REQUIRED";
  }
  if (!approvedAsset(input)) return "ETSY_CHAT_ASSET_NOT_IN_SERVER_APPROVED_MANIFEST";
  if (!input.qc.productTruthVerified ||
      input.qc.testerFingerprint !== input.candidateFingerprint ||
      input.qc.independentFinalQcFingerprint !== input.candidateFingerprint) {
    return "QC_EVIDENCE_MISMATCH";
  }
  return null;
}

export function createEtsyChatAssetHandler(deps: IntakeDependencies = {}) {
  const uploader = deps.assetPostHandler ?? createDraftAssetsPostHandler();
  const verifyBuild = deps.verifyBuild ?? verifyBuildPrerequisites;
  return async (request: Request): Promise<Response> => {
    const auth = operatorAuth(request);
    if (auth) return auth;
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > CHAT_REQUEST_MAX_BYTES)) {
      return reply(413, "CHAT_MULTIPART_BODY_TOO_LARGE");
    }
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) {
      return reply(415, "MULTIPART_REQUIRED");
    }
    let input: DriveBridgeRequest;
    let asset: File;
    try {
      const form = await request.formData();
      const metadata = form.get("manifest");
      const source = form.get("asset");
      if (typeof metadata !== "string" || metadata.length > 16000 ||
          !(source instanceof File)) return reply(400, "INVALID_CHAT_MULTIPART");
      input = parseDriveBridgeRequest(JSON.parse(metadata));
      asset = source;
    } catch { return reply(400, "INVALID_CHAT_MULTIPART_OR_MANIFEST"); }
    if (input.action === "UPLOAD") {
      const reason = uploadGate(input);
      if (reason) return reply(403, reason);
    }
    if (asset.size > CHAT_ASSET_MAX_BYTES) return reply(413, "CHAT_ASSET_TOO_LARGE");
    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await asset.arrayBuffer()); }
    catch { return reply(400, "CHAT_ASSET_READ_FAILED"); }
    const invalid = validateChatSourceBytes(input, asset, bytes);
    if (invalid) return reply(409, invalid);
    const evidence = {
      action: input.action, productId: input.productId,
      candidateId: input.candidateId, driveFileId: input.driveFileId,
      assetName: input.assetName, sha256: input.expectedSha256,
      sizeBytes: asset.size,
      sourceDriveIdVerifiedByServer: false,
      bytesVerifiedAgainstExpectedSha256: true
    };
    if (input.action === "PREFLIGHT") return NextResponse.json({
      status: "SOURCE_BYTES_VERIFIED", mode: "READ_ONLY",
      ...evidence, independentQcVerified: false, publishAuthorized: false,
      ETSY_WRITE_COUNT: 0
    }, { headers: { "cache-control": "no-store" } });
    try {
      const plan = await verifyBuild({productId:input.productId,builder:"ETSY_CHAT_DIRECT_ASSET"});
      if (!plan.allowed || plan.status !== "BUILD_PERMITTED") {
        return reply(409, "EXPLICIT_APPROVED_PRODUCT_PLAN_REQUIRED");
      }
    } catch { return reply(409, "APPROVED_PRODUCT_PLAN_UNAVAILABLE"); }
    const form = new FormData();
    const fields = {
      operationId: input.operationId, kind: input.kind,
      candidateId: input.candidateId, candidateFingerprint: input.candidateFingerprint,
      expectedListingFingerprint: input.expectedListingFingerprint,
      shopId: String(input.shopId), draftListingId: String(input.draftListingId),
      assetSha256: input.expectedSha256, assetName: input.assetName,
      rank: String(input.rank)
    };
    Object.entries(fields).forEach(([key, value]) => form.set(key, value));
    form.set("asset", new File([new Uint8Array(bytes)], input.assetName, { type: asset.type }), input.assetName);
    const response = await uploader(new Request(request.url, {
      method: "POST",
      headers: { [TOKEN_HEADER]: request.headers.get(TOKEN_HEADER) ?? "" },
      body: form
    }));
    let result: Record<string, unknown>;
    try { result = await response.json() as Record<string, unknown>; }
    catch { return NextResponse.json({
      status: "RECONCILIATION_REQUIRED", ...evidence,
      ETSY_WRITE_COUNT: "UNKNOWN", publishAuthorized: false
    }, { status: 502 }); }
    return NextResponse.json({
      ...result, ...evidence, publishAuthorized: false,
      ETSY_WRITE_COUNT: response.ok
        ? result.status === "APPLIED" ? 1 : 0 : "UNKNOWN"
    }, { status: response.status, headers: { "cache-control": "no-store" } });
  };
}

export function getChatAssetIntakeStatus() {
  return {
    status: "CONFIGURATION_SNAPSHOT",
    mode: "READ_ONLY",
    source: "chatgpt-drive-connector-file-handoff",
    googleServiceAccountRequired: false,
    maxFileBytes: CHAT_ASSET_MAX_BYTES,
    chatAssetWritesEnabled: process.env.ETSY_CHAT_ASSET_WRITES_ENABLED === "true",
    draftWritesEnabled: process.env.ETSY_DRAFT_WRITES_ENABLED === "true",
    exactApprovalConfigured: Boolean(
      process.env.ETSY_CHAT_APPROVED_PRODUCT_ID?.trim() &&
      process.env.ETSY_CHAT_APPROVED_DRAFT_LISTING_ID?.trim() &&
      process.env.ETSY_CHAT_APPROVED_CANDIDATE_FINGERPRINT?.trim()
    ),
    ETSY_WRITE_COUNT: 0
  };
}
