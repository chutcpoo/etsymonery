import assert from "node:assert/strict";
import test from "node:test";
import {
  ETSY_SCOPES,
  ETSY_SELLER_READ_SCOPES,
  ETSY_SELLER_WRITE_SCOPES,
  getMissingEtsyScopes,
  parseEtsyGrantedScopes
} from "../lib/etsy";

const CURRENT_ETSY_V3_SCOPES = [
  "address_r",
  "address_w",
  "email_r",
  "listings_d",
  "listings_r",
  "listings_w",
  "profile_r",
  "profile_w",
  "shops_r",
  "shops_w",
  "transactions_r",
  "transactions_w"
] as const;

test("OAuth requests the full current Etsy Open API v3 documented scope set", () => {
  assert.deepEqual(ETSY_SCOPES, CURRENT_ETSY_V3_SCOPES);
  assert.equal(new Set(ETSY_SCOPES).size, ETSY_SCOPES.length);
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
