import test from "node:test";
import assert from "node:assert/strict";
import { PDT_HBOP_001_V2_ALT_TEXT_R01 as R01 } from "../lib/pdt-hbop-001-v2-alt-text-r01";

test("HBOP publish R01 freezes exact target and assets",()=>{
  assert.equal(R01.listingId,4581821318);
  assert.equal(R01.priceAmount,999);
  assert.equal(R01.tags.length,13);
  assert.equal(R01.altTexts.length,10);
  assert.equal(R01.buyerFiles.length,4);
  assert.deepEqual(R01.expectedVideo,{count:1,width:1080,height:1920});
});
