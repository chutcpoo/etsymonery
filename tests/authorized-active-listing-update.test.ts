import assert from "node:assert/strict";
import test from "node:test";
import { handleAuthorizedActiveListingUpdate } from "../lib/authorized-active-listing-update";
import { createListingFingerprint } from "../lib/candidate-fingerprint";
import { hashOperationRequest, MemoryOperationLedgerRepository } from "../lib/operation-ledger";

const SHOP_ID = "23582741";
const LISTING_ID = "4560696421";
const BEFORE = {
  title: "Old title",
  description: "Old description",
  price: 9.99,
  tags: ["old", "boba"],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2025",
  taxonomy_id: 1234,
  listing_type: "download",
  state: "active"
};
const AFTER = {
  title: "New title",
  description: "New description",
  price: 12.99,
  tags: ["new", "boba"],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2025",
  taxonomy_id: 1234,
  listing_type: "download",
  state: "active"
};

function fp(value: typeof BEFORE) {
  return createListingFingerprint({
    title: value.title,
    description: value.description,
    priceUsd: value.price,
    tags: value.tags,
    quantity: value.quantity,
    who_made: value.who_made,
    when_made: value.when_made,
    taxonomy_id: value.taxonomy_id,
    type: "download",
    state: "draft"
  });
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    operation: "UPDATE_ACTIVE_LISTING",
    operationId: "B01-UPDATE-001",
    buildId: "ETSY-RESET-V1-PDT-BOBA-001-BUILD-20260906-B01",
    buildFreezeSha256: "9".repeat(64),
    acceptanceCriteriaSha256: "2".repeat(64),
    candidateFingerprint: "e".repeat(64),
    expectedBeforeListingFingerprint: fp(BEFORE),
    expectedAfterListingFingerprint: fp(AFTER),
    shopId: SHOP_ID,
    listingId: LISTING_ID,
    channel: "etsy",
    patch: {
      title: AFTER.title,
      description: AFTER.description,
      priceUsd: AFTER.price,
      tags: AFTER.tags,
      quantity: AFTER.quantity,
      whoMade: AFTER.who_made,
      whenMade: AFTER.when_made,
      taxonomyId: AFTER.taxonomy_id
    },
    ...overrides
  };
}

function request(token?: string) {
  const headers = new Headers();
  if (token) headers.set("x-autodigitalpublisher-write-token", token);
  return new Request("https://example.test/api/publish", { method: "POST", headers });
}

async function withEnv<T>(values: { writes?: string; token?: string; shop?: string; authorizationHash?: string }, fn: () => Promise<T>) {
  const prior = { writes: process.env.PUBLISH_WRITES_ENABLED, token: process.env.ETSY_DRAFT_WRITE_TOKEN, shop: process.env.ETSY_SHOP_ID, apiKey: process.env.ETSY_API_KEY, sharedSecret: process.env.ETSY_SHARED_SECRET, authorizationHash: process.env.ETSY_ACTIVE_UPDATE_B01_REQUEST_SHA256 };
  const set = (key: string, value: string | undefined) => value === undefined ? delete process.env[key] : process.env[key] = value;
  set("PUBLISH_WRITES_ENABLED", values.writes); set("ETSY_DRAFT_WRITE_TOKEN", values.token); set("ETSY_SHOP_ID", values.shop);
  set("ETSY_API_KEY", "test-api-key"); set("ETSY_SHARED_SECRET", "test-shared-secret");
  set("ETSY_ACTIVE_UPDATE_B01_REQUEST_SHA256", values.authorizationHash ?? hashOperationRequest(body()));
  try { return await fn(); } finally { set("PUBLISH_WRITES_ENABLED", prior.writes); set("ETSY_DRAFT_WRITE_TOKEN", prior.token); set("ETSY_SHOP_ID", prior.shop); set("ETSY_API_KEY", prior.apiKey); set("ETSY_SHARED_SECRET", prior.sharedSecret); set("ETSY_ACTIVE_UPDATE_B01_REQUEST_SHA256", prior.authorizationHash); }
}

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("fails closed with writes disabled and performs no fetch", async () => {
  let calls = 0;
  const result = await withEnv({ token: "secret", shop: SHOP_ID }, () => handleAuthorizedActiveListingUpdate(body(), request("secret"), { fetchImpl: async () => { calls += 1; return response({}); }, getAccessToken: async () => "token" }));
  assert.equal(result.status, 403);
  assert.equal(calls, 0);
});

test("fails closed on invalid token and performs no fetch", async () => {
  let calls = 0;
  const result = await withEnv({ writes: "true", token: "secret", shop: SHOP_ID }, () => handleAuthorizedActiveListingUpdate(body(), request("wrong"), { fetchImpl: async () => { calls += 1; return response({}); }, getAccessToken: async () => "token" }));
  assert.equal(result.status, 401);
  assert.equal(calls, 0);
});

test("pre-identity mismatch stops before PATCH", async () => {
  const methods: string[] = [];
  const mismatchedBody = body({ expectedBeforeListingFingerprint: "f".repeat(64) });
  const result = await withEnv({ writes: "true", token: "secret", shop: SHOP_ID, authorizationHash: hashOperationRequest(mismatchedBody) }, () => handleAuthorizedActiveListingUpdate(mismatchedBody, request("secret"), {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => "token",
    fetchImpl: async (_url, init) => { methods.push(String(init?.method)); return response(BEFORE); }
  }));
  assert.equal(result.status, 409);
  assert.deepEqual(methods, ["GET"]);
});

test("exact active listing identity updates once and verifies exact after identity", async () => {
  const methods: string[] = [];
  let reads = 0;
  const repository = new MemoryOperationLedgerRepository();
  const result = await withEnv({ writes: "true", token: "secret", shop: SHOP_ID }, () => handleAuthorizedActiveListingUpdate(body(), request("secret"), {
    repository,
    getAccessToken: async () => "token",
    fetchImpl: async (_url, init) => {
      const method = String(init?.method);
      methods.push(method);
      if (method === "PATCH") return response({ listing_id: Number(LISTING_ID), state: "active" }, 200);
      reads += 1;
      return response(reads === 1 ? BEFORE : AFTER);
    }
  }));
  const json = await result.json() as Record<string, unknown>;
  assert.equal(result.status, 200);
  assert.equal(json.status, "UPDATED_AND_VERIFIED");
  assert.equal(json.ledgerStatus, "SUCCEEDED");
  assert.match(String(json.requestHash), /^[a-f0-9]{64}$/);
  assert.equal((json.receipt as Record<string, unknown>).buildId, "ETSY-RESET-V1-PDT-BOBA-001-BUILD-20260906-B01");
  assert.equal((json.receipt as Record<string, unknown>).candidateFingerprint, "e".repeat(64));
  assert.equal((json.receipt as Record<string, unknown>).listingId, LISTING_ID);
  assert.deepEqual(methods, ["GET", "PATCH", "GET"]);
});

test("successful replay returns the same correlation and receipt without another Etsy call", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const methods: string[] = [];
  let reads = 0;
  const runtime = {
    repository,
    getAccessToken: async () => "token",
    fetchImpl: async (_url: URL | RequestInfo, init?: RequestInit) => {
      const method = String(init?.method);
      methods.push(method);
      if (method === "PATCH") return response({ listing_id: Number(LISTING_ID), state: "active" });
      reads += 1;
      return response(reads === 1 ? BEFORE : AFTER);
    }
  };

  const first = await withEnv({ writes: "true", token: "secret", shop: SHOP_ID }, () =>
    handleAuthorizedActiveListingUpdate(body(), request("secret"), runtime)
  );
  const firstJson = await first.json() as Record<string, unknown>;
  const replay = await withEnv({ writes: "true", token: "secret", shop: SHOP_ID }, () =>
    handleAuthorizedActiveListingUpdate(body(), request("secret"), runtime)
  );
  const replayJson = await replay.json() as Record<string, unknown>;

  assert.equal(replay.status, 200);
  assert.equal(replayJson.status, "REPLAY");
  assert.equal(replayJson.requestHash, firstJson.requestHash);
  assert.deepEqual(replayJson.receipt, firstJson.receipt);
  assert.deepEqual(methods, ["GET", "PATCH", "GET"]);
});

test("B01 rejects any other listing or build before ledger or Etsy access", async () => {
  let calls = 0;
  const result = await withEnv({ writes: "true", token: "secret", shop: SHOP_ID }, () =>
    handleAuthorizedActiveListingUpdate(body({ listingId: "4568730165" }), request("secret"), {
      repository: new MemoryOperationLedgerRepository(),
      getAccessToken: async () => { calls += 1; return "token"; },
      fetchImpl: async () => { calls += 1; return response({}); }
    })
  );
  assert.equal(result.status, 409);
  assert.equal(calls, 0);
});

test("same B01 operation with changed identity is rejected without a second PATCH", async () => {
  const repository = new MemoryOperationLedgerRepository();
  let patches = 0;
  let reads = 0;
  const runtime = {
    repository,
    getAccessToken: async () => "token",
    fetchImpl: async (_url: URL | RequestInfo, init?: RequestInit) => {
      if (init?.method === "PATCH") { patches += 1; return response({ state: "active" }); }
      reads += 1;
      return response(reads === 1 ? BEFORE : AFTER);
    }
  };
  await withEnv({ writes: "true", token: "secret", shop: SHOP_ID }, () =>
    handleAuthorizedActiveListingUpdate(body(), request("secret"), runtime)
  );
  const changed = await withEnv({ writes: "true", token: "secret", shop: SHOP_ID }, () =>
    handleAuthorizedActiveListingUpdate(body({ candidateFingerprint: "a".repeat(64) }), request("secret"), runtime)
  );
  assert.equal(changed.status, 409);
  assert.equal(patches, 1);
});

test("server-side B01 request hash rejects a changed patch before ledger or Etsy access", async () => {
  let calls = 0;
  const changed = body({ patch: { ...body().patch as Record<string, unknown>, title: "Unauthorized title" } });
  const result = await withEnv({ writes: "true", token: "secret", shop: SHOP_ID }, () =>
    handleAuthorizedActiveListingUpdate(changed, request("secret"), {
      repository: new MemoryOperationLedgerRepository(),
      getAccessToken: async () => { calls += 1; return "token"; },
      fetchImpl: async () => { calls += 1; return response({}); }
    })
  );
  assert.equal(result.status, 409);
  assert.deepEqual(await result.json(), { error: "B01_ACTIVE_UPDATE_REQUEST_HASH_MISMATCH" });
  assert.equal(calls, 0);
});
