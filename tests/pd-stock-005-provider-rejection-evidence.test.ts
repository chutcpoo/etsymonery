import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("PD-STOCK-005 executor preserves sanitized Etsy rejection evidence without secrets", async () => {
  const source = await readFile(new URL("../lib/pd-stock-005-b01-title-tags.ts", import.meta.url), "utf8");
  assert.match(source, /sanitizeProviderRejection/);
  assert.match(source, /updateStatusCode:\s*updateResponse\.status/);
  assert.match(source, /providerError/);
  assert.match(source, /recoveryPoint:\s*"PATCH_REJECTED"/);
  assert.match(source, /raw\.slice\(0, 500\)/);
  assert.doesNotMatch(source, /providerError.*accessToken/);
  assert.doesNotMatch(source, /providerError.*ETSY_B01_WRITE_TOKEN/);
});
