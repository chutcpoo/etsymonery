import { getEtsyCredentials } from "./etsy";
import { loadEtsyTokens, saveEtsyTokens } from "./token-store";

type EtsyTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

export function getEtsyUserIdFromToken(token: string) {
  const prefix = token.split(".", 1)[0];
  const userId = Number(prefix);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error("ETSY_TOKEN_USER_ID_INVALID");
  }

  return userId;
}

async function refreshEtsyTokens(refreshToken: string) {
  const { keystring } = getEtsyCredentials();

  if (!keystring) {
    throw new Error("ETSY_API_KEY_NOT_CONFIGURED");
  }

  const response = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: keystring,
      refresh_token: refreshToken
    }),
    cache: "no-store"
  });

  const token = (await response.json()) as EtsyTokenResponse;

  if (!response.ok || !token.access_token) {
    throw new Error(
      `ETSY_TOKEN_REFRESH_FAILED:${token.error_description ?? token.error ?? "UNKNOWN"}`
    );
  }

  const nextRefreshToken = token.refresh_token ?? refreshToken;
  const userId = getEtsyUserIdFromToken(token.access_token);

  await saveEtsyTokens({
    accessToken: token.access_token,
    refreshToken: nextRefreshToken,
    expiresIn: token.expires_in ?? 3600,
    scope: token.scope,
    tokenType: token.token_type,
    userId
  });

  return token.access_token;
}

export async function getValidEtsyAccessToken() {
  const stored = await loadEtsyTokens();

  if (!stored) {
    throw new Error("ETSY_OAUTH_NOT_CONNECTED");
  }

  const refreshBufferMs = 5 * 60 * 1000;

  if (stored.expiresAt.getTime() - Date.now() > refreshBufferMs) {
    return stored.accessToken;
  }

  return refreshEtsyTokens(stored.refreshToken);
}
