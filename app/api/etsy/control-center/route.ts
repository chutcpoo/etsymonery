import { NextResponse } from "next/server";
import { getSalesControlCenterSnapshot } from "../../../../lib/etsy-sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getSalesControlCenterSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      {
        status: "BLOCKED",
        mode: "READ_ONLY",
        error: error instanceof Error ? error.message : "UNKNOWN"
      },
      { status: 503 }
    );
  }
}
