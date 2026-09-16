import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { PD_CLEAN_004_VISUAL_R02_RELEASE } from "../../../../../../../../lib/pd-clean-004-visual-r02-release";
import { stageAuthorizedAssetChunk } from "../../../../../../../../lib/authorized-operation-asset-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_SHA256 = "74b6f8034c53f520b1f4ee27574436a5250e187b5c8258fcb9c83c4839863423";
const TOKEN_HEADER = "x-pd-clean-r02-stage-once-token";

type Rec = Record<string, unknown>;
const isRec = (value: unknown): value is Rec => typeof value === "object" && value !== null && !Array.isArray(value);

function authorized(request: Request) {
  const supplied = request.headers.get(TOKEN_HEADER)?.trim() ?? "";
  if (!supplied) return false;
  const actual = createHash("sha256").update(supplied, "utf8").digest("hex");
  const a = Buffer.from(actual);
  const b = Buffer.from(TOKEN_SHA256);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "PD_CLEAN_R02_STAGE_ONCE_UNAUTHORIZED", ETSY_WRITE_COUNT: 0 }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "PD_CLEAN_R02_STAGE_ONCE_INVALID_JSON", ETSY_WRITE_COUNT: 0 }, { status: 400 }); }
  if (!isRec(body)) return NextResponse.json({ error: "PD_CLEAN_R02_STAGE_ONCE_INVALID_BODY", ETSY_WRITE_COUNT: 0 }, { status: 400 });

  const operationId = typeof body.operationId === "string" ? body.operationId : "";
  const assetSha256 = typeof body.assetSha256 === "string" ? body.assetSha256.trim().toLowerCase() : "";
  const registered = [...PD_CLEAN_004_VISUAL_R02_RELEASE.gallery, PD_CLEAN_004_VISUAL_R02_RELEASE.video].some((asset) => asset.sha256 === assetSha256);
  if (operationId !== PD_CLEAN_004_VISUAL_R02_RELEASE.operationId || !registered) {
    return NextResponse.json({ error: "PD_CLEAN_R02_STAGE_ONCE_ASSET_NOT_REGISTERED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  }

  const chunkIndex = Number(body.chunkIndex);
  const chunkCount = Number(body.chunkCount);
  const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";
  try {
    await stageAuthorizedAssetChunk({ operationId, assetSha256, chunkIndex, chunkCount, dataBase64 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PD_CLEAN_R02_STAGE_ONCE_FAILED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  }

  return NextResponse.json({ status: "ASSET_CHUNK_STAGED", operationId, assetSha256, chunkIndex, chunkCount, ETSY_WRITE_COUNT: 0 });
}
