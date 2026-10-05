import { globalPlanStore, type PlanStorage } from "./store";
import { computePlanSha256 } from "./types";

export interface BuildPrerequisitesInput {
  productId: string;
  planId?: string;
  planSha256?: string;
  store?: PlanStorage;
}

export type BuildPrerequisitesResult =
  | {
      allowed: true;
      status: "BUILD_PERMITTED";
      productId: string;
      planId: string;
      planSha256: string;
      approvedAt: string;
    }
  | {
      allowed: false;
      status: "BUILD_BLOCKED";
      reason: string;
      productId: string;
      details?: Record<string, unknown>;
    };

export async function verifyBuildPrerequisites(
  input: BuildPrerequisitesInput
): Promise<BuildPrerequisitesResult> {
  const store = input.store ?? globalPlanStore;
  const plan = input.planId
    ? await store.getPlan(input.planId)
    : await store.getPlanByProductId(input.productId);

  if (!plan) {
    return {
      allowed: false,
      status: "BUILD_BLOCKED",
      reason: `NO_APPROVED_PLAN_FOUND: No creation plan found for product ${input.productId}. Product creation requires an approved plan before build.`,
      productId: input.productId
    };
  }

  if (plan.productId !== input.productId) {
    return {
      allowed: false,
      status: "BUILD_BLOCKED",
      reason: `PLAN_PRODUCT_MISMATCH: Plan ${plan.planId} is for ${plan.productId}, not ${input.productId}.`,
      productId: input.productId
    };
  }

  if (plan.status !== "PLAN_APPROVED") {
    return {
      allowed: false,
      status: "BUILD_BLOCKED",
      reason: `PLAN_NOT_APPROVED: Plan status is ${plan.status}. Only PLAN_APPROVED plans may proceed to build.`,
      productId: input.productId,
      details: {
        currentStatus: plan.status,
        qcPassed: plan.qcResult?.passed ?? false,
        issues: plan.qcResult?.issues ?? []
      }
    };
  }

  // Check content drift
  const actualHash = computePlanSha256(plan.plan);
  if (actualHash !== plan.planSha256) {
    return {
      allowed: false,
      status: "BUILD_BLOCKED",
      reason: `PLAN_STALE: Plan contents have drifted from frozen hash ${plan.planSha256}. Re-run Plan QC and approve before build.`,
      productId: input.productId
    };
  }

  // If caller provided planSha256, verify exact match
  if (input.planSha256 && input.planSha256 !== plan.planSha256) {
    return {
      allowed: false,
      status: "BUILD_BLOCKED",
      reason: `PLAN_HASH_MISMATCH: Caller provided hash ${input.planSha256} does not match approved frozen hash ${plan.planSha256}.`,
      productId: input.productId
    };
  }

  // Verify unresolved critical/high risks
  const unresolvedRisks = (plan.plan.planRisks ?? []).filter(
    r => (r.severity === "CRITICAL" || r.severity === "HIGH") && !r.resolved
  );
  if (unresolvedRisks.length > 0) {
    return {
      allowed: false,
      status: "BUILD_BLOCKED",
      reason: `UNRESOLVED_CRITICAL_HIGH_RISKS: Build cannot start while critical or high risks remain unresolved.`,
      productId: input.productId,
      details: { unresolvedRisks }
    };
  }

  return {
    allowed: true,
    status: "BUILD_PERMITTED",
    productId: plan.productId,
    planId: plan.planId,
    planSha256: plan.planSha256,
    approvedAt: plan.approvedAt ?? new Date().toISOString()
  };
}
