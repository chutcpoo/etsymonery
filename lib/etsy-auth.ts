import { getMissingEtsyScopes } from "./etsy";
import {
  loadEtsyTokens
} from "./token-store";

export function getEtsyUserIdFromToken(token: string) {
  const prefix = token.split(".", 1)[0];
  const userId = Number(prefix);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error("ETSY_TOKEN_USER_ID_INVALID");
  }

  return userId;
}

export async function getValidEtsyAccessToken(
  requiredScopes: readonly string[] = []
) {
  const stored = await loadEtsyTokens();

  if (!stored) {
    throw new Error("ETSY_OAUTH_NOT_CONNECTED");
  }

  if (requiredScopes.length > 0) {
    if (!stored.scope?.trim()) {
      throw new Error("ETSY_SCOPE_METADATA_MISSING");
    }

    const missingScopes = getMissingEtsyScopes(stored.scope, requiredScopes);
    if (missingScopes.length > 0) {
      throw new Error(`ETSY_SCOPE_MISSING:${missingScopes.join(",")}`);
    }
  }

  const refreshBufferMs = 5 * 60 * 1000;

  if (stored.expiresAt.getTime() - Date.now() > refreshBufferMs) {
    return stored.accessToken;
  }

  throw new Error("ETSY_REFRESH_REQUIRES_OWNER_AUTHORIZATION");
}
