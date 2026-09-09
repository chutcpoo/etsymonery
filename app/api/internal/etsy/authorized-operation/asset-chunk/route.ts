import { NextResponse } from "next/server";
import { PD_REST_003_A02 } from "../../../../../../lib/pd-rest-003-a02-title-tags-image1";
import { PDT_BOBA_001_C03_GALLERY_REPAIR } from "../../../../../../lib/pdt-boba-001-c03-gallery-mobile-safe-repair";
import {
  clearAuthorizedAssetSource,
  loadAuthorizedAssetSource,
  stageAuthorizedAssetChunk
} from "../../../../../../lib/authorized-operation-asset-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "https://autodigitalpublisher.vercel.app/api/internal/etsy/authorized-operation/asset-chunk";
const REPOSITORY = "chutcpoo/etsymonery";
const REF = "refs/heads/main";
const EVENT = "workflow_dispatch";
const WORKFLOW_REF = "chutcpoo/etsymonery/.github/workflows/execute-authorized-etsy-operation.yml@refs/heads/main";
const SOURCE_MODE = "NEON_TRANSIENT_SOURCE";
const MAX_CHUNK_BYTES = 45000;

type Claims = { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; repository?: string; ref?: string; event_name?: string; workflow_ref?: string };
type Jwk = JsonWebKey & { kid?: string };
function decode<T>(s: string) { return JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as T; }
function audienceMatches(aud: Claims["aud"]) { return typeof aud === "string" ? aud === AUDIENCE : Array.isArray(aud) && aud.includes(AUDIENCE); }

async function verify(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("AUTHORIZED_ETSY_OIDC_MALFORMED");
  const [h, c, s] = parts;
  const header = decode<{ alg?: string; kid?: string }>(h);
  const claims = decode<Claims>(c);
  if (header.alg !== "RS256" || !header.kid) throw new Error("AUTHORIZED_ETSY_OIDC_HEADER_INVALID");
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== ISSUER || !audienceMatches(claims.aud) || !claims.exp || claims.exp < now - 30 || (claims.nbf && claims.nbf > now + 30) || claims.repository !== REPOSITORY || claims.ref !== REF || claims.event_name !== EVENT || claims.workflow_ref !== WORKFLOW_REF) {
    throw new Error("AUTHORIZED_ETSY_OIDC_CLAIMS_INVALID");
  }
  const discovery = await fetch(`${ISSUER}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!discovery.ok) throw new Error("AUTHORIZED_ETSY_OIDC_DISCOVERY_FAILED");
  const { jwks_uri } = await discovery.json() as { jwks_uri?: string };
  if (!jwks_uri) throw new Error("AUTHORIZED_ETSY_OIDC_JWKS_URI_MISSING");
  const jr = await fetch(jwks_uri, { cache: "no-store" });
  if (!jr.ok) throw new Error("AUTHORIZED_ETSY_OIDC_JWKS_FAILED");
  const keys = (await jr.json() as { keys?: Jwk[] }).keys ?? [];
  const key = keys.find((k) => k.kid === header.kid && k.kty === "RSA");
  if (!key) throw new Error("AUTHORIZED_ETSY_OIDC_KEY_NOT_FOUND");
  const publicKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, Buffer.from(s, "base64url"), new TextEncoder().encode(`${h}.${c}`));
  if (!ok) throw new Error("AUTHORIZED_ETSY_OIDC_SIGNATURE_INVALID");
}

function pngIdentityMatches(bytes: Buffer, expected: { byteSize: number; width: number; height: number }) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return bytes.length === expected.byteSize &&
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(signature) &&
    bytes.readUInt32BE(16) === expected.width &&
    bytes.readUInt32BE(20) === expected.height;
}

async function stageBobaAssetFromSource(operationId: string, assetSha256: string) {
  const asset = PDT_BOBA_001_C03_GALLERY_REPAIR.gallery.find((candidate) => candidate.sha256 === assetSha256);
  if (!asset) throw new Error("AUTHORIZED_ETSY_ASSET_NOT_REGISTERED");
  const bytes = await loadAuthorizedAssetSource(operationId, assetSha256);
  if (!pngIdentityMatches(bytes, asset)) throw new Error("AUTHORIZED_ETSY_SOURCE_ASSET_IDENTITY_MISMATCH");
  const chunkCount = Math.ceil(bytes.length / MAX_CHUNK_BYTES);
  if (chunkCount < 1 || chunkCount > 16) throw new Error("AUTHORIZED_ETSY_SOURCE_CHUNK_COUNT_INVALID");
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const dataBase64 = bytes.subarray(chunkIndex * MAX_CHUNK_BYTES, (chunkIndex + 1) * MAX_CHUNK_BYTES).toString("base64");
    await stageAuthorizedAssetChunk({ operationId, assetSha256, chunkIndex, chunkCount, dataBase64 });
  }
  await clearAuthorizedAssetSource(operationId, assetSha256);
  return chunkCount;
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.startsWith("Bearer ")) return NextResponse.json({ error: "AUTHORIZED_ETSY_OIDC_MISSING" }, { status: 401 });
  try { await verify(authorization.slice(7).trim()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "AUTHORIZED_ETSY_OIDC_INVALID" }, { status: 401 }); }

  let value: unknown;
  try { value = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  const body = value as Record<string, unknown>;
  const operationId = typeof body.operationId === "string" ? body.operationId : "";
  const confirmation = typeof body.confirmation === "string" ? body.confirmation : "";
  const requestedAssetSha256 = typeof body.assetSha256 === "string" ? body.assetSha256 : "";
  const sourceMode = typeof body.sourceMode === "string" ? body.sourceMode : "";
  if (!operationId || confirmation !== operationId) return NextResponse.json({ error: "AUTHORIZED_ETSY_CONFIRMATION_MISMATCH" }, { status: 409 });

  let registeredAssetSha256 = "";
  if (operationId === PD_REST_003_A02.operationId) {
    if (sourceMode) return NextResponse.json({ error: "AUTHORIZED_ETSY_SOURCE_MODE_NOT_REGISTERED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
    if (requestedAssetSha256 && requestedAssetSha256 !== PD_REST_003_A02.image.sha256) return NextResponse.json({ error: "AUTHORIZED_ETSY_ASSET_NOT_REGISTERED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
    registeredAssetSha256 = PD_REST_003_A02.image.sha256;
  } else if (operationId === PDT_BOBA_001_C03_GALLERY_REPAIR.operationId) {
    const asset = PDT_BOBA_001_C03_GALLERY_REPAIR.gallery.find((candidate) => candidate.sha256 === requestedAssetSha256);
    if (!asset) return NextResponse.json({ error: "AUTHORIZED_ETSY_ASSET_NOT_REGISTERED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
    registeredAssetSha256 = asset.sha256;
  } else {
    return NextResponse.json({ error: "AUTHORIZED_ETSY_OPERATION_NOT_REGISTERED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  }

  if (sourceMode) {
    if (operationId !== PDT_BOBA_001_C03_GALLERY_REPAIR.operationId || sourceMode !== SOURCE_MODE) {
      return NextResponse.json({ error: "AUTHORIZED_ETSY_SOURCE_MODE_NOT_REGISTERED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
    }
    try {
      const chunkCount = await stageBobaAssetFromSource(operationId, registeredAssetSha256);
      return NextResponse.json({
        status: "ASSET_STAGED_FROM_SOURCE",
        operationId,
        assetSha256: registeredAssetSha256,
        chunkCount,
        ETSY_WRITE_COUNT: 0
      });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "ASSET_SOURCE_STAGE_FAILED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
    }
  }

  const chunkIndex = Number(body.chunkIndex);
  const chunkCount = Number(body.chunkCount);
  const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";
  try { await stageAuthorizedAssetChunk({ operationId, assetSha256: registeredAssetSha256, chunkIndex, chunkCount, dataBase64 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "ASSET_STAGE_FAILED", ETSY_WRITE_COUNT: 0 }, { status: 409 }); }
  return NextResponse.json({ status: "ASSET_CHUNK_STAGED", operationId, chunkIndex, chunkCount, assetSha256: registeredAssetSha256, ETSY_WRITE_COUNT: 0 });
}
