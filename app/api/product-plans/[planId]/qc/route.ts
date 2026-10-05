import { NextResponse } from "next/server";
import { globalPlanStore } from "../../../../../lib/product-creation-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  props: { params: Promise<{ planId: string }> }
) {
  try {
    const { planId } = await props.params;
    const plan = await globalPlanStore.runQC(planId);

    return NextResponse.json({
      status: plan.qcResult.status,
      passed: plan.qcResult.passed,
      planId: plan.planId,
      productId: plan.productId,
      planSha256: plan.planSha256,
      scores: plan.qcResult.scores,
      issues: plan.qcResult.issues,
      evaluatedAt: plan.qcResult.evaluatedAt
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = msg.includes("PRODUCT_PLAN_NOT_FOUND") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
