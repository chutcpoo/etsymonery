import test from "node:test";
import assert from "node:assert/strict";
import { createValidSmokeTestPlan } from "../lib/product-creation-plan/seed-plans";
import { POST as create } from "../app/api/product-plans/create/route";
import { POST as approve } from "../app/api/product-plans/[planId]/approve/route";
import { POST as qc } from "../app/api/product-plans/[planId]/qc/route";
import { POST as build } from "../app/api/products/[productId]/build/route";

test("distinct credentials create, review, approve a frozen revision and build locally", async () => {
  const roles = { edit: "ETSY_PLAN_EDITOR_TOKEN", qc: "ETSY_QC_REVIEWER_TOKEN", owner: "ETSY_SELLER_APPROVER_TOKEN" };
  const credential = (role: string) => "offline-plan-integration-test-" + role + "-123456789";
  for (const [role, key] of Object.entries(roles)) process.env[key] = credential(role);
  function request(role: string, body = {}, hash?: string) {
    return new Request("https://fixture.test", { method: "POST", headers: {
      authorization: "Bearer " + credential(role), "content-type": "application/json",
      ...(hash ? { "if-match": '"' + hash + '"' } : {})
    }, body: JSON.stringify(body) });
  }
  const plan = createValidSmokeTestPlan();
  const created = await create(request("edit", { plan }));
  assert.equal(created.status, 201);
  const { planId, planSha256 } = await created.json();
  const props = { params: Promise.resolve({ planId }) };
  assert.equal((await qc(request("edit"), props)).status, 401);
  assert.equal((await qc(request("qc"), props)).status, 200);
  assert.equal((await approve(request("edit", {}, planSha256), props)).status, 401);
  assert.equal((await approve(request("owner"), props)).status, 428);
  assert.equal((await approve(request("owner", {}, "b".repeat(64)), props)).status, 412);
  assert.equal((await approve(request("owner", {}, planSha256), props)).status, 200);
  const result = await build(request("edit", { planId, planSha256 }), { params: Promise.resolve({ productId: plan.productId }) });
  assert.equal((await result.json()).status, "BUILD_PERMITTED");
  process.env.ETSY_QC_REVIEWER_TOKEN = credential("edit");
  assert.equal((await qc(request("edit"), props)).status, 503);
});
