import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_CATALOG_SOURCE,
  ETSY_CHANNEL_INDEX
} from "../lib/catalog-channel-index";

test("derived Etsy projection is bound to the latest Drive Master plus Product Truth sources", () => {
  assert.equal(
    CANONICAL_CATALOG_SOURCE.driveId,
    "108WmUQjOQ4BR_PkTJUznGXzDHaFwIwIkDJOCdjnl7QM"
  );
  assert.equal(CANONICAL_CATALOG_SOURCE.title, "00 - Master Project Brief");
  assert.equal(CANONICAL_CATALOG_SOURCE.snapshotRevisionId, "27");
  assert.equal(
    CANONICAL_CATALOG_SOURCE.authority,
    "MASTER_PLUS_PRODUCT_TRUTH_IDENTIFIER_PROJECTION"
  );
  assert.equal(
    CANONICAL_CATALOG_SOURCE.projectionScope,
    "ACTIVE_PROTECTED_PRODUCT_ID_ETSY_LISTING_ID_ONLY"
  );
  assert.deepEqual(CANONICAL_CATALOG_SOURCE.productTruthDriveIds, {
    "PDT-CSCH-001": "1dCdQ8kvRDVH_qynLljAynLKxOp_a5WH-9aUva5oitCc",
    "PDT-PCL-002": "1G_zXzW1e1MIfAKdIf618VXMZKUWWR0Hq7qRFBoUj1tU",
    "PDT-CPR-003": "18xSNFCFmFzLveI54ELCjrZLABOPQ0lLe"
  });
});

test("derived Etsy projection contains exactly the current ACTIVE Product_ID to Listing_ID pairs", () => {
  assert.deepEqual(ETSY_CHANNEL_INDEX, [
    { productId: "PDT-CSCH-001", listingId: 4587646332 },
    { productId: "PDT-PCL-002", listingId: 4588681044 },
    { productId: "PDT-CPR-003", listingId: 4588738623 }
  ]);
});

test("derived Etsy projection stays identifier-only and unique", () => {
  assert.equal(
    new Set(ETSY_CHANNEL_INDEX.map((entry) => entry.productId)).size,
    ETSY_CHANNEL_INDEX.length
  );
  assert.equal(
    new Set(ETSY_CHANNEL_INDEX.map((entry) => entry.listingId)).size,
    ETSY_CHANNEL_INDEX.length
  );

  for (const entry of ETSY_CHANNEL_INDEX) {
    assert.deepEqual(Object.keys(entry).sort(), ["listingId", "productId"]);
    assert.match(entry.productId, /^[A-Z0-9][A-Z0-9._-]*$/);
    assert.ok(Number.isSafeInteger(entry.listingId) && entry.listingId > 0);
  }
});
