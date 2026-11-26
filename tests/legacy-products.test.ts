import assert from "node:assert/strict";
import test from "node:test";
import { ETSY_CHANNEL_INDEX, LEGACY_ETSY_CHANNEL_INDEX } from "../lib/catalog-channel-index";
import { isLegacyProduct } from "../lib/legacy-products";

test("legacy mappings remain available for history without entering the current Etsy index", () => {
  assert.deepEqual(ETSY_CHANNEL_INDEX, []);
  assert.deepEqual(LEGACY_ETSY_CHANNEL_INDEX.map(({ listingId }) => listingId), [
    4580126260, 4579068925, 4581821318, 4578945050, 4580303015,
  ]);
  assert.ok(LEGACY_ETSY_CHANNEL_INDEX.every(({ productId }) => isLegacyProduct(productId)));
  assert.equal(isLegacyProduct("PDT-CQE-008"), true);
  assert.equal(isLegacyProduct("creative:M01"), false);
});
