import assert from "node:assert/strict";
import test from "node:test";
import { classifyLedgerStatus } from "../lib/control-center-v3";

test("control center V3 classifies operation ledger attention without inventing authorization", () => {
  assert.equal(classifyLedgerStatus("SUCCEEDED"), "COMPLETE");
  assert.equal(classifyLedgerStatus("RECONCILIATION_REQUIRED"), "NEEDS_RECONCILIATION");
  assert.equal(classifyLedgerStatus("FAILED"), "FAILED");
  assert.equal(classifyLedgerStatus("PENDING"), "PENDING");
  assert.equal(classifyLedgerStatus("UNKNOWN"), "PENDING");
});
