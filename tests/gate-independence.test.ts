import assert from "node:assert/strict";
import test from "node:test";
import { FACTORY_DOMAIN_SCHEMA_VERSION, type GateRecord } from "../lib/factory-domain-schemas";
import {
  GATE_INDEPENDENCE_POLICY_VERSION,
  assertIndependentFinalQc,
  evaluateFinalQcIndependence,
  validateGenerationIdentity
} from "../lib/gate-independence";

const FP = "a".repeat(64);
const generation = { candidateId: "CAND-1", candidateFingerprint: FP, executionId: "EXEC-GEN", actorId: "ACTOR-GEN" };
function qc(overrides: Partial<GateRecord> = {}): GateRecord {
  return {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION, gateRecordId: "QC-1", gateType: "INDEPENDENT_FINAL_QC", result: "PASS",
    candidateId: "CAND-1", candidateFingerprint: FP, executionId: "EXEC-QC", actorId: "ACTOR-QC",
    createdAt: "2026-09-05T06:30:00.000Z", evidenceIds: ["EVID-1"], ...overrides
  };
}

test("different execution and actor is independent", () => {
  const result = evaluateFinalQcIndependence(generation, qc());
  assert.equal(result.policyVersion, GATE_INDEPENDENCE_POLICY_VERSION);
  assert.equal(result.independent, true);
  assert.deepEqual(result.reasons, []);
});

test("same execution is rejected even with different actor", () => {
  const result = evaluateFinalQcIndependence(generation, qc({ executionId: "EXEC-GEN" }));
  assert.equal(result.independent, false);
  assert.deepEqual(result.reasons, ["SAME_EXECUTION"]);
});

test("same actor is rejected even with different execution", () => {
  const result = evaluateFinalQcIndependence(generation, qc({ actorId: "ACTOR-GEN" }));
  assert.equal(result.independent, false);
  assert.deepEqual(result.reasons, ["SAME_ACTOR"]);
});

test("same execution and actor reports both deterministic reasons", () => {
  const result = evaluateFinalQcIndependence(generation, qc({ executionId: "EXEC-GEN", actorId: "ACTOR-GEN" }));
  assert.deepEqual(result.reasons, ["SAME_ACTOR", "SAME_EXECUTION"]);
});

test("assertion returns canonical QC record only when independent", () => {
  assert.equal(assertIndependentFinalQc(generation, qc()).gateRecordId, "QC-1");
  assert.throws(() => assertIndependentFinalQc(generation, qc({ actorId: "ACTOR-GEN" })), /INDEPENDENT_FINAL_QC_REQUIRED:SAME_ACTOR/);
});

test("non-final-QC gate cannot claim independence", () => {
  assert.throws(() => evaluateFinalQcIndependence(generation, qc({ gateType: "LISTING_TEST" })), /FINAL_QC_GATE_REQUIRED/);
});

test("candidate ID mismatch fails closed", () => {
  assert.throws(() => evaluateFinalQcIndependence(generation, qc({ candidateId: "OTHER" })), /FINAL_QC_CANDIDATE_BINDING_MISMATCH/);
});

test("fingerprint mismatch fails closed", () => {
  assert.throws(() => evaluateFinalQcIndependence(generation, qc({ candidateFingerprint: "b".repeat(64) })), /FINAL_QC_CANDIDATE_BINDING_MISMATCH/);
});

test("generation identity normalizes fingerprint and preserves stable identity", () => {
  assert.deepEqual(validateGenerationIdentity({ ...generation, candidateFingerprint: FP.toUpperCase() }), generation);
});

test("invalid generation identity fails closed", () => {
  assert.throws(() => validateGenerationIdentity({ ...generation, executionId: "" }), /INVALID_GENERATION_EXECUTION_ID/);
  assert.throws(() => validateGenerationIdentity({ ...generation, candidateFingerprint: "bad" }), /INVALID_GENERATION_FINGERPRINT/);
});

test("evaluation is read-only", () => {
  const gen = structuredClone(generation); const gate = qc(); const gb = structuredClone(gen); const qb = structuredClone(gate);
  evaluateFinalQcIndependence(gen, gate); assert.deepEqual(gen, gb); assert.deepEqual(gate, qb);
});
