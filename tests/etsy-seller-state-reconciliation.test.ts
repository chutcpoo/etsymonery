import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ETSY_SELLER_STATES,
  getEtsySellerStateSnapshot
} from "../lib/etsy-seller-state-reconciliation";

async function withEtsyHeaders<T>(fn: () => Promise<T>) {
  const previousKey = process.env.ETSY_API_KEY;
  const previousSecret = process.env.ETSY_SHARED_SECRET;
  process.env.ETSY_API_KEY = "test-key";
  process.env.ETSY_SHARED_SECRET = "test-secret";
  try { return await fn(); }
  finally {
    if (previousKey === undefined) delete process.env.ETSY_API_KEY;
    else process.env.ETSY_API_KEY = previousKey;
    if (previousSecret === undefined) delete process.env.ETSY_SHARED_SECRET;
    else process.env.ETSY_SHARED_SECRET = previousSecret;
  }
}

test("seller-state endpoint and reconciler are GET-only", async () => {
  const route = await readFile(
    new URL("../app/api/etsy/test/seller-state/route.ts", import.meta.url),
    "utf8"
  );
  const lib = await readFile(
    new URL("../lib/etsy-seller-state-reconciliation.ts", import.meta.url),
    "utf8"
  );
  assert.match(route, /export async function GET\(/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)\(/);
  assert.doesNotMatch(lib, /method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
});

test("seller-state snapshot covers every Etsy getListingsByShop state and reads SKU inventory", async () => {
  await withEtsyHeaders(async () => {
    const calls: Array<{ url: string; method: string | undefined }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, method: init?.method });
      if (url.endsWith("/inventory")) {
        return Response.json({ products: [{ sku: url.includes("/101/") ? "PDT-IPT-001" : "" }] });
      }
      const state = new URL(url).searchParams.get("state") ?? "";
      const id = state === "active" ? 101 : state === "draft" ? 202 : 300 + ETSY_SELLER_STATES.indexOf(state as never);
      return Response.json({
        count: 1,
        results: [{
          listing_id: id,
          shop_id: 23582741,
          title: `${state} listing`,
          state,
          url: `https://example.test/${id}`
        }]
      });
    };

    const result = await getEtsySellerStateSnapshot({
      shopId: 23582741,
      accessToken: "token",
      dependencies: { fetchImpl }
    });

    assert.equal(result.status, "PASS");
    assert.equal(result.mode, "READ_ONLY");
    assert.equal(result.ETSY_WRITE_COUNT, 0);
    assert.deepEqual(result.states, [...ETSY_SELLER_STATES]);
    assert.equal(result.total, 5);
    for (const state of ETSY_SELLER_STATES) assert.equal(result.counts[state], 1);
    assert.deepEqual(result.listings.find((x) => x.listingId === 101)?.skus, ["PDT-IPT-001"]);
    assert.equal(calls.every((call) => call.method === "GET"), true);
    for (const state of ETSY_SELLER_STATES) {
      assert.ok(calls.some((call) => call.url.includes(`state=${state}`)));
    }
  });
});

test("seller-state snapshot fails closed on cross-shop evidence", async () => {
  await withEtsyHeaders(async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/inventory")) return Response.json({ products: [] });
      return Response.json({
        count: 1,
        results: [{ listing_id: 1, shop_id: 999999, title: "wrong shop", state: "active" }]
      });
    };
    await assert.rejects(
      () => getEtsySellerStateSnapshot({ shopId: 23582741, accessToken: "token", dependencies: { fetchImpl } }),
      /ETSY_SELLER_STATE_SHOP_ID_MISMATCH/
    );
  });
});
