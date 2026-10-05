import { createCandidateFingerprint, createListingFingerprint } from "./candidate-fingerprint";
import { validateReleaseCandidateBinding } from "./authoritative-candidate-binding";
import { validateProductPack } from "./publisher";

export type ReleaseAsset = {
  assetId: string; filename: string; sha256: string; sizeBytes: number; mimeType: string; rank: number;
  altText?: string;
};
export type ProductManifest = {
  schemaVersion: "1.0.0"; releaseId: string; productId: string; candidateId: string;
  title: string; description: string; price: number; quantity: number; taxonomyId: number;
  tags: string[]; whoMade: "i_did" | "collective" | "someone_else"; whenMade: string;
  shop: { shopId: number; userId: number };
  listingImages: ReleaseAsset[]; buyerFiles: ReleaseAsset[]; video?: ReleaseAsset;
  productTruth: { verified: boolean; evidenceId: string };
  releaseLock: { locked: boolean; candidateFingerprint: string; expiresAt: string };
  authoritativeCandidate: { candidateId: string; candidateFingerprint: string; listingFingerprint: string; evidenceId: string };
  testerPass: { pass: boolean; candidateFingerprint: string; evidenceId: string };
  finalQcPass: { pass: boolean; candidateFingerprint: string; evidenceId: string };
  productionAuthorized: boolean;
  // Full protected listing + media identity, captured and approved outside this engine.
  protectedSellerState: Array<{ listingId: number; state: string; snapshotHash: string }>;
};
const SHA = /^[a-f0-9]{64}$/;
export function assertReleaseId(value: string) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) throw new Error("INVALID_RELEASE_ID");
  return value;
}
export function listingIdentity(m: ProductManifest) {
  return { title: m.title, description: m.description, priceUsd: m.price, quantity: m.quantity,
    taxonomy_id: m.taxonomyId, tags: m.tags, who_made: m.whoMade, when_made: m.whenMade, type: "download", state: "draft" };
}
export function candidatePayload(m: ProductManifest) {
  // Gate attestations cannot participate in the fingerprint they attest to.
  return { productId: m.productId, candidateId: m.candidateId, listing: listingIdentity(m), shop: m.shop,
    listingImages: m.listingImages, buyerFiles: m.buyerFiles, video: m.video ?? null,
    productTruth: m.productTruth, protectedSellerState: m.protectedSellerState };
}
export function releaseFingerprints(m: ProductManifest) {
  return { candidateFingerprint: createCandidateFingerprint(candidatePayload(m)), listingFingerprint: createListingFingerprint(listingIdentity(m)) };
}
function required(value: unknown, code: string) {
  if (typeof value !== "string" || !value.trim() || value !== value.normalize("NFC").trim()) throw new Error(code);
}
function positive(value: number, code: string) { if (!Number.isSafeInteger(value) || value < 1) throw new Error(code); }
function assets(items: ReleaseAsset[], max: number, kind: "image" | "file" | "video") {
  if (!Array.isArray(items) || items.length < 1 || items.length > max) throw new Error("INVALID_ASSET_COUNT");
  const names = new Set<string>(), ids = new Set<string>(), hashes = new Set<string>();
  items.forEach((a, i) => {
    required(a.assetId, "INVALID_ASSET_ID"); required(a.filename, "INVALID_ASSET_FILENAME");
    if (/[/\\\x00-\x1f]/.test(a.filename)) throw new Error("INVALID_ASSET_FILENAME");
    if (!SHA.test(a.sha256)) throw new Error("INVALID_ASSET_SHA256");
    positive(a.sizeBytes, "INVALID_ASSET_SIZE");
    if (a.rank !== i + 1) throw new Error("INVALID_ASSET_RANK");
    if (names.has(a.filename) || ids.has(a.assetId) || hashes.has(a.sha256)) throw new Error("DUPLICATE_ASSET_IDENTITY");
    names.add(a.filename); ids.add(a.assetId); hashes.add(a.sha256);
    required(a.mimeType, "INVALID_ASSET_MIME");
    if (kind === "image" && !["image/jpeg", "image/png"].includes(a.mimeType)) throw new Error("INVALID_IMAGE_MIME");
    if (kind === "image") required(a.altText, "INVALID_IMAGE_ALT_TEXT");
    if (kind === "image" && (!a.altText?.trim() || a.altText.length > 500)) throw new Error("INVALID_IMAGE_ALT_TEXT");
    if (kind === "file" && a.sizeBytes > 20 * 1024 * 1024) throw new Error("BUYER_FILE_TOO_LARGE");
    if (kind === "video" && (a.mimeType !== "video/mp4" || a.sizeBytes > 100 * 1024 * 1024)) throw new Error("INVALID_VIDEO_SIZE_OR_MIME");
  });
}
export function validateReleaseManifest(input: ProductManifest, now: string): ProductManifest {
  const m = structuredClone(input);
  if (m.schemaVersion !== "1.0.0") throw new Error("INVALID_RELEASE_SCHEMA");
  assertReleaseId(m.releaseId); required(m.productId, "INVALID_PRODUCT_ID"); required(m.candidateId, "INVALID_CANDIDATE_ID");
  required(m.title, "INVALID_TITLE"); required(m.description, "INVALID_DESCRIPTION"); required(m.whenMade, "INVALID_WHEN_MADE");
  if (!Array.isArray(m.tags) || m.tags.length !== 13) throw new Error("ETSY_TAG_COUNT_MUST_BE_13");
  for (const tag of m.tags) { required(tag, "INVALID_TAG"); if (/[,\x00-\x1f]/.test(tag)) throw new Error("INVALID_TAG"); }
  if (typeof m.price !== "number" || !Number.isFinite(m.price) || m.price !== Number(m.price.toFixed(2))) throw new Error("INVALID_PRICE");
  positive(m.shop.shopId, "INVALID_SHOP_ID"); positive(m.shop.userId, "INVALID_SHOP_USER_ID");
  if (typeof m.productionAuthorized !== "boolean") throw new Error("INVALID_PRODUCTION_AUTHORIZATION");
  const gate = validateProductPack({ productId: m.productId, title: m.title, description: m.description, priceUsd: m.price,
    tags: m.tags, files: m.buyerFiles.map(a => a.filename), channels: ["etsy"], productTruthVerified: m.productTruth.verified,
    etsy: { taxonomyId: m.taxonomyId, quantity: m.quantity, whoMade: m.whoMade, whenMade: m.whenMade,
      release: { productionBuildFrozen: m.releaseLock.locked, testerPass: m.testerPass.pass, finalQcPass: m.finalQcPass.pass, productionAuthorized: m.productionAuthorized } } });
  if (!gate.pass) throw new Error(gate.errors.join(","));
  assets(m.listingImages, 10, "image"); assets(m.buyerFiles, 5, "file"); if (m.video) assets([m.video], 1, "video");
  const all = [...m.listingImages, ...m.buyerFiles, ...(m.video ? [m.video] : [])];
  if (new Set(all.map(a => a.assetId)).size !== all.length) throw new Error("DUPLICATE_ASSET_ID");
  required(m.productTruth.evidenceId, "PRODUCT_TRUTH_EVIDENCE_REQUIRED");
  const fp = releaseFingerprints(m);
  const binding = validateReleaseCandidateBinding(m.authoritativeCandidate, { candidateId: m.candidateId, ...fp, testerPass: m.testerPass, finalQcPass: m.finalQcPass });
  if (!binding.pass) throw new Error(binding.errors.join(","));
  if (!m.releaseLock.locked || m.releaseLock.candidateFingerprint !== fp.candidateFingerprint ||
    !Number.isFinite(Date.parse(now)) || !Number.isFinite(Date.parse(m.releaseLock.expiresAt)) || Date.parse(now) >= Date.parse(m.releaseLock.expiresAt)) throw new Error("RELEASE_LOCK_INVALID");
  if (!Array.isArray(m.protectedSellerState)) throw new Error("PROTECTED_SELLER_STATE_REQUIRED");
  const protectedIds = new Set<number>();
  for (const row of m.protectedSellerState) {
    positive(row.listingId, "INVALID_PROTECTED_LISTING_ID");
    if (protectedIds.has(row.listingId) || !["active", "inactive", "sold_out", "draft", "expired"].includes(row.state) || !SHA.test(row.snapshotHash)) throw new Error("INVALID_PROTECTED_SELLER_STATE");
    protectedIds.add(row.listingId);
  }
  return m;
}
