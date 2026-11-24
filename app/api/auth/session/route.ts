import { NextResponse } from "next/server";
import { authorizeEtsyOperatorRequest, privateHeaders } from "../../../../lib/etsy-operator-auth";
import {
  hasOwnerSession, hasReaderSession, issueOwnerSession, issueReaderSession,
  OWNER_COOKIE, READER_COOKIE, validSameOrigin
} from "../../../../lib/factory-owner-session";

export const runtime = "nodejs";

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}

export async function GET(request: Request) {
  const role = await hasOwnerSession(request)
    ? "owner" : await hasReaderSession(request) ? "reader" : null;
  return json({ authenticated: role !== null, role });
}

export async function POST(request: Request) {
  // Login is a same-origin JSON action; never accept credentials from URLs.
  if (!validSameOrigin(request)) return json({ error: "LOGIN_ORIGIN_DENIED" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "LOGIN_INVALID_REQUEST" }, 415);
  }
  const input = await request.json().catch(() => null);
  const mode = input?.mode;
  const password = input?.password;
  if ((mode !== "owner" && mode !== "reader") || typeof password !== "string" ||
      password.length < 32 || password.length > 512 || password !== password.trim()) {
    return json({ error: "LOGIN_INVALID_CREDENTIALS" }, 401);
  }
  const authorization = new Headers({ authorization: "Bearer " + password });
  const denied = await authorizeEtsyOperatorRequest({ headers: authorization }, mode === "owner" ? "plan" : "read", false);
  if (denied) {
    // No WWW-Authenticate: a failed login must never open a browser Basic Auth dialog.
    return json({ error: denied.status === 503 ? "LOGIN_NOT_CONFIGURED" : "LOGIN_INVALID_CREDENTIALS" },
      denied.status === 503 ? 503 : 401);
  }
  const session = mode === "owner" ? await issueOwnerSession() : await issueReaderSession();
  const response = json({ authenticated: true, role: mode });
  response.cookies.set(mode === "owner" ? OWNER_COOKIE : READER_COOKIE, session.value, {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: session.maxAge
  });
  // Switching to read-only must drop the earlier owner session, and vice versa.
  response.cookies.set(mode === "owner" ? READER_COOKIE : OWNER_COOKIE, "", {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0
  });
  return response;
}

export async function DELETE(request: Request) {
  if (!validSameOrigin(request)) return json({ error: "LOGOUT_ORIGIN_DENIED" }, 403);
  const response = json({ authenticated: false, role: null });
  for (const cookie of [OWNER_COOKIE, READER_COOKIE]) {
    response.cookies.set(cookie, "", {
      httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0
    });
  }
  return response;
}
