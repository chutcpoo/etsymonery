import assert from "node:assert/strict";
import test from "node:test";
import {
  POST_RESET_PLATFORM_STATE,
  prepareNewProductCandidate,
  validateNewProductManifest
} from "../lib/post-reset-platform";

const valid = {
  productId: "NEW-PRODUCT-001",
  version: "V1",
  productName: "New Product",
  canonicalDriveFileId: "drive-file-new-001",
  buyerFiles: ["buyer.xlsx"],
  galleryFiles: ["01.png"],
  title: "New Product Spreadsheet",
  description: "A verified new product prepared after the catalog reset.",
  tags: Array.from({ length: 13 }, (_, i) => `tag ${i + 1}`),
  priceUsd: 9.99,
  productTruthVerified: true,
  testerPass: true,
  finalQcPass: true
};

test("platform starts empty and write-locked", () => {
  assert.equal(POST_RESET_PLATFORM_STATE.catalogState, "EMPTY_CATALOG");
  assert.equal(POST_RESET_PLATFORM_STATE.liveCatalogCount, 0);
  assert.equal(POST_RESET_PLATFORM_STATE.legacyProductsLoaded, 0);
  assert.equal(POST_RESET_PLATFORM_STATE.legacyWritesEnabled, false);
  assert.equal(POST_RESET_PLATFORM_STATE.ETSY_WRITE_COUNT, 0);
});

test("new product can be prepared without creating an Etsy listing", () => {
  const result = validateNewProductManifest(valid);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const prepared = prepareNewProductCandidate(result.manifest);
  assert.equal(prepared.status, "PREPARED");
  assert.equal(prepared.listingId, null);
  assert.equal(prepared.publishAuthorized, false);
  assert.equal(prepared.EtsyWriteCount, 0);
});

test("pre-existing listing identity is rejected", () => {
  const result = validateNewProductManifest({ ...valid, listingId: 123456 });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.includes("PREEXISTING_LISTING_ID_NOT_ALLOWED"));
});

test("stale authorization is rejected during preparation", () => {
  const result = validateNewProductManifest({ ...valid, authorizationId: "old-auth" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.includes("STALE_AUTHORIZATION_NOT_ALLOWED"));
});
