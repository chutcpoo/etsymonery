import { neon } from "@neondatabase/serverless";
import { decryptSecret, encryptSecret } from "./token-crypto";

const PROVIDER = "etsy";
const ACCOUNT_KEY = "primary";

export type EtsyStoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope?: string;
  tokenType?: string;
  userId?: number;
  shopId?: number;
};

type SaveTokensInput = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope?: string;
  tokenType?: string;
  userId?: number;
};

function getSql() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL_NOT_CONFIGURED");
  }

  return neon(databaseUrl);
}

export function isTokenStoreConfigured() {
  return Boolean(
    process.env.DATABASE_URL?.trim() &&
      process.env.TOKEN_ENCRYPTION_KEY?.trim()
  );
}

export async function saveEtsyTokens(input: SaveTokensInput) {
  const sql = getSql();
  const expiresAt = new Date(
    Date.now() + Math.max(60, input.expiresIn || 3600) * 1000
  ).toISOString();

  await sql`
    INSERT INTO oauth_tokens (
      provider,
      account_key,
      access_token_enc,
      refresh_token_enc,
      expires_at,
      scope,
      token_type,
      user_id,
      updated_at
    )
    VALUES (
      ${PROVIDER},
      ${ACCOUNT_KEY},
      ${encryptSecret(input.accessToken)},
      ${encryptSecret(input.refreshToken)},
      ${expiresAt},
      ${input.scope ?? null},
      ${input.tokenType ?? null},
      ${input.userId ?? null},
      now()
    )
    ON CONFLICT (provider, account_key)
    DO UPDATE SET
      access_token_enc = EXCLUDED.access_token_enc,
      refresh_token_enc = EXCLUDED.refresh_token_enc,
      expires_at = EXCLUDED.expires_at,
      scope = EXCLUDED.scope,
      token_type = EXCLUDED.token_type,
      user_id = COALESCE(EXCLUDED.user_id, oauth_tokens.user_id),
      updated_at = now()
  `;
}

export async function loadEtsyTokens(): Promise<EtsyStoredTokens | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      access_token_enc,
      refresh_token_enc,
      expires_at,
      scope,
      token_type,
      user_id,
      shop_id
    FROM oauth_tokens
    WHERE provider = ${PROVIDER}
      AND account_key = ${ACCOUNT_KEY}
    LIMIT 1
  `;

  const row = rows[0] as
    | {
        access_token_enc: string;
        refresh_token_enc: string;
        expires_at: string | Date;
        scope: string | null;
        token_type: string | null;
        user_id: string | number | null;
        shop_id: string | number | null;
      }
    | undefined;

  if (!row) return null;

  return {
    accessToken: decryptSecret(row.access_token_enc),
    refreshToken: decryptSecret(row.refresh_token_enc),
    expiresAt: new Date(row.expires_at),
    scope: row.scope ?? undefined,
    tokenType: row.token_type ?? undefined,
    userId: row.user_id == null ? undefined : Number(row.user_id),
    shopId: row.shop_id == null ? undefined : Number(row.shop_id)
  };
}

export async function hasStoredEtsyTokens() {
  if (!isTokenStoreConfigured()) return false;

  const sql = getSql();
  const rows = await sql`
    SELECT 1 AS present
    FROM oauth_tokens
    WHERE provider = ${PROVIDER}
      AND account_key = ${ACCOUNT_KEY}
    LIMIT 1
  `;

  return rows.length > 0;
}

export async function updateEtsyIdentity(userId: number, shopId: number) {
  const sql = getSql();

  await sql`
    UPDATE oauth_tokens
    SET
      user_id = ${userId},
      shop_id = ${shopId},
      updated_at = now()
    WHERE provider = ${PROVIDER}
      AND account_key = ${ACCOUNT_KEY}
  `;
}

export async function getStoredEtsyShopId() {
  if (!isTokenStoreConfigured()) return null;

  const sql = getSql();
  const rows = await sql`
    SELECT shop_id
    FROM oauth_tokens
    WHERE provider = ${PROVIDER}
      AND account_key = ${ACCOUNT_KEY}
    LIMIT 1
  `;

  const row = rows[0] as { shop_id: string | number | null } | undefined;
  return row?.shop_id == null ? null : Number(row.shop_id);
}
