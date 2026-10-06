import { previewStubApi } from "../../../../lib/etsy-release-preview-stub";
import { createReleaseApi } from "../../../../lib/etsy-release-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  return (previewStubApi(request) ?? createReleaseApi()).prepare(request);
}
