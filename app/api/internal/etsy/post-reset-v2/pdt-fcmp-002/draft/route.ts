import { NextResponse } from "next/server";
import { enforceBuildGateForRoute } from "../../../../../../../lib/product-creation-plan";
import {
  handlePdtFcmp002V1Post,
  pdtFcmp002V1Plan,
  verifyPdtFcmp002V1ProtectedState
} from "../../../../../../../lib/pdt-fcmp-002-v1-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // BLOCKER 1 — CENTRAL BUILD GATE (verifies plan approval; LEGACY_EXEMPT passes through)
  const _buildGateBlock = await enforceBuildGateForRoute("PDT-FCMP-002", "FCMP_002_DRAFT");
  if (_buildGateBlock) return _buildGateBlock;

  const url = new URL(request.url);
  if (url.searchParams.get("action") === "verify_protected_state") {
    return verifyPdtFcmp002V1ProtectedState();
  }
  return NextResponse.json(pdtFcmp002V1Plan());
}

export async function POST(request: Request) {
  // BLOCKER 1 — CENTRAL BUILD GATE (verifies plan approval; LEGACY_EXEMPT passes through)
  const _buildGateBlock = await enforceBuildGateForRoute("PDT-FCMP-002", "FCMP_002_DRAFT_POST");
  if (_buildGateBlock) return _buildGateBlock;

  return handlePdtFcmp002V1Post(request);
}
