import { NextResponse } from "next/server";
import { handleAuthorizedActiveListingUpdate } from "../../../../lib/authorized-active-listing-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  return handleAuthorizedActiveListingUpdate(body, request);
}
