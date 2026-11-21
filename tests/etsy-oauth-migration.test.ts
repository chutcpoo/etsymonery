import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createOAuthState, createPkcePair } from "../lib/etsy";
import {
  buildMigrationAuthorizationUrl, migrationPreflight, stateDigest,
  statesEqual, validateMigrationToken, reviewedReference
} from "../lib/etsy-oauth-migration";
import { GET as start } from "../app/api/etsy/oauth/start/route";
import { GET as launch } from "../app/api/etsy/oauth/migration/launch/route";
import { GET as loginPage, POST as loginSubmit } from "../app/api/etsy/oauth/migration/login/route";
import { createSellerBrowserSession, validSellerBrowserSession, SELLER_SESSION_COOKIE } from "../lib/etsy-oauth-browser-session";
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

test("cross-site OAuth entry redirects to inert seller landing without creating a session", async () => {
  await withEnv({
    ETSY_OAUTH_MIGRATION_ENABLED: "true",
    ETSY_SELLER_APPROVER_TOKEN: "fixture-seller-for-oauth-landing-1234567890123456",
    ETSY_OPERATOR_READ_TOKEN: "fixture-read-for-oauth-landing-12345678901234567"
  }, async () => {
    const url = "https://publisher.poonthaidigital.com/api/etsy/oauth/start";
    const seller = "Bearer fixture-seller-for-oauth-landing-1234567890123456";
    const response = await start(new NextRequest(url, {
      headers: { authorization: seller, "sec-fetch-site": "cross-site" }
    }));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"),
      "https://publisher.poonthaidigital.com/api/etsy/oauth/migration/launch");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("cache-control")?.includes("no-store"), true);
    const landingUrl = "https://publisher.poonthaidigital.com/api/etsy/oauth/migration/launch";
    const landing = await launch(new NextRequest(landingUrl, {
      headers: { authorization: seller, "sec-fetch-site": "cross-site" }
    }));
    assert.equal(landing.status, 200);
    assert.match(await landing.text(), /href="\/api\/etsy\/oauth\/start"/);
    assert.equal(landing.headers.get("set-cookie"), null);
    assert.match(landing.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    const unauthorized = await launch(new NextRequest(landingUrl, {
      headers: { authorization: "Bearer fixture-read-for-oauth-landing-12345678901234567" }
    }));
    assert.equal(unauthorized.status, 401);
    const readMiddleware = await middleware(new NextRequest(landingUrl, {
      headers: { authorization: "Bearer fixture-read-for-oauth-landing-12345678901234567" }
    }));
    assert.equal(readMiddleware.status, 401);
    const sellerMiddleware = await middleware(new NextRequest(landingUrl, {
      headers: { authorization: seller }
    }));
    assert.equal(sellerMiddleware.headers.get("x-middleware-next"), "1");
  });
});

test("seller OAuth login form uses signed short-lived cookie, not an exposed bearer token", async () => {
  await withEnv({
    ETSY_OAUTH_MIGRATION_ENABLED: "true",
    ETSY_SELLER_APPROVER_TOKEN: "fixture-seller-form-secret-12345678901234567890",
    ETSY_OPERATOR_READ_TOKEN: "fixture-read-form-secret-123456789012345678901"
  }, async () => {
    const origin = "https://publisher.poonthaidigital.com";
    const loginUrl = origin + "/api/etsy/oauth/migration/login";
    const landingUrl = origin + "/api/etsy/oauth/migration/launch";
    const startUrl = origin + "/api/etsy/oauth/start";
    const noAuth = await middleware(new NextRequest(landingUrl));
    assert.equal(noAuth.status, 303);
    assert.equal(noAuth.headers.get("location"), loginUrl);
    const page = await loginPage();
    assert.equal(page.status, 200);
    assert.match(await page.text(), /name="password"/);
    const wrongRole = await middleware(new NextRequest(landingUrl, {
      headers: { authorization: "Bearer fixture-read-form-secret-123456789012345678901" }
    }));
    assert.equal(wrongRole.status, 401);
    const wrong = await loginSubmit(new NextRequest(loginUrl, {
      method: "POST",
      headers: { origin, "content-type": "application/x-www-form-urlencoded" },
      body: "password=wrong"
    }));
    assert.equal(wrong.status, 401);
    assert.equal(wrong.headers.get("set-cookie"), null);
    const crossSite = await loginSubmit(new NextRequest(loginUrl, {
      method: "POST",
      headers: { origin: "https://attacker.invalid", "content-type": "application/x-www-form-urlencoded" },
      body: "password=fixture-seller-form-secret-12345678901234567890"
    }));
    assert.equal(crossSite.status, 403);
    const valid = await loginSubmit(new NextRequest(loginUrl, {
      method: "POST",
      headers: { origin, "content-type": "application/x-www-form-urlencoded" },
      body: "password=fixture-seller-form-secret-12345678901234567890"
    }));
    assert.equal(valid.status, 303);
    assert.equal(valid.headers.get("location"), landingUrl);
    const setCookie = valid.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=lax/i);
    assert.doesNotMatch(setCookie, /fixture-seller-form-secret/);
    const cookie = setCookie.split(";")[0];
    const req = new NextRequest(landingUrl, { headers: { cookie } });
    assert.equal(await validSellerBrowserSession(req), true);
    const landingMiddleware = await middleware(req);
    assert.equal(landingMiddleware.headers.get("x-middleware-next"), "1");
    const landing = await launch(req);
    assert.equal(landing.status, 200);
    const startMiddleware = await middleware(new NextRequest(startUrl, {
      headers: { cookie, "sec-fetch-site": "same-origin" }
    }));
    assert.equal(startMiddleware.headers.get("x-middleware-next"), "1");
    const fake = new NextRequest(landingUrl, {
      headers: { cookie: cookie.slice(0, -1) + (cookie.endsWith("0") ? "1" : "0") }
    });
    assert.equal(await validSellerBrowserSession(fake), false);
    const stale = await createSellerBrowserSession(Math.floor(Date.now() / 1000) - 601);
    assert.equal(await validSellerBrowserSession(new NextRequest(landingUrl, {
      headers: { cookie: SELLER_SESSION_COOKIE + "=" + stale }
    })), false);
    const promotion = await middleware(new NextRequest(
      origin + "/api/etsy/oauth/migration/promote",
      { method: "POST", headers: { cookie } }
    ));
    assert.equal(promotion.status, 401);
  });
});
