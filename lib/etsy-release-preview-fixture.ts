import { createHash } from "node:crypto";
import { assertReleaseId, releaseFingerprints, type ProductManifest, type ReleaseAsset } from "./etsy-release-manifest";

export const PREVIEW_STUB_BRANCH = "feat/generic-etsy-release-engine";
export const PREVIEW_STUB_HEADER = "x-autodigitalpublisher-preview-stub";
export const PREVIEW_STUB_MARKER = "synthetic-fixture-only";
export const PREVIEW_STUB_RELEASE_ID = "preview-stub-smoke";
// Deliberately synthetic signature-only fixtures. Never buyer/product evidence.
export const PREVIEW_STUB_BYTES = {
  image: Buffer.from("89504e470d0a1a0a00000000", "hex"),
  file: Buffer.from("%PDF-synthetic-preview-fixture"),
  video: Buffer.from("000000146674797069736f6d00000000", "hex")
};
function asset(assetId: string, filename: string, mimeType: string, bytes: Buffer, altText?: string): ReleaseAsset {
  return { assetId, filename, mimeType, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), rank: 1, ...(altText ? { altText } : {}) };
}
export function createPreviewStubManifest(releaseId = PREVIEW_STUB_RELEASE_ID): ProductManifest {
  assertReleaseId(releaseId);
  if (releaseId !== PREVIEW_STUB_RELEASE_ID) throw new Error("PREVIEW_STUB_RELEASE_NOT_ALLOWED");
  const m: ProductManifest = { schemaVersion: "1.0.0", releaseId, productId: "SYNTHETIC-STUB-PRODUCT", candidateId: "SYNTHETIC-STUB-CANDIDATE",
    title: "Synthetic preview fixture", description: "Stub transport only. Not real product evidence.", price: 1, quantity: 1,
    taxonomyId: 123, tags: Array.from({ length: 13 }, (_, i) => `stub tag ${i}`), whoMade: "i_did", whenMade: "2020_2026", shop: { shopId: 77, userId: 88 },
    listingImages: [asset("stub-image", "stub.png", "image/png", PREVIEW_STUB_BYTES.image, "Synthetic preview fixture")],
    buyerFiles: [asset("stub-file", "stub.pdf", "application/pdf", PREVIEW_STUB_BYTES.file)],
    video: asset("stub-video", "stub.mp4", "video/mp4", PREVIEW_STUB_BYTES.video),
    productTruth: { verified: true, evidenceId: "SYNTHETIC-STUB-TRUTH" }, productionAuthorized: false,
    releaseLock: { locked: true, candidateFingerprint: "", expiresAt: "2099-01-01T00:00:00Z" },
    authoritativeCandidate: { candidateId: "SYNTHETIC-STUB-CANDIDATE", candidateFingerprint: "", listingFingerprint: "", evidenceId: "SYNTHETIC-STUB-BINDING" },
    testerPass: { pass: true, candidateFingerprint: "", evidenceId: "SYNTHETIC-STUB-TESTER" }, finalQcPass: { pass: true, candidateFingerprint: "", evidenceId: "SYNTHETIC-STUB-QC" }, protectedSellerState: [] };
  const fp = releaseFingerprints(m); Object.assign(m.authoritativeCandidate, fp);
  m.releaseLock.candidateFingerprint = fp.candidateFingerprint; m.testerPass.candidateFingerprint = fp.candidateFingerprint; m.finalQcPass.candidateFingerprint = fp.candidateFingerprint;
  return m;
}
export function previewStubForm() {
  const m = createPreviewStubManifest(), form = new FormData(); form.set("releaseId", m.releaseId);
  for (const [a, bytes] of [[m.listingImages[0], PREVIEW_STUB_BYTES.image], [m.buyerFiles[0], PREVIEW_STUB_BYTES.file], [m.video!, PREVIEW_STUB_BYTES.video]] as const)
    form.set(a.assetId, new File([new Uint8Array(bytes)], a.filename, { type: a.mimeType }));
  return form;
}
