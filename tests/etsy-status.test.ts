import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ETSY_STATUS_REQUIRED_SCOPES,
  buildEtsyOAuthStatus,
  type EtsyOAuthStatusInput
} from "../lib/etsy-status";

const NOW = new Date("2026-10-21T05:00:00.000Z");

function input(overrides: Partial<EtsyOAuthStatusInput> = {}): EtsyOAuthStatusInput {
  return {
    apiCredentialsConfigured: true,
    tokenStoreConfigured: true,
    tokensStored: true,
    grantScope: "listings_r listings_w transactions_r",
    grantExpiresAt: new Date("2026-10-21T06:00:00.000Z"),
    redirectUriConfigured: true,
    shopIdConfigured: true,
    writeGates: {
      draftWritesEnabled: false,
      publishWritesEnabled: false,
      postResetV2WritesEnabled: false
    },
    now: NOW,
    ...overrides
  };
}

test("stored grant reports all three required scopes, without claiming an Etsy API handshake", () => {
  const value = buildEtsyOAuthStatus(input());
  assert.deepEqual(ETSY_STATUS_REQUIRED_SCOPES, [
    "listings_r", "listings_w", "transactions_r"
  ]);
  assert.equal(value.oauthGrantStatus, "GRANT_RECORDED");
  assert.deepEqual(value.requiredScopeChecks, {
    listings_r: true, listings_w: true, transactions_r: true
  });
  assert.deepEqual(value.missingRequiredScopes, []);
  assert.equal(value.allRequiredScopesGranted, true);
  assert.equal(value.sellerReadGrantReady, true);
  assert.equal(value.sellerWriteGrantReady, true);
  assert.equal(value.transactionsReadGrantReady, true);
  assert.equal(value.tokenExpiryStatus, "UNEXPIRED");
  assert.equal(value.etsyApiLiveVerification, "NOT_TESTED");
  assert.equal(value.allCheckedWriteGatesClosed, true);
  assert.equal(value.ETSY_WRITE_COUNT, 0);
  assert.equal(value.mode, "READ_ONLY");
});

test("missing transactions_r is visible even when listing read/write is granted", () => {
  const value = buildEtsyOAuthStatus(input({ grantScope: "listings_r listings_w" }));
  assert.equal(value.sellerWriteGrantReady, true);
  assert.equal(value.transactionsReadGrantReady, false);
  assert.equal(value.allRequiredScopesGranted, false);
  assert.deepEqual(value.missingRequiredScopes, ["transactions_r"]);
  assert.equal(value.oauthGrantStatus, "REQUIRED_SCOPES_MISSING");
});

test("missing write grant cannot be called ready", () => {
  const value = buildEtsyOAuthStatus(input({ grantScope: "listings_r transactions_r" }));
  assert.equal(value.sellerWriteGrantReady, false);
  assert.deepEqual(value.missingSellerWriteScopes, ["listings_w"]);
  assert.equal(value.requiredScopeChecks.listings_w, false);
});

test("stored metadata alone never counts as connected without stored tokens", () => {
  const value = buildEtsyOAuthStatus(input({ tokensStored: false }));
  assert.equal(value.oauthConnected, false);
  assert.equal(value.oauthGrantStatus, "TOKEN_NOT_STORED");
  assert.equal(value.scopeMetadataPresent, false);
  assert.equal(value.allRequiredScopesGranted, false);
  assert.deepEqual(value.grantedScopes, []);
  assert.equal(value.etsyApiLiveVerification, "NOT_TESTED");
});

test("missing token store fails closed and expired token is not misreported as live verification", () => {
  const noStore = buildEtsyOAuthStatus(input({ tokenStoreConfigured: false }));
  assert.equal(noStore.oauthGrantStatus, "TOKEN_STORE_NOT_CONFIGURED");
  assert.equal(noStore.sellerReadGrantReady, false);
  assert.equal(noStore.sellerWriteGrantReady, false);
  assert.equal(noStore.tokenExpiryStatus, "UNKNOWN");
  const expired = buildEtsyOAuthStatus(input({
    grantExpiresAt: new Date("2026-10-20T00:00:00.000Z")
  }));
  assert.equal(expired.tokenExpiryStatus, "EXPIRED_REFRESH_MAY_BE_REQUIRED");
  assert.equal(expired.etsyApiLiveVerification, "NOT_TESTED");
});

test("write-gate reporting never authorizes writes", () => {
  const value = buildEtsyOAuthStatus(input({
    writeGates: {
      draftWritesEnabled: true,
      publishWritesEnabled: false,
      postResetV2WritesEnabled: false
    }
  }));
  assert.equal(value.allCheckedWriteGatesClosed, false);
  assert.equal(value.mode, "READ_ONLY");
  assert.equal(value.ETSY_WRITE_COUNT, 0);
});

test("status route is GET-only, cache-free, and has no Etsy write or token refresh", async () => {
  const source = await readFile(
    new URL("../app/api/etsy/status/route.ts", import.meta.url), "utf8"
  );
  assert.match(source, /export async function GET\(/);
  assert.match(source, /cache-control": "no-store"/);
  assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)\(/);
  assert.doesNotMatch(source, /getValidEtsyAccessToken|refreshEtsyTokens|saveEtsyTokens/);
  assert.doesNotMatch(source, /method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
});
