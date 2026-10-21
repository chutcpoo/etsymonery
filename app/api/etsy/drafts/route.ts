import { NextResponse } from "next/server";
import { createGenericDraftPostHandler } from "../../../../lib/etsy-generic-draft-create";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({
    status: "CONFIGURATION_SNAPSHOT", mode: "READ_ONLY",
    genericDraftWritesEnabled: process.env.ETSY_GENERIC_DRAFT_WRITES_ENABLED === "true",
    EtsyWriteCount: 0
  }, { headers: { "cache-control": "no-store" } });
}

export const POST = createGenericDraftPostHandler();
