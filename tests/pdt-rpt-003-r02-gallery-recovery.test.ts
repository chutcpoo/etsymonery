import assert from "node:assert/strict";
import test from "node:test";
import {
  PDT_RPT_003_R02,
  pdtRpt003R02GalleryRecoverySequence
} from "../lib/pdt-rpt-003-r02";

test("R02 gallery recovery reattaches desired images from last to first", () => {
  const sequence = pdtRpt003R02GalleryRecoverySequence();

  assert.equal(sequence.length, 10);
  assert.deepEqual(
    sequence.map(x => x.desiredRank),
    [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
  );
  assert.equal(sequence[0].alt, PDT_RPT_003_R02.images[9].alt);
  assert.equal(sequence[9].alt, PDT_RPT_003_R02.images[0].alt);
});
