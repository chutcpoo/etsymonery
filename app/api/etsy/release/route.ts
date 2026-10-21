import { NextResponse } from "next/server";
import { createEtsyReleaseCheckpointHandler } from "../../../../lib/etsy-release-checkpoint";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Safe release-readiness metadata: never return credentials or authorization
// grants. This permits protected GitHub Actions to pin the exact live commit.
export async function GET() {
  return NextResponse.json({
    status: "CONFIGURATION_SNAPSHOT", mode: "READ_ONLY",
    publishWritesEnabled: process.env.PUBLISH_WRITES_ENABLED === "true" &&
      process.env.ETSY_EXACT_PUBLISH_WRITES_ENABLED === "true",
    deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() || null,
    deployedEnvironment: process.env.VERCEL_ENV || null,
    ETSY_WRITE_COUNT: 0
  }, { headers: { "cache-control": "no-store" } });
}
export const POST = createEtsyReleaseCheckpointHandler();
