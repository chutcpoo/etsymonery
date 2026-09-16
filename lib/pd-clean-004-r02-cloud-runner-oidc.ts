const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_REPOSITORY = "chutcpoo/baan-kitchen-private";
const GITHUB_REF = "refs/heads/main";
const GITHUB_EVENT = "push";
const GITHUB_WORKFLOW_REF = "chutcpoo/baan-kitchen-private/.github/workflows/pd-clean-r02-cloud-executor.yml@refs/heads/main";

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

function audienceMatches(aud: JwtClaims["aud"], expected: string) {
  return typeof aud === "string" ? aud === expected : Array.isArray(aud) && aud.includes(expected);
}

export async function verifyPdClean004CloudRunnerOidc(token: string, expectedAudience: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("PD_CLEAN_R02_RUNNER_OIDC_MALFORMED");
  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const header = decodeJsonSegment<JwtHeader>(encodedHeader);
  const claims = decodeJsonSegment<JwtClaims>(encodedClaims);
  if (header.alg !== "RS256" || !header.kid) throw new Error("PD_CLEAN_R02_RUNNER_OIDC_HEADER_INVALID");
  if (claims.iss !== GITHUB_OIDC_ISSUER) throw new Error("PD_CLEAN_R02_RUNNER_OIDC_ISSUER_INVALID");
  if (!audienceMatches(claims.aud, expectedAudience)) throw new Error("PD_CLEAN_R02_RUNNER_OIDC_AUDIENCE_INVALID");
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp < now - 30) throw new Error("PD_CLEAN_R02_RUNNER_OIDC_EXPIRED");
  if (claims.nbf && claims.nbf > now + 30) throw new Error("PD_CLEAN_R02_RUNNER_OIDC_NOT_YET_VALID");
  if (claims.repository !== GITHUB_REPOSITORY) throw new Error("PD_CLEAN_R02_RUNNER_OIDC_REPOSITORY_INVALID");
  if (claims.ref !== GITHUB_REF) throw new Error("PD_CLEAN_R02_RUNNER_OIDC_REF_INVALID");
  if (claims.event_name !== GITHUB_EVENT) throw new Error("PD_CLEAN_R02_RUNNER_OIDC_EVENT_INVALID");
  if (claims.workflow_ref !== GITHUB_WORKFLOW_REF) throw new Error("PD_CLEAN_R02_RUNNER_OIDC_WORKFLOW_INVALID");

  const discoveryResponse = await fetch(`${GITHUB_OIDC_ISSUER}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!discoveryResponse.ok) throw new Error("PD_CLEAN_R02_RUNNER_OIDC_DISCOVERY_FAILED");
  const discovery = await discoveryResponse.json() as { jwks_uri?: string };
  if (!discovery.jwks_uri) throw new Error("PD_CLEAN_R02_RUNNER_OIDC_JWKS_URI_MISSING");
  const jwksResponse = await fetch(discovery.jwks_uri, { cache: "no-store" });
  if (!jwksResponse.ok) throw new Error("PD_CLEAN_R02_RUNNER_OIDC_JWKS_FAILED");
  const jwks = await jwksResponse.json() as { keys?: Jwk[] };
  const key = jwks.keys?.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA");
  if (!key) throw new Error("PD_CLEAN_R02_RUNNER_OIDC_KEY_NOT_FOUND");
  const publicKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`);
  const signature = Buffer.from(encodedSignature, "base64url");
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, signed);
  if (!valid) throw new Error("PD_CLEAN_R02_RUNNER_OIDC_SIGNATURE_INVALID");
  return claims;
}
