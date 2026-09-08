import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ETSY_CHANNEL_INDEX } from "../lib/catalog-channel-index";
import { formatEtsyMoney, normalizeProviderText } from "../lib/public-product";

test("canonical channel projection exposes exactly eight public landing identities", () => {
  assert.equal(ETSY_CHANNEL_INDEX.length, 8);
  assert.equal(new Set(ETSY_CHANNEL_INDEX.map((item) => item.listingId)).size, 8);
  assert.equal(new Set(ETSY_CHANNEL_INDEX.map((item) => item.productId)).size, 8);
});

test("Etsy money formatting preserves provider amount/divisor identity", () => {
  assert.equal(
    formatEtsyMoney({ amount: 1490, divisor: 100, currency_code: "USD" }),
    "$14.90"
  );
  assert.equal(formatEtsyMoney({ amount: 500, divisor: 100, currency_code: "THB" }), "THB 5.00");
});

test("provider unavailable sentinels never render as public text", () => {
  assert.equal(normalizeProviderText("NOT_AVAILABLE"), null);
  assert.equal(normalizeProviderText("BYTE_HASH_NOT_AVAILABLE_FROM_PROVIDER"), null);
  assert.equal(normalizeProviderText("SHA256_NOT_AVAILABLE_FROM_PROVIDER"), null);
  assert.equal(normalizeProviderText("NOT_AVAILABLE_FROM_CURRENT_ETSY_API_PATH"), null);
  assert.equal(normalizeProviderText("  Current Etsy title  "), "Current Etsy title");
});

test("public product page is analytics-bound and contains no marketplace write handler", async () => {
  const source = await readFile("app/p/[listingId]/page.tsx", "utf8");
  assert.match(source, /data-analytics-product-id/);
  assert.match(source, /data-analytics-listing-id/);
  assert.match(source, /getPublicProduct/);
  assert.match(source, /View on Etsy/);
  assert.doesNotMatch(source, /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/);
});

test("public product model delegates listing fields to the existing read-only Etsy detail reader", async () => {
  const source = await readFile("lib/public-product.ts", "utf8");
  assert.match(source, /getEtsyListingDetailEvidence/);
  assert.match(source, /getStoredEtsyShopId/);
  assert.match(source, /getValidEtsyAccessToken/);
  assert.match(source, /PROVIDER_UNAVAILABLE_STRINGS/);
  assert.doesNotMatch(source, /method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
});
