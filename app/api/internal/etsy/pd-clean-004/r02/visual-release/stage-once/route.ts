import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { PD_CLEAN_004_VISUAL_R02_RELEASE } from "../../../../../../../../lib/pd-clean-004-visual-r02-release";
import { stageAuthorizedAssetChunk } from "../../../../../../../../lib/authorized-operation-asset-store";
import { verifyPdClean004CloudRunnerOidc } from "../../../../../../../../lib/pd-clean-004-r02-cloud-runner-oidc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_SHA256 = "a77973744122e333ccc1c7bcfc9752784b7ba56eb6a2f5417d0dab91ff09fc35";
const TOKEN_HEADER = "x-pd-clean-r02-stage-once-token";
const OIDC_AUDIENCE = "https://autodigitalpublisher.vercel.app/api/internal/etsy/pd-clean-004/r02/visual-release/stage-once";

type Rec = Record<string, unknown>;
const isRec = (value: unknown): value is Rec => typeof value === "object" && value !== null && !Array.isArray(value);

function tokenAuthorized(request: Request) {
  const supplied = request.headers.get(TOKEN_HEADER)?.trim() ?? "";
  if (!supplied) return false;
  const actual = createHash("sha256").update(supplied, "utf8").digest("hex");
  const a = Buffer.from(actual);
  const b = Buffer.from(TOKEN_SHA256);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function authorized(request: Request) {
  if (tokenAuthorized(request)) return true;
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  try {
    await verifyPdClean004CloudRunnerOidc(authorization.slice("Bearer ".length).trim(), OIDC_AUDIENCE);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "PD_CLEAN_R02_STAGE_ONCE_UNAUTHORIZED", ETSY_WRITE_COUNT: 0 }, { status: 401 });

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
