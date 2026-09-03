import { NextResponse } from "next/server";
import { getEtsyCredentials, getEtsyRedirectUri } from "../../../../../lib/etsy";
import { getEtsyUserIdFromToken } from "../../../../../lib/etsy-auth";
import { isTokenStoreConfigured, saveEtsyTokens } from "../../../../../lib/token-store";

export const runtime = "nodejs";

type EtsyTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.json(
      { error: "ETSY_AUTHORIZATION_DENIED", detail: error },
      { status: 400 }
    );
  }

  if (!isTokenStoreConfigured()) {
    return NextResponse.json(
      { error: "ETSY_TOKEN_STORE_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1
          ? [part, ""]
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );

  const verifier = cookies.etsy_oauth_verifier;
  const expectedState = cookies.etsy_oauth_state;
  const { keystring } = getEtsyCredentials();

  if (!code || !returnedState || !verifier || !expectedState || !keystring) {
    return NextResponse.json(
      { error: "ETSY_OAUTH_CALLBACK_INCOMPLETE" },
      { status: 400 }
    );
  }

  if (returnedState !== expectedState) {
    return NextResponse.json(
      { error: "ETSY_OAUTH_STATE_MISMATCH" },
      { status: 400 }
    );
  }

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: keystring,
    redirect_uri: getEtsyRedirectUri(request.url),
    code,
    code_verifier: verifier
  });

  const tokenResponse = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: tokenBody,
    cache: "no-store"
  });

  const token = (await tokenResponse.json()) as EtsyTokenResponse;

  if (!tokenResponse.ok || !token.access_token || !token.refresh_token) {
    return NextResponse.json(
      {
        error: "ETSY_TOKEN_EXCHANGE_FAILED",
        detail: token.error_description ?? token.error ?? "UNKNOWN"
      },
      { status: 502 }
    );
  }

  try {
    await saveEtsyTokens({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in ?? 3600,
      scope: token.scope,
      tokenType: token.token_type,
      userId: getEtsyUserIdFromToken(token.access_token)
    });
  } catch (storageError) {
    return NextResponse.json(
      {
        error: "ETSY_TOKEN_STORAGE_FAILED",
        detail:
          storageError instanceof Error ? storageError.message : "UNKNOWN"
      },
      { status: 503 }
    );
  }

  const response = NextResponse.redirect(new URL("/connect/etsy", request.url));
  response.cookies.delete("etsy_access_token");
  response.cookies.delete("etsy_refresh_token");
  response.cookies.delete("etsy_oauth_verifier");
  response.cookies.delete("etsy_oauth_state");

  return response;
}
