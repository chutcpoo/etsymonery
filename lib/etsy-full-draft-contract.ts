/** Fail-closed request contract for the staged Etsy draft workflow. */
export type FullDraftAsset = {
  kind: "UPLOAD_IMAGE" | "UPLOAD_FILE";
  driveFileId: string; assetName: string; expectedSha256: string; expectedBytes: number; rank: number;
};
export type FullDraftAction =
  "PREFLIGHT" | "CREATE_DRAFT" | "UPLOAD_APPROVED_ASSETS" | "VERIFY_DRAFT_ASSETS";
export type FullDraftRequest = {
  action: FullDraftAction; operationId: string; shopId: number;
  productId: string; candidateId: string; candidateFingerprint: string;
  expectedListingFingerprint: string; listing: Record<string, unknown>;
  assets: FullDraftAsset[]; draftListingId?: number; manifestFingerprint?: string;
  qc: { state: "QC_PASSED"; productTruthVerified: true;
    testerFingerprint: string; independentFinalQcFingerprint: string };
};
export const FULL_DRAFT_MANIFEST_SCHEMA = "etsy-full-draft-manifest.v1";
const SHA = /^[0-9a-f]{64}$/;
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;
function fail(message: string): never { throw new Error(message); }
function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}
function text(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) fail(code);
  return value.normalize("NFC").trim();
}
function positive(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) fail(code);
  return value;
}
function assetName(value: unknown): string {
  const name = text(value, "INVALID_ASSET_NAME");
  if (name.length > 70 || name.startsWith(".") || /[. ]$/.test(name) ||
      /[\\/\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(name)) fail("INVALID_ASSET_NAME");
  return name;
}
export function parseFullDraftRequest(raw: unknown): FullDraftRequest {
  const input = object(raw, "INVALID_FULL_DRAFT_BODY");
  const action = input.action;
  if (action !== "PREFLIGHT" && action !== "CREATE_DRAFT" &&
      action !== "UPLOAD_APPROVED_ASSETS" && action !== "VERIFY_DRAFT_ASSETS") fail("INVALID_FULL_DRAFT_ACTION");
  const operationId = text(input.operationId, "INVALID_OPERATION_ID");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(operationId)) fail("INVALID_OPERATION_ID");
  const shopId = positive(input.shopId, "INVALID_SHOP_ID");
  const productId = text(input.productId, "INVALID_PRODUCT_ID");
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(productId)) fail("INVALID_PRODUCT_ID");
  const candidateId = text(input.candidateId, "INVALID_CANDIDATE_ID");
  if (candidateId.length > 150 || /[\u0000-\u001f\u007f]/u.test(candidateId)) fail("INVALID_CANDIDATE_ID");
  const candidateFingerprint = text(input.candidateFingerprint, "INVALID_CANDIDATE_FINGERPRINT");
  const expectedListingFingerprint = text(input.expectedListingFingerprint, "INVALID_LISTING_FINGERPRINT");
  if (!SHA.test(candidateFingerprint) || !SHA.test(expectedListingFingerprint)) fail("INVALID_FINGERPRINT");
  const listing = object(input.listing, "INVALID_LISTING");
  if (listing.type !== "download" || listing.state !== "draft") fail("DIGITAL_DRAFT_ONLY");
  const qc = object(input.qc, "QC_EVIDENCE_REQUIRED");
  if (qc.state !== "QC_PASSED" || qc.productTruthVerified !== true ||
      qc.testerFingerprint !== candidateFingerprint ||
      qc.independentFinalQcFingerprint !== candidateFingerprint) fail("QC_CURRENT_FINGERPRINT_NOT_PASSED");
  if (!Array.isArray(input.assets) || input.assets.length < 2 || input.assets.length > 15) fail("INVALID_ASSETS");
  const assets: FullDraftAsset[] = [];
  const ranks = new Set<string>(), ids = new Set<string>(), names = new Set<string>();
  let images = 0, files = 0;
  for (const value of input.assets) {
    const a = object(value, "INVALID_ASSET");
    const kind = a.kind;
    if (kind !== "UPLOAD_IMAGE" && kind !== "UPLOAD_FILE") fail("INVALID_ASSET_KIND");
    const driveFileId = text(a.driveFileId, "INVALID_DRIVE_FILE_ID");
    if (!DRIVE_ID.test(driveFileId) || ids.has(driveFileId)) fail("INVALID_OR_DUPLICATE_DRIVE_FILE_ID");
    ids.add(driveFileId);
    const name = assetName(a.assetName);
    if (names.has(name.toLowerCase())) fail("DUPLICATE_ASSET_NAME");
    names.add(name.toLowerCase());
    const expectedSha256 = text(a.expectedSha256, "INVALID_ASSET_SHA256");
    if (!SHA.test(expectedSha256)) fail("INVALID_ASSET_SHA256");
    const expectedBytes = positive(a.expectedBytes, "INVALID_ASSET_SIZE");
    const rank = positive(a.rank, "INVALID_ASSET_RANK");
    const key = kind + ":" + rank;
    if (ranks.has(key)) fail("DUPLICATE_ASSET_RANK");
    ranks.add(key);
    if (kind === "UPLOAD_IMAGE") {
      images++;
      if (rank > 10 || expectedBytes > 10 * 1024 * 1024 || !/\.(png|jpe?g)$/i.test(name)) fail("INVALID_IMAGE_ASSET");
    } else {
      files++;
      if (rank > 5 || expectedBytes > 20_000_000 || !/\.(pdf|zip)$/i.test(name)) fail("INVALID_BUYER_FILE");
    }
    assets.push({kind, driveFileId, assetName: name, expectedSha256, expectedBytes, rank});
  }
  if (!images || !files || images > 10 || files > 5) fail("IMAGES_AND_BUYER_FILES_REQUIRED");
  for (let i = 1; i <= images; i++) if (!ranks.has("UPLOAD_IMAGE:" + i)) fail("IMAGE_RANK_GAP");
  for (let i = 1; i <= files; i++) if (!ranks.has("UPLOAD_FILE:" + i)) fail("FILE_RANK_GAP");
  const needsId = action === "UPLOAD_APPROVED_ASSETS" || action === "VERIFY_DRAFT_ASSETS";
  const draftListingId = needsId ? positive(input.draftListingId, "DRAFT_ID_REQUIRED") : undefined;
  if (!needsId && input.draftListingId !== undefined) fail("DRAFT_ID_NOT_PERMITTED");
  const manifestFingerprint = input.manifestFingerprint === undefined
    ? undefined : text(input.manifestFingerprint, "INVALID_MANIFEST_SHA");
  if (manifestFingerprint !== undefined && !SHA.test(manifestFingerprint)) fail("INVALID_MANIFEST_SHA");
  if (action === "UPLOAD_APPROVED_ASSETS" && !manifestFingerprint) fail("MANIFEST_SHA_REQUIRED");
  return {
    action, operationId, shopId, productId, candidateId, candidateFingerprint,
    expectedListingFingerprint, listing, assets,
    ...(draftListingId ? {draftListingId} : {}),
    ...(manifestFingerprint ? {manifestFingerprint} : {}),
    qc: qc as FullDraftRequest["qc"]
  };
}
