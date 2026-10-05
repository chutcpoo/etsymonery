import { NextResponse } from "next/server";
import { globalPlanStore } from "../../../../lib/product-creation-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  props: { params: Promise<{ planId: string }> }
) {
  try {
    const { planId } = await props.params;
    const plan = await globalPlanStore.getPlan(planId);

    if (!plan) {
      return NextResponse.json(
        { error: `PRODUCT_PLAN_NOT_FOUND:${planId}` },
        { status: 404 }
      );
    }

    return NextResponse.json(plan);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "UNKNOWN_ERROR" },
      { status: 500 }
    );
  }
}
