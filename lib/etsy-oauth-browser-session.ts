import { NextRequest, NextResponse } from "next/server";
import { authorizeEtsyOperatorRequest, privateHeaders } from "./etsy-operator-auth";

export const SELLER_SESSION_COOKIE = "etsy_oauth_seller_session";
const LOGIN_PATH = "/api/etsy/oauth/migration/login";
const SESSION_TTL_SECONDS = 600;

function sellerSecret(): string | null {
  const secret = process.env.ETSY_SELLER_APPROVER_TOKEN?.trim() ?? "";
  return secret.length >= 32 && secret.length <= 512 ? secret : null;
}

async function sign(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const bytes = new Uint8Array(await crypto.subtle.sign(
    "HMAC", key, encoder.encode("etsy-oauth-seller-browser:v1:" + payload)
  ));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSellerBrowserSession(nowSeconds = Math.floor(Date.now() / 1000)) {
  const secret = sellerSecret();
  if (!secret) throw new Error("SELLER_ROLE_NOT_CONFIGURED");
  const payload = nowSeconds.toString(36) + "." + crypto.randomUUID();
  return "v1." + payload + "." + await sign(payload, secret);
}

export async function validSellerBrowserSession(
  request: NextRequest, nowSeconds = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  const secret = sellerSecret();
  const value = request.cookies.get(SELLER_SESSION_COOKIE)?.value ?? "";
  const parts = /^v1\.([a-z0-9]{6,10})\.([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(value);
  if (!secret || !parts) return false;
  const issued = parseInt(parts[1], 36);
  if (!Number.isSafeInteger(issued) || issued > nowSeconds + 30 ||
      issued < nowSeconds - SESSION_TTL_SECONDS) return false;
  const expected = await sign(parts[1] + "." + parts[2], secret);
  const supplied = parts[3];
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  }
  return diff === 0;
}

// Only the two OAuth browser GETs accept this short-lived session.
// Other routes, especially token promotion and Etsy writes, still require
// their original Bearer/role checks.
export async function authorizeSellerOAuthBrowserGet(request: NextRequest) {
  const denied = await authorizeEtsyOperatorRequest(request, "seller", true);
  if (!denied) return null;
  if (denied.status === 503) return denied;
  if (await validSellerBrowserSession(request)) return null;
  return NextResponse.redirect(new URL(LOGIN_PATH, request.url),
    { status: 303, headers: privateHeaders });
}
