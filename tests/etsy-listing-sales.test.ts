import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import {
  EtsyListingSalesError,
  fetchExactListingSales
} from "../lib/etsy-listing-sales";

const previousEnv = {
  apiKey: process.env.ETSY_API_KEY,
  sharedSecret: process.env.ETSY_SHARED_SECRET
};

function assignEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

before(() => {
  process.env.ETSY_API_KEY = "api-key";
  process.env.ETSY_SHARED_SECRET = "shared-secret";
});

after(() => {
  assignEnv("ETSY_API_KEY", previousEnv.apiKey);
  assignEnv("ETSY_SHARED_SECRET", previousEnv.sharedSecret);
});

function transactions(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    transaction_id: 10_000 + index,
    quantity: (index % 3) + 1
  }));
}

test("paginates every listing transaction and separates transactionCount from unitsSold", async () => {
  const all = transactions(205);
  const offsets: number[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const offset = Number(url.searchParams.get("offset"));
    const limit = Number(url.searchParams.get("limit"));
    offsets.push(offset);
    assert.equal(init?.method, "GET");
    assert.equal(limit, 100);
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer access-token");
    return Response.json({ count: all.length, results: all.slice(offset, offset + limit) });
  };

  const result = await fetchExactListingSales({
    accessToken: "access-token",
    shopId: 23582741,
    listingId: 4560696421,
    fetchImpl
  });

  assert.deepEqual(offsets, [0, 100, 200, 0, 100, 200]);
  assert.equal(result.transactionCount, 205);
  assert.equal(
    result.unitsSold,
    all.reduce((sum, transaction) => sum + transaction.quantity, 0)
  );
  assert.deepEqual(result.pagination, {
    pageSize: 100,
    pagesFetched: 3,
    fetchedTransactionCount: 205,
    reportedTransactionCount: 205,
    verificationPasses: 2,
    apiRequestCount: 6,
    complete: true
  });
});

test("zero transactions is verified with one Etsy GET page", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return Response.json({ count: 0, results: [] });
  };

  const result = await fetchExactListingSales({
    accessToken: "access-token",
    shopId: 23582741,
    listingId: 4560696421,
    fetchImpl
  });

  assert.equal(calls, 2);
  assert.equal(result.transactionCount, 0);
  assert.equal(result.unitsSold, 0);
  assert.equal(result.pagination.complete, true);
});

test("fails closed if Etsy's total changes while pagination is in progress", async () => {
  const all = transactions(101);
  let calls = 0;
  const fetchImpl: typeof fetch = async (_input, _init) => {
    calls += 1;
    return Response.json({
      count: calls === 1 ? 101 : 102,
      results: calls === 1 ? all.slice(0, 100) : all.slice(100)
    });
  };

  await assert.rejects(
    fetchExactListingSales({
      accessToken: "access-token",
      shopId: 23582741,
      listingId: 4560696421,
      fetchImpl
    }),
    (error: unknown) =>
      error instanceof EtsyListingSalesError &&
      error.message === "ETSY_TRANSACTION_COUNT_CHANGED_DURING_PAGINATION"
  );
});

test("fails closed on duplicate transaction IDs", async () => {
  const fetchImpl: typeof fetch = async () =>
    Response.json({
      count: 2,
      results: [
        { transaction_id: 100, quantity: 1 },
        { transaction_id: 100, quantity: 2 }
      ]
    });

  await assert.rejects(
    fetchExactListingSales({
      accessToken: "access-token",
      shopId: 23582741,
      listingId: 4560696421,
      fetchImpl
    }),
    (error: unknown) =>
      error instanceof EtsyListingSalesError &&
      error.message === "ETSY_DUPLICATE_TRANSACTION_ID"
  );
});

test("fails closed instead of inventing units for a missing quantity", async () => {
  const fetchImpl: typeof fetch = async () =>
    Response.json({ count: 1, results: [{ transaction_id: 100 }] });

  await assert.rejects(
    fetchExactListingSales({
      accessToken: "access-token",
      shopId: 23582741,
      listingId: 4560696421,
      fetchImpl
    }),
    (error: unknown) =>
      error instanceof EtsyListingSalesError &&
      error.message === "ETSY_TRANSACTION_QUANTITY_INVALID"
  );
});

test("fails closed when equal counts hide a changed transaction set", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return Response.json({
      count: 1,
      results: [
        { transaction_id: calls === 1 ? 100 : 101, quantity: 1 }
      ]
    });
  };

  await assert.rejects(
    fetchExactListingSales({
      accessToken: "access-token",
      shopId: 23582741,
      listingId: 4560696421,
      fetchImpl
    }),
    (error: unknown) =>
      error instanceof EtsyListingSalesError &&
      error.message === "ETSY_TRANSACTIONS_CHANGED_DURING_VERIFICATION"
  );
});

test("fails closed before requesting an offset beyond Etsy's 12000 maximum", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return Response.json({ count: 12_101, results: [] });
  };

  await assert.rejects(
    fetchExactListingSales({
      accessToken: "access-token",
      shopId: 23582741,
      listingId: 4560696421,
      fetchImpl
    }),
    (error: unknown) =>
      error instanceof EtsyListingSalesError &&
      error.message === "ETSY_TRANSACTION_COUNT_EXCEEDS_EXACT_OFFSET_WINDOW"
  );
  assert.equal(calls, 1);
});
