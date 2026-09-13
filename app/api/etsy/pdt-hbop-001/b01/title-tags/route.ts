import { NextResponse } from "next/server";
import { handlePdtHbop001B01TitleTags } from "../../../../../../lib/pdt-hbop-001-b01-title-tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON", providerPatchCount: 0, ETSY_WRITE_COUNT: 0 }, { status: 400 }); }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "INVALID_BODY", providerPatchCount: 0, ETSY_WRITE_COUNT: 0 }, { status: 400 });
  }
  return handlePdtHbop001B01TitleTags(body, request);
}
