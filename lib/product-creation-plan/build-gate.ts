import { createHash } from "node:crypto";
import { globalPlanStore, type PlanStorage } from "./store";
import { computePlanSha256 } from "./types";
import { isProductPlanRequired } from "./policy";

export interface BuildPrerequisitesInput {
  productId: string;
  planId?: string;
  planSha256?: string;
  builder?: string;
  store?: PlanStorage;
  overridePlanRequired?: boolean;
}

export interface BuildEvidenceRecord {
  productId: string;
  planId: string;
  planVersion: number;
  planSha256: string;
  approvedAt: string;
  buildStartedAt: string;
  buildCorrelationId: string;
  builder: string;
  result: "BUILD_PERMITTED";
}

export type BuildPrerequisitesResult =
  | {
      allowed: true;
      status: "BUILD_PERMITTED";
      productId: string;
      planId: string;
      planSha256: string;
      approvedAt: string;
      evidence: BuildEvidenceRecord;
    }
  | {
      allowed: true;
      status: "LEGACY_EXEMPT";
      productId: string;
      planId: null;
      planSha256: null;
      approvedAt: null;
      message: string;
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
  const { productId } = input;

  // Check if this product requires an approved plan (Policy check)
  const requiresPlan = isProductPlanRequired(productId, {
    planRequired: input.overridePlanRequired
  });

  if (!requiresPlan) {
    return {
      allowed: true,
      status: "LEGACY_EXEMPT",
      productId,
      planId: null,
      planSha256: null,
      approvedAt: null,
      message: `Product ${productId} is identified as a legacy exempt product. Plan gate bypassed for backward compatibility.`
    };
  }

  const store = input.store ?? globalPlanStore;
  const plan = input.planId
    ? await store.getPlan(input.planId)
    : await store.getPlanByProductId(productId);

  if (!plan) {
    return {
      allowed: false,
      status: "BUILD_BLOCKED",
      reason: `NO_APPROVED_PLAN_FOUND: No creation plan found for product ${productId}. Product creation requires an approved plan before build.`,
      productId
    };
  }

  if (plan.productId !== productId) {
    return {
      allowed: false,
      status: "BUILD_BLOCKED",
      reason: `PLAN_PRODUCT_MISMATCH: Plan ${plan.planId} is for ${plan.productId}, not ${productId}.`,
      productId
    };
  }

  if (plan.status !== "PLAN_APPROVED") {
    return {
      allowed: false,
      status: "BUILD_BLOCKED",
      reason: `PLAN_NOT_APPROVED: Plan status is ${plan.status}. Only PLAN_APPROVED plans may proceed to build.`,
      productId,
      details: {
        currentStatus: plan.status,
        qcPassed: plan.qcResult?.passed ?? false,
        issues: plan.qcResult?.issues ?? []
      }
    };
  }

  // Check content drift (TASK 8)
  const actualHash = computePlanSha256(plan.plan);
  if (actualHash !== plan.planSha256) {
    return {
      allowed: false,
      status: "BUILD_BLOCKED",
      reason: `PLAN_STALE: Plan contents have drifted from frozen hash ${plan.planSha256}. Re-run Plan QC and approve before build.`,
      productId
    };
  }

  // If caller provided planSha256, verify exact match
  if (input.planSha256 && input.planSha256 !== plan.planSha256) {
    return {
      allowed: false,
      status: "BUILD_BLOCKED",
      reason: `PLAN_HASH_MISMATCH: Caller provided hash ${input.planSha256} does not match approved frozen hash ${plan.planSha256}.`,
      productId
    };
  }

  // Verify unresolved critical/high risks (TASK 5)
  const unresolvedRisks = (plan.plan.planRisks ?? []).filter(
    (r) => (r.severity === "CRITICAL" || r.severity === "HIGH") && !r.resolved
  );
  if (unresolvedRisks.length > 0) {
    return {
      allowed: false,
      status: "BUILD_BLOCKED",
      reason: `UNRESOLVED_CRITICAL_HIGH_RISKS: Build cannot start while critical or high risks remain unresolved.`,
      productId,
      details: { unresolvedRisks }
    };
  }

  const buildStartedAt = new Date().toISOString();
  const correlationHash = createHash("sha256")
    .update(`${productId}:${plan.planId}:${buildStartedAt}`)
    .digest("hex")
    .slice(0, 12);
  const buildCorrelationId = `BLD-${productId}-${correlationHash}`;

  const evidence: BuildEvidenceRecord = {
    productId,
    planId: plan.planId,
    planVersion: plan.planVersion,
    planSha256: plan.planSha256,
    approvedAt: plan.approvedAt ?? buildStartedAt,
    buildStartedAt,
    buildCorrelationId,
    builder: input.builder || "UNKNOWN_BUILDER",
    result: "BUILD_PERMITTED"
  };

  return {
    allowed: true,
    status: "BUILD_PERMITTED",
    productId: plan.productId,
    planId: plan.planId,
    planSha256: plan.planSha256,
    approvedAt: plan.approvedAt ?? buildStartedAt,
    evidence
  };
}

/**
 * Central enforcement assertion (TASK 5).
 * Throws an Error if build prerequisites are not met.
 */
export async function assertApprovedProductPlanForBuild(
  input: BuildPrerequisitesInput
): Promise<BuildPrerequisitesResult> {
  const result = await verifyBuildPrerequisites(input);
  if (!result.allowed) {
    throw new Error(`BUILD_BLOCKED:${result.reason}`);
  }
  return result;
}

/**
 * BLOCKER 1 — CENTRAL GATE FOR NEXT.JS ROUTE HANDLERS:
 *
 * Calls verifyBuildPrerequisites and returns a NextResponse (HTTP 409)
 * if the gate blocks the request, or null if the request may proceed.
 *
 * Usage in internal/legacy route handlers (before any Etsy mutation):
 *
 *   const blocked = await enforceBuildGateForRoute("PDT-SOME-ID", "ROUTE_NAME");
 *   if (blocked) return blocked;
 *   // ... proceed with Etsy mutation
 *
 * For legacy-exempt products, verifyBuildPrerequisites returns LEGACY_EXEMPT
 * and this function returns null (pass-through). The gate still runs —
 * the call is auditable and logged in the response header.
 *
 * For new/unknown products without an approved plan, returns HTTP 409
 * with BUILD_BLOCKED status. This prevents any bypass path for Product 04+.
 */
export async function enforceBuildGateForRoute(
  productId: string,
  builderName: string,
  store?: PlanStorage
): Promise<import("next/server").NextResponse | null> {
  const { NextResponse } = await import("next/server");

  let result: BuildPrerequisitesResult;
  try {
    result = await verifyBuildPrerequisites({ productId, builder: builderName, store });
  } catch (err) {
    return NextResponse.json(
      {
        status: "BUILD_GATE_ERROR",
        productId,
        error: err instanceof Error ? err.message : "UNKNOWN_GATE_ERROR",
        EtsyWriteCount: 0
      },
      { status: 500 }
    );
  }

  if (!result.allowed) {
    return NextResponse.json(
      {
        status: "BUILD_BLOCKED",
        productId,
        reason: result.reason,
        details: result.details,
        EtsyWriteCount: 0
      },
      { status: 409 }
    );
  }

  // Gate passed (LEGACY_EXEMPT or BUILD_PERMITTED) — return null to continue.
  return null;
}
