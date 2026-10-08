import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { readFile } from "node:fs/promises";
import { RECONCILIATION_TRUTH_04_15 as truth } from "../lib/etsy-reconciliation-truth";
import { readOnlyReconciliation as runReconciliation, reconcileListings, type Listing } from "../lib/etsy-readonly-reconciliation";
import { handleReconciliationGet } from "../lib/etsy-reconciliation-api";
import * as route from "../app/api/etsy/reconcile-listings/route";
import { POST_RESET_PLATFORM_STATE } from "../lib/post-reset-platform";

const previous = { key: process.env.ETSY_API_KEY, secret: process.env.ETSY_SHARED_SECRET, reconciliationReadToken: process.env.ETSY_RECONCILIATION_READ_TOKEN };
before(() => { process.env.ETSY_API_KEY = "private-api-key"; process.env.ETSY_SHARED_SECRET = "private-api-secret"; process.env.ETSY_RECONCILIATION_READ_TOKEN = "reconciliation-read-secret"; });
after(() => {
  for (const [key, value] of [["ETSY_API_KEY", previous.key], ["ETSY_SHARED_SECRET", previous.secret], ["ETSY_RECONCILIATION_READ_TOKEN", previous.reconciliationReadToken]]) {
    if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
  }
});
const now = () => 1_000;
const readOnlyReconciliation: typeof runReconciliation = (ids, dependencies) => runReconciliation(ids, {
  loadMappings: async () => [], ...dependencies
});
const token = () => ({ accessToken: "123.private-access-token", refreshToken: "private-refresh-token",
  expiresAt: new Date(100_000), shopId: 900001, scope: "listings_r" });
const listing = (overrides: Partial<Listing> = {}): Listing => ({
  listingId: 123, title: truth[0].productName, state: "draft", url: "https://www.etsy.com/listing/123",
  productIds: [truth[0].productId], ...overrides
});
function provider(options: { shopName?: string; status?: number; count?: number; results?: unknown[] } = {}) {
  const calls: { url: string; method: string | undefined }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method });
    assert.equal(init?.method, "GET", "upstream mutation forbidden");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.body, undefined);
    if (url.endsWith("/shops/900001")) return Response.json({ shop_id: 900001, shop_name: options.shopName ?? "PoonthaiDigital" });
    assert.match(url, /\/shops\/900001\/listings\?/);
    if (options.status) return Response.json({ error: "private-access-token" }, { status: options.status, headers: { "retry-after": "600" } });
    const state = new URL(url).searchParams.get("state");
    const results = state === "draft" ? options.results ?? [{ listing_id: 123, shop_id: 900001,
      title: truth[0].productName, state: "draft", description: `Product ${truth[0].productId}`,
      url: "https://www.etsy.com/listing/123" }] : [];
    return Response.json({ count: state === "draft" ? options.count ?? results.length : 0, results });
  };
  return { calls, fetchImpl };
}

test("anonymous and wrong caller credentials fail closed before seller-read dependency", async () => {
  let calls = 0;
  const read = async () => { calls++; throw new Error("SHOULD_NOT_READ"); };
  for (const headers of [undefined, { authorization: "Bearer wrong-secret" }, { authorization: "Basic reconciliation-read-secret" }]) {
    const response = await handleReconciliationGet(new Request("https://local.test/api/etsy/reconcile-listings", { headers }), read);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), "Bearer");
    assert.equal((await response.json()).error, "ETSY_RECONCILIATION_READ_UNAUTHORIZED");
  }
  assert.equal(calls, 0);
});

test("missing caller-auth configuration fails closed before seller-read dependency", async () => {
  const configured = process.env.ETSY_RECONCILIATION_READ_TOKEN;
  delete process.env.ETSY_RECONCILIATION_READ_TOKEN;
  let calls = 0;
  try {
    const response = await handleReconciliationGet(new Request("https://local.test/api/etsy/reconcile-listings"), async () => { calls++; throw new Error("SHOULD_NOT_READ"); });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "ETSY_RECONCILIATION_READ_AUTH_NOT_CONFIGURED");
    assert.equal(calls, 0);
  } finally {
    if (configured !== undefined) process.env.ETSY_RECONCILIATION_READ_TOKEN = configured;
  }
});

test("GET returns authenticated read-only evidence for exactly Products 04–15", async () => {
  const mock = provider();
  const stateBefore = structuredClone(POST_RESET_PLATFORM_STATE);
  const response = await handleReconciliationGet(new Request("https://local.test/api/etsy/reconcile-listings", { headers: { authorization: "Bearer reconciliation-read-secret" } }),
    (ids) => readOnlyReconciliation(ids, { loadTokens: async () => token(), fetchImpl: mock.fetchImpl, now }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, "READ_ONLY");
  assert.equal(body.etsyMutationPerformed, false);
  assert.equal(body.writeStateObserved, "UNKNOWN");
  assert.equal(body.products.length, 12);
  assert.equal(body.products[0].match, "MATCH");
  assert.ok(body.products.slice(1).every((p: { match: string }) => p.match === "NOT_FOUND"));
  assert.deepEqual(body.statesQueried, ["active", "inactive", "sold_out", "draft", "expired"]);
  assert.equal(mock.calls.length, 6);
  assert.deepEqual(POST_RESET_PLATFORM_STATE, stateBefore);
});

for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const) {
  test(`${method} rejected before credentials or provider are read`, async () => {
    const response = route[method]();
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "GET");
    const wrong = await route.GET(new Request("https://local.test/api/etsy/reconcile-listings", { method }));
    assert.equal(wrong.status, 405);
  });
}

test("arbitrary/protected IDs and write credentials rejected before read dependency", async () => {
  let calls = 0;
  const read = async () => { calls++; throw new Error("SHOULD_NOT_READ"); };
  for (const query of ["?productId=PDT-FCMP-002", "?productId=PDT-PCL-002", "?productId=PDT-UNKNOWN-999", "?nonce=private", "?listingId=123"]) {
    assert.equal((await handleReconciliationGet(new Request(`https://local.test/${query}`, { headers: { authorization: "Bearer reconciliation-read-secret" } }), read)).status, 400);
  }
  for (const key of ["x-write-token", "x-nonce", "x-authorization-secret"]) {
    assert.equal((await handleReconciliationGet(new Request("https://local.test/", { headers: { authorization: "Bearer reconciliation-read-secret", [key]: "private" } }), read)).status, 400);
  }
  assert.equal(calls, 0);
  assert.throws(() => reconcileListings([{ ...truth[0], productId: "PDT-FCMP-002" }], []));
});

test("exact identity, absent identity, ambiguous candidates and stale mappings", () => {
  assert.equal(reconcileListings([truth[0]], [listing()])[0].match, "MATCH");
  assert.equal(reconcileListings([truth[0]], [listing({ productIds: [], title: truth[0].productName })])[0].match, "MATCH");
  assert.equal(reconcileListings([truth[0]], [])[0].match, "NOT_FOUND");
  assert.equal(reconcileListings([truth[0]], [listing(), listing({ listingId: 124 })])[0].match, "CONFLICT_AMBIGUOUS");
  assert.equal(reconcileListings([truth[0]], [listing({ title: "Unrelated", productIds: [] })], [{ productId: truth[0].productId, listingId: 123 }])[0].match, "CONFLICT");
  assert.equal(reconcileListings([{ ...truth[0], listingId: 999 }], [listing()])[0].match, "CONFLICT");
  assert.equal(reconcileListings([{ ...truth[0], expectedTitle: "Approved title" }], [listing()])[0].match, "CONFLICT");
  assert.equal(reconcileListings([{ ...truth[0], expectedState: "draft" }], [listing({ state: "active" })])[0].match, "CONFLICT");
  assert.equal(reconcileListings([truth[0]], [listing({ productIds: [truth[1].productId] })])[0].match, "CONFLICT");
  assert.equal(reconcileListings([truth[0]], [listing({ title: `${truth[0].productName} Extra`, productIds: [] })])[0].match, "NOT_FOUND", "no fuzzy match");
});

test("duplicate state-query records deduplicate; inconsistent same-ID observations fail closed", () => {
  assert.equal(reconcileListings([truth[0]], [listing(), listing()])[0].match, "MATCH");
  assert.throws(() => reconcileListings([truth[0]], [listing(), listing({ state: "active" })]), /INCONSISTENT/);
});

test("unknown provider state is preserved as evidence instead of inferred from query state", async () => {
  const mock = provider({ results: [{ listing_id: 123, shop_id: 900001, state: "edit", title: truth[0].productName }] });
  const result = await readOnlyReconciliation(undefined, { loadTokens: async () => token(), fetchImpl: mock.fetchImpl, now });
  assert.equal(result.products[0].state, "edit");
  assert.equal(result.truthInputs.mode, "DRIVE_SNAPSHOT");
  assert.equal(result.truthInputs.unresolvedLifecycleConflict, false);
});

test("durable registry pointers are read only for selected targets and verified against Etsy identity", async () => {
  const mock = provider({ results: [{ listing_id: 123, shop_id: 900001, state: "draft", title: "Different product" }] });
  let requested: readonly string[] = [];
  const result = await readOnlyReconciliation([truth[0].productId], {
    loadTokens: async () => token(), fetchImpl: mock.fetchImpl, now,
    loadMappings: async (ids) => { requested = ids; return [{ productId: truth[0].productId, listingId: 123 }]; }
  });
  assert.deepEqual(requested, [truth[0].productId]);
  assert.equal(result.products[0].match, "CONFLICT");
  const failed = await handleReconciliationGet(new Request("https://local.test/", { headers: { authorization: "Bearer reconciliation-read-secret" } }), (ids) => readOnlyReconciliation(ids, {
    loadTokens: async () => token(), fetchImpl: provider().fetchImpl, now,
    loadMappings: async () => { throw new Error("PRIVATE_DB_FAILURE"); }
  }));
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).products, undefined);
});

test("full pagination is read before emitting missing-product evidence", async () => {
  const offsets: number[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    assert.equal(init?.method, "GET");
    const url = new URL(String(input));
    if (url.pathname.endsWith("/900001")) return Response.json({ shop_id: 900001, shop_name: "PoonthaiDigital" });
    if (url.searchParams.get("state") !== "draft") return Response.json({ count: 0, results: [] });
    const offset = Number(url.searchParams.get("offset"));
    offsets.push(offset);
    return Response.json({ count: 101, results: offset === 0 ? Array.from({ length: 100 }, (_, i) => ({
      listing_id: 1000 + i, shop_id: 900001, title: "Unrelated", state: "draft"
    })) : [{ listing_id: 123, shop_id: 900001, title: truth[0].productName, state: "draft" }] });
  };
  const result = await readOnlyReconciliation(undefined, { loadTokens: async () => token(), fetchImpl, now });
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(result.products[0].match, "MATCH");
});

test("protected global-shop results ignored without extra inventory reads", async () => {
  const mock = provider({ results: [{ listing_id: 444, shop_id: 900001, state: "active", title: "Protected",
    description: "PDT-FCMP-002", url: "https://www.etsy.com/listing/444" }] });
  const result = await readOnlyReconciliation(undefined, { loadTokens: async () => token(), fetchImpl: mock.fetchImpl, now });
  assert.ok(result.products.every((p) => p.match === "NOT_FOUND"));
  assert.ok(mock.calls.every((c) => !c.url.includes("/inventory")));
  assert.equal(reconcileListings([truth[0]], [listing({ listingId: 4587646332 })])[0].match, "NOT_FOUND");
  assert.equal(reconcileListings([truth[0]], [listing({ productIds: ["PDT-FCMP-002"] })])[0].match, "NOT_FOUND");
});

test("missing scope, missing tokens, expired tokens and wrong shop fail before listing read", async () => {
  for (const stored of [null, { ...token(), scope: "listings_w" }, { ...token(), scope: undefined },
    { ...token(), expiresAt: new Date(0) }]) {
    let calls = 0;
    await assert.rejects(() => readOnlyReconciliation(undefined, { loadTokens: async () => stored,
      fetchImpl: async () => { calls++; throw new Error("SHOULD_NOT_FETCH"); }, now }));
    assert.equal(calls, 0, "no refresh POST or provider fallback");
  }
  const mock = provider({ shopName: "WrongShop" });
  await assert.rejects(() => readOnlyReconciliation(undefined, { loadTokens: async () => token(), fetchImpl: mock.fetchImpl, now }), /SHOP_IDENTITY_MISMATCH/);
  assert.equal(mock.calls.length, 1);
});

test("read failure, rate limit, forbidden scope, malformed or incomplete pagination fail closed", async () => {
  for (const options of [{ status: 429 }, { status: 500 }, { status: 403 }, { count: 101 }, { count: 0 }, { results: [null] }]) {
    const mock = provider(options);
    const response = await handleReconciliationGet(new Request("https://local.test/", { headers: { authorization: "Bearer reconciliation-read-secret" } }),
      (ids) => readOnlyReconciliation(ids, { loadTokens: async () => token(), fetchImpl: mock.fetchImpl, now }));
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.etsyMutationPerformed, false);
    assert.equal(body.products, undefined, "never return partial NOT_FOUND evidence");
    assert.equal(body.error, options.status === 403 ? "ETSY_READ_SCOPE_MISSING" : "ETSY_RECONCILIATION_READ_FAILED");
    assert.ok(mock.calls.every((c) => c.method === "GET"));
  }
});

test("secrets never appear in response or logs, including provider error echo", async () => {
  const logs: unknown[] = [];
  const originals = [console.log, console.error, console.warn];
  console.log = console.error = console.warn = (...args) => { logs.push(args); };
  try {
    const mock = provider({ results: [{ listing_id: 123, shop_id: 900001, state: "draft",
      title: "123.private-access-token private-refresh-token private-api-secret", description: "PDT-CBP-004",
      url: "https://www.etsy.com/private-api-key" }] });
    const result = await readOnlyReconciliation(undefined, { loadTokens: async () => token(), fetchImpl: mock.fetchImpl, now });
    const response = await handleReconciliationGet(new Request("https://local.test/", { headers: { authorization: "Bearer reconciliation-read-secret" } }), async () => {
      throw new Error("private-refresh-token private-api-secret");
    });
    const text = JSON.stringify(result) + await response.text() + JSON.stringify(logs);
    for (const secret of [token().accessToken, token().refreshToken, "private-api-secret", "private-api-key"]) assert.equal(text.includes(secret), false);
    assert.equal(logs.length, 0);
  } finally { [console.log, console.error, console.warn] = originals; }
});

test("reconciliation import closure contains no publish, activate, upload, edit or token-save capability", async () => {
  const paths = ["lib/etsy-readonly-reconciliation.ts", "lib/etsy-reconciliation-api.ts",
    "app/api/etsy/reconcile-listings/route.ts", "lib/etsy-seller-state-reconciliation.ts"];
  for (const path of paths) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\b(createListing|updateListing|updateListingInventory|uploadListingImage|uploadListingFile|deleteListing|publishListing|activateListing|deactivateListing|saveEtsyTokens|getValidEtsyAccessToken)\s*\(/);
    assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
    assert.doesNotMatch(source, /from ["'].*(?:publish|draft-asset|authorization|operation-ledger|product-creation-plan)/);
  }
  const authSource = await readFile(new URL("../lib/etsy-auth.ts", import.meta.url), "utf8");
  assert.match(authSource, /scope: token.scope \?\? stored.scope/);
  assert.doesNotMatch(authSource.split("async function refreshEtsyTokens")[1].split("export async function")[0], /scope:\s*ETSY_SCOPES/);
});
