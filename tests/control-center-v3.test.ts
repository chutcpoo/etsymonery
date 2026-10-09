import assert from "node:assert/strict";
import test from "node:test";
import { currentProductIdFromOperationId } from "../lib/control-center-v2";
import {
  classifyLedgerStatus,
  classifyOperationScope
} from "../lib/control-center-v3";

test("control center V3 classifies operation ledger attention without inventing authorization", () => {
  assert.equal(classifyLedgerStatus("SUCCEEDED"), "COMPLETE");
  assert.equal(
    classifyLedgerStatus("RECONCILIATION_REQUIRED"),
    "NEEDS_RECONCILIATION"
  );
  assert.equal(classifyLedgerStatus("FAILED"), "FAILED");
  assert.equal(classifyLedgerStatus("PENDING"), "PENDING");
  assert.equal(classifyLedgerStatus("UNKNOWN"), "PENDING");
});

test("control center scopes current Product Truth operations separately from historical ledger records", () => {
  assert.equal(classifyOperationScope("PDT-CSCH-001"), "CURRENT");
  assert.equal(classifyOperationScope("PDT-PCL-002"), "CURRENT");
  assert.equal(classifyOperationScope("PDT-CPR-003"), "CURRENT");
  assert.equal(
    classifyOperationScope("PDT-FCMP-002"),
    "HISTORICAL_SUPERSEDED"
  );
  assert.equal(classifyOperationScope(null), "HISTORICAL_SUPERSEDED");
});

test("publish operation IDs resolve only against the current Drive-backed projection", () => {
  assert.equal(
    currentProductIdFromOperationId("PDT-CPR-003-V1-ETSY-PUBLISH-R01"),
    "PDT-CPR-003"
  );
  assert.equal(
    currentProductIdFromOperationId("PDT-FCMP-002-V1-ETSY-PUBLISH-R01"),
    null
  );
});
