import { createHash, timingSafeEqual } from "node:crypto";
import { appSupportEmail } from "./app-support";
import { getEtsyCredentials, parseEtsyGrantedScopes } from "./etsy";
import { isTokenStoreConfigured } from "./token-store";

export type PrimaryGrantIdentity = { userId?: number | null; shopId?: number | null };
export type MigrationSettings = { callback: string; userId: number; shopId: number };
export type ScopedMigrationToken = {
  accessToken: string;
  refreshToken: string;
  userId: number;
  expiresAt: Date;
  scope: "listings_r";
  tokenType: "Bearer";
};

// This gate is separate from marketplace Draft/Publish permissions. It must
// remain OFF until the owner approves the exact production cutover.
export const migrationEnabled = () => process.env.ETSY_OAUTH_MIGRATION_ENABLED === "true";

const writeFlags = [
  "ETSY_DRAFT_WRITES_ENABLED",
  "PUBLISH_WRITES_ENABLED",
  "ETSY_POST_RESET_V2_WRITES_ENABLED",
  "ETSY_GENERIC_DRAFT_WRITES_ENABLED",
  "ETSY_CHAT_ASSET_WRITES_ENABLED",
  "ETSY_DRIVE_ASSET_WRITES_ENABLED",
  "ETSY_EXACT_PUBLISH_WRITES_ENABLED"
] as const;

export function reviewedReference(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  return /^[A-Za-z0-9][A-Za-z0-9_.:/-]{11,255}$/.test(trimmed) &&
    !/^(test|todo|tbd|pending|placeholder|not-approved|fixture)/i.test(trimmed);
}

export function migrationPreflight(
  requestUrl: string,
  primary: PrimaryGrantIdentity | null
): MigrationSettings {
  if (!migrationEnabled()) throw new Error("MIGRATION_DISABLED");
  if (!reviewedReference(process.env.ETSY_OAUTH_MIGRATION_OWNER_APPROVAL_REF))
    throw new Error("OWNER_APPROVAL_EVIDENCE_REQUIRED");
  if (writeFlags.some(key => process.env[key] === "true"))
    throw new Error("MARKETPLACE_WRITE_FLAGS_MUST_BE_OFF");
  if (!appSupportEmail()) throw new Error("MONITORED_SUPPORT_CONTACT_REQUIRED");
  if (!isTokenStoreConfigured() || !getEtsyCredentials().configured)
    throw new Error("OAUTH_STORAGE_OR_APP_CREDENTIALS_REQUIRED");

  const shopId = Number(process.env.ETSY_SHOP_ID);
  const userId = Number(process.env.ETSY_OAUTH_MIGRATION_EXPECTED_USER_ID);
  if (!Number.isSafeInteger(shopId) || shopId < 1 ||
      !Number.isSafeInteger(userId) || userId < 1 ||
      primary?.userId !== userId || primary?.shopId !== shopId)
    throw new Error("STORED_SHOP_OWNER_IDENTITY_NOT_CONFIRMED");

  // Must be the exact pre-registered callback, not an origin inferred from
  // a Host header, a preview URL, or the request's query parameters.
  const raw = process.env.ETSY_REDIRECT_URI?.trim() ?? "";
  let callback: URL;
  let current: URL;
  try {
    callback = new URL(raw);
    current = new URL(requestUrl);
  } catch {
    throw new Error("OAUTH_CALLBACK_URL_INVALID");
  }
  if (current.protocol !== "https:" || callback.protocol !== "https:" ||
      current.origin !== callback.origin ||
      callback.pathname !== "/api/etsy/oauth/callback" ||
      callback.search || callback.hash || callback.username || callback.password)
    throw new Error("OAUTH_CALLBACK_MUST_MATCH_START_ORIGIN");
  return { callback: callback.toString(), userId, shopId };
}

export function stateDigest(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function statesEqual(expected: string | undefined, actual: string | null): boolean {
  if (!expected || !actual || !/^[A-Za-z0-9_-]{35,128}$/.test(expected) ||
      !/^[A-Za-z0-9_-]{35,128}$/.test(actual)) return false;
  const left = Buffer.from(stateDigest(expected), "hex");
  const right = Buffer.from(stateDigest(actual), "hex");
  return timingSafeEqual(left, right);
}

export function buildMigrationAuthorizationUrl(
  clientId: string, callback: string, state: string, pkceChallenge: string
): string {
  if (!clientId.trim() || !/^[A-Za-z0-9_-]{35,128}$/.test(state) ||
      !/^[A-Za-z0-9_-]{43}$/.test(pkceChallenge))
    throw new Error("MIGRATION_OAUTH_PARAMETERS_INVALID");
  const url = new URL("https://www.etsy.com/oauth/connect");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("scope", "listings_r");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", pkceChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function validateMigrationToken(
  value: unknown,
  expectedUserId: number,
  now: () => number = Date.now
): ScopedMigrationToken {
  if (!value || typeof value !== "object" ||
      !Number.isSafeInteger(expectedUserId) || expectedUserId < 1)
    throw new Error("MIGRATION_TOKEN_INVALID");
  const body = value as Record<string, unknown>;
  const prefix = String(expectedUserId) + ".";
  const accessToken = body.access_token;
  const refreshToken = body.refresh_token;
  const expiresIn = body.expires_in;
  const scopes = typeof body.scope === "string" ? parseEtsyGrantedScopes(body.scope) : [];
  if (typeof accessToken !== "string" || !accessToken.startsWith(prefix) ||
      accessToken.length <= prefix.length + 8 ||
      typeof refreshToken !== "string" || !refreshToken.startsWith(prefix) ||
      refreshToken.length <= prefix.length + 8 ||
      body.token_type !== "Bearer" ||
      !Number.isSafeInteger(expiresIn) || (expiresIn as number) < 600 ||
      (expiresIn as number) > 86400 ||
      scopes.length !== 1 || scopes[0] !== "listings_r")
    throw new Error("MIGRATION_TOKEN_SCOPE_OR_IDENTITY_REJECTED");
  return {
    accessToken, refreshToken, userId: expectedUserId,
    expiresAt: new Date(now() + (expiresIn as number) * 1000),
    scope: "listings_r", tokenType: "Bearer"
  };
}
