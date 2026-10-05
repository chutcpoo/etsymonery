import { NextResponse } from "next/server";
import { enforceBuildGateForRoute } from "../../../../../../../lib/product-creation-plan";
import {
  handlePdtIpt001V2Post,
  pdtIpt001V2Plan
} from "../../../../../../../lib/pdt-ipt-001-v2-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // BLOCKER 1 — CENTRAL BUILD GATE (verifies plan approval; LEGACY_EXEMPT passes through)
  const _buildGateBlock = await enforceBuildGateForRoute("PDT-IPT-001", "IPT_001_DRAFT");
  if (_buildGateBlock) return _buildGateBlock;

  return NextResponse.json(pdtIpt001V2Plan());
}

export async function POST(request: Request) {
  // BLOCKER 1 — CENTRAL BUILD GATE (verifies plan approval; LEGACY_EXEMPT passes through)
  const _buildGateBlock = await enforceBuildGateForRoute("PDT-IPT-001", "IPT_001_DRAFT_POST");
  if (_buildGateBlock) return _buildGateBlock;

  return handlePdtIpt001V2Post(request);
}
