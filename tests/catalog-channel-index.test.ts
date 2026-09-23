import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_CATALOG_SOURCE,
  ETSY_CHANNEL_INDEX
} from "../lib/catalog-channel-index";

test("derived Etsy projection is bound to the canonical Google Drive registry snapshot", () => {
  assert.equal(
    CANONICAL_CATALOG_SOURCE.driveId,
    "1WGL_VFGW0DdqxGUdQAzZnjshGEEVCr0ZMeOdAU-KMWQ"
  );
  assert.equal(CANONICAL_CATALOG_SOURCE.title, "POONTHAIDIGITAL_PRODUCT_REGISTRY");
  assert.equal(CANONICAL_CATALOG_SOURCE.authority, "IDENTIFIER_PROJECTION_ONLY");
  assert.equal(
    CANONICAL_CATALOG_SOURCE.projectionScope,
    "PRODUCT_ID_ETSY_LISTING_ID_ONLY"
  );
  assert.ok(CANONICAL_CATALOG_SOURCE.snapshotRevisionId);
});

test("derived Etsy projection contains exactly the current canonical Product_ID to Listing_ID pairs", () => {
  assert.deepEqual(ETSY_CHANNEL_INDEX, [
    { productId: "PDT-CBEO-004", listingId: 4580126260 },
    { productId: "PDT-FCMP-002", listingId: 4579068925 },
    { productId: "PDT-IPT-001", listingId: 4578945050 },
    { productId: "PDT-RPT-003", listingId: 4580303015 }
  ]);
});

test("derived Etsy projection stays identifier-only and unique", () => {
  assert.equal(new Set(ETSY_CHANNEL_INDEX.map((entry) => entry.productId)).size, ETSY_CHANNEL_INDEX.length);
  assert.equal(new Set(ETSY_CHANNEL_INDEX.map((entry) => entry.listingId)).size, ETSY_CHANNEL_INDEX.length);

  for (const entry of ETSY_CHANNEL_INDEX) {
    assert.deepEqual(Object.keys(entry).sort(), ["listingId", "productId"]);
    assert.match(entry.productId, /^[A-Z0-9][A-Z0-9._-]*$/);
    assert.ok(Number.isSafeInteger(entry.listingId) && entry.listingId > 0);
  }
});
