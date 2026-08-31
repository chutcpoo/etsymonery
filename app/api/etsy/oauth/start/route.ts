import { NextResponse } from "next/server";
import {
  ETSY_SCOPES,
  createOAuthState,
  createPkcePair,
  getEtsyCredentials,
  getEtsyRedirectUri
} from "../../../../../lib/etsy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { keystring } = getEtsyCredentials();

  if (!keystring) {
    return NextResponse.json(
      { error: "ETSY_API_KEY_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const { verifier, challenge } = createPkcePair();
  const state = createOAuthState();
  const redirectUri = getEtsyRedirectUri(request.url);

  const authorize = new URL("https://www.etsy.com/oauth/connect");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", keystring);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", ETSY_SCOPES.join(" "));
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorize);
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 10 * 60
  };

  response.cookies.set("etsy_oauth_verifier", verifier, cookieOptions);
  response.cookies.set("etsy_oauth_state", state, cookieOptions);

  return response;
}
