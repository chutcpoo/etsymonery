import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile } from "node:fs/promises";
import {
  handleDestructiveListingAction,
  parseDestructiveListingAction
} from "../lib/authorized-destructive-listing-action";
import { createListingFingerprint } from "../lib/candidate-fingerprint";
import { hashOperationRequest, MemoryOperationLedgerRepository } from "../lib/operation-ledger";

const SHOP_ID = "23582741";
const LISTING_ID = "4560696421";
const BEFORE = {
  title: "Boba Toolkit",
  description: "Exact current description",
  price: 12.9,
  tags: ["boba", "checklist"],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2026",
  taxonomy_id: 12476,
  listing_type: "download",
  state: "active"
};
const INACTIVE = { ...BEFORE, state: "inactive" };

function listingFingerprint(value = BEFORE) {
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

function body(operation: "DEACTIVATE_ACTIVE_LISTING" | "DELETE_LISTING" = "DEACTIVATE_ACTIVE_LISTING", overrides: Record<string, unknown> = {}) {
  const operationId = operation === "DEACTIVATE_ACTIVE_LISTING" ? "BOBA-UNPUBLISH-001" : "BOBA-DELETE-001";
  return {
    operation,
    operationId,
    confirmation: operationId,
    authorizationId: "AUTH-DEST-001",
    authorizationRequestSha256: "1".repeat(64),
    productId: "PDT-BOBA-001",
    productVersion: "V1",
    shopId: SHOP_ID,
    listingId: LISTING_ID,
    candidateId: "CANDIDATE-DEST-001",
    candidateFingerprint: "2".repeat(64),
    buildId: "BUILD-DEST-001",
    buildFingerprint: "3".repeat(64),
    acceptanceCriteriaId: "AC-DEST-001",
    acceptanceCriteriaSha256: "4".repeat(64),
    protectedStateFingerprint: "5".repeat(64),
    expectedBeforeListingFingerprint: listingFingerprint(),
    qcStatus: "QC_PASSED",
    lifecycleState: "READY_TO_PUBLISH",
    scope: [operation === "DEACTIVATE_ACTIVE_LISTING" ? "UNPUBLISH" : "DELETE_LISTING"],
    ...overrides
  };
}

function request(token = "secret") {
  return new Request("https://example.test/api/etsy/authorized-destructive-action", {
    method: "POST",
    headers: { "x-autodigitalpublisher-write-token": token }
  });
}
function response(value: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(value), {
    status,
    headers: status === 204 ? undefined : { "content-type": "application/json" }
  });
}

const ENV_KEYS = [
  "PUBLISH_WRITES_ENABLED", "ETSY_DESTRUCTIVE_WRITES_ENABLED", "ETSY_DRAFT_WRITE_TOKEN", "ETSY_SHOP_ID",
  "ETSY_DESTRUCTIVE_OPERATION", "ETSY_DESTRUCTIVE_AUTHORIZATION_ID", "ETSY_DESTRUCTIVE_AUTH_REQUEST_SHA256",
  "ETSY_DESTRUCTIVE_REQUEST_SHA256", "ETSY_DESTRUCTIVE_PROTECTED_STATE_SHA256", "ETSY_API_KEY", "ETSY_SHARED_SECRET"
] as const;
const ORIGINAL = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
after(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

async function withEnv<T>(payload: Record<string, unknown>, fn: () => Promise<T>, options: { enabled?: boolean; operation?: string; authRequestSha?: string } = {}) {
  const set = (key: string, value: string | undefined) => value === undefined ? delete process.env[key] : process.env[key] = value;
  set("PUBLISH_WRITES_ENABLED", "true");
  set("ETSY_DESTRUCTIVE_WRITES_ENABLED", options.enabled === false ? undefined : "true");
  set("ETSY_DRAFT_WRITE_TOKEN", "secret");
  set("ETSY_SHOP_ID", SHOP_ID);
  set("ETSY_DESTRUCTIVE_OPERATION", options.operation ?? String(payload.operation));
  set("ETSY_DESTRUCTIVE_AUTHORIZATION_ID", String(payload.authorizationId));
  set("ETSY_DESTRUCTIVE_AUTH_REQUEST_SHA256", options.authRequestSha ?? String(payload.authorizationRequestSha256));
  set("ETSY_DESTRUCTIVE_REQUEST_SHA256", hashOperationRequest(payload));
  set("ETSY_DESTRUCTIVE_PROTECTED_STATE_SHA256", String(payload.protectedStateFingerprint));
  set("ETSY_API_KEY", "test-key");
  set("ETSY_SHARED_SECRET", "test-secret");
  try { return await fn(); }
  finally {
    for (const key of ENV_KEYS) {
      const value = ORIGINAL[key];
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test("destructive contract requires exact confirmation, QC, lifecycle and action scope", () => {
  const valid = body();
  assert.ok(parseDestructiveListingAction(valid));
  assert.equal(parseDestructiveListingAction(body("DEACTIVATE_ACTIVE_LISTING", { confirmation: "wrong" })), null);
  assert.equal(parseDestructiveListingAction(body("DEACTIVATE_ACTIVE_LISTING", { qcStatus: "QC_PENDING" })), null);
  assert.equal(parseDestructiveListingAction(body("DEACTIVATE_ACTIVE_LISTING", { lifecycleState: "LIVE" })), null);
  assert.equal(parseDestructiveListingAction(body("DEACTIVATE_ACTIVE_LISTING", { scope: ["DELETE_LISTING"] })), null);
});

test("destructive actions are disabled by default and perform zero Etsy access", async () => {
  const payload = body();
  let calls = 0;
  const result = await withEnv(payload, () => handleDestructiveListingAction(payload, request(), {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => { calls += 1; return "token"; },
    fetchImpl: async () => { calls += 1; return response({}); }
  }), { enabled: false });
  assert.equal(result.status, 403);
  assert.equal(calls, 0);
});

test("exact unpublish performs GET PATCH GET and verifies inactive readback", async () => {
  const payload = body();
  const methods: string[] = [];
  let reads = 0;
  let patchBody = "";
  const result = await withEnv(payload, () => handleDestructiveListingAction(payload, request(), {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => "token",
    fetchImpl: async (_url, init) => {
      const method = String(init?.method ?? "GET"); methods.push(method);
      if (method === "PATCH") { patchBody = String(init?.body); return response({ state: "inactive" }); }
      reads += 1; return response(reads === 1 ? BEFORE : INACTIVE);
    }
  }));
  const json = await result.json() as Record<string, unknown>;
  assert.equal(result.status, 200);
  assert.equal(json.status, "DEACTIVATED_AND_VERIFIED");
  assert.deepEqual(methods, ["GET", "PATCH", "GET"]);
  assert.equal(patchBody, "state=inactive");
  assert.equal((json.receipt as Record<string, unknown>).authorizationState, "CONSUMED");
});

test("exact delete performs GET DELETE GET and requires 404 readback", async () => {
  const payload = body("DELETE_LISTING");
  const methods: string[] = [];
  let reads = 0;
  const result = await withEnv(payload, () => handleDestructiveListingAction(payload, request(), {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => "token",
    fetchImpl: async (_url, init) => {
      const method = String(init?.method ?? "GET"); methods.push(method);
      if (method === "DELETE") return response({}, 204);
      reads += 1; return reads === 1 ? response(BEFORE) : response({ error: "not found" }, 404);
    }
  }));
  const json = await result.json() as Record<string, unknown>;
  assert.equal(result.status, 200);
  assert.equal(json.status, "DELETED_AND_VERIFIED");
  assert.deepEqual(methods, ["GET", "DELETE", "GET"]);
  assert.equal((json.receipt as Record<string, unknown>).finalState, "deleted");
});

test("authorization-request drift fails before Etsy access", async () => {
  const payload = body();
  let calls = 0;
  const result = await withEnv(payload, () => handleDestructiveListingAction(payload, request(), {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => { calls += 1; return "token"; },
    fetchImpl: async () => { calls += 1; return response({}); }
  }), { authRequestSha: "9".repeat(64) });
  assert.equal(result.status, 409);
  assert.equal(calls, 0);
});

test("fresh pre-identity drift blocks before any destructive mutation", async () => {
  const payload = body();
  const methods: string[] = [];
  const drifted = { ...BEFORE, title: "Drifted title" };
  const result = await withEnv(payload, () => handleDestructiveListingAction(payload, request(), {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => "token",
    fetchImpl: async (_url, init) => { methods.push(String(init?.method ?? "GET")); return response(drifted); }
  }));
  assert.equal(result.status, 409);
  assert.deepEqual(methods, ["GET"]);
});

test("ambiguous unpublish never retries mutation; replay is read-only reconciliation", async () => {
  const payload = body();
  const repository = new MemoryOperationLedgerRepository();
  const methods: string[] = [];
  let mutationThrown = false;
  const runtime = {
    repository,
    getAccessToken: async () => "token",
    fetchImpl: async (_url: URL | RequestInfo, init?: RequestInit) => {
      const method = String(init?.method ?? "GET"); methods.push(method);
      if (method === "PATCH" && !mutationThrown) { mutationThrown = true; throw new Error("network"); }
      return response(BEFORE);
    }
  };
  const first = await withEnv(payload, () => handleDestructiveListingAction(payload, request(), runtime));
  const replay = await withEnv(payload, () => handleDestructiveListingAction(payload, request(), runtime));
  assert.equal(first.status, 202);
  assert.equal(replay.status, 409);
  assert.deepEqual(methods, ["GET", "PATCH", "GET", "GET"]);
});

test("ambiguous delete can reconcile success from 404 without a second DELETE", async () => {
  const payload = body("DELETE_LISTING");
  const methods: string[] = [];
  let reads = 0;
  const result = await withEnv(payload, () => handleDestructiveListingAction(payload, request(), {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => "token",
    fetchImpl: async (_url, init) => {
      const method = String(init?.method ?? "GET"); methods.push(method);
      if (method === "DELETE") throw new Error("connection reset after send");
      reads += 1; return reads === 1 ? response(BEFORE) : response({ error: "not found" }, 404);
    }
  }));
  assert.equal(result.status, 200);
  assert.deepEqual(methods, ["GET", "DELETE", "GET"]);
});


test("deterministic delete rejection is terminal and replay performs zero provider access", async () => {
  const payload = body("DELETE_LISTING");
  const repository = new MemoryOperationLedgerRepository();
  const methods: string[] = [];
  const runtime = {
    repository,
    getAccessToken: async () => "token",
    fetchImpl: async (_url: URL | RequestInfo, init?: RequestInit) => {
      const method = String(init?.method ?? "GET"); methods.push(method);
      return method === "DELETE" ? response({ error: "bad request" }, 400) : response(BEFORE);
    }
  };
  const first = await withEnv(payload, () => handleDestructiveListingAction(payload, request(), runtime));
  const replay = await withEnv(payload, () => handleDestructiveListingAction(payload, request(), runtime));
  assert.equal(first.status, 502);
  assert.equal(replay.status, 409);
  assert.deepEqual(methods, ["GET", "DELETE"]);
});


test("post-mutation readback network failure becomes reconciliation and replay remains GET-only", async () => {
  const payload = body();
  const repository = new MemoryOperationLedgerRepository();
  const methods: string[] = [];
  let call = 0;
  const runtime = {
    repository,
    getAccessToken: async () => "token",
    fetchImpl: async (_url: URL | RequestInfo, init?: RequestInit) => {
      call += 1;
      const method = String(init?.method ?? "GET"); methods.push(method);
      if (call === 1) return response(BEFORE);
      if (method === "PATCH") return response({ state: "inactive" });
      if (call === 3) throw new Error("readback network failure");
      return response(INACTIVE);
    }
  };
  const first = await withEnv(payload, () => handleDestructiveListingAction(payload, request(), runtime));
  const replay = await withEnv(payload, () => handleDestructiveListingAction(payload, request(), runtime));
  assert.equal(first.status, 202);
  assert.equal(replay.status, 200);
  assert.deepEqual(methods, ["GET", "PATCH", "GET", "GET"]);
});

test("executor source declares only one PATCH and one DELETE mutation path", async () => {
  const source = await readFile(new URL("../lib/authorized-destructive-listing-action.ts", import.meta.url), "utf8");
  assert.equal(source.match(/method: \"PATCH\"/g)?.length, 1);
  assert.equal(source.match(/method: \"DELETE\"/g)?.length, 1);
});

test("destructive route is POST-only", async () => {
  const source = await readFile(new URL("../app/api/etsy/authorized-destructive-action/route.ts", import.meta.url), "utf8");
  assert.match(source, /export async function POST/);
  assert.doesNotMatch(source, /export async function (GET|PUT|PATCH|DELETE)/);
});
