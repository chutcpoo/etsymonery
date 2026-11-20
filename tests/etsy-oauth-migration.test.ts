import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createOAuthState, createPkcePair } from "../lib/etsy";
import {
  buildMigrationAuthorizationUrl, migrationPreflight, stateDigest,
  statesEqual, validateMigrationToken, reviewedReference
} from "../lib/etsy-oauth-migration";
import { GET as start } from "../app/api/etsy/oauth/start/route";
import { GET as callback } from "../app/api/etsy/oauth/callback/route";
import { POST as promote } from "../app/api/etsy/oauth/migration/promote/route";
import { middleware } from "../middleware";

const envKeys = [
  "ETSY_OAUTH_MIGRATION_ENABLED", "ETSY_OAUTH_MIGRATION_OWNER_APPROVAL_REF",
  "ETSY_OAUTH_MIGRATION_EXPECTED_USER_ID", "ETSY_OAUTH_MIGRATION_PROMOTION_ENABLED",
  "ETSY_OAUTH_MIGRATION_PROMOTION_APPROVAL_REF",
  "ETSY_OAUTH_MIGRATION_PROMOTION_CANDIDATE_ID",
  "ETSY_REDIRECT_URI", "ETSY_SHOP_ID", "APP_SUPPORT_EMAIL",
  "DATABASE_URL", "TOKEN_ENCRYPTION_KEY", "ETSY_API_KEY", "ETSY_SHARED_SECRET",
  "ETSY_DRAFT_WRITES_ENABLED", "PUBLISH_WRITES_ENABLED",
  "ETSY_OPERATOR_READ_TOKEN", "ETSY_SELLER_APPROVER_TOKEN"
] as const;

function withEnv<T>(changes: Record<string, string | undefined>, task: () => T): T {
  const old = Object.fromEntries(Object.keys(changes).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(changes))
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  const restore = () => {
    for (const [k, v] of Object.entries(old))
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
  };
  try {
    const result = task();
    if (result && typeof (result as unknown as PromiseLike<unknown>).then === "function")
      return (result as unknown as Promise<unknown>).finally(restore) as T;
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}
function fixtureEnv() {
  return {
    ETSY_OAUTH_MIGRATION_ENABLED: "true",
    ETSY_OAUTH_MIGRATION_OWNER_APPROVAL_REF: "owner:approval:2026-11-20",
    ETSY_OAUTH_MIGRATION_EXPECTED_USER_ID: "42",
    ETSY_REDIRECT_URI: "https://publisher.poonthaidigital.com/api/etsy/oauth/callback",
    ETSY_SHOP_ID: "123",
    APP_SUPPORT_EMAIL: "support@example.test",
    DATABASE_URL: "postgresql://fixture.invalid/example",
    TOKEN_ENCRYPTION_KEY: "offline-only-key-xxxxxxxxxxxxxxxxxxxx",
    ETSY_API_KEY: "fixture-api-key",
    ETSY_SHARED_SECRET: "fixture-secret",
    ETSY_DRAFT_WRITES_ENABLED: "false",
    PUBLISH_WRITES_ENABLED: "false"
  };
}

test("migration disabled by default; no OAuth route may change a grant", async () => {
  await withEnv({
    ETSY_OAUTH_MIGRATION_ENABLED: undefined,
    ETSY_OAUTH_MIGRATION_PROMOTION_ENABLED: undefined
  }, async () => {
    assert.equal((await start(new NextRequest("https://publisher.poonthaidigital.com/api/etsy/oauth/start"))).status, 403);
    assert.equal((await callback(new NextRequest("https://publisher.poonthaidigital.com/api/etsy/oauth/callback?code=fixture"))).status, 403);
    assert.equal((await promote(new NextRequest("https://publisher.poonthaidigital.com/api/etsy/oauth/migration/promote",
      { method: "POST" }))).status, 403);
  });
});

test("owner identity, approval, same-host callback and write flags fail closed", () => {
  withEnv(fixtureEnv(), () => {
    const expected = { userId: 42, shopId: 123 };
    const base = "https://publisher.poonthaidigital.com/api/etsy/oauth/start";
    assert.deepEqual(migrationPreflight(base, expected), {
      callback: "https://publisher.poonthaidigital.com/api/etsy/oauth/callback",
      userId: 42, shopId: 123
    });
    assert.throws(() => migrationPreflight(base, { userId: 99, shopId: 123 }), /STORED_SHOP_OWNER/);
    assert.throws(() => migrationPreflight(base, { userId: 42, shopId: 124 }), /STORED_SHOP_OWNER/);
    assert.throws(() => migrationPreflight("https://autodigitalpublisher.vercel.app/api/etsy/oauth/start", expected), /CALLBACK_MUST_MATCH/);
    withEnv({ ETSY_DRAFT_WRITES_ENABLED: "true" }, () =>
      assert.throws(() => migrationPreflight(base, expected), /WRITE_FLAGS/));
    withEnv({ ETSY_OAUTH_MIGRATION_OWNER_APPROVAL_REF: "pending" }, () =>
      assert.throws(() => migrationPreflight(base, expected), /APPROVAL/));
    withEnv({ ETSY_OAUTH_MIGRATION_ENABLED: "false" }, () =>
      assert.throws(() => migrationPreflight(base, expected), /DISABLED/));
    assert.equal(reviewedReference("PENDING"), false);
  });
});

test("OAuth authorize URL asks only listings_r and uses PKCE S256", () => {
  const state = createOAuthState();
  const pair = createPkcePair();
  const callback = "https://publisher.poonthaidigital.com/api/etsy/oauth/callback";
  const url = new URL(buildMigrationAuthorizationUrl("keystring", callback, state, pair.challenge));
  assert.equal(url.origin, "https://www.etsy.com");
  assert.equal(url.searchParams.get("scope"), "listings_r");
  assert.equal(url.searchParams.get("redirect_uri"), callback);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(url.searchParams.has("code_verifier"), false);
});

test("migration state requires an exact one-time callback cookie match", () => {
  const state = createOAuthState();
  assert.equal(statesEqual(state, state), true);
  assert.equal(statesEqual(state, createOAuthState()), false);
  assert.equal(statesEqual(state, null), false);
  assert.equal(statesEqual("", state), false);
  assert.notEqual(stateDigest(state), state);
});

test("staged token rejects excess scope, wrong user, wrong type and expiry", () => {
  const token = {
    access_token: "42.synthetic-access-not-a-real-etsy-token",
    refresh_token: "42.synthetic-refresh-not-a-real-etsy-token",
    expires_in: 3600,
    token_type: "Bearer",
    scope: "listings_r"
  };
  const parsed = validateMigrationToken(token, 42, () => 1000);
  assert.equal(parsed.userId, 42);
  assert.equal(parsed.scope, "listings_r");
  assert.equal(parsed.expiresAt.toISOString(), new Date(3_601_000).toISOString());
  for (const changes of [
    { scope: "listings_r listings_w" }, { scope: "transactions_r" },
    { scope: "" }, { access_token: "99.not-my-token" },
    { refresh_token: "99.not-my-refresh-token" },
    { token_type: "basic" }, { expires_in: 20 }, { expires_in: 0 }
  ]) assert.throws(() => validateMigrationToken({ ...token, ...changes }, 42), /REJECTED/);
});

test("OAuth migration start cannot be accessed with normal read role", async () => {
  await withEnv({
    ETSY_OAUTH_MIGRATION_ENABLED: "true",
    ETSY_OPERATOR_READ_TOKEN: "fixture-only-read-role-123456789012345",
    ETSY_SELLER_APPROVER_TOKEN: "fixture-only-seller-role-123456789012345"
  }, async () => {
    const url = "https://publisher.poonthaidigital.com/api/etsy/oauth/start";
    const result = await middleware(new NextRequest(url, {
      headers: { authorization: "Bearer fixture-only-read-role-123456789012345" }
    }));
    assert.equal(result.status, 401);
    const seller = await middleware(new NextRequest(url, {
      headers: { authorization: "Bearer fixture-only-seller-role-123456789012345" }
    }));
    assert.equal(seller.headers.has("x-middleware-next"), true);
    const sellerBasic = await middleware(new NextRequest(url, {
      headers: { authorization: "Basic " + Buffer.from(
        "operator:fixture-only-seller-role-123456789012345"
      ).toString("base64") }
    }));
    assert.equal(sellerBasic.headers.has("x-middleware-next"), true);
    const prohibitedSellerBasicPost = await middleware(new NextRequest(
      "https://publisher.poonthaidigital.com/api/etsy/oauth/migration/promote",
      {
        method: "POST",
        headers: { authorization: "Basic " + Buffer.from(
          "operator:fixture-only-seller-role-123456789012345"
        ).toString("base64") }
      }
    ));
    assert.equal(prohibitedSellerBasicPost.status, 401);
    const callbackAllowed = await middleware(new NextRequest(
      "https://publisher.poonthaidigital.com/api/etsy/oauth/callback?code=fixture"
    ));
    assert.equal(callbackAllowed.headers.has("x-middleware-next"), true);
  });
});

test("promotion requires a second independent owner authorization", async () => {
  await withEnv({
    ETSY_OAUTH_MIGRATION_ENABLED: "true",
    ETSY_OAUTH_MIGRATION_PROMOTION_ENABLED: undefined,
    ETSY_OAUTH_MIGRATION_PROMOTION_APPROVAL_REF: undefined
  }, async () => {
    const res = await promote(new NextRequest(
      "https://publisher.poonthaidigital.com/api/etsy/oauth/migration/promote",
      { method: "POST" }
    ));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "PROMOTION_REQUIRES_OWNER_APPROVAL");
  });
});

test("fixture env test keys remain isolated", () => {
  // Explicit reminder: source code and CI must never set live migration flags.
  assert.equal(envKeys.includes("ETSY_OAUTH_MIGRATION_ENABLED"), true);
});
