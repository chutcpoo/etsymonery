import test from "node:test";
import assert from "node:assert/strict";
import { nextStage, validateWorkflowInput } from "../lib/local-factory-workflow";

test("local workflow requires named product and specific buyer", () => {
  assert.throws(() => validateWorkflowInput({ title: "", buyer: "shop owner" }), /INVALID/);
  assert.throws(() => validateWorkflowInput({ title: "Cake calculator", buyer: "" }), /INVALID/);
  assert.throws(() => validateWorkflowInput({ title: "Cake calculator", buyer: "Baker", evidenceUrl: "javascript:alert(1)" }), /INVALID_EVIDENCE_URL/);
  assert.equal(validateWorkflowInput({ title: "Cake calculator", buyer: "Bakery" }).title, "Cake calculator");
});
test("workflow cannot skip stages and requires evidence at gates", () => {
  const blank = { evidenceUrl: null, qaPassed: false, listingId: null };
  assert.throws(() => nextStage("RESEARCH", blank), /RESEARCH_EVIDENCE_REQUIRED/);
  assert.equal(nextStage("RESEARCH", { ...blank, evidenceUrl: "https://example.com/research" }), "BLUEPRINT");
  assert.equal(nextStage("BLUEPRINT", blank), "BUILD");
  assert.throws(() => nextStage("BUILD", blank), /BUILD_EVIDENCE_REQUIRED/);
  assert.equal(nextStage("BUILD", { ...blank, evidenceUrl: "https://example.com/build" }), "QA");
  assert.throws(() => nextStage("QA", { ...blank, evidenceUrl: "https://example.com/test" }), /QA_RELEASE_EVIDENCE_REQUIRED/);
  assert.throws(() => nextStage("QA", { ...blank, evidenceUrl: "https://example.com/test", qaPassed: true }), /QA_RELEASE_EVIDENCE_REQUIRED/);
  assert.equal(nextStage("QA", { ...blank, releaseGatePassed: true }), "READY");
  assert.throws(() => nextStage("READY", { ...blank, evidenceUrl: "https://example.com/listing" }), /MANUAL_PUBLISH_EVIDENCE_REQUIRED/);
  assert.equal(nextStage("READY", { ...blank, evidenceUrl: "https://example.com/listing", listingId: 123 }), "PUBLISHED");
  assert.throws(() => nextStage("PUBLISHED", blank), /INVALID_STAGE_TRANSITION/);
});
