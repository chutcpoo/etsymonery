import { NextResponse } from "next/server";
import {
  PD_CLEAN_004_VISUAL_R02_RELEASE,
  handlePdClean004R02Release,
  verifyPdClean004R02ProtectedState
} from "../../../../../../../lib/pd-clean-004-visual-r02-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_AUDIENCE = "https://autodigitalpublisher.vercel.app/api/internal/etsy/pd-clean-004/r02/visual-release";
const GITHUB_REPOSITORY = "chutcpoo/etsymonery";
const GITHUB_REF = "refs/heads/main";
const GITHUB_EVENT = "workflow_dispatch";
const GITHUB_WORKFLOW_REF = "chutcpoo/etsymonery/.github/workflows/pd-clean-004-r02-visual-release.yml@refs/heads/main";

type JwtHeader = { alg?: string; kid?: string; typ?: string };
type JwtClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  repository?: string;
  ref?: string;
  event_name?: string;
  workflow_ref?: string;
};
type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

function decodeJsonSegment<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}

function audienceMatches(aud: JwtClaims["aud"]) {
  return typeof aud === "string" ? aud === GITHUB_OIDC_AUDIENCE : Array.isArray(aud) && aud.includes(GITHUB_OIDC_AUDIENCE);
}

async function verifyGithubOidcToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("PD_CLEAN_R02_OIDC_MALFORMED");
  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const header = decodeJsonSegment<JwtHeader>(encodedHeader);
  const claims = decodeJsonSegment<JwtClaims>(encodedClaims);
  if (header.alg !== "RS256" || !header.kid) throw new Error("PD_CLEAN_R02_OIDC_HEADER_INVALID");
  if (claims.iss !== GITHUB_OIDC_ISSUER) throw new Error("PD_CLEAN_R02_OIDC_ISSUER_INVALID");
  if (!audienceMatches(claims.aud)) throw new Error("PD_CLEAN_R02_OIDC_AUDIENCE_INVALID");
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp < now - 30) throw new Error("PD_CLEAN_R02_OIDC_EXPIRED");
  if (claims.nbf && claims.nbf > now + 30) throw new Error("PD_CLEAN_R02_OIDC_NOT_YET_VALID");
  if (claims.repository !== GITHUB_REPOSITORY) throw new Error("PD_CLEAN_R02_OIDC_REPOSITORY_INVALID");
  if (claims.ref !== GITHUB_REF) throw new Error("PD_CLEAN_R02_OIDC_REF_INVALID");
  if (claims.event_name !== GITHUB_EVENT) throw new Error("PD_CLEAN_R02_OIDC_EVENT_INVALID");
  if (claims.workflow_ref !== GITHUB_WORKFLOW_REF) throw new Error("PD_CLEAN_R02_OIDC_WORKFLOW_INVALID");

  const discoveryResponse = await fetch(`${GITHUB_OIDC_ISSUER}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!discoveryResponse.ok) throw new Error("PD_CLEAN_R02_OIDC_DISCOVERY_FAILED");
  const discovery = await discoveryResponse.json() as { jwks_uri?: string };
  if (!discovery.jwks_uri) throw new Error("PD_CLEAN_R02_OIDC_JWKS_URI_MISSING");
  const jwksResponse = await fetch(discovery.jwks_uri, { cache: "no-store" });
  if (!jwksResponse.ok) throw new Error("PD_CLEAN_R02_OIDC_JWKS_FAILED");
  const jwks = await jwksResponse.json() as { keys?: Jwk[] };
  const key = jwks.keys?.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA");
  if (!key) throw new Error("PD_CLEAN_R02_OIDC_KEY_NOT_FOUND");
  const publicKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`);
  const signature = Buffer.from(encodedSignature, "base64url");
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, signed);
  if (!valid) throw new Error("PD_CLEAN_R02_OIDC_SIGNATURE_INVALID");
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.startsWith("Bearer ")) return NextResponse.json({ error: "PD_CLEAN_R02_OIDC_MISSING", ETSY_WRITE_COUNT: 0 }, { status: 401 });
  try { await verifyGithubOidcToken(authorization.slice("Bearer ".length).trim()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "PD_CLEAN_R02_OIDC_INVALID", ETSY_WRITE_COUNT: 0 }, { status: 401 }); }

  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: "PD_CLEAN_R02_INVALID_JSON", ETSY_WRITE_COUNT: 0 }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ error: "PD_CLEAN_R02_INVALID_PAYLOAD", ETSY_WRITE_COUNT: 0 }, { status: 400 });
  const input = payload as Record<string, unknown>;
  const operationId = typeof input.operationId === "string" ? input.operationId : "";
  const confirmation = typeof input.confirmation === "string" ? input.confirmation : "";
  const action = typeof input.action === "string" ? input.action : "verify_protected_state";
  if (operationId !== PD_CLEAN_004_VISUAL_R02_RELEASE.operationId || confirmation !== operationId) {
    return NextResponse.json({ error: "PD_CLEAN_R02_OPERATION_CONFIRMATION_MISMATCH", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  }

  if (action === "verify_protected_state") return verifyPdClean004R02ProtectedState();
  if (action !== "execute") return NextResponse.json({ error: "PD_CLEAN_R02_INVALID_ACTION", ETSY_WRITE_COUNT: 0 }, { status: 409 });

  const protectedStateFingerprint = typeof input.protectedStateFingerprint === "string" ? input.protectedStateFingerprint.trim().toLowerCase() : "";
  const authorizationRequestHash = typeof input.authorizationRequestHash === "string" ? input.authorizationRequestHash.trim().toLowerCase() : "";
  if (!/^[a-f0-9]{64}$/.test(protectedStateFingerprint) || !/^[a-f0-9]{64}$/.test(authorizationRequestHash)) {
    return NextResponse.json({ error: "PD_CLEAN_R02_EXACT_AUTHORIZATION_BINDING_REQUIRED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  }

  const writeToken = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  if (!writeToken) return NextResponse.json({ error: "PD_CLEAN_R02_WRITE_TOKEN_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0 }, { status: 503 });
  const delegated = new Request(request.url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken }
  });
  return handlePdClean004R02Release(protectedStateFingerprint, authorizationRequestHash, delegated);
}
