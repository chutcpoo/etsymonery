import { authorizePlanRequest } from "../../../../lib/etsy-operator-auth";
import { NextResponse } from "next/server";
import { globalPlanStore } from "../../../../lib/product-creation-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ planId: string }> }
) {
  const denied = await authorizePlanRequest(request, "read");
  if (denied) return denied;
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
      { error: "PLAN_STORE_UNAVAILABLE" },
      { status: 500 }
    );
  }
}
