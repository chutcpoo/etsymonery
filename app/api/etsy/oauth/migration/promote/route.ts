import { NextRequest, NextResponse } from "next/server";
import { authorizeEtsyOperatorRequest, privateHeaders } from "../../../../../../lib/etsy-operator-auth";
import { migrationPreflight, reviewedReference } from "../../../../../../lib/etsy-oauth-migration";
import { promoteMigrationGrant } from "../../../../../../lib/etsy-oauth-migration-store";
import { getStoredEtsyGrantMetadata } from "../../../../../../lib/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Separate release approval, exact candidate ID and a Bearer credential are
// required; the OAuth callback can only STAGE and never call this route.
export async function POST(request: NextRequest) {
  if (process.env.ETSY_OAUTH_MIGRATION_ENABLED !== "true" ||
      process.env.ETSY_OAUTH_MIGRATION_PROMOTION_ENABLED !== "true" ||
      !reviewedReference(process.env.ETSY_OAUTH_MIGRATION_PROMOTION_APPROVAL_REF))
    return NextResponse.json({ status: "BLOCKED", error: "PROMOTION_REQUIRES_OWNER_APPROVAL" },
      { status: 403, headers: privateHeaders });

  const denied = await authorizeEtsyOperatorRequest(request, "seller", false);
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json({ status: "BLOCKED", error: "PROMOTION_CROSS_ORIGIN_FORBIDDEN" },
      { status: 403, headers: privateHeaders });

  const candidateId = process.env.ETSY_OAUTH_MIGRATION_PROMOTION_CANDIDATE_ID?.trim() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(candidateId) ||
      request.headers.get("if-match") !== `"${candidateId}"`)
    return NextResponse.json({ status: "BLOCKED", error: "EXACT_CANDIDATE_APPROVAL_REQUIRED" },
      { status: 428, headers: privateHeaders });

  try {
    const settings = migrationPreflight(request.url, await getStoredEtsyGrantMetadata());
    const result = await promoteMigrationGrant(candidateId, settings);
    return NextResponse.json({ ...result, ETSY_WRITE_COUNT: 0 }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ status: "BLOCKED", error: "MIGRATION_PROMOTION_ABORTED" },
      { status: 503, headers: privateHeaders });
  }
}
