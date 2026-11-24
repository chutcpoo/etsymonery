import test from "node:test";
import assert from "node:assert/strict";
import { workflowErrorMessage } from "../lib/workflow-feedback";
import { nextStage } from "../lib/local-factory-workflow";

test("research missing evidence explains blocked advance in plain language", () => {
  let code = "";
  try { nextStage("RESEARCH", { evidenceUrl: null, qaPassed: false, listingId: null }); }
  catch (error) { code = (error as Error).message; }
  assert.equal(workflowErrorMessage(code), "Cannot advance to Blueprint: Research evidence URL is required.");
});
test("each QA gate has an actionable error", () => {
  for (const [code, fragment] of [
    ["BUILD_EVIDENCE_REQUIRED", "Build evidence URL"],
    ["QA_RELEASE_EVIDENCE_REQUIRED", "fully verified release QA record"],
    ["MANUAL_PUBLISH_EVIDENCE_REQUIRED", "manually published Etsy Listing ID"],
    ["WORKFLOW_REVISION_CONFLICT", "Refresh"],
  ]) assert.match(workflowErrorMessage(code), new RegExp(fragment));
});
test("all stage transitions through READY with verifiable code evidence links, without Etsy writes", () => {
  // These URLs identify existing repository artifacts, not invented marketplace listings.
  const research = "https://github.com/chutcpoo/etsymonery/pull/295";
  const build = "https://github.com/chutcpoo/etsymonery/pull/296";
  const qa = "https://github.com/chutcpoo/etsymonery/blob/restore-dashboard-20261121/tests/local-factory-workflow.test.ts";
  const input = { evidenceUrl: research, qaPassed: false, listingId: null };
  assert.equal(nextStage("RESEARCH", input), "BLUEPRINT");
  assert.equal(nextStage("BLUEPRINT", input), "BUILD");
  assert.equal(nextStage("BUILD", { ...input, evidenceUrl: build }), "QA");
  assert.throws(() => nextStage("QA", { ...input, evidenceUrl: qa }), /QA_RELEASE_EVIDENCE_REQUIRED/);
  assert.throws(() => nextStage("QA", { ...input, evidenceUrl: qa, qaPassed: true }), /QA_RELEASE_EVIDENCE_REQUIRED/);
  assert.equal(nextStage("QA", { ...input, evidenceUrl: qa, releaseGatePassed: true }), "READY");
  assert.throws(() => nextStage("READY", { ...input, evidenceUrl: qa }), /MANUAL_PUBLISH_EVIDENCE_REQUIRED/);
});
