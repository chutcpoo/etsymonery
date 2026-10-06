import { previewStubApi } from "../../../../../lib/etsy-release-preview-stub";
import { createReleaseApi } from "../../../../../lib/etsy-release-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ releaseId: string }> }) {
  return (previewStubApi(request) ?? createReleaseApi()).status(request, (await context.params).releaseId);
}
