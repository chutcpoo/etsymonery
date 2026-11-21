import assert from "node:assert/strict";
import test from "node:test";
import {
  ETSY_SCOPES,
  ETSY_SELLER_READ_SCOPES,
  ETSY_SELLER_WRITE_SCOPES,
  getMissingEtsyScopes,
  parseEtsyGrantedScopes
} from "../lib/etsy";

test("the live count requires only listing read permission", () => {
  assert.deepEqual(ETSY_SCOPES, ["listings_r"]);
});

test("normalizes stored OAuth scope metadata and detects missing Seller scopes", () => {
  const granted = parseEtsyGrantedScopes("listings_r listings_w,transactions_r listings_r");
  assert.deepEqual(granted, ["listings_r", "listings_w", "transactions_r"]);
  assert.deepEqual(getMissingEtsyScopes(granted, ETSY_SELLER_READ_SCOPES), []);
  assert.deepEqual(getMissingEtsyScopes(granted, ETSY_SELLER_WRITE_SCOPES), []);
  assert.deepEqual(
    getMissingEtsyScopes("listings_r", ETSY_SELLER_WRITE_SCOPES),
    ["listings_w"]
  );
});
