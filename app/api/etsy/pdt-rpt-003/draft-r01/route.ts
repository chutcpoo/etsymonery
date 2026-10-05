import { GET as handleDraftR01 } from "../../../internal/etsy/post-reset-v2/pdt-rpt-003/draft-create-r01/route";

import { enforceBuildGateForRoute } from "../../../../../lib/product-creation-plan";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // BLOCKER 1 — CENTRAL BUILD GATE (verifies plan approval; LEGACY_EXEMPT passes through)
  const _buildGateBlock = await enforceBuildGateForRoute("PDT-RPT-003", "RPT_003_DRAFT_R01_PUBLIC");
  if (_buildGateBlock) return _buildGateBlock;

  return handleDraftR01(request);
}
