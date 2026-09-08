import assert from "node:assert/strict";
import test from "node:test";
import { PD_STOCK_005_B01 } from "../lib/pd-stock-005-b01-title-tags";

test("PD-STOCK-005 B01 is rebound only to fresh one-time identity 004", () => {
  assert.equal(PD_STOCK_005_B01.operationId, "PD-STOCK-005-B01-TITLE-TAGS-004");
  assert.equal(PD_STOCK_005_B01.authorizationId, "PTQC-PD-STOCK-005-AUTH-20260908-C01-01");
  assert.equal(PD_STOCK_005_B01.candidateId, "ETSY-DISCOVERY-FIX-PD-STOCK-005-V1-2026-09-08-C");
  assert.equal(PD_STOCK_005_B01.candidateFingerprint, "0b1b62ffe52a69793efc46f1caf0bbbf19d8fdd3242b5caa59c6254a53b73a1e");
  assert.equal(PD_STOCK_005_B01.buildId, "ETSY-DISCOVERY-FIX-PD-STOCK-005-BUILD-20260908-C01");
  assert.equal(PD_STOCK_005_B01.buildFingerprint, "46d4d1c445bf901112394f28b776897302cc33978a55ba683bfea9043780b3a9");
  assert.equal(PD_STOCK_005_B01.protectedFieldSnapshotSha256, "f4c57e5d3cfa427dedec022a3c3dcfd77bedc56e0198d3c56bbff4aeeb72bd60");
  assert.equal(PD_STOCK_005_B01.title, "Restaurant & Cafe Inventory Tracker | Stock, Waste, Reorder and Supplier Spreadsheet");
  assert.equal(PD_STOCK_005_B01.tags.length, 13);
  assert.deepEqual([...PD_STOCK_005_B01.tags], [
    "restaurant inventory",
    "cafe stock tracker",
    "kitchen inventory",
    "food waste tracker",
    "reorder spreadsheet",
    "supplier tracker",
    "par level sheet",
    "stock count sheet",
    "stock control",
    "inventory excel",
    "google sheets stock",
    "waste cost log",
    "food stocktake"
  ]);
});
