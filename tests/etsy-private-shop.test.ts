import test from "node:test";
import assert from "node:assert/strict";
import { privateSingleShopId } from "../lib/etsy-private-shop";
import { reviewedReadAuthorizationFromEnvironment } from "../lib/etsy-live-count";
import { mayRefreshMinimalReadGrant } from "../lib/etsy-read-refresh";

const keys = ["ETSY_PRIVATE_SINGLE_SHOP_READ_ENABLED", "ETSY_SHOP_ID", "ETSY_READ_APPROVED_SHOP_ID", "ETSY_READ_APP_PERMISSION_REF", "ETSY_READ_SELLER_AGREEMENT_REF", "ETSY_READ_TOKEN_REFRESH_ENABLED", "ETSY_READ_TOKEN_REFRESH_APPROVAL_REF", "APP_SUPPORT_EMAIL"] as const;
function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    for (const k of keys) { if (values[k] === undefined) delete process.env[k]; else process.env[k] = values[k]; }
    fn();
  } finally { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}
const env = { ETSY_PRIVATE_SINGLE_SHOP_READ_ENABLED: "true", ETSY_SHOP_ID: "123", ETSY_READ_APPROVED_SHOP_ID: "123", ETSY_READ_TOKEN_REFRESH_ENABLED: "true", ETSY_READ_TOKEN_REFRESH_APPROVAL_REF: "owner:read-refresh:2026", APP_SUPPORT_EMAIL: "owner@example.test" };
const grant = { accessToken: "42.fake", shopId: 123, userId: 42, scope: "listings_r", expiresAt: new Date(0) };
test("private single shop read is explicitly opted in and shop pinned", () => withEnv(env, () => {
  assert.equal(privateSingleShopId(), 123);
  assert.equal(reviewedReadAuthorizationFromEnvironment()?.shopId, 123);
  assert.equal(mayRefreshMinimalReadGrant(grant, 20_000), true);
}));
test("private shop mode fails closed for wrong shop or broad grant", () => withEnv(env, () => {
  process.env.ETSY_READ_APPROVED_SHOP_ID = "124";
  assert.equal(privateSingleShopId(), null);
  assert.equal(reviewedReadAuthorizationFromEnvironment(), null);
  assert.equal(mayRefreshMinimalReadGrant(grant, 20_000), false);
  process.env.ETSY_READ_APPROVED_SHOP_ID = "123";
  assert.equal(mayRefreshMinimalReadGrant({ ...grant, scope: "listings_r listings_w" }, 20_000), false);
  delete process.env.ETSY_READ_TOKEN_REFRESH_APPROVAL_REF;
  assert.equal(mayRefreshMinimalReadGrant(grant, 20_000), false);
}));
