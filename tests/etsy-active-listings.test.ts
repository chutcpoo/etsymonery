import test from "node:test";
import assert from "node:assert/strict";
import { readActiveListings } from "../lib/etsy-active-listings";

process.env.APP_SUPPORT_EMAIL = "support@example.test";
process.env.ETSY_SHOP_ID = "123";
process.env.ETSY_READ_APPROVED_SHOP_ID = "123";
process.env.ETSY_PRIVATE_SINGLE_SHOP_READ_ENABLED = "true";
process.env.ETSY_API_KEY = "fixture";
process.env.ETSY_SHARED_SECRET = "fixture";
const grant = { shopId: 123, userId: 42, scope: "listings_r", accessToken: "42.fixture", refreshToken: "fixture", expiresAt: new Date(100000) };
const deps = { expectedShop: 123, now: () => 100, loadGrant: async () => grant };
const row = (id: number) => ({ listing_id: id, shop_id: 123, state: "active", title: `Listing ${id}`, url: `https://www.etsy.com/listing/${id}/example` });

test("reads active listings with titles and IDs only using shop-scoped GET", async () => {
  const result = await readActiveListings({ ...deps, transport: async (url, init) => {
    assert.match(String(url), /shops\/123\/listings\?state=active&limit=100&offset=0$/);
    assert.equal(init?.method, "GET"); assert.equal(init?.cache, "no-store");
    return Response.json({ count: 3, results: [row(1), row(2), row(3)] });
  }});
  assert.equal(result.status, "PASS");
  if (result.status === "PASS") {
    assert.equal(result.count, 3);
    assert.deepEqual(result.listings.map(x => x.listingId), [1, 2, 3]);
  }
});

test("owner live catalog retains M01 after the legacy projection is archived", async () => {
  const listingId = 4626228544;
  const result = await readActiveListings({
    ...deps,
    transport: async (_url, init) => {
      assert.equal(init?.method, "GET");
      return Response.json({ count: 1, results: [{ ...row(listingId), title: "M01" }] });
    }
  });

  assert.equal(result.status, "PASS");
  assert.equal(result.count, 1);
  assert.deepEqual(result.listings, [{
    listingId,
    title: "M01",
    url: `https://www.etsy.com/listing/${listingId}/example`
  }]);
});

test("does not contact Etsy for broad, expired or wrong-shop grants", async () => {
  let calls = 0;
  for (const change of [{ scope: "listings_r listings_w" }, { shopId: 124 }, { expiresAt: new Date(50) }, { accessToken: "99.bad" }]) {
    const result = await readActiveListings({ ...deps, loadGrant: async () => ({ ...grant, ...change }), transport: async () => { calls++; throw Error("unexpected"); } });
    assert.equal(result.status, "BLOCKED");
  }
  assert.equal(calls, 0);
});

test("rejects wrong shop, duplicate IDs and incomplete pages rather than displaying partial data", async () => {
  for (const payload of [
    { count: 1, results: [{ ...row(1), shop_id: 124 }] },
    { count: 2, results: [row(1), row(1)] },
    { count: 3, results: [row(1)] },
    { count: 1, results: [{ ...row(1), title: "" }] }
  ]) {
    const result = await readActiveListings({ ...deps, transport: async () => Response.json(payload) });
    assert.equal(result.status, "BLOCKED");
    assert.deepEqual(result.listings, []);
  }
});

test("refuses requests unless explicit private single shop mode is enabled", async () => {
  process.env.ETSY_PRIVATE_SINGLE_SHOP_READ_ENABLED = "false";
  try {
    const result = await readActiveListings({ ...deps, transport: async () => { throw Error("unexpected"); } });
    assert.equal(result.status, "BLOCKED");
  } finally { process.env.ETSY_PRIVATE_SINGLE_SHOP_READ_ENABLED = "true"; }
});
