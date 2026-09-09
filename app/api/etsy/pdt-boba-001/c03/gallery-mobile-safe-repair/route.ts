import { NextResponse } from "next/server";
import { handlePdtBoba001C03GalleryRepair } from "../../../../../../../lib/pdt-boba-001-c03-gallery-mobile-safe-repair";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON", providerWriteCount: 0 }, { status: 400 }); }
  if (!isRecord(body)) return NextResponse.json({ error: "INVALID_BODY", providerWriteCount: 0 }, { status: 400 });
  return handlePdtBoba001C03GalleryRepair(body, request);
}
