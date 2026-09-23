import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ETSY_CHANNEL_INDEX } from "../lib/catalog-channel-index";
import { formatEtsyMoney, normalizeProviderText } from "../lib/public-product";

test("post-reset public channel index reflects the current canonical identifier projection", () => {
  assert.equal(ETSY_CHANNEL_INDEX.length, 4);
  assert.deepEqual(
    ETSY_CHANNEL_INDEX.map(({ productId, listingId }) => ({ productId, listingId })),
    [
      { productId: "PDT-CBEO-004", listingId: 4580126260 },
      { productId: "PDT-FCMP-002", listingId: 4579068925 },
      { productId: "PDT-IPT-001", listingId: 4578945050 },
      { productId: "PDT-RPT-003", listingId: 4580303015 }
    ]
  );
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
