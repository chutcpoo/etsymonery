import assert from "node:assert/strict";
import test from "node:test";
import {
  createEtsyTaxonomyPreflightGetHandler,
  rejectTaxonomyMethod
} from "../lib/etsy-taxonomy-preflight";

const KEYS = ["ETSY_TAXONOMY_READ_TOKEN", "ETSY_API_KEY", "ETSY_SHARED_SECRET"];
const ROOT = "https://preview.example/api/etsy/taxonomy";

async function withEnv<T>(fn: () => Promise<T>) {
  const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  try {
    process.env.ETSY_TAXONOMY_READ_TOKEN = "fixture-read-token";
    process.env.ETSY_API_KEY = "fixture-api-key";
    process.env.ETSY_SHARED_SECRET = "fixture-app-secret";
    return await fn();
  } finally {
    for (const key of KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function request(query: string, token: string | null = "fixture-read-token", method = "GET") {
  return new Request(ROOT + "?" + query, {
    method,
    headers: token === null ? {} : { Authorization: "Bearer " + token }
  });
}

test("missing operator secret is fail-closed before any provider call", async () => {
  await withEnv(async () => {
    delete process.env.ETSY_TAXONOMY_READ_TOKEN;
    let calls = 0;
    const handler = createEtsyTaxonomyPreflightGetHandler({
      fetchImpl: async () => { calls++; throw new Error("UNEXPECTED_NETWORK"); }
    });
    const response = await handler(request("q=forms"));
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.error, "ETSY_TAXONOMY_READ_AUTH_NOT_CONFIGURED");
    assert.equal(body.ETSY_WRITE_COUNT, 0);
    assert.equal(calls, 0);
  });
});

test("wrong/missing token is fail-closed without contacting Etsy", async () => {
  await withEnv(async () => {
    let calls = 0;
    const handler = createEtsyTaxonomyPreflightGetHandler({
      fetchImpl: async () => { calls++; throw new Error("UNEXPECTED_NETWORK"); }
    });
    for (const token of [null, "incorrect"]) {
      const response = await handler(request("q=forms", token));
      assert.equal(response.status, 401);
      assert.equal((await response.json()).ETSY_WRITE_COUNT, 0);
    }
    assert.equal(calls, 0);
  });
});

test("GET searches nested seller taxonomy and never sends an Etsy write", async () => {
  await withEnv(async () => {
    const calls: Array<{url: string, method: string | undefined, key: string | null}> = [];
    const handler = createEtsyTaxonomyPreflightGetHandler({
      fetchImpl: async (input, init) => {
        const h = new Headers(init?.headers);
        calls.push({
          url: String(input), method: init?.method,
          key: h.get("x-api-key")
        });
        return Response.json({
          count: 1, results: [
            { id: 1, name: "Paper & Party Supplies", children: [
              { id: 2, name: "Forms & Templates", children: [] },
              { id: 3, name: "Paper", children: [] }
            ] }
          ]
        });
      }
    });
    const response = await handler(request("q=Forms"));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, "PASS");
    assert.equal(body.ETSY_WRITE_COUNT, 0);
    assert.equal(body.results.length, 1);
    assert.equal(body.results[0].taxonomy_id, 2);
    assert.deepEqual(body.results[0].path, ["Paper & Party Supplies", "Forms & Templates"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].url, "https://openapi.etsy.com/v3/application/seller-taxonomy/nodes");
    assert.equal(calls[0].key, "fixture-api-key:fixture-app-secret");
    assert.equal(JSON.stringify(body).includes("fixture-app-secret"), false);
  });
});

test("GET reads properties for the exact numeric taxonomy ID and reports truncation", async () => {
  await withEnv(async () => {
    const seen: string[] = [];
    const handler = createEtsyTaxonomyPreflightGetHandler({
      fetchImpl: async (input, init) => {
        seen.push(String(input) + ":" + init?.method);
        return Response.json({ count: 1, results: [{
          property_id: 100, name: "Primary color", display_name: "Primary colour",
          is_required: false, supports_attributes: true, supports_variations: false,
          possible_values: Array.from({ length: 81 }, (_, n) => ({
            value_id: n + 1, name: "Example " + (n + 1)
          }))
        }] });
      }
    });
    const response = await handler(request("taxonomy_id=1234"));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.taxonomy_id, 1234);
    assert.equal(body.properties.length, 1);
    assert.equal(body.properties[0].possible_values.length, 80);
    assert.equal(body.properties[0].values_truncated, true);
    assert.equal(body.properties[0].is_required, false);
    assert.deepEqual(seen, [
      "https://openapi.etsy.com/v3/application/seller-taxonomy/nodes/1234/properties:GET"
    ]);
  });
});

test("rejects ambiguous/invalid inputs before any provider call", async () => {
  await withEnv(async () => {
    let calls = 0;
    const handler = createEtsyTaxonomyPreflightGetHandler({
      fetchImpl: async () => { calls++; throw new Error("UNEXPECTED_NETWORK"); }
    });
    for (const query of [
      "", "q=a", "q=forms&taxonomy_id=1", "q=forms&q=paper",
      "q=forms&api_key=leak", "taxonomy_id=0", "taxonomy_id=1%2F2",
      "taxonomy_id=9007199254740992", "q=%3Cscript%3E"
    ]) {
      const response = await handler(request(query));
      assert.equal(response.status, 400, query);
    }
    assert.equal(calls, 0);
  });
});

test("provider invalid response does not create a false verified taxonomy", async () => {
  await withEnv(async () => {
    const handler = createEtsyTaxonomyPreflightGetHandler({
      fetchImpl: async () => Response.json({ results: [{ id: "wrong", name: "Imaginary" }] })
    });
    const response = await handler(request("q=forms"));
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.status, "BLOCKED");
    assert.equal(body.ETSY_WRITE_COUNT, 0);
  });
});

test("no write-method API is exposed", async () => {
  const response = rejectTaxonomyMethod();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET");
  assert.equal((await response.json()).ETSY_WRITE_COUNT, 0);
});
