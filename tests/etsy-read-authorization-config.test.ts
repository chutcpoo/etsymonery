import test from "node:test";
import assert from "node:assert/strict";
import {
  reviewedReadAuthorizationFromEnvironment, readActiveCatalog
} from "../lib/etsy-live-count";
import { buildEtsyOAuthStatus } from "../lib/etsy-status";

const keys = [
  "ETSY_READ_APPROVED_SHOP_ID",
  "ETSY_READ_APP_PERMISSION_REF",
  "ETSY_READ_SELLER_AGREEMENT_REF"
] as const;

test("shop authorization cannot be inferred from Personal Access or a broad OAuth grant", async () => {
  const original = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    keys.forEach(k => delete process.env[k]);
    assert.equal(reviewedReadAuthorizationFromEnvironment(), null);
    process.env.ETSY_READ_APPROVED_SHOP_ID = "23582741";
    process.env.ETSY_READ_APP_PERMISSION_REF = "PENDING";
    process.env.ETSY_READ_SELLER_AGREEMENT_REF = "todo";
    assert.equal(reviewedReadAuthorizationFromEnvironment(), null);
    process.env.ETSY_READ_APP_PERMISSION_REF = "etsy:review:2026-11-20";
    process.env.ETSY_READ_SELLER_AGREEMENT_REF = "owner:consent:2026-11-20";
    assert.deepEqual(reviewedReadAuthorizationFromEnvironment(), {
      shopId: 23582741,
      etsyPermissionRef: "etsy:review:2026-11-20",
      sellerPrivacyAgreementRef: "owner:consent:2026-11-20"
    });
    process.env.ETSY_READ_APPROVED_SHOP_ID = "23582742";
    let calls = 0;
    const observed = await readActiveCatalog({
      expectedShop: 23582741,
      loadGrant: async () => { calls++; return null; },
      transport: async () => { calls++; return Response.json({ count: 0, results: [] }); }
    });
    assert.equal(observed.status, "BLOCKED");
    assert.equal(observed.error, "AUTHORIZED_SHOP_MISMATCH");
    assert.equal(calls, 0);
  } finally {
    keys.forEach(k => { const old = original[k]; if (old === undefined) delete process.env[k]; else process.env[k] = old; });
  }
});

test("historical transaction scope does not mark blocked analytics as ready", () => {
  const s = buildEtsyOAuthStatus({
    apiCredentialsConfigured: true, tokenStoreConfigured: true,
    tokensStored: true, grantScope: "listings_r transactions_r",
    grantExpiresAt: new Date(Date.now() + 30_000),
    redirectUriConfigured: true, shopIdConfigured: true,
    writeGates: { draftWritesEnabled: false, publishWritesEnabled: false, postResetV2WritesEnabled: false }
  });
  assert.equal(s.oauthGrantStatus, "EXCESS_SCOPES_BLOCKED");
  assert.equal(s.transactionsReadGrantReady, false);
  assert.equal(s.sellerReadGrantReady, false);
});
