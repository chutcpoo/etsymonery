import { NextResponse } from "next/server";
import { globalPlanStore } from "../../../../lib/product-creation-plan";
import type { ProductCreationPlan } from "../../../../lib/product-creation-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { plan?: ProductCreationPlan; planId?: string } & ProductCreationPlan;
    const plan = (body.plan ?? body) as ProductCreationPlan;

    if (!plan || !plan.productId) {
      return NextResponse.json(
        { error: "INVALID_REQUEST_BODY: 'productId' is required in ProductCreationPlan." },
        { status: 400 }
      );
    }

    const saved = await globalPlanStore.savePlan(plan, body.planId);

    return NextResponse.json(
      {
        status: "PLAN_CREATED",
        planId: saved.planId,
        productId: saved.productId,
        planSha256: saved.planSha256,
        qcStatus: saved.qcResult.status,
        qcPassed: saved.qcResult.passed,
        scores: saved.qcResult.scores,
        issues: saved.qcResult.issues,
        plan: saved.plan
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "UNKNOWN_ERROR" },
      { status: 500 }
    );
  }
}
