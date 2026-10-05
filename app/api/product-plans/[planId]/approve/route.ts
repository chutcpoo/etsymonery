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
    const approved = await globalPlanStore.approvePlan(planId);

    return NextResponse.json({
      status: "PLAN_APPROVED",
      planId: approved.planId,
      productId: approved.productId,
      planSha256: approved.planSha256,
      approvedAt: approved.approvedAt,
      scores: approved.qcResult.scores
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = msg.includes("PRODUCT_PLAN_NOT_FOUND")
      ? 404
      : msg.includes("CANNOT_APPROVE_PLAN")
      ? 422
      : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
