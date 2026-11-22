import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPublishProofScope,
  productIdFromOperationId
} from "../lib/control-center-v2";
import {
  classifyLedgerStatus,
  classifyOperationScope
} from "../lib/control-center-v3";

const currentProductIds = new Set([
  "PDT-CSCH-001",
  "PDT-PCL-002",
  "PDT-CPR-003"
]);

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

test("control center scopes operations from the authenticated live tracked product set", () => {
  assert.equal(
    classifyOperationScope("PDT-CSCH-001", currentProductIds),
    "CURRENT"
  );
  assert.equal(
    classifyOperationScope("PDT-PCL-002", currentProductIds),
    "CURRENT"
  );
  assert.equal(
    classifyOperationScope("PDT-CPR-003", currentProductIds),
    "CURRENT"
  );
  assert.equal(
    classifyOperationScope("PDT-FCMP-002", currentProductIds),
    "HISTORICAL_SUPERSEDED"
  );
  assert.equal(
    classifyOperationScope(null, currentProductIds),
    "HISTORICAL_SUPERSEDED"
  );
});

test("missing live marketplace evidence leaves operations unverified instead of misclassifying them historical", () => {
  assert.equal(classifyOperationScope("PDT-CPR-003", null), "UNVERIFIED");
  assert.equal(classifyOperationScope("PDT-FCMP-002", null), "UNVERIFIED");
  assert.equal(classifyOperationScope(null, null), "UNVERIFIED");
  assert.equal(classifyPublishProofScope("PDT-CPR-003", null), "UNVERIFIED");
});

test("operation IDs provide a generic product hint while live evidence determines current scope", () => {
  assert.equal(
    productIdFromOperationId("PDT-CPR-003-V1-ETSY-PUBLISH-R01"),
    "PDT-CPR-003"
  );
  assert.equal(
    productIdFromOperationId("PDT-FCMP-002-V1-ETSY-PUBLISH-R01"),
    "PDT-FCMP-002"
  );
  assert.equal(productIdFromOperationId("OP-WITHOUT-PRODUCT"), null);
  assert.equal(
    classifyPublishProofScope("PDT-FCMP-002", currentProductIds),
    "HISTORICAL_SUPERSEDED"
  );
});
