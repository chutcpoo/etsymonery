import assert from "node:assert/strict";
import test from "node:test";
import { PD_STOCK_005_B01 } from "../lib/pd-stock-005-b01-title-tags";

test("PD-STOCK-005 B01 is rebound only to fresh one-time identity 003", () => {
  assert.equal(PD_STOCK_005_B01.operationId, "PD-STOCK-005-B01-TITLE-TAGS-003");
  assert.equal(PD_STOCK_005_B01.authorizationId, "PTQC-PD-STOCK-005-AUTH-20260908-B01-03");
  assert.equal(PD_STOCK_005_B01.candidateId, "ETSY-DISCOVERY-FIX-PD-STOCK-005-V1-2026-09-08-B");
  assert.equal(PD_STOCK_005_B01.candidateFingerprint, "ce86c67091e5ecf612d056056b558c2301a64e057517b78e6628b0eca5115fdb");
  assert.equal(PD_STOCK_005_B01.buildId, "ETSY-DISCOVERY-FIX-PD-STOCK-005-BUILD-20260908-B01");
  assert.equal(PD_STOCK_005_B01.buildFingerprint, "19ce5029beafbdf049d4867ec2dd5d29332ea3128c38437293f3c812c6a54f37");
  assert.equal(PD_STOCK_005_B01.protectedFieldSnapshotSha256, "f4c57e5d3cfa427dedec022a3c3dcfd77bedc56e0198d3c56bbff4aeeb72bd60");
  assert.equal(PD_STOCK_005_B01.title, "Restaurant & Cafe Inventory Tracker | Stock, Waste, Reorder & Supplier Spreadsheet");
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
