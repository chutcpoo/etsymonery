import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { before, after } from "node:test";
import {
  createEtsyDriveAssetBridgeHandler,
  getEtsyDriveBridgeStatus
} from "../lib/etsy-drive-asset-bridge";
import type { VerifiedDriveAsset } from "../lib/google-drive-asset-source";

const FP = "a".repeat(64);
const LISTING_FP = "b".repeat(64);
const BYTES = Buffer.from("fixture-digital-product", "utf8");
const HASH = createHash("sha256").update(BYTES).digest("hex");
const TOKEN = "testing-only-operator-token";
const PRODUCT_ID = "PDT-NEW-017";
const DRAFT_ID = 1234567890;

const previous: Record<string, string | undefined> = {};
const vars = [
  "ETSY_DRAFT_WRITE_TOKEN", "ETSY_DRAFT_WRITES_ENABLED",
  "ETSY_DRIVE_ASSET_WRITES_ENABLED", "ETSY_DRIVE_APPROVED_CANDIDATE_FINGERPRINT",
  "ETSY_DRIVE_APPROVED_DRAFT_LISTING_ID", "ETSY_DRIVE_APPROVED_PRODUCT_ID", "ETSY_SHOP_ID",
  "PUBLISH_WRITES_ENABLED"
];
before(() => {
  for (const name of vars) previous[name] = process.env[name];
  process.env.ETSY_DRAFT_WRITE_TOKEN = TOKEN;
  process.env.ETSY_DRAFT_WRITES_ENABLED = "false";
  process.env.ETSY_DRIVE_ASSET_WRITES_ENABLED = "false";
  process.env.PUBLISH_WRITES_ENABLED = "false";
  process.env.ETSY_SHOP_ID = "23582741";
});
after(() => {
  for (const name of vars) {
    const value = previous[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});
function body(action: "PREFLIGHT" | "UPLOAD" = "PREFLIGHT") {
  return {
    action, operationId: "EXACT-OP-1", productId: PRODUCT_ID,
    candidateId: "CAND-17", candidateFingerprint: FP,
    expectedListingFingerprint: LISTING_FP, shopId: 23582741,
    draftListingId: DRAFT_ID, kind: "UPLOAD_FILE",
    driveFileId: "1qZ9DriveFakeProductAsset123456",
    assetName: "buyer.pdf", expectedSha256: HASH,
    expectedBytes: BYTES.byteLength, rank: 1,
    qc: {
      productTruthVerified: true,
      testerFingerprint: FP,
      independentFinalQcFingerprint: FP,
      state: "QC_PASSED"
    }
  };
}
function request(data: Record<string, unknown>, token?: string) {
  return new Request("https://preview.example/api/etsy/drive-assets", {
    method: "POST", headers: {
      "content-type": "application/json",
      ...(token ? { "x-autodigitalpublisher-write-token": token } : {})
    }, body: JSON.stringify(data)
  });
}
const asset: VerifiedDriveAsset = {
  driveFileId: body().driveFileId,
  assetName: "buyer.pdf", sha256: HASH, sizeBytes: BYTES.byteLength,
  mimeType: "application/pdf", bytes: new Uint8Array(BYTES)
};

test("requires operator authorization before touching Drive", async () => {
  let reads = 0, uploads = 0;
  const handler = createEtsyDriveAssetBridgeHandler({
    fetchAsset: async () => { reads++; return asset; },
    assetPostHandler: async () => { uploads++; return Response.json({ status: "APPLIED" }); }
  });
  const result = await handler(request(body()));
  assert.equal(result.status, 401);
  assert.equal(reads, 0);
  assert.equal(uploads, 0);
});

test("PREVIEW write flags default to closed, before Drive or Etsy calls", async () => {
  let reads = 0, uploads = 0;
  const handler = createEtsyDriveAssetBridgeHandler({
    fetchAsset: async () => { reads++; return asset; },
    assetPostHandler: async () => { uploads++; return Response.json({}); }
  });
  const result = await handler(request(body("UPLOAD"), TOKEN));
  assert.equal(result.status, 403);
  assert.equal((await result.json()).error, "ETSY_DRIVE_ASSET_WRITES_DISABLED");
  assert.equal(reads, 0);
  assert.equal(uploads, 0);
  assert.equal(getEtsyDriveBridgeStatus().allWriteGatesClosed, true);
});

test("PREFLIGHT verifies source file with zero Etsy writes", async () => {
  let uploaded = 0;
  const handler = createEtsyDriveAssetBridgeHandler({
    fetchAsset: async () => asset,
    assetPostHandler: async () => { uploaded++; return Response.json({}); }
  });
  const result = await handler(request(body(), TOKEN));
  const value = await result.json();
  assert.equal(result.status, 200);
  assert.equal(value.status, "ASSET_VERIFIED");
  assert.equal(value.finalQcIndependentlyVerified, false);
  assert.equal(value.ETSY_WRITE_COUNT, 0);
  assert.equal(value.publishAuthorized, false);
  assert.equal(uploaded, 0);
});

test("an inconsistent source hash blocks even a read-only preflight", async () => {
  const handler = createEtsyDriveAssetBridgeHandler({
    fetchAsset: async () => ({ ...asset, sha256: "b".repeat(64) })
  });
  const result = await handler(request(body(), TOKEN));
  assert.equal(result.status, 409);
  assert.equal((await result.json()).error, "DRIVE_ASSET_READBACK_IDENTITY_MISMATCH");
});

test("even with write flags enabled, an exact candidate+draft approval is required", async () => {
  process.env.ETSY_DRAFT_WRITES_ENABLED = "true";
  process.env.ETSY_DRIVE_ASSET_WRITES_ENABLED = "true";
  delete process.env.ETSY_DRIVE_APPROVED_DRAFT_LISTING_ID;
  let reads = 0;
  const result = await createEtsyDriveAssetBridgeHandler({
    fetchAsset: async () => { reads++; return asset; }
  })(request(body("UPLOAD"), TOKEN));
  assert.equal(result.status, 403);
  assert.equal((await result.json()).error, "ETSY_DRIVE_EXACT_APPROVAL_REQUIRED");
  assert.equal(reads, 0);
  process.env.ETSY_DRAFT_WRITES_ENABLED = "false";
  process.env.ETSY_DRIVE_ASSET_WRITES_ENABLED = "false";
});

test("an explicitly pinned but unapproved product plan is rejected before Google or Etsy", async () => {
  process.env.ETSY_DRAFT_WRITES_ENABLED = "true";
  process.env.ETSY_DRIVE_ASSET_WRITES_ENABLED = "true";
  process.env.ETSY_DRIVE_APPROVED_PRODUCT_ID = PRODUCT_ID;
  process.env.ETSY_DRIVE_APPROVED_CANDIDATE_FINGERPRINT = FP;
  process.env.ETSY_DRIVE_APPROVED_DRAFT_LISTING_ID = String(DRAFT_ID);
  let reads = 0, uploads = 0;
  const handler = createEtsyDriveAssetBridgeHandler({
    fetchAsset: async () => { reads++; return asset; },
    assetPostHandler: async () => { uploads++; return Response.json({ status: "APPLIED" }); },
    verifyBuild: async () => ({
      allowed: false, status: "BUILD_BLOCKED", reason: "NO_APPROVED_PLAN_FOUND",
      productId: PRODUCT_ID
    })
  });
  const result = await handler(request(body("UPLOAD"), TOKEN));
  assert.equal(result.status, 409);
  assert.equal((await result.json()).error, "EXPLICIT_APPROVED_PRODUCT_PLAN_REQUIRED");
  assert.equal(reads, 0);
  assert.equal(uploads, 0);
  process.env.ETSY_DRAFT_WRITES_ENABLED = "false";
  process.env.ETSY_DRIVE_ASSET_WRITES_ENABLED = "false";
});

test("an exact approved upload passes bytes only to the existing draft asset handler", async () => {
  process.env.ETSY_DRAFT_WRITES_ENABLED = "true";
  process.env.ETSY_DRIVE_ASSET_WRITES_ENABLED = "true";
  process.env.ETSY_DRIVE_APPROVED_PRODUCT_ID = PRODUCT_ID;
  process.env.ETSY_DRIVE_APPROVED_CANDIDATE_FINGERPRINT = FP;
  process.env.ETSY_DRIVE_APPROVED_DRAFT_LISTING_ID = String(DRAFT_ID);
  let calls = 0;
  const handler = createEtsyDriveAssetBridgeHandler({
    fetchAsset: async () => asset,
    verifyBuild: async () => ({
      allowed: true, status: "BUILD_PERMITTED", productId: PRODUCT_ID,
      planId: "PLAN-17", planSha256: FP, approvedAt: "2026-10-21T01:00:00Z",
      evidence: {
        productId: PRODUCT_ID, planId: "PLAN-17", planVersion: 1, planSha256: FP,
        approvedAt: "2026-10-21T01:00:00Z",
        buildStartedAt: "2026-10-21T01:01:00Z",
        buildCorrelationId: "BLD-17", builder: "TEST", result: "BUILD_PERMITTED"
      }
    }),
    assetPostHandler: async input => {
      calls++;
      const form = await input.formData();
      assert.equal(form.get("assetName"), "buyer.pdf");
      assert.equal(form.get("assetSha256"), HASH);
      assert.equal(form.get("kind"), "UPLOAD_FILE");
      assert.equal(form.get("draftListingId"), String(DRAFT_ID));
      const file = form.get("asset") as File;
      assert.equal(createHash("sha256").update(new Uint8Array(await file.arrayBuffer())).digest("hex"), HASH);
      return Response.json({ status: "APPLIED", receipt: { providerResourceId: "123" } });
    }
  });
  const result = await handler(request(body("UPLOAD"), TOKEN));
  const value = await result.json();
  assert.equal(result.status, 200);
  assert.equal(calls, 1);
  assert.equal(value.ETSY_WRITE_COUNT, 1);
  assert.equal(value.publishAuthorized, false);
  process.env.ETSY_DRAFT_WRITES_ENABLED = "false";
  process.env.ETSY_DRIVE_ASSET_WRITES_ENABLED = "false";
});
