import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { inspectChatGptHandoff } from "../../../../lib/etsy-digital-delivery-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };
const MAX_JSON_BYTES = 64 * 1024;
const TOKEN_HEADER = "x-autodigitalpublisher-write-token";

// Uses a dedicated read-only QC secret, not Etsy write/publish credentials.
function auth(request: Request): Response | null {
  const expected = process.env.ETSY_CHAT_SOURCE_PREFLIGHT_TOKEN?.trim() || "";
  if (!expected) return NextResponse.json({
    status: "BLOCKED", error: "READ_ONLY_QC_AUTH_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0
  }, { status: 503, headers: NO_STORE });
  const provided = request.headers.get(TOKEN_HEADER)?.trim() || "";
  const left = Buffer.from(provided), right = Buffer.from(expected);
  if (!provided || left.length !== right.length || !timingSafeEqual(left, right)) {
    return NextResponse.json({
      status: "BLOCKED", error: "READ_ONLY_QC_UNAUTHORIZED", ETSY_WRITE_COUNT: 0
    }, { status: 401, headers: NO_STORE });
  }
  return null;
}

export async function GET() {
  return NextResponse.json({
    status: "READ_ONLY_METADATA_PREFLIGHT",
    acceptsActualFileBytes: false,
    actualFileBytesVerified: false,
    independentlyReviewed: false,
    createsEtsyDraft: false,
    publishesEtsyListing: false,
    ETSY_WRITE_COUNT: 0
  }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const denied = auth(request);
  if (denied) return denied;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({
      status: "BLOCKED", error: "JSON_REQUIRED", ETSY_WRITE_COUNT: 0
    }, { status: 415, headers: NO_STORE });
  }
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) {
    return NextResponse.json({
      status: "BLOCKED", error: "QC_MANIFEST_TOO_LARGE", ETSY_WRITE_COUNT: 0
    }, { status: 413, headers: NO_STORE });
  }
  let json: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf-8") > MAX_JSON_BYTES) throw Error("TOO_LARGE");
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({
      status: "BLOCKED", error: "QC_MANIFEST_INVALID_JSON_OR_TOO_LARGE", ETSY_WRITE_COUNT: 0
    }, { status: 400, headers: NO_STORE });
  }
  const report = inspectChatGptHandoff(json);
  return NextResponse.json(report, {
    status: report.status === "BLOCKED" ? 422 : 200,
    headers: NO_STORE
  });
}

function methodNotAllowed() {
  return NextResponse.json({
    status: "BLOCKED", error: "METHOD_NOT_ALLOWED", ETSY_WRITE_COUNT: 0
  }, { status: 405, headers: { ...NO_STORE, allow: "GET, POST" } });
}
export { methodNotAllowed as PUT, methodNotAllowed as PATCH, methodNotAllowed as DELETE };
