import test from "node:test";
import assert from "node:assert/strict";
import {
  mayRefreshMinimalReadGrant, loadEtsyReadGrantWithOptionalRefresh
} from "../lib/etsy-read-refresh";

const base = {
  accessToken: "42.synthetic-read-token",
  shopId: 123,
  userId: 42,
  scope: "listings_r",
  expiresAt: new Date(100_000)
};

const env = {
  ETSY_READ_TOKEN_REFRESH_ENABLED: "true",
  ETSY_READ_TOKEN_REFRESH_APPROVAL_REF: "owner:refresh:2026-11-20",
  ETSY_READ_APP_PERMISSION_REF: "etsy:app:permission:2026",
  ETSY_READ_SELLER_AGREEMENT_REF: "owner:shop:agreement:2026",
  ETSY_SHOP_ID: "123",
  ETSY_READ_APPROVED_SHOP_ID: "123",
  APP_SUPPORT_EMAIL: "support@example.test"
};

async function scopedEnv<T>(changes: Record<string, string | undefined>, task: () => T | Promise<T>): Promise<T> {
  const before = Object.fromEntries(Object.keys(changes).map(k => [k, process.env[k]]));
  for (const [key, value] of Object.entries(changes))
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return await task(); }
  finally {
    for (const [key, value] of Object.entries(before))
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}

test("read token rotation is strictly opt-in and scoped to approved own-shop metadata", async () => {
  await scopedEnv(env, async () => {
    assert.equal(mayRefreshMinimalReadGrant(base, 20_000), true);
    assert.equal(mayRefreshMinimalReadGrant({ ...base, scope: "listings_r listings_w" }, 20_000), false);
    assert.equal(mayRefreshMinimalReadGrant({ ...base, scope: "transactions_r" }, 20_000), false);
    assert.equal(mayRefreshMinimalReadGrant({ ...base, userId: 99 }, 20_000), false);
    assert.equal(mayRefreshMinimalReadGrant({ ...base, shopId: 999 }, 20_000), false);
    assert.equal(mayRefreshMinimalReadGrant({ ...base, expiresAt: new Date(1_000_000) }, 20_000), false);
    await scopedEnv({ ETSY_READ_TOKEN_REFRESH_ENABLED: "false" }, async () => {
      assert.equal(mayRefreshMinimalReadGrant(base, 20_000), false);
    });
    await scopedEnv({ ETSY_READ_TOKEN_REFRESH_APPROVAL_REF: "pending" }, async () => {
      assert.equal(mayRefreshMinimalReadGrant(base, 20_000), false);
    });
  });
});

test("disabled refresh never contacts Etsy and does not alter stored tokens", async () => {
  await scopedEnv({ ETSY_READ_TOKEN_REFRESH_ENABLED: undefined }, async () => {
    let networkCalls = 0;
    const grant = await loadEtsyReadGrantWithOptionalRefresh({
      loadGrant: async () => base,
      transport: async () => {
        networkCalls++;
        throw new Error("NETWORK_MUST_NOT_BE_USED");
      },
      now: () => 20_000
    });
    assert.deepEqual(grant, base);
    assert.equal(networkCalls, 0);
  });
});
