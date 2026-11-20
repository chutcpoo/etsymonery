import assert from "node:assert/strict";
import test from "node:test";
import {
  computePlanSha256,
  DurableProductPlanStore,
  MemoryProductCreationPlanRepository,
  verifyBuildPrerequisites,
  type BuyerFilePlanItem
} from "../lib/product-creation-plan";
import { createValidSmokeTestPlan } from "../lib/product-creation-plan/seed-plans";

test("approval SHA includes nested buyer files, listing images and Etsy fields", () => {
  const plan = createValidSmokeTestPlan();
  const hash = computePlanSha256(plan);

  const buyerFileEdit = structuredClone(plan);
  buyerFileEdit.buyerFiles[0].filename += "-revised";
  assert.notEqual(computePlanSha256(buyerFileEdit), hash);

  const imageEdit = structuredClone(plan);
  imageEdit.listingImagePlan[0].headline += " revised";
  assert.notEqual(computePlanSha256(imageEdit), hash);

  const listingEdit = structuredClone(plan);
  listingEdit.etsyPlan.thirteenTags[0] += "-revised";
  assert.notEqual(computePlanSha256(listingEdit), hash);

  const reordered = structuredClone(plan);
  reordered.buyerFiles[0] = Object.fromEntries(
    Object.entries(reordered.buyerFiles[0]).reverse()
  ) as BuyerFilePlanItem;
  assert.equal(computePlanSha256(reordered), hash);
});

test("re-running QC revokes seller approval after nested content drift", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidSmokeTestPlan();
  const saved = await store.savePlan(plan);
  assert.equal(saved.qcResult.passed, true);
  const approved = await store.approvePlan(saved.planId, undefined, saved.planSha256);
  assert.equal(approved.status, "PLAN_APPROVED");

  // Simulate a changed persisted buyer-file spec retaining its former approval.
  const changed = structuredClone(approved);
  changed.plan.buyerFiles[0].filename += "-revised";
  await repo.save(changed);

  const firstCheck = await verifyBuildPrerequisites({
    productId: plan.productId, planId: saved.planId,
    planSha256: saved.planSha256, store, overridePlanRequired: true
  });
  assert.equal(firstCheck.allowed, false);
  if (!firstCheck.allowed) assert.match(firstCheck.reason, /PLAN_STALE/);

  const rechecked = await store.runQC(saved.planId);
  assert.equal(rechecked.status, "PLAN_STALE");
  assert.equal(rechecked.approvedAt, null);
  assert.notEqual(rechecked.planSha256, approved.planSha256);

  const secondCheck = await verifyBuildPrerequisites({
    productId: plan.productId, planId: saved.planId,
    planSha256: saved.planSha256, store, overridePlanRequired: true
  });
  assert.equal(secondCheck.allowed, false);
});

test("re-running QC revokes approval when a previously approved plan now fails rules", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidSmokeTestPlan();
  const saved = await store.savePlan(plan);
  const approved = await store.approvePlan(saved.planId, undefined, saved.planSha256);
  const changed = structuredClone(approved);
  changed.plan.productName = "TBD";
  changed.planSha256 = computePlanSha256(changed.plan);
  await repo.save(changed);

  const rechecked = await store.runQC(saved.planId);
  assert.equal(rechecked.qcResult.passed, false);
  assert.notEqual(rechecked.status, "PLAN_APPROVED");
  assert.equal(rechecked.approvedAt, null);
});
