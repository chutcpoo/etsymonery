import assert from "node:assert/strict";
import test from "node:test";
import {
  assertEtsyAutoRetryReadOnly,
  fetchEtsyReadWithRetry,
  parseRetryAfterMs,
  readEtsyRateLimitSnapshot
} from "../lib/etsy-http";

function response(status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ status }), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

test("parses Etsy rate-limit headers and Retry-After seconds", () => {
  const headers = new Headers({
    "x-limit-per-second": "150",
    "x-remaining-this-second": "149",
    "x-limit-per-day": "100000",
    "x-remaining-today": "99998",
    "retry-after": "2.5"
  });

  assert.deepEqual(readEtsyRateLimitSnapshot(headers, 0), {
    limitPerSecond: 150,
    remainingThisSecond: 149,
    limitPerDay: 100000,
    remainingToday: 99998,
    retryAfterMs: 2500
  });
});

test("supports Retry-After HTTP dates", () => {
  const now = Date.parse("2026-09-14T14:00:00Z");
  assert.equal(
    parseRetryAfterMs("Mon, 14 Sep 2026 14:00:03 GMT", now),
    3000
  );
});

test("retries a read-only Etsy GET once after a short 429 Retry-After", async () => {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const queue = [response(429, { "retry-after": "0.01" }), response(200)];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push(`${init?.method}:${String(input)}`);
    const next = queue.shift();
    if (!next) throw new Error("UNEXPECTED_FETCH");
    return next;
  };

  const result = await fetchEtsyReadWithRetry(
    fetchImpl,
    "https://api.etsy.com/v3/application/listings/123",
    { method: "GET" },
    {
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [10]);
});

test("does not hold the request open for a long Retry-After", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return response(429, { "retry-after": "60" });
  };

  const result = await fetchEtsyReadWithRetry(
    fetchImpl,
    "https://api.etsy.com/v3/application/listings/123",
    { method: "GET" },
    {
      maxRetryDelayMs: 5000,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      }
    }
  );

  assert.equal(result.status, 429);
  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
});

test("retries an idempotent GET after one network failure", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) throw new Error("network reset");
    return response(200);
  };

  const result = await fetchEtsyReadWithRetry(
    fetchImpl,
    "https://api.etsy.com/v3/application/listings/123",
    { method: "GET" },
    {
      baseDelayMs: 25,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [25]);
});

test("automatic retry helper rejects Etsy write methods", async () => {
  assert.throws(
    () => assertEtsyAutoRetryReadOnly({ method: "PATCH" }),
    /ETSY_AUTO_RETRY_WRITE_FORBIDDEN:PATCH/
  );

  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return response(200);
  };

  await assert.rejects(
    () =>
      fetchEtsyReadWithRetry(
        fetchImpl,
        "https://api.etsy.com/v3/application/shops/1/listings/2",
        { method: "POST" }
      ),
    /ETSY_AUTO_RETRY_WRITE_FORBIDDEN:POST/
  );
  assert.equal(calls, 0);
});
