import { NextResponse } from "next/server";
import {
  prepareNewProductCandidate,
  validateNewProductManifest
} from "../../../../lib/post-reset-platform";
import { verifyBuildPrerequisites } from "../../../../lib/product-creation-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "BLOCKED", errors: ["INVALID_JSON"], EtsyWriteCount: 0 }, { status: 400 });
  }

  const validated = validateNewProductManifest(body);
  if (!validated.ok) {
    return NextResponse.json(
      { status: "BLOCKED", errors: validated.errors, EtsyWriteCount: 0 },
      { status: 422 }
    );
  }

  // Central Build Gate Enforcement (TASK 4 & 5)
  const gateCheck = await verifyBuildPrerequisites({
    productId: validated.manifest.productId,
    builder: "PRODUCT_PREPARATION_ROUTE"
  });

  if (!gateCheck.allowed) {
    return NextResponse.json(
      {
        status: "BUILD_BLOCKED",
        errors: [gateCheck.reason],
        details: gateCheck.details,
        EtsyWriteCount: 0
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ...prepareNewProductCandidate(validated.manifest),
    next: "FRESH_PROTECTED_STATE_VERIFICATION",
    planGateStatus: gateCheck.status,
    ...(gateCheck.status === "BUILD_PERMITTED" ? { evidence: gateCheck.evidence } : {}),
    note: "Preparation only. No Etsy listing, draft, asset upload, price change, or publish action was performed."
  });
}
