import assert from "node:assert/strict";
import test from "node:test";
import { parseFullDraftRequest, type FullDraftRequest } from "../lib/etsy-full-draft-contract";
import {
  createStagedFullDraftHandler, createFullDraftManifestFingerprint, type FullDraftStageDeps
} from "../lib/etsy-full-draft-staged";

const hashA = "a".repeat(64), hashB = "b".repeat(64), hashC = "c".repeat(64);
function sample(action: FullDraftRequest["action"] = "PREFLIGHT"): FullDraftRequest {
  const data = {
    action, operationId: "review_0001", shopId: 23582741, productId: "P01",
    candidateId: "candidate-v1", candidateFingerprint: hashA, expectedListingFingerprint: hashB,
    listing: {title: "Example", type: "download", state: "draft"},
    qc: {state: "QC_PASSED", productTruthVerified: true,
      testerFingerprint: hashA, independentFinalQcFingerprint: hashA},
    assets: [
      {kind: "UPLOAD_IMAGE", rank: 1, driveFileId: "driveImage1111",
        assetName: "hero.jpg", expectedSha256: hashC, expectedBytes: 100},
      {kind: "UPLOAD_FILE", rank: 1, driveFileId: "driveBuyer1111",
        assetName: "product.zip", expectedSha256: hashC, expectedBytes: 200}
    ]
  } as unknown as FullDraftRequest;
  if (action === "UPLOAD_APPROVED_ASSETS" || action === "VERIFY_DRAFT_ASSETS") data.draftListingId = 111;
  if (action === "UPLOAD_APPROVED_ASSETS") data.manifestFingerprint = createFullDraftManifestFingerprint(data);
  return data;
}
function harness(overrides: Partial<FullDraftStageDeps> = {}) {
  const calls: string[] = [];
  const dependencies: FullDraftStageDeps = {
    validateListing: () => {},
    verifyDriveAsset: async asset => ({sha256: asset.expectedSha256,
      sizeBytes: asset.expectedBytes, driveFileId: asset.driveFileId, assetName: asset.assetName}),
    isManifestApproved: () => true,
    createDraft: async () => {
      calls.push("draft");
      return Response.json({status: "APPLIED", receipt: {providerResourceId: "111", kind: "CREATE_DRAFT"}});
    },
    uploadAsset: async request => {
      const value = await request.json() as {kind: string; rank: number;
        draftListingId: number; expectedSha256: string; assetName: string};
      calls.push(value.kind);
      return Response.json({status: "APPLIED",
        receipt: {providerResourceId: "222", kind: value.kind},
        listingIdentity: "MATCH", assetReadBack: "MATCH",
        draftListingId: value.draftListingId, assetSha256: value.expectedSha256,
        assetName: value.assetName, rank: value.rank});
    },
    readBackAssets: async data => ({
      listingId: data.draftListingId!, shopId: data.shopId,
      listingState: "draft" as const, listingIdentity: "MATCH" as const,
      images: [{rank: 1, resourceId: "222"}],
      buyerFiles: [{rank: 1, resourceId: "223", filename: "product.zip", sizeBytes: 200}]
    }),
    ...overrides
  };
  const run = async (data: unknown) => {
    const request = new Request("https://example.test/api/etsy/full-draft", {
      method: "POST", body: JSON.stringify(data)
    });
    const response = await createStagedFullDraftHandler(dependencies)(request);
    return {code: response.status, body: await response.json() as Record<string, unknown>};
  };
  return {run, calls};
}
test("preflight is read-only, with no falsely verified sources", async () => {
  const t = harness();
  const x = await t.run(sample());
  assert.equal(x.code, 200);
  assert.equal(x.body.status, "PREFLIGHT_SHAPE_VALID");
  assert.equal(x.body.driveFilesVerified, false);
  assert.equal(x.body.ETSY_WRITE_COUNT, 0);
  assert.deepEqual(t.calls, []);
});
test("contract refuses incomplete assets and tampered fingerprints", () => {
  const value = sample();
  assert.throws(() => parseFullDraftRequest({...value, assets: [value.assets[0]]}));
  assert.throws(() => parseFullDraftRequest({...value, qc: {...value.qc, testerFingerprint: hashB}}));
  assert.throws(() => parseFullDraftRequest({...value, draftListingId: 123}));
  assert.throws(() => parseFullDraftRequest({...value, assets: [
    {...value.assets[0], expectedBytes: 15_000_000}, value.assets[1]
  ]}));
  assert.throws(() => parseFullDraftRequest({...value, assets: [
    {...value.assets[0], assetName: "../hero.jpg"}, value.assets[1]
  ]}));
});
test("manifest is order-independent but covers the source hashes", () => {
  const a = sample(), b = sample();
  b.assets = [...b.assets].reverse();
  assert.equal(createFullDraftManifestFingerprint(a), createFullDraftManifestFingerprint(b));
  b.assets[0] = {...b.assets[0], expectedSha256: hashA};
  assert.notEqual(createFullDraftManifestFingerprint(a), createFullDraftManifestFingerprint(b));
});
test("manifest mismatch refuses any upload", async () => {
  const x = sample("UPLOAD_APPROVED_ASSETS");
  x.manifestFingerprint = hashA;
  const t = harness();
  assert.equal((await t.run(x)).body.status, "BLOCKED");
  assert.deepEqual(t.calls, []);
});
test("source mismatch prevents draft creation", async () => {
  const t = harness({verifyDriveAsset: async asset => ({
    sha256: hashA, sizeBytes: asset.expectedBytes,
    driveFileId: asset.driveFileId, assetName: asset.assetName
  })});
  assert.equal((await t.run(sample("CREATE_DRAFT"))).body.stage, "SOURCE_VERIFICATION");
  assert.deepEqual(t.calls, []);
});
test("creation reads nested receipt and pauses for exact draft approval", async () => {
  const t = harness();
  const result = await t.run(sample("CREATE_DRAFT"));
  assert.equal(result.body.draftListingId, 111);
  assert.equal(result.body.status, "AWAITING_EXACT_DRAFT_APPROVAL");
  assert.deepEqual(t.calls, ["draft"]);
});
test("replay does not count as a new draft write", async () => {
  const t = harness({createDraft: async () => Response.json({
    status: "REPLAY", receipt: {providerResourceId: "111", kind: "CREATE_DRAFT"}
  })});
  assert.equal((await t.run(sample("CREATE_DRAFT"))).body.ETSY_WRITE_COUNT, 0);
});
test("wrong receipt kind requires reconciliation", async () => {
  const t = harness({createDraft: async () => Response.json({
    status: "APPLIED", receipt: {providerResourceId: "111", kind: "UPLOAD_IMAGE"}
  })});
  assert.equal((await t.run(sample("CREATE_DRAFT"))).body.status, "RECONCILIATION_REQUIRED");
});
test("exact server manifest approval is required", async () => {
  const t = harness({isManifestApproved: () => false});
  const result = await t.run(sample("UPLOAD_APPROVED_ASSETS"));
  assert.equal(result.code, 403);
  assert.deepEqual(t.calls, []);
});
test("uploads stop and reconcile on incomplete Etsy receipt", async () => {
  const t = harness({uploadAsset: async () => Response.json({
    status: "APPLIED", receipt: {providerResourceId: "222", kind: "UPLOAD_IMAGE"}
  })});
  assert.equal((await t.run(sample("UPLOAD_APPROVED_ASSETS"))).body.status, "RECONCILIATION_REQUIRED");
});
test("uploads are sequential and require a separate final readback", async () => {
  const t = harness();
  const result = await t.run(sample("UPLOAD_APPROVED_ASSETS"));
  assert.deepEqual(t.calls, ["UPLOAD_IMAGE", "UPLOAD_FILE"]);
  assert.equal(result.body.status, "ASSET_UPLOADS_REPORTED");
  assert.equal(result.body.independentReadBackVerified, false);
});
test("matching readback confirms metadata only, never independent human QC", async () => {
  const t = harness();
  const result = await t.run(sample("VERIFY_DRAFT_ASSETS"));
  assert.equal(result.body.status, "READBACK_METADATA_MATCH");
  assert.equal(result.body.ETSY_WRITE_COUNT, 0);
  assert.equal(result.body.originalBuyerFileHashesVerifiedByEtsy, false);
  assert.equal(result.body.independentHumanFinalQcPassed, false);
});
test("provider readback mismatch fails closed", async () => {
  const t = harness({readBackAssets: async data => ({
    listingId: data.draftListingId!, shopId: data.shopId,
    listingState: "draft", listingIdentity: "MATCH",
    images: [], buyerFiles: []
  })});
  assert.equal((await t.run(sample("VERIFY_DRAFT_ASSETS"))).body.status, "READBACK_MISMATCH");
});
