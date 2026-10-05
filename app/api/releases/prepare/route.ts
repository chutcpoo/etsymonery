import { createReleaseApi } from "../../../../lib/etsy-release-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = createReleaseApi().prepare;
