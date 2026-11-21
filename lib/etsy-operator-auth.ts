import { NextResponse } from "next/server";

export type OperatorRole = "read" | "plan" | "qc" | "seller";
const roleKeys = {
  read: "ETSY_OPERATOR_READ_TOKEN",
  plan: "ETSY_PLAN_EDITOR_TOKEN",
  qc: "ETSY_QC_REVIEWER_TOKEN",
  seller: "ETSY_SELLER_APPROVER_TOKEN"
} as const;

export function isEtsyOperatorProtectedPath(pathname: string) {
  return pathname !== "/api/health";
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

export const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff"
};

export async function authorizeEtsyOperatorRequest(
  request: Pick<Request, "headers">, role: OperatorRole = "read", allowBasic = role === "read"
) {
  const expected = process.env[roleKeys[role]]?.trim() ?? "";
  if (expected.length < 32 || expected.length > 512 || Object.entries(roleKeys).some(
    ([other, key]) => other !== role && process.env[key]?.trim() === expected
  )) {
    return NextResponse.json(
      { status: "BLOCKED", error: "ETSY_OPERATOR_AUTH_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0 },
      { status: 503, headers: privateHeaders }
    );
  }

  const header = request.headers.get("authorization");
  // Basic is allowed only when an explicit browser-navigation caller opts in.
  // This includes the owner-only OAuth staging GET, but not any seller POST.
  const permittedScheme = (allowBasic && /^Basic /i.test(header ?? "")) || /^Bearer /i.test(header ?? "");
  const supplied = permittedScheme ? suppliedOperatorToken(header) : null;
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

export async function authorizePlanRequest(request: Request, role: OperatorRole) {
  const denied = await authorizeEtsyOperatorRequest(request, role, role === "read");
  if (denied) return denied;
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL?.trim()) {
    return NextResponse.json({ status: "BLOCKED", error: "DURABLE_PLAN_STORE_REQUIRED" },
      { status: 503, headers: privateHeaders });
  }
  return null;
}
