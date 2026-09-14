import assert from "node:assert/strict";
import test from "node:test";
import { createListingFingerprint } from "../lib/candidate-fingerprint";
import { handleGenericLiveListingUpdate, parseGenericLiveListingUpdate } from "../lib/authorized-live-listing-update-v2";
import { hashOperationRequest, MemoryOperationLedgerRepository } from "../lib/operation-ledger";

const BEFORE = {
  title: "Old title", description: "Old description", price: 9.99, tags: ["old", "tag"], quantity: 999,
  who_made: "i_did", when_made: "2020_2026", taxonomy_id: 12476, listing_type: "download", state: "active"
};
const AFTER = { ...BEFORE, title: "New title", price: 12.9, tags: ["new", "tag"] };
function fp(value: typeof BEFORE) {
  return createListingFingerprint({
    title: value.title, description: value.description, priceUsd: value.price, tags: value.tags, quantity: value.quantity,
    who_made: value.who_made, when_made: value.when_made, taxonomy_id: value.taxonomy_id, type: "download", state: "draft"
  });
}
function body(overrides: Record<string, unknown> = {}) {
  return {
    operation: "UPDATE_ACTIVE_LISTING_METADATA", operationId: "GENERIC-UPDATE-001", authorizationId: "AUTH-001",
    authorizationRequestSha256: "1".repeat(64), productId: "PDT-TEST-001", productVersion: "V1", shopId: "23582741",
    listingId: "4560696421", candidateId: "CANDIDATE-001", candidateFingerprint: "2".repeat(64), buildId: "BUILD-001",
    buildFingerprint: "3".repeat(64), acceptanceCriteriaId: "AC-001", acceptanceCriteriaSha256: "4".repeat(64),
    protectedStateFingerprint: "5".repeat(64), expectedBeforeListingFingerprint: fp(BEFORE), expectedAfterListingFingerprint: fp(AFTER),
    qcStatus: "QC_PASSED", lifecycleState: "READY_TO_PUBLISH", scope: ["TITLE", "TAGS", "PRICE"],
    patch: { title: AFTER.title, tags: AFTER.tags, priceUsd: AFTER.price }, ...overrides
  };
}
function request(token = "secret") { return new Request("https://example.test/api/etsy/authorized-listing-update", { method: "POST", headers: { "x-autodigitalpublisher-write-token": token } }); }
function response(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }

async function withEnv<T>(input: Record<string, unknown>, fn: () => Promise<T>) {
  const keys = ["PUBLISH_WRITES_ENABLED", "ETSY_DRAFT_WRITE_TOKEN", "ETSY_SHOP_ID", "ETSY_API_KEY", "ETSY_SHARED_SECRET", "ETSY_GENERIC_UPDATE_AUTHORIZATION_ID", "ETSY_GENERIC_UPDATE_AUTH_REQUEST_SHA256", "ETSY_GENERIC_UPDATE_REQUEST_SHA256", "ETSY_GENERIC_UPDATE_PROTECTED_STATE_SHA256"];
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    PUBLISH_WRITES_ENABLED: "true", ETSY_DRAFT_WRITE_TOKEN: "secret", ETSY_SHOP_ID: "23582741", ETSY_API_KEY: "test-api-key",
    ETSY_SHARED_SECRET: "test-shared-secret", ETSY_GENERIC_UPDATE_AUTHORIZATION_ID: "AUTH-001", ETSY_GENERIC_UPDATE_AUTH_REQUEST_SHA256: "1".repeat(64),
    ETSY_GENERIC_UPDATE_REQUEST_SHA256: hashOperationRequest(input), ETSY_GENERIC_UPDATE_PROTECTED_STATE_SHA256: "5".repeat(64)
  });
  try { return await fn(); } finally { for (const key of keys) prior[key] === undefined ? delete process.env[key] : process.env[key] = prior[key]; }
}

test("generic metadata contract requires QC_PASSED and READY_TO_PUBLISH", () => {
  assert.ok(parseGenericLiveListingUpdate(body()));
  assert.equal(parseGenericLiveListingUpdate(body({ qcStatus: "QC_PENDING" })), null);
  assert.equal(parseGenericLiveListingUpdate(body({ lifecycleState: "CANDIDATE" })), null);
  assert.equal(parseGenericLiveListingUpdate(body({ scope: ["TITLE"] })), null);
  assert.equal(parseGenericLiveListingUpdate(body({ scope: ["TITLE", "TAGS", "PRICE", "DELETE"] })), null);
});

test("generic metadata update executes one PATCH only after exact authorization and pre-identity match", async () => {
  const input = body();
  const methods: string[] = [];
  let reads = 0;
  const result = await withEnv(input, () => handleGenericLiveListingUpdate(input, request(), {
    repository: new MemoryOperationLedgerRepository(), getAccessToken: async () => "token",
    fetchImpl: async (_url, init) => {
      const method = String(init?.method); methods.push(method);
      if (method === "PATCH") return response({ state: "active" });
      reads += 1; return response(reads === 1 ? BEFORE : AFTER);
    }
  }));
  const payload = await result.json() as Record<string, unknown>;
  assert.equal(result.status, 200);
  assert.equal(payload.status, "UPDATED_AND_VERIFIED");
  assert.deepEqual(methods, ["GET", "PATCH", "GET"]);
  const receipt = payload.receipt as Record<string, unknown>;
  assert.equal(receipt.authorizationState, "CONSUMED");
  assert.equal(receipt.productId, "PDT-TEST-001");
});

test("generic metadata update rejects stale protected state before Etsy access", async () => {
  const input = body({ protectedStateFingerprint: "6".repeat(64) });
  let calls = 0;
  const result = await withEnv(input, async () => {
    process.env.ETSY_GENERIC_UPDATE_PROTECTED_STATE_SHA256 = "5".repeat(64);
    process.env.ETSY_GENERIC_UPDATE_REQUEST_SHA256 = hashOperationRequest(input);
    return handleGenericLiveListingUpdate(input, request(), {
      repository: new MemoryOperationLedgerRepository(), getAccessToken: async () => { calls += 1; return "token"; },
      fetchImpl: async () => { calls += 1; return response({}); }
    });
  });
  assert.equal(result.status, 409);
  assert.equal(calls, 0);
});
