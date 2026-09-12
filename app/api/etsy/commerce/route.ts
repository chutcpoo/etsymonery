import { NextResponse } from "next/server";
import { getCommerceIntelligenceSnapshot } from "../../../../lib/etsy-commerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDays(request: Request) {
  const raw = new URL(request.url).searchParams.get("days");
  if (!raw) return 30;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(90, Math.max(1, Math.floor(parsed)));
}

export async function GET(request: Request) {
  try {
    const snapshot = await getCommerceIntelligenceSnapshot(parseDays(request));
    return NextResponse.json(snapshot, {
      status: snapshot.status === "PASS" ? 200 : 206,
      headers: {
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "BLOCKED",
        mode: "READ_ONLY",
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        generatedAt: new Date().toISOString()
      },
      {
        status: 503,
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  }
}
