import assert from "node:assert/strict";
import test from "node:test";
import {
  FACTORY_DOMAIN_SCHEMA_VERSION,
  type Authorization,
  type GateRecord
} from "../lib/factory-domain-schemas";
import {
  GATE_CHANGE_MATRIX,
  GATE_INVALIDATION_POLICY_VERSION,
  GATE_ORDER,
  evaluateGateChain,
  invalidationForChange,
  isAuthorizationUsableForGateChain,
  type GateBindingRequirements
} from "../lib/gate-invalidation-engine";

const FP_PRODUCT = "1".repeat(64);
const FP_LISTING = "2".repeat(64);
const FP_STALE = "3".repeat(64);
const NOW = "2026-09-05T06:00:00.000Z";

function requirements(): GateBindingRequirements {
  return {
    PRODUCT_TEST: { candidateId: "PROD-V1", candidateFingerprint: FP_PRODUCT },
    LISTING_TEST: { candidateId: "LIST-V1", candidateFingerprint: FP_LISTING },
    PERSISTENCE_VERIFY: { candidateId: "LIST-V1", candidateFingerprint: FP_LISTING },
    INDEPENDENT_FINAL_QC: { candidateId: "LIST-V1", candidateFingerprint: FP_LISTING }
  };
}

function gate(gateType: GateRecord["gateType"], overrides: Partial<GateRecord> = {}): GateRecord {
  const binding = gateType === "PRODUCT_TEST"
    ? requirements().PRODUCT_TEST
    : requirements().LISTING_TEST;
  return {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    gateRecordId: `GATE-${gateType}`,
    gateType,
    result: "PASS",
    candidateId: binding.candidateId,
    candidateFingerprint: binding.candidateFingerprint,
    executionId: `EXEC-${gateType}`,
    actorId: `ACTOR-${gateType}`,
    createdAt: NOW,
    evidenceIds: [`EVIDENCE-${gateType}`],
    ...overrides
  };
}

function passingGates() {
  return GATE_ORDER.map((gateType) => gate(gateType));
}

function authorization(overrides: Partial<Authorization> = {}): Authorization {
  return {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    authorizationId: "AUTH-301",
    scope: "PUBLISH",
    candidateId: "LIST-V1",
    candidateFingerprint: FP_LISTING,
    channel: "etsy",
    state: "ACTIVE",
    issuedAt: NOW,
    ...overrides
  };
}

test("canonical change matrix invalidates only affected and downstream targets", () => {
  assert.deepEqual(GATE_CHANGE_MATRIX.PRODUCT_OR_ARTIFACT, [
    "PRODUCT_TEST", "LISTING_TEST", "PERSISTENCE_VERIFY", "INDEPENDENT_FINAL_QC", "AUTHORIZATION"
  ]);
  assert.deepEqual(GATE_CHANGE_MATRIX.LISTING, [
    "LISTING_TEST", "PERSISTENCE_VERIFY", "INDEPENDENT_FINAL_QC", "AUTHORIZATION"
  ]);
  assert.deepEqual(GATE_CHANGE_MATRIX.PERSISTENCE_IDENTITY, [
    "PERSISTENCE_VERIFY", "INDEPENDENT_FINAL_QC", "AUTHORIZATION"
  ]);
  assert.deepEqual(GATE_CHANGE_MATRIX.FINAL_QC_RELEVANT, ["INDEPENDENT_FINAL_QC", "AUTHORIZATION"]);
  assert.deepEqual(GATE_CHANGE_MATRIX.NON_MATERIAL, []);
});

test("all exact bound PASS records make the chain eligible for production authorization", () => {
  const result = evaluateGateChain(requirements(), passingGates());
  assert.equal(result.policyVersion, GATE_INVALIDATION_POLICY_VERSION);
  assert.equal(result.eligibleForProductionAuthorization, true);
  assert.deepEqual(result.gates.map((item) => item.status), ["PASS", "PASS", "PASS", "PASS"]);
});

test("stale PASS on an old fingerprint is never accepted for the required binding", () => {
  const records = passingGates().filter((record) => record.gateType !== "INDEPENDENT_FINAL_QC");
  records.push(gate("INDEPENDENT_FINAL_QC", { candidateFingerprint: FP_STALE }));
  const result = evaluateGateChain(requirements(), records);
  assert.equal(result.gates.at(-1)?.status, "MISSING");
  assert.equal(result.eligibleForProductionAuthorization, false);
});

test("latest exact-bound FAIL supersedes an older PASS for the same gate", () => {
  const records = passingGates();
  records.push(gate("LISTING_TEST", {
    gateRecordId: "GATE-LISTING-FAIL",
    result: "FAIL",
    createdAt: "2026-09-05T06:01:00.000Z",
    evidenceIds: []
  }));
  const result = evaluateGateChain(requirements(), records);
  assert.equal(result.gates[1].status, "FAIL");
  assert.equal(result.eligibleForProductionAuthorization, false);
});

test("a newer PASS restores a gate only for the same exact binding", () => {
  const records = passingGates();
  records.push(gate("PERSISTENCE_VERIFY", {
    gateRecordId: "GATE-PERSIST-FAIL",
    result: "FAIL",
    createdAt: "2026-09-05T06:01:00.000Z",
    evidenceIds: []
  }));
  records.push(gate("PERSISTENCE_VERIFY", {
    gateRecordId: "GATE-PERSIST-REPASS",
    createdAt: "2026-09-05T06:02:00.000Z"
  }));
  assert.equal(evaluateGateChain(requirements(), records).eligibleForProductionAuthorization, true);
});

test("product test can remain bound to product candidate while downstream gates bind listing candidate", () => {
  const result = evaluateGateChain(requirements(), passingGates());
  assert.equal(result.gates[0].requiredBinding.candidateId, "PROD-V1");
  assert.equal(result.gates[1].requiredBinding.candidateId, "LIST-V1");
  assert.equal(result.eligibleForProductionAuthorization, true);
});

test("listing change preserves product test but invalidates all listing/downstream targets", () => {
  const result = invalidationForChange("LISTING");
  assert.deepEqual(result.preservedTargets, ["PRODUCT_TEST"]);
  assert.deepEqual(result.invalidatedTargets, [
    "LISTING_TEST", "PERSISTENCE_VERIFY", "INDEPENDENT_FINAL_QC", "AUTHORIZATION"
  ]);
});

test("persistence identity change preserves upstream product and listing tests", () => {
  const result = invalidationForChange("PERSISTENCE_IDENTITY");
  assert.deepEqual(result.preservedTargets, ["PRODUCT_TEST", "LISTING_TEST"]);
});

test("non-material metadata change invalidates no gate or authorization", () => {
  const result = invalidationForChange("NON_MATERIAL");
  assert.deepEqual(result.invalidatedTargets, []);
  assert.deepEqual(result.preservedTargets, [
    "PRODUCT_TEST", "LISTING_TEST", "PERSISTENCE_VERIFY", "INDEPENDENT_FINAL_QC", "AUTHORIZATION"
  ]);
});

test("active exact-bound authorization is usable only when the full gate chain passes", () => {
  const chain = evaluateGateChain(requirements(), passingGates());
  assert.equal(isAuthorizationUsableForGateChain(
    authorization(),
    { candidateId: "LIST-V1", candidateFingerprint: FP_LISTING },
    chain
  ), true);
});

test("authorization bound to a stale fingerprint cannot authorize current candidate", () => {
  const chain = evaluateGateChain(requirements(), passingGates());
  assert.equal(isAuthorizationUsableForGateChain(
    authorization({ candidateFingerprint: FP_STALE }),
    { candidateId: "LIST-V1", candidateFingerprint: FP_LISTING },
    chain
  ), false);
});

test("revoked or consumed authorization cannot be used even when all gates pass", () => {
  const chain = evaluateGateChain(requirements(), passingGates());
  assert.equal(isAuthorizationUsableForGateChain(
    authorization({ state: "REVOKED" }),
    { candidateId: "LIST-V1", candidateFingerprint: FP_LISTING },
    chain
  ), false);
  assert.equal(isAuthorizationUsableForGateChain(
    authorization({ state: "CONSUMED", consumedAt: "2026-09-05T06:02:00.000Z" }),
    { candidateId: "LIST-V1", candidateFingerprint: FP_LISTING },
    chain
  ), false);
});

test("authorization is unusable when any required gate is missing", () => {
  const chain = evaluateGateChain(requirements(), passingGates().slice(0, 3));
  assert.equal(chain.eligibleForProductionAuthorization, false);
  assert.equal(isAuthorizationUsableForGateChain(
    authorization(),
    { candidateId: "LIST-V1", candidateFingerprint: FP_LISTING },
    chain
  ), false);
});

test("evaluation is deterministic regardless of input gate record order", () => {
  const records = passingGates();
  const first = evaluateGateChain(requirements(), records);
  const second = evaluateGateChain(requirements(), [...records].reverse());
  assert.deepEqual(first, second);
});

test("gate evaluation is read-only and does not mutate requirements or records", () => {
  const req = requirements();
  const records = passingGates();
  const reqBefore = structuredClone(req);
  const recordsBefore = structuredClone(records);
  evaluateGateChain(req, records);
  assert.deepEqual(req, reqBefore);
  assert.deepEqual(records, recordsBefore);
});
