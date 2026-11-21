import { NextRequest, NextResponse } from "next/server";
import { authorizeEtsyOperatorRequest, privateHeaders } from "../../../../../../lib/etsy-operator-auth";
import { migrationPreflight } from "../../../../../../lib/etsy-oauth-migration";
import { latestMigrationCandidate } from "../../../../../../lib/etsy-oauth-migration-store";
import { getStoredEtsyGrantMetadata } from "../../../../../../lib/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Operator-only metadata. Never return tokens, verifier, state or OAuth code.
export async function GET(request: NextRequest) {
  const denied = await authorizeEtsyOperatorRequest(request, "seller", true);
  if (denied) return denied;
  try {
    const primary = await getStoredEtsyGrantMetadata();
    const settings = migrationPreflight(request.url, primary);
    const candidate = await latestMigrationCandidate();
    return NextResponse.json({
      migration: "STAGING_ONLY_UNTIL_SEPARATE_PROMOTION_APPROVAL",
      expectedShopId: settings.shopId,
      expectedUserId: settings.userId,
      candidate,
      ETSY_WRITE_COUNT: 0
    }, { headers: privateHeaders });
  } catch (error) {
    const code = error instanceof Error && /^[A-Z_]{5,80}$/.test(error.message)
      ? error.message : "OAUTH_MIGRATION_PREFLIGHT_FAILED";
    return NextResponse.json({ status: "BLOCKED", error: code, ETSY_WRITE_COUNT: 0 },
      { status: 503, headers: privateHeaders });
  }
}
