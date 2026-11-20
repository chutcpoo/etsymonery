import { NextResponse } from "next/server";

// This gate protects shop, financial and OAuth-administration GET endpoints on
// custom domains too. Vercel Authentication alone is not sufficient because
// custom domains can be exempt from SSO protection.
const OPERATOR_PAGES = [
  "/",
  "/commerce",
  "/sales",
  "/events",
  "/factory",
  "/stats-evidence",
  "/connect/etsy"
] as const;

function routeMatches(pathname: string, root: string) {
  return pathname === root || (root !== "/" && pathname.startsWith(`${root}/`));
}

export function isEtsyOperatorProtectedPath(pathname: string) {
  // The callback is authenticated by the short-lived, HttpOnly OAuth state and
  // PKCE verifier cookies, which Etsy's redirect cannot carry as a Bearer token.
  if (pathname === "/api/etsy/oauth/callback") return false;

  // Both endpoints already require independent, scope-specific Bearer secrets.
  if (
    pathname === "/api/etsy/listing-sales" ||
    pathname === "/api/etsy/reconcile-listings"
  ) return false;

  return (
    pathname === "/api/etsy" ||
    pathname.startsWith("/api/etsy/") ||
    pathname === "/api/control-center" ||
    pathname.startsWith("/api/control-center/") ||
    OPERATOR_PAGES.some((root) => routeMatches(pathname, root))
  );
}

function suppliedOperatorToken(authorization: string | null) {
  if (!authorization || authorization.length > 4096) return null;

  const bearer = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (bearer) return bearer[1];

  // HTTP Basic is used only for browser navigation. Login username is fixed;
  // the password is the same high-entropy, server-side operator secret.
  const basic = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
  if (!basic) return null;
  try {
    const decoded = atob(basic[1]);
    const colon = decoded.indexOf(":");
    if (colon < 0 || decoded.slice(0, colon) !== "operator") return null;
    return decoded.slice(colon + 1);
  } catch {
    return null;
  }
}

async function sameSecret(supplied: string, expected: string) {
  // WebCrypto is available in the Edge middleware runtime. Hash first so both
  // comparisons use equal-length buffers and never shortcut on token prefixes.
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) {
    difference |= left[i] ^ right[i];
  }
  return difference === 0;
}

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff"
};

export async function authorizeEtsyOperatorRequest(
  request: Pick<Request, "headers">
) {
  const expected = process.env.ETSY_OPERATOR_READ_TOKEN?.trim() ?? "";
  if (expected.length < 32) {
    return NextResponse.json(
      { status: "BLOCKED", error: "ETSY_OPERATOR_AUTH_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0 },
      { status: 503, headers: privateHeaders }
    );
  }

  const supplied = suppliedOperatorToken(request.headers.get("authorization"));
  if (!supplied || supplied.length > 512 || !(await sameSecret(supplied, expected))) {
    return NextResponse.json(
      { status: "BLOCKED", error: "ETSY_OPERATOR_UNAUTHORIZED", ETSY_WRITE_COUNT: 0 },
      {
        status: 401,
        headers: {
          ...privateHeaders,
          "www-authenticate": 'Basic realm="Etsy Operator", charset="UTF-8"'
        }
      }
    );
  }
  return null;
}
