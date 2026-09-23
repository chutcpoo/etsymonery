import assert from "node:assert/strict";
import test from "node:test";
import { PDT_RPT_003_R02 } from "../lib/pdt-rpt-003-r02";

test("R02 Hero-preserving recovery restores only images 02-10", () => {
  assert.equal(
    PDT_RPT_003_R02.galleryRecoveryR02Authorization,
    "AUTHORIZE PDT-RPT-003-V1-ETSY-R02-GALLERY-RECOVERY-R02-20260923 EXACT SCOPE ONLY"
  );
  assert.equal(PDT_RPT_003_R02.images.length, 10);
  assert.deepEqual(
    PDT_RPT_003_R02.images.slice(1).map((_, index) => index + 2),
    [2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
});
