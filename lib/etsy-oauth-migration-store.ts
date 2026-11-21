import { randomUUID } from "node:crypto";
import { neon, Client } from "@neondatabase/serverless";
import { decryptSecret, encryptSecret } from "./token-crypto";
import { type MigrationSettings, type ScopedMigrationToken, stateDigest } from "./etsy-oauth-migration";

// Migration credentials never pass through saveEtsyTokens(): it replaces the
// primary grant. New credentials remain encrypted in a separate candidate row.
function dbUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("MIGRATION_DATABASE_NOT_CONFIGURED");
  return url;
}

async function schema() {
  const sql = neon(dbUrl());
  await sql`
    CREATE TABLE IF NOT EXISTS etsy_oauth_migration_sessions (
      state_sha256 TEXT PRIMARY KEY,
      verifier_enc TEXT NOT NULL,
      callback_uri TEXT NOT NULL,
      expected_user_id BIGINT NOT NULL,
      expected_shop_id BIGINT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS etsy_oauth_migration_candidates (
      candidate_id UUID PRIMARY KEY,
      state_sha256 TEXT NOT NULL UNIQUE,
      access_token_enc TEXT,
      refresh_token_enc TEXT,
      token_type TEXT NOT NULL,
      scope TEXT NOT NULL,
      user_id BIGINT NOT NULL,
      shop_id BIGINT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'STAGED',
      validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      promoted_at TIMESTAMPTZ,
      CHECK (status IN ('STAGED', 'PROMOTED'))
    );
  `;
}

export async function saveMigrationSession(state: string, verifier: string, settings: MigrationSettings) {
  await schema();
  const sql = neon(dbUrl());
  await sql`
    DELETE FROM etsy_oauth_migration_sessions WHERE expires_at <= NOW();
  `;
  await sql`
    DELETE FROM etsy_oauth_migration_candidates
    WHERE status = 'STAGED' AND expires_at <= NOW();
  `;
  const hash = stateDigest(state);
  await sql`
    INSERT INTO etsy_oauth_migration_sessions
      (state_sha256, verifier_enc, callback_uri, expected_user_id, expected_shop_id, expires_at)
    VALUES
      (${hash}, ${encryptSecret(verifier)}, ${settings.callback},
       ${settings.userId}, ${settings.shopId}, NOW() + INTERVAL '10 minutes');
  `;
}

// The DELETE ... RETURNING operation atomically consumes the state before
// exchanging an OAuth code. A duplicate callback cannot reuse the verifier.
export async function consumeMigrationSession(state: string) {
  await schema();
  const sql = neon(dbUrl());
  const rows = await sql`
    DELETE FROM etsy_oauth_migration_sessions
    WHERE state_sha256 = ${stateDigest(state)} AND expires_at > NOW()
    RETURNING verifier_enc, callback_uri, expected_user_id, expected_shop_id;
  `;
  if (rows.length !== 1) return null;
  const row = rows[0];
  return {
    verifier: decryptSecret(String(row.verifier_enc)),
    callback: String(row.callback_uri),
    userId: Number(row.expected_user_id),
    shopId: Number(row.expected_shop_id)
  };
}

export async function stageMigrationGrant(state: string, token: ScopedMigrationToken, shopId: number) {
  await schema();
  const sql = neon(dbUrl());
  const candidateId = randomUUID();
  const hash = stateDigest(state);
  const encryptedAccess = encryptSecret(token.accessToken);
  const encryptedRefresh = encryptSecret(token.refreshToken);
  const rows = await sql`
    INSERT INTO etsy_oauth_migration_candidates
      (candidate_id, state_sha256, access_token_enc, refresh_token_enc,
       token_type, scope, user_id, shop_id, expires_at)
    VALUES
      (${candidateId}::uuid, ${hash}, ${encryptedAccess}, ${encryptedRefresh},
       'Bearer', 'listings_r', ${token.userId}, ${shopId},
       ${token.expiresAt.toISOString()}::timestamptz)
    RETURNING candidate_id;
  `;
  if (rows.length !== 1) throw new Error("MIGRATION_STAGING_FAILED");
  return candidateId;
}

export async function latestMigrationCandidate() {
  await schema();
  const sql = neon(dbUrl());
  const rows = await sql`
    SELECT candidate_id, scope, user_id, shop_id, expires_at, status,
           validated_at, promoted_at
    FROM etsy_oauth_migration_candidates
    ORDER BY validated_at DESC LIMIT 1;
  `;
  if (rows.length !== 1) return null;
  const row = rows[0];
  return {
    candidateId: String(row.candidate_id),
    scope: String(row.scope),
    userId: Number(row.user_id),
    shopId: Number(row.shop_id),
    expiresAt: new Date(row.expires_at).toISOString(),
    status: String(row.status),
    validatedAt: new Date(row.validated_at).toISOString(),
    promotedAt: row.promoted_at ? new Date(row.promoted_at).toISOString() : null
  };
}

// Separate, explicit second owner approval is necessary before promotion.
// The old primary row is locked and cannot be replaced by another Etsy user
// or shop. Both token replacement and candidate consumption are atomic.
export async function promoteMigrationGrant(candidateId: string, settings: MigrationSettings) {
  if (!/^[a-f0-9-]{36}$/i.test(candidateId))
    throw new Error("MIGRATION_CANDIDATE_INVALID");
  await schema();
  const client = new Client(dbUrl());
  await client.connect();
  try {
    await client.query("BEGIN");
    const candidateResult = await client.query(
      `SELECT access_token_enc, refresh_token_enc, token_type, scope,
              user_id, shop_id, expires_at, status
       FROM etsy_oauth_migration_candidates WHERE candidate_id = $1::uuid FOR UPDATE`,
      [candidateId]
    );
    const candidate = candidateResult.rows[0];
    if (!candidate || candidate.status !== "STAGED" ||
        candidate.token_type !== "Bearer" || candidate.scope !== "listings_r" ||
        Number(candidate.user_id) !== settings.userId ||
        Number(candidate.shop_id) !== settings.shopId ||
        !candidate.access_token_enc || !candidate.refresh_token_enc ||
        new Date(candidate.expires_at).getTime() <= Date.now() + 5 * 60_000)
      throw new Error("MIGRATION_CANDIDATE_NOT_ELIGIBLE");

    const primaryResult = await client.query(
      `SELECT user_id, shop_id FROM oauth_tokens
       WHERE provider = 'etsy' AND account_key = 'primary' FOR UPDATE`
    );
    const primary = primaryResult.rows[0];
    if (!primary || Number(primary.user_id) !== settings.userId ||
        Number(primary.shop_id) !== settings.shopId)
      throw new Error("MIGRATION_PRIMARY_OWNER_MISMATCH");

    const update = await client.query(
      `UPDATE oauth_tokens SET access_token_enc = $1, refresh_token_enc = $2,
       expires_at = $3, scope = 'listings_r', token_type = 'Bearer',
       user_id = $4, shop_id = $5, updated_at = NOW()
       WHERE provider = 'etsy' AND account_key = 'primary'
         AND user_id = $4 AND shop_id = $5
       RETURNING user_id, shop_id, scope`,
      [candidate.access_token_enc, candidate.refresh_token_enc,
       candidate.expires_at, settings.userId, settings.shopId]
    );
    if (update.rowCount !== 1 || update.rows[0].scope !== "listings_r")
      throw new Error("MIGRATION_PROMOTION_VERIFICATION_FAILED");

    const finished = await client.query(
      `UPDATE etsy_oauth_migration_candidates SET status = 'PROMOTED',
       promoted_at = NOW(), access_token_enc = NULL, refresh_token_enc = NULL
       WHERE candidate_id = $1::uuid AND status = 'STAGED' RETURNING candidate_id`,
      [candidateId]
    );
    if (finished.rowCount !== 1)
      throw new Error("MIGRATION_CANDIDATE_CONSUMPTION_FAILED");
    await client.query("COMMIT");
    return { status: "PROMOTED" as const, userId: settings.userId,
      shopId: settings.shopId, scope: "listings_r" as const };
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    throw new Error("MIGRATION_PROMOTION_ABORTED");
  } finally {
    await client.end().catch(() => {});
  }
}
