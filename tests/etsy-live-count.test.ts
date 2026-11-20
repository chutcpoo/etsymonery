import test from "node:test";
import assert from "node:assert/strict";
import { readActiveCatalog } from "../lib/etsy-live-count";
process.env.APP_SUPPORT_EMAIL = "support@example.test";
const grant = { shopId: 123, userId: 42, scope: "listings_r", accessToken: "42.fixture", refreshToken: "fixture", expiresAt: new Date(100000) };
const deps = { expectedShop: 123, authorization: { shopId: 123, etsyPermissionRef: "test-consent", sellerPrivacyAgreementRef: "test-terms" },
  now: () => 100, loadGrant: async () => grant };
test("missing written consent, mismatched shop and invalid grants stop before transport", async () => {
  let calls = 0;
  const transport = async () => { calls++; throw new Error(); };
  for (const change of [{ authorization: null }, { expectedShop: 12 }, { loadGrant: async () => null },
    ...[{ scope: "listings_r listings_w" }, { scope: "" }, { shopId: 9 }, { userId: 8 },
      { expiresAt: new Date(50) }].map(fields => ({ loadGrant: async () => ({ ...grant, ...fields }) }))]) {
    assert.equal((await readActiveCatalog({ ...deps, ...change, transport })).liveCatalogCount, null);
  }
  assert.equal(calls, 0);
});
test("the active count comes from a single uncached shop-scoped GET; invalid responses never become zero", async () => {
  process.env.ETSY_API_KEY = "fixture"; process.env.ETSY_SHARED_SECRET = "fixture";
  const row = { shop_id: 123, state: "active", listing_id: 1 };
  for (const [data, expected] of [
    [{ count: 0, results: [] }, 0], [{ count: 73, results: [row] }, 73],
    [{ count: 4, results: [] }, null], [{ count: 1, results: [{ ...row, shop_id: 124 }] }, null],
    [{ count: 1, results: [{ ...row, state: "draft" }] }, null], [{ count: -1, results: [] }, null],
    [{ results: [] }, null]
  ] as const) {
    let calls = 0;
    const result = await readActiveCatalog({ ...deps, transport: async (input, init) => {
      calls++; assert.match(String(input), /shops\/123\/listings\?state=active&limit=1$/);
      assert.equal(init?.method, "GET"); assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error");
      return Response.json(data);
    }});
    assert.equal(calls, 1); assert.equal(result.liveCatalogCount, expected);
    assert.equal(result.observedAt !== null, expected !== null);
  }
  const failed = await readActiveCatalog({ ...deps, transport: async () => new Response(null, {status: 429, headers: {"retry-after":"1800"}}) });
  assert.equal(failed.liveCatalogCount, null);
});
