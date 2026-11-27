import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LEGACY_ETSY_CHANNEL_INDEX } from "../lib/catalog-channel-index";
import { formatEtsyMoney, getPublicProduct, normalizeProviderText } from "../lib/public-product";

test("the public product resolver rejects each archived Etsy listing", async () => {
  for (const { listingId } of LEGACY_ETSY_CHANNEL_INDEX) {
    assert.deepEqual(await getPublicProduct(listingId), {
      status: "NOT_FOUND",
      reason: "LISTING_NOT_IN_CANONICAL_CHANNEL_INDEX"
    });
  }
});

test("Etsy money formatting preserves provider amount/divisor identity", () => {
  assert.equal(formatEtsyMoney({ amount: 1490, divisor: 100, currency_code: "USD" }), "$14.90");
});

test("provider unavailable sentinels never render as public text", () => {
  assert.equal(normalizeProviderText("NOT_AVAILABLE"), null);
  assert.equal(normalizeProviderText("SHA256_NOT_AVAILABLE_FROM_PROVIDER"), null);
  assert.equal(normalizeProviderText("  Current Etsy title  "), "Current Etsy title");
});

test("public product page remains read-only", async () => {
  const source = await readFile("app/p/[listingId]/page.tsx", "utf8");
  assert.match(source, /getPublicProduct/);
  assert.doesNotMatch(source, /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/);
});
