import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PDT_HBOP_001_V2_ALT_TEXT_R01 as R01 } from "../lib/pdt-hbop-001-v2-alt-text-r01";

test("HBOP V2 alt-text manifest freezes exact remaining scope", () => {
  assert.equal(R01.listingId, 4581821318);
  assert.equal(R01.shopId, 23582741);
  assert.equal(R01.altTexts.length, 10);
  assert.equal(R01.tags.length, 13);
  assert.equal(R01.buyerFiles.length, 4);
  assert.equal(R01.priceAmount, 999);
  assert.equal(R01.taxonomyId, 12476);
});

test("HBOP V2 R01 route is dry-run only and exposes no Etsy mutation method", async () => {
  const source = await readFile(
    new URL("../app/api/internal/etsy/post-reset-v2/pdt-hbop-001/alt-text-r01/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /DRY_RUN_PASS/);
  assert.match(source, /ETSY_WRITE_COUNT:\s*0/);
  assert.doesNotMatch(source, /export async function POST/);
  assert.doesNotMatch(source, /export async function PATCH/);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/);
});
