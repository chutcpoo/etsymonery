import { NextResponse } from "next/server";
import { handleGenericLiveListingUpdate } from "../../../../lib/authorized-live-listing-update-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  return handleGenericLiveListingUpdate(body as Record<string, unknown>, request);
}
