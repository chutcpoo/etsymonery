import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("PDT-IPT category repair route is exact category-only and fail-closed", async () => {
  const source = await readFile(
    new URL("../app/api/internal/etsy/post-reset-v2/pdt-ipt-001/category-repair-r01/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /LISTING_ID = 4578945050/);
  assert.match(source, /CURRENT_TAXONOMY_ID = 12476/);
  assert.match(source, /TARGET_NAME = "Bookkeeping Templates"/);
  assert.match(source, /CATEGORY-ONLY EXACT SCOPE ONLY/);
  assert.match(source, /baselineSha256/);
  assert.match(source, /protectedWithoutTaxonomySha256/);
  assert.match(source, /new URLSearchParams\(\{ taxonomy_id: String\(taxonomyId\) \}\)/);
  assert.match(source, /ETSY_WRITE_COUNT: 0/);
  assert.match(source, /ETSY_WRITE_COUNT: 1/);
  assert.match(source, /searchParams\.get\("action"\) === "execute"/);
  assert.match(source, /executeCategoryRepair/);
});

test("middleware allows only the dedicated post-reset category repair path", async () => {
  const source = await readFile(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.match(source, /POST_RESET_V2_PDT_IPT_CATEGORY_REPAIR_R01_ROUTE/);
  assert.match(source, /pdt-ipt-001\/category-repair-r01/);
});
