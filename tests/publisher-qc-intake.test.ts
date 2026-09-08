import assert from "node:assert/strict";
import test from "node:test";
import { buildPublishPlan } from "../lib/publisher";

const base = {
  productId: "PDT-HBOP-001",
  title: "Digital Operations Template",
  description: "Dry-run contract test only.",
  priceUsd: 9.99,
  files: ["buyer.zip"],
  channels: ["etsy" as const],
  productTruthVerified: true,
  tags: [
    "digital planner", "small business", "operations", "workflow", "business tool",
    "etsy template", "printable pdf", "spreadsheet", "daily planner", "shop workflow",
    "owner toolkit", "business system", "instant download"
  ],
  etsy: { taxonomyId: 1234, quantity: 999, whoMade: "i_did" as const, whenMade: "2020_2026" }
};

test("publisher rejects intake before QC_PASSED", () => {
  const plan = buildPublishPlan({
    ...base,
    etsy: { ...base.etsy, release: { productionBuildFrozen: true, testerPass: true, finalQcPass: false } }
  });
  assert.equal(plan.status, "BLOCKED");
  assert.deepEqual(plan.channels, []);
  assert.ok(plan.gate.errors.includes("PUBLISHER_REQUIRES_QC_PASSED"));
});

test("publisher accepts QC_PASSED intake but still does not allow live write", () => {
  const plan = buildPublishPlan({
    ...base,
    etsy: { ...base.etsy, release: { productionBuildFrozen: true, testerPass: true, finalQcPass: true, productionAuthorized: false } }
  });
  assert.equal(plan.status, "READY");
  assert.equal(plan.channels[0]?.releaseState, "PRODUCTION_AUTHORIZATION_PENDING");
  assert.equal(plan.channels[0]?.liveWriteAllowed, false);
});
