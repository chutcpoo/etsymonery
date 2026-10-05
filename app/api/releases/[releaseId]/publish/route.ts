import { previewStubApi } from "../../../../../lib/etsy-release-preview-stub";
import { createReleaseApi } from "../../../../../lib/etsy-release-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ releaseId: string }> }) {
  return (previewStubApi(request) ?? createReleaseApi()).publish(request, (await context.params).releaseId);
}
