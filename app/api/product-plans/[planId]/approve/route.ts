import { authorizePlanRequest } from "../../../../../lib/etsy-operator-auth";
import { NextResponse } from "next/server";
import { globalPlanStore } from "../../../../../lib/product-creation-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  props: { params: Promise<{ planId: string }> }
) {
  const denied = await authorizePlanRequest(request, "seller");
  if (denied) return denied;
  try {
    const { planId } = await props.params;
    const digest = request.headers.get("if-match")?.match(/^"([a-f0-9]{64})"$/)?.[1];
    if (!digest) return NextResponse.json({ error: "REVIEWED_PLAN_SHA256_REQUIRED" }, { status: 428 });
    const approved = await globalPlanStore.approvePlan(planId, undefined, digest);

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
    const status = msg === "REVIEWED_PLAN_CHANGED" ? 412 : msg.includes("PRODUCT_PLAN_NOT_FOUND")
      ? 404
      : msg.includes("CANNOT_APPROVE_PLAN")
      ? 422
      : 500;
    return NextResponse.json({ error: status === 500 ? "PLAN_STORE_UNAVAILABLE" : msg.split(":")[0] }, { status });
  }
}
