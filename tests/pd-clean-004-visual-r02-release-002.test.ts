import assert from "node:assert/strict";
import test from "node:test";
import {
  PD_CLEAN_004_VISUAL_R02_RELEASE_002,
  exactPdClean004Recovery002AuthorizationHash,
  exactPdClean004Recovery002ReleaseBody,
  handlePdClean004R02Recovery002Release
} from "../lib/pd-clean-004-visual-r02-release-002";
import { MemoryOperationLedgerRepository } from "../lib/operation-ledger";

process.env.ETSY_API_KEY = "test-key";
process.env.ETSY_SHARED_SECRET = "test-secret";

test("PD-CLEAN-004 R02 recovery 002 identity is exact and complete", () => {
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE_002.operationId, "PD-CLEAN-004-VISUAL-R02-RELEASE-002");
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE_002.listingId, "4561795303");
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE_002.productId, "PD-CLEAN-004");
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE_002.operationFingerprint, "ab27b1d8712abb91e813d4782dc8fbd4ad40c57f2e52ffc414ae4fa21c49b59e");
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE_002.authorizationId, "PD-CLEAN-004-VISUAL-R02-AUTH-20260916-03-RECOVERY");
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE_002.authorizationEvidenceDriveId, "1J5rTN25Xs5Xozfg0kTBui3o_VsUcaISwxq0K02_WWZs");
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE_002.candidateFingerprint, "4448973e5abee4bd344414307c12066248af5f9ab7de26062333deee7f77f069");
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE_002.gallery.length, 8);
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE_002.gallery.filter((asset) => asset.altText.length > 0).length, 8);
  assert.deepEqual(PD_CLEAN_004_VISUAL_R02_RELEASE_002.gallery.map((asset) => asset.altText.length), [187, 210, 172, 182, 176, 188, 186, 203]);
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE_002.video.mimeType, "video/mp4");
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE_002.video.byteSize, 412385);
  assert.match(PD_CLEAN_004_VISUAL_R02_RELEASE_002.video.sha256, /^[a-f0-9]{64}$/);
  for (const [index, asset] of PD_CLEAN_004_VISUAL_R02_RELEASE_002.gallery.entries()) {
    assert.equal(asset.order, index + 1);
    assert.equal(asset.width, 2500);
    assert.equal(asset.height, 2000);
    assert.equal(asset.mimeType, "image/jpeg");
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  }
});

test("authorization binding and release body are pinned to the fresh PSV", () => {
  const protectedStateFingerprint = "a".repeat(64);
  const authorizationHash = exactPdClean004Recovery002AuthorizationHash(protectedStateFingerprint);
  const body = exactPdClean004Recovery002ReleaseBody(protectedStateFingerprint);

  assert.match(authorizationHash, /^[a-f0-9]{64}$/);
  assert.equal(body.operationId, PD_CLEAN_004_VISUAL_R02_RELEASE_002.operationId);
  assert.equal(body.authorizationId, PD_CLEAN_004_VISUAL_R02_RELEASE_002.authorizationId);
  assert.equal(body.operationFingerprint, PD_CLEAN_004_VISUAL_R02_RELEASE_002.operationFingerprint);
  assert.equal(body.candidateFingerprint, PD_CLEAN_004_VISUAL_R02_RELEASE_002.candidateFingerprint);
  assert.equal(body.protectedStateFingerprint, protectedStateFingerprint);
  assert.equal(body.gallery.length, 8);
  assert.equal(body.video.sha256, PD_CLEAN_004_VISUAL_R02_RELEASE_002.video.sha256);
});

test("authorization mismatch fails closed before asset load, Etsy read, or write", async () => {
  process.env.PUBLISH_WRITES_ENABLED = "true";
  process.env.ETSY_B01_WRITE_TOKEN = "write-token";
  process.env.ETSY_SHOP_ID = "23582741";

  let accessTokenCalls = 0;
  let assetLoads = 0;
  const request = new Request("https://example.test/pd-clean-004/r02", {
    method: "POST",
    headers: { "x-autodigitalpublisher-write-token": "write-token" }
  });

  const response = await handlePdClean004R02Recovery002Release(
    "b".repeat(64),
    "0".repeat(64),
    request,
    {
      repository: new MemoryOperationLedgerRepository(),
      getAccessToken: async () => { accessTokenCalls += 1; return "token"; },
      loadAsset: async () => { assetLoads += 1; return Buffer.alloc(0); }
    }
  );

  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error, "PD_CLEAN_004_R02_RECOVERY_002_AUTHORIZATION_REQUEST_HASH_MISMATCH");
  assert.equal(body.ETSY_WRITE_COUNT, 0);
  assert.equal(accessTokenCalls, 0);
  assert.equal(assetLoads, 0);
});

test("write gate disabled fails before all provider activity", async () => {
  process.env.PUBLISH_WRITES_ENABLED = "false";
  process.env.ETSY_B01_WRITE_TOKEN = "write-token";
  process.env.ETSY_SHOP_ID = "23582741";

  let accessTokenCalls = 0;
  const request = new Request("https://example.test/pd-clean-004/r02", {
    method: "POST",
    headers: { "x-autodigitalpublisher-write-token": "write-token" }
  });
  const protectedStateFingerprint = "c".repeat(64);
  const response = await handlePdClean004R02Recovery002Release(
    protectedStateFingerprint,
    exactPdClean004Recovery002AuthorizationHash(protectedStateFingerprint),
    request,
    {
      repository: new MemoryOperationLedgerRepository(),
      getAccessToken: async () => { accessTokenCalls += 1; return "token"; }
    }
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, "PD_CLEAN_004_R02_RECOVERY_002_WRITES_DISABLED");
  assert.equal(body.ETSY_WRITE_COUNT, 0);
  assert.equal(accessTokenCalls, 0);
});
