import { NextResponse } from "next/server";
import { authorizeEtsyOperatorRequest, privateHeaders } from "../../../../lib/etsy-operator-auth";
import { hasOwnerSession, issueOwnerSession, OWNER_COOKIE, validSameOrigin } from "../../../../lib/factory-owner-session";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return NextResponse.json({ authenticated: await hasOwnerSession(request) }, { headers: privateHeaders });
}
export async function POST(request: Request) {
  if (!validSameOrigin(request)) return NextResponse.json({ error: "FACTORY_ORIGIN_DENIED" }, { status: 403, headers: privateHeaders });
  const denied = await authorizeEtsyOperatorRequest(request, "plan", false);
  if (denied) return denied;
  const session = await issueOwnerSession();
  const response = NextResponse.json({ authenticated: true }, { headers: privateHeaders });
  response.cookies.set(OWNER_COOKIE, session.value, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: session.maxAge });
  return response;
}
export async function DELETE(request: Request) {
  if (!validSameOrigin(request) || !await hasOwnerSession(request)) return NextResponse.json({ error: "FACTORY_OWNER_SESSION_REQUIRED" }, { status: 401, headers: privateHeaders });
  const response = NextResponse.json({ authenticated: false }, { headers: privateHeaders });
  response.cookies.set(OWNER_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
