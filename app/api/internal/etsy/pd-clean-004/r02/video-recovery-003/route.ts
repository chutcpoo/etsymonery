import { NextResponse } from "next/server";
import {
  PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003,
  handlePdClean004VideoRecovery003,
  verifyPdClean004VideoRecovery003ProtectedState
} from "../../../../../../../lib/pd-clean-004-visual-r02-video-recovery-003";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "https://autodigitalpublisher.vercel.app/api/internal/etsy/pd-clean-004/r02/video-recovery-003";
const REPOSITORY = "chutcpoo/etsymonery";
const REF = "refs/heads/main";
const EVENT = "workflow_dispatch";
const WORKFLOW_REF = "chutcpoo/etsymonery/.github/workflows/pd-clean-004-r02-video-recovery-003.yml@refs/heads/main";

type JwtHeader = { alg?: string; kid?: string };
type JwtClaims = { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; repository?: string; ref?: string; event_name?: string; workflow_ref?: string };
type Jwk = JsonWebKey & { kid?: string };
const decode = <T,>(segment: string) => JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
const audienceMatches = (aud: JwtClaims["aud"]) => typeof aud === "string" ? aud === AUDIENCE : Array.isArray(aud) && aud.includes(AUDIENCE);

async function verifyGithubOidc(token: string) {
  const parts = token.split("."); if (parts.length !== 3) throw new Error("PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_MALFORMED");
  const [h, c, s] = parts; const header = decode<JwtHeader>(h); const claims = decode<JwtClaims>(c);
  if (header.alg !== "RS256" || !header.kid) throw new Error("PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_HEADER_INVALID");
  if (claims.iss !== ISSUER) throw new Error("PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_ISSUER_INVALID");
  if (!audienceMatches(claims.aud)) throw new Error("PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_AUDIENCE_INVALID");
  const now = Math.floor(Date.now() / 1000); if (!claims.exp || claims.exp < now - 30) throw new Error("PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_EXPIRED"); if (claims.nbf && claims.nbf > now + 30) throw new Error("PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_NOT_YET_VALID");
  if (claims.repository !== REPOSITORY) throw new Error("PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_REPOSITORY_INVALID");
  if (claims.ref !== REF) throw new Error("PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_REF_INVALID");
  if (claims.event_name !== EVENT) throw new Error("PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_EVENT_INVALID");
  if (claims.workflow_ref !== WORKFLOW_REF) throw new Error("PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_WORKFLOW_INVALID");
  const discovery = await fetch(`${ISSUER}/.well-known/openid-configuration`, { cache: "no-store" }); if (!discovery.ok) throw new Error("PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_DISCOVERY_FAILED");
  const d = await discovery.json() as { jwks_uri?: string }; if (!d.jwks_uri) throw new Error("PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_JWKS_URI_MISSING");
  const jwks = await fetch(d.jwks_uri, { cache: "no-store" }); if (!jwks.ok) throw new Error("PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_JWKS_FAILED");
  const data = await jwks.json() as { keys?: Jwk[] }; const key = data.keys?.find(k => k.kid === header.kid && k.kty === "RSA"); if (!key) throw new Error("PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_KEY_NOT_FOUND");
  const publicKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, Buffer.from(s, "base64url"), new TextEncoder().encode(`${h}.${c}`)); if (!valid) throw new Error("PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_SIGNATURE_INVALID");
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? ""; if (!authorization.startsWith("Bearer ")) return NextResponse.json({ error: "PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_MISSING", ETSY_WRITE_COUNT: 0 }, { status: 401 });
  try { await verifyGithubOidc(authorization.slice("Bearer ".length).trim()); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "PD_CLEAN_004_VIDEO_RECOVERY_003_OIDC_INVALID", ETSY_WRITE_COUNT: 0 }, { status: 401 }); }
  let payload: unknown; try { payload = await request.json(); } catch { return NextResponse.json({ error: "PD_CLEAN_004_VIDEO_RECOVERY_003_INVALID_JSON", ETSY_WRITE_COUNT: 0 }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ error: "PD_CLEAN_004_VIDEO_RECOVERY_003_INVALID_PAYLOAD", ETSY_WRITE_COUNT: 0 }, { status: 400 });
  const input = payload as Record<string, unknown>; const operationId = typeof input.operationId === "string" ? input.operationId : ""; const confirmation = typeof input.confirmation === "string" ? input.confirmation : ""; const action = typeof input.action === "string" ? input.action : "verify_protected_state";
  if (operationId !== PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.operationId || confirmation !== operationId) return NextResponse.json({ error: "PD_CLEAN_004_VIDEO_RECOVERY_003_OPERATION_CONFIRMATION_MISMATCH", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  if (action === "verify_protected_state") return verifyPdClean004VideoRecovery003ProtectedState();
  if (action !== "execute") return NextResponse.json({ error: "PD_CLEAN_004_VIDEO_RECOVERY_003_INVALID_ACTION", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  const protectedStateFingerprint = typeof input.protectedStateFingerprint === "string" ? input.protectedStateFingerprint.trim().toLowerCase() : ""; const authorizationRequestHash = typeof input.authorizationRequestHash === "string" ? input.authorizationRequestHash.trim().toLowerCase() : "";
  if (!/^[a-f0-9]{64}$/.test(protectedStateFingerprint) || !/^[a-f0-9]{64}$/.test(authorizationRequestHash)) return NextResponse.json({ error: "PD_CLEAN_004_VIDEO_RECOVERY_003_EXACT_BINDING_REQUIRED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  const writeToken = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? ""; if (!writeToken) return NextResponse.json({ error: "PD_CLEAN_004_VIDEO_RECOVERY_003_WRITE_TOKEN_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0 }, { status: 503 });
  const delegated = new Request(request.url, { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken } });
  return handlePdClean004VideoRecovery003(protectedStateFingerprint, authorizationRequestHash, delegated);
}
