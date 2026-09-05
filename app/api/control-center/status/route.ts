import { NextResponse } from "next/server";
import { getControlCenterV2Snapshot } from "../../../../lib/control-center-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getControlCenterV2Snapshot();
  return NextResponse.json(snapshot, { status: 200 });
}
