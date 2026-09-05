import assert from "node:assert/strict";
import test from "node:test";
import { PublishAmbiguousResultError } from "../lib/authorized-publish-transaction";
import { EtsyAuthorizedPublishProvider } from "../lib/etsy-authorized-publish-provider";

const SHOP_ID = "23582741";
const LISTING_ID = "900000001";
const LISTING = {
  listing_id: Number(LISTING_ID),
  title: "Proof Planner",
  description: "Proof description",
  price: { amount: 999, divisor: 100, currency_code: "USD" },
  tags: ["proof", "planner"],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2025",
  taxonomy_id: 1234,
  listing_type: "download",
  state: "draft"
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function withEtsyHeaders<T>(fn: () => Promise<T>) {
  const previousKey = process.env.ETSY_API_KEY;
  const previousSecret = process.env.ETSY_SHARED_SECRET;
  process.env.ETSY_API_KEY = "test-key";
  process.env.ETSY_SHARED_SECRET = "test-secret";
  try {
    return await fn();
  } finally {
    if (previousKey === undefined) delete process.env.ETSY_API_KEY;
    else process.env.ETSY_API_KEY = previousKey;
    if (previousSecret === undefined) delete process.env.ETSY_SHARED_SECRET;
    else process.env.ETSY_SHARED_SECRET = previousSecret;
  }
}

test("adapter maps readDraft -> publish -> readPublished to Etsy GET/PATCH/GET", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const queue = [
    response(LISTING),
    response({ ...LISTING, state: "active" }),
    response({ ...LISTING, state: "active" })
  ];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const next = queue.shift();
    if (!next) throw new Error("UNEXPECTED_FETCH");
    return next;
  };

  await withEtsyHeaders(async () => {
    const provider = new EtsyAuthorizedPublishProvider(SHOP_ID, {
      fetchImpl,
      getAccessToken: async () => "12345.test-token"
    });

    const draft = await provider.readDraft(LISTING_ID);
    const publish = await provider.publish(LISTING_ID);
    const published = await provider.readPublished(LISTING_ID);

    assert.equal(draft.state, "draft");
    assert.equal(publish.listingId, LISTING_ID);
    assert.equal(published?.state, "active");
    assert.equal(published?.observation?.state, "active");
  });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, `https://api.etsy.com/v3/application/listings/${LISTING_ID}`);
  assert.equal(calls[0].init?.method, "GET");
  assert.equal(
    calls[1].url,
    `https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${LISTING_ID}`
  );
  assert.equal(calls[1].init?.method, "PATCH");
  assert.equal((calls[1].init?.body as URLSearchParams).get("state"), "active");
  assert.equal(calls[2].url, `https://api.etsy.com/v3/application/listings/${LISTING_ID}`);
  assert.equal(calls[2].init?.method, "GET");
});

test("adapter treats Etsy 5xx publish result as ambiguous", async () => {
  await withEtsyHeaders(async () => {
    const provider = new EtsyAuthorizedPublishProvider(SHOP_ID, {
      fetchImpl: async () => response({ error: "provider unavailable" }, 503),
      getAccessToken: async () => "12345.test-token"
    });
    await assert.rejects(
      () => provider.publish(LISTING_ID),
      (error: unknown) => error instanceof PublishAmbiguousResultError
    );
  });
});

test("adapter treats network failure during publish as ambiguous", async () => {
  await withEtsyHeaders(async () => {
    const provider = new EtsyAuthorizedPublishProvider(SHOP_ID, {
      fetchImpl: async () => {
        throw new Error("network reset");
      },
      getAccessToken: async () => "12345.test-token"
    });
    await assert.rejects(
      () => provider.publish(LISTING_ID),
      (error: unknown) => error instanceof PublishAmbiguousResultError
    );
  });
});

test("readPublished returns null on Etsy 404 for read-only reconciliation", async () => {
  await withEtsyHeaders(async () => {
    const provider = new EtsyAuthorizedPublishProvider(SHOP_ID, {
      fetchImpl: async () => response({}, 404),
      getAccessToken: async () => "12345.test-token"
    });
    assert.equal(await provider.readPublished(LISTING_ID), null);
  });
});
