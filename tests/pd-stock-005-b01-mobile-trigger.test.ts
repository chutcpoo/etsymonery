import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PD_STOCK_005_B01 } from "../lib/pd-stock-005-b01-title-tags";

test("temporary mobile trigger delegates only to the exact operation 002 executor", async () => {
  const source = await readFile(
    new URL("../app/api/internal/pd-stock-005-b01-002/route.ts", import.meta.url),
    "utf8"
  );

  assert.equal(PD_STOCK_005_B01.operationId, "PD-STOCK-005-B01-TITLE-TAGS-002");
  assert.equal(PD_STOCK_005_B01.authorizationId, "PTQC-PD-STOCK-005-AUTH-20260908-B01-02");
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /process\.env\.ETSY_B01_WRITE_TOKEN/);
  assert.match(source, /handlePdStock005B01TitleTags\(body, delegated\)/);
  assert.doesNotMatch(source, /api\.etsy\.com/);
  assert.doesNotMatch(source, /method:\s*"PATCH"/);
  assert.doesNotMatch(source, /method:\s*"PUT"/);
  assert.doesNotMatch(source, /method:\s*"DELETE"/);
});
