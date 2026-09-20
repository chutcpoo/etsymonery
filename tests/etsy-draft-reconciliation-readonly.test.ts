import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getEtsyDraftListingSummaries } from "../lib/etsy-draft-reconciliation";

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

test("draft reconciliation fetches Etsy draft listings read-only and preserves exact provider fields", async () => {
  await withEtsyHeaders(async () => {
    const calls: Array<{ url: string; method: string | undefined }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), method: init?.method });
      return new Response(
        JSON.stringify({
          count: 1,
          results: [
            {
              listing_id: 9876543210,
              shop_id: 900001,
              title: "New Product Spreadsheet",
              state: "draft",
              price: { amount: 1290, divisor: 100, currency_code: "USD" },
              taxonomy_id: 12476,
              quantity: 999,
              who_made: "i_did",
              when_made: "2020_2026",
              listing_type: "download",
              tags: ["new product", "business spreadsheet"],
              updated_timestamp: 1789350000
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const result = await getEtsyDraftListingSummaries({
      shopId: 900001,
      accessToken: "12345.test-token",
      dependencies: { fetchImpl }
    });

    assert.equal(result.status, "PASS");
    assert.equal(result.mode, "READ_ONLY");
    assert.equal(result.ETSY_WRITE_COUNT, 0);
    assert.equal(result.returnedCount, 1);
    assert.equal(result.drafts[0].listingId, 9876543210);
    assert.equal(result.drafts[0].taxonomyId, 12476);
    assert.equal(result.drafts[0].quantity, 999);
    assert.deepEqual(result.drafts[0].tags, [
      "new product",
      "business spreadsheet"
    ]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "GET");
    assert.match(calls[0].url, /state=draft/);
  });
});

test("draft reconciliation fails closed on cross-shop listing evidence", async () => {
  await withEtsyHeaders(async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          count: 1,
          results: [
            {
              listing_id: 123,
              shop_id: 999999,
              title: "wrong shop",
              state: "draft"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );

    await assert.rejects(
      () =>
        getEtsyDraftListingSummaries({
          shopId: 900001,
          accessToken: "12345.test-token",
          dependencies: { fetchImpl }
        }),
      /ETSY_DRAFT_RECONCILIATION_SHOP_ID_MISMATCH/
    );
  });
});

test("draft reconciliation inherits bounded retry only for GET reads", async () => {
  await withEtsyHeaders(async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: "rate limited" }), {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "0.01"
          }
        });
      }
      return new Response(JSON.stringify({ count: 0, results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    const result = await getEtsyDraftListingSummaries({
      shopId: 900001,
      accessToken: "12345.test-token",
      dependencies: {
        fetchImpl,
        retryOptions: {
          sleep: async (milliseconds) => {
            sleeps.push(milliseconds);
          }
        }
      }
    });

    assert.equal(result.returnedCount, 0);
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [10]);
  });
});
