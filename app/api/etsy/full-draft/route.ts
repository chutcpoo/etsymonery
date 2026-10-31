import { timingSafeEqual } from "node:crypto";
import { createStagedFullDraftHandler } from "../../../../lib/etsy-full-draft-staged";
import { readBackEtsyDraftAssets } from "../../../../lib/etsy-full-draft-readback";
import { parseGenericDraftRequest, createGenericDraftPostHandler } from "../../../../lib/etsy-generic-draft-create";
import { createEtsyDriveAssetBridgeHandler } from "../../../../lib/etsy-drive-asset-bridge";
import { fetchVerifiedGoogleDriveAsset } from "../../../../lib/google-drive-asset-source";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}
const handler = createStagedFullDraftHandler({
 validateListing: data => { parseGenericDraftRequest({...data, action: "PREFLIGHT"}); },
 verifyDriveAsset: asset => fetchVerifiedGoogleDriveAsset(asset),
 createDraft: createGenericDraftPostHandler(),
 uploadAsset: createEtsyDriveAssetBridgeHandler(),
 readBackAssets: data => readBackEtsyDraftAssets(data),
 isManifestApproved: hash => same(process.env.ETSY_FULL_DRAFT_APPROVED_MANIFEST_SHA256 ?? "", hash)
});
export async function POST(request: Request) {
 if (process.env.ETSY_FULL_DRAFT_ORCHESTRATOR_ENABLED !== "true") return Response.json({status: "BLOCKED", error: "FULL_DRAFT_DEFAULT_OFF", ETSY_WRITE_COUNT: 0}, {status: 503});
 const expected = process.env.ETSY_DRAFT_WRITE_TOKEN?.trim() ?? "";
 const actual = request.headers.get("x-autodigitalpublisher-write-token")?.trim() ?? "";
 if (!same(expected, actual)) return Response.json({status: "BLOCKED", error: "OPERATOR_AUTH_REQUIRED", ETSY_WRITE_COUNT: 0}, {status: 401});
 return handler(request);
}
export async function GET() {
 return Response.json({status: "CONFIGURATION_SNAPSHOT", mode: "READ_ONLY", staged: true,
  featureEnabled: process.env.ETSY_FULL_DRAFT_ORCHESTRATOR_ENABLED === "true", ETSY_WRITE_COUNT: 0},
  {headers: {"cache-control": "no-store"}});
}
