import assert from "node:assert/strict";
import test from "node:test";
import {
  createEtsyShopIdentityPreflightGetHandler,
  rejectEtsyShopIdentityWrite
} from "../lib/etsy-shop-identity-preflight";

const ENV = ["ETSY_TAXONOMY_READ_TOKEN", "ETSY_API_KEY", "ETSY_SHARED_SECRET", "ETSY_SHOP_ID"];
const URL = "https://preview.example/api/etsy/shop-identity";
const shopPayload = { shop_id: 23582741, shop_name: "PoonthaiDigital", currency_code: "USD" };

async function withFixture<T>(fn: () => Promise<T>) {
  const saved = Object.fromEntries(ENV.map((name) => [name, process.env[name]]));
  try {
    process.env.ETSY_TAXONOMY_READ_TOKEN = "fixture-read-token";
    process.env.ETSY_API_KEY = "fixture-app-key";
    process.env.ETSY_SHARED_SECRET = "fixture-shared-secret";
    process.env.ETSY_SHOP_ID = "23582741";
    return await fn();
  } finally {
    for (const name of ENV) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
}

function req(token: string | null = "fixture-read-token", query = "") {
  return new Request(URL + query, {
    method: "GET", headers: token === null ? {} : { authorization: "Bearer " + token }
  });
}

test("P01 shop identity preflight requires private read token before network", async () => {
  await withFixture(async () => {
    let calls = 0;
    const get = createEtsyShopIdentityPreflightGetHandler({
      fetchImpl: async () => { calls++; throw new Error("NETWORK_NOT_EXPECTED"); }
    });
    assert.equal((await get(req(null))).status, 401);
    assert.equal((await get(req("wrong-token"))).status, 401);
    delete process.env.ETSY_TAXONOMY_READ_TOKEN;
    assert.equal((await get(req())).status, 503);
    assert.equal(calls, 0);
  });
});

test("P01 shop identity preflight queries only configured shop ID through GET", async () => {
  await withFixture(async () => {
    const calls: string[] = [];
    const get = createEtsyShopIdentityPreflightGetHandler({
      fetchImpl: async (input, init) => {
        calls.push(String(input) + ":" + init?.method);
        return Response.json(shopPayload);
      }
    });
    const response = await get(req());
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, "PASS");
    assert.equal(body.shop_id, 23582741);
    assert.equal(body.shop_name, "PoonthaiDigital");
    assert.equal(body.name_matches, true);
    assert.equal(body.currency_code, "USD");
    assert.equal(body.ETSY_WRITE_COUNT, 0);
    assert.deepEqual(calls, ["https://openapi.etsy.com/v3/application/shops/23582741:GET"]);
  });
});

test("P01 shop identity refuses untrusted returned ID or shop name", async () => {
  await withFixture(async () => {
    for (const invalid of [
      { ...shopPayload, shop_id: 99 },
      { ...shopPayload, shop_name: "AnotherShop" },
      { ...shopPayload, shop_name: "" }
    ]) {
      const get = createEtsyShopIdentityPreflightGetHandler({
        fetchImpl: async () => Response.json(invalid)
      });
      const response = await get(req());
      assert.notEqual(response.status, 200);
      assert.equal((await response.json()).ETSY_WRITE_COUNT, 0);
    }
  });
});

test("P01 shop identity does not let caller select a different shop", async () => {
  await withFixture(async () => {
    let called = 0;
    const get = createEtsyShopIdentityPreflightGetHandler({
      fetchImpl: async () => { called++; return Response.json(shopPayload); }
    });
    assert.equal((await get(req("fixture-read-token", "?shop_id=99"))).status, 400);
    process.env.ETSY_SHOP_ID = "not-valid";
    assert.equal((await get(req())).status, 503);
    assert.equal(called, 0);
  });
});

test("P01 shop identity rejects mutation methods", async () => {
  const response = rejectEtsyShopIdentityWrite();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET");
  assert.equal((await response.json()).ETSY_WRITE_COUNT, 0);
});
