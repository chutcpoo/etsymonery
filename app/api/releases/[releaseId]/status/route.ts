import { createReleaseApi } from "../../../../../lib/etsy-release-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ releaseId: string }> }) {
  return createReleaseApi().status(request, (await context.params).releaseId);
}
