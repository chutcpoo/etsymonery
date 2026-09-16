import assert from "node:assert/strict";
import test from "node:test";
import {
  PD_CLEAN_004_VISUAL_R02_RELEASE,
  exactPdClean004AuthorizationHash,
  exactPdClean004ReleaseBody,
  handlePdClean004R02Release
} from "../lib/pd-clean-004-visual-r02-release";
import { MemoryOperationLedgerRepository } from "../lib/operation-ledger";

process.env.ETSY_API_KEY = "test-key";
process.env.ETSY_SHARED_SECRET = "test-secret";

test("PD-CLEAN-004 R02 release identity is exact and complete", () => {
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE.operationId, "PD-CLEAN-004-VISUAL-R02-RELEASE-001");
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE.listingId, "4561795303");
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE.productId, "PD-CLEAN-004");
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE.gallery.length, 8);
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE.gallery.filter((asset) => asset.altText.length > 0).length, 8);
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE.video.mimeType, "video/mp4");
  assert.equal(PD_CLEAN_004_VISUAL_R02_RELEASE.video.byteSize, 412385);
  assert.match(PD_CLEAN_004_VISUAL_R02_RELEASE.video.sha256, /^[a-f0-9]{64}$/);
  for (const [index, asset] of PD_CLEAN_004_VISUAL_R02_RELEASE.gallery.entries()) {
    assert.equal(asset.order, index + 1);
    assert.equal(asset.width, 2500);
    assert.equal(asset.height, 2000);
    assert.equal(asset.mimeType, "image/jpeg");
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  }
});

test("authorization binding and release body are pinned to the fresh PSV", () => {
  const protectedStateFingerprint = "a".repeat(64);
  const authorizationHash = exactPdClean004AuthorizationHash(protectedStateFingerprint);
  const body = exactPdClean004ReleaseBody(protectedStateFingerprint);

  assert.match(authorizationHash, /^[a-f0-9]{64}$/);
  assert.equal(body.operationId, PD_CLEAN_004_VISUAL_R02_RELEASE.operationId);
  assert.equal(body.authorizationId, PD_CLEAN_004_VISUAL_R02_RELEASE.authorizationId);
  assert.equal(body.operationFingerprint, PD_CLEAN_004_VISUAL_R02_RELEASE.operationFingerprint);
  assert.equal(body.candidateFingerprint, PD_CLEAN_004_VISUAL_R02_RELEASE.candidateFingerprint);
  assert.equal(body.protectedStateFingerprint, protectedStateFingerprint);
  assert.equal(body.gallery.length, 8);
  assert.equal(body.video.sha256, PD_CLEAN_004_VISUAL_R02_RELEASE.video.sha256);
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

  const response = await handlePdClean004R02Release(
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
  assert.equal(body.error, "PD_CLEAN_004_R02_AUTHORIZATION_REQUEST_HASH_MISMATCH");
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
  const response = await handlePdClean004R02Release(
    protectedStateFingerprint,
    exactPdClean004AuthorizationHash(protectedStateFingerprint),
    request,
    {
      repository: new MemoryOperationLedgerRepository(),
      getAccessToken: async () => { accessTokenCalls += 1; return "token"; }
    }
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, "PD_CLEAN_004_R02_WRITES_DISABLED");
  assert.equal(body.ETSY_WRITE_COUNT, 0);
  assert.equal(accessTokenCalls, 0);
});
