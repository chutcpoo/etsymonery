import { NextResponse } from "next/server";
import { verifyBuildPrerequisites } from "../../../../../lib/product-creation-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  props: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await props.params;
    let body: { planId?: string; planSha256?: string } = {};

    try {
      body = (await request.json()) as { planId?: string; planSha256?: string };
    } catch {
      // Body may be empty
    }

    const check = await verifyBuildPrerequisites({
      productId,
      planId: body.planId,
      planSha256: body.planSha256
    });

    if (!check.allowed) {
      return NextResponse.json(
        {
          status: "BUILD_BLOCKED",
          productId,
          reason: check.reason,
          details: check.details
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      status: "BUILD_PERMITTED",
      productId: check.productId,
      planId: check.planId,
      planSha256: check.planSha256,
      approvedAt: check.approvedAt,
      message: "Approved frozen plan validated. Product build is authorized."
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "UNKNOWN_ERROR" },
      { status: 500 }
    );
  }
}
