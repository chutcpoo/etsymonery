import { NextResponse } from "next/server";
import { getControlCenterV3Snapshot } from "../../../../../lib/control-center-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getControlCenterV3Snapshot(), { headers: { "cache-control": "no-store" } });
}
