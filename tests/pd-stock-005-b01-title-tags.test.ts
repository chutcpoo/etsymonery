import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  handlePdStock005B01TitleTags,
  PD_STOCK_005_B01
} from "../lib/pd-stock-005-b01-title-tags";
import { MemoryOperationLedgerRepository } from "../lib/operation-ledger";

const request = () => new Request("https://example.test/api/etsy/pd-stock-005/b01/title-tags", {
  method: "POST",
  headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": "test-write-token" }
});

const authorizedBody = () => ({
  operation: PD_STOCK_005_B01.operation,
  operationId: PD_STOCK_005_B01.operationId,
  authorizationId: PD_STOCK_005_B01.authorizationId,
  productId: PD_STOCK_005_B01.productId,
  productVersion: PD_STOCK_005_B01.productVersion,
  shopId: PD_STOCK_005_B01.shopId,
  listingId: PD_STOCK_005_B01.listingId,
  candidateId: PD_STOCK_005_B01.candidateId,
  candidateFingerprint: PD_STOCK_005_B01.candidateFingerprint,
  buildId: PD_STOCK_005_B01.buildId,
  buildFingerprint: PD_STOCK_005_B01.buildFingerprint,
  acceptanceCriteriaVersion: PD_STOCK_005_B01.acceptanceCriteriaVersion,
  acceptanceCriteriaSha256: PD_STOCK_005_B01.acceptanceCriteriaSha256,
  protectedFieldSnapshotSha256: PD_STOCK_005_B01.protectedFieldSnapshotSha256,
  patch: { title: PD_STOCK_005_B01.title, tags: [...PD_STOCK_005_B01.tags] }
});

const beforeListing = {
  listing_id: 4561821192,
  shop_id: 23582741,
  state: "active",
  title: "Old title",
  tags: ["old tag"],
  taxonomy_id: 12476,
  description: "protected description",
  price: { amount: 890, divisor: 100, currency_code: "USD" },
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2026",
  listing_type: "download"
};
const afterListing = { ...beforeListing, title: PD_STOCK_005_B01.title, tags: [...PD_STOCK_005_B01.tags] };

function enable() {
  process.env.PUBLISH_WRITES_ENABLED = "true";
  process.env.ETSY_B01_WRITE_TOKEN = "test-write-token";
  process.env.ETSY_DRAFT_WRITE_TOKEN = "different-draft-token";
  process.env.ETSY_SHOP_ID = PD_STOCK_005_B01.shopId;
  process.env.ETSY_API_KEY = "test-api-key";
  process.env.ETSY_SHARED_SECRET = "test-shared-secret";
}

test("write flag and secure token fail closed with zero Etsy calls", async () => {
  enable();
  let providerCalls = 0;
  const runtime = {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => { providerCalls += 1; return "token"; }
  };
  process.env.PUBLISH_WRITES_ENABLED = "false";
  const disabled = await handlePdStock005B01TitleTags(authorizedBody(), request(), runtime);
  assert.equal(disabled.status, 403);
  process.env.PUBLISH_WRITES_ENABLED = "true";
  const unauthorized = await handlePdStock005B01TitleTags(authorizedBody(), new Request("https://example.test", { method: "POST" }), runtime);
  assert.equal(unauthorized.status, 401);
  assert.equal(providerCalls, 0);
});

test("authorized path sends one Etsy PATCH containing title and exact ordered 13 tags only", async () => {
  enable();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let reads = 0;
  const response = await handlePdStock005B01TitleTags(authorizedBody(), request(), {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => "secret-access-token",
    now: () => "2026-09-08T10:00:00.000Z",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (init?.method === "GET") return Response.json(reads++ === 0 ? beforeListing : afterListing);
      return Response.json(afterListing);
    }
  });
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.status, "UPDATED_AND_VERIFIED");
  assert.equal(json.providerPatchCount, 1);
  const patchCalls = calls.filter((call) => call.init?.method === "PATCH");
  assert.equal(patchCalls.length, 1);
  assert.equal(patchCalls[0].url, "https://api.etsy.com/v3/application/shops/23582741/listings/4561821192");
  const form = patchCalls[0].init?.body as URLSearchParams;
  assert.deepEqual([...form.keys()], ["title", "tags"]);
  assert.equal(form.get("title"), PD_STOCK_005_B01.title);
  assert.deepEqual(form.get("tags")?.split(","), PD_STOCK_005_B01.tags);
});

test("rejects every protected or unknown patch field before Etsy access", async () => {
  enable();
  let providerCalls = 0;
  for (const protectedField of ["description", "price", "taxonomy_id", "quantity", "who_made", "when_made", "image_ids", "type", "shipping_profile_id", "personalization"]) {
    const body = authorizedBody() as ReturnType<typeof authorizedBody> & { patch: Record<string, unknown> };
    body.patch[protectedField] = "must-not-send";
    const response = await handlePdStock005B01TitleTags(body, request(), {
      repository: new MemoryOperationLedgerRepository(),
      getAccessToken: async () => { providerCalls += 1; return "token"; },
      fetchImpl: async () => { providerCalls += 1; return Response.json({}); }
    });
    assert.equal(response.status, 409, protectedField);
    assert.equal((await response.json()).providerPatchCount, 0);
  }
  assert.equal(providerCalls, 0);
});

test("rejects non-exact title, tag order, tag count, identity, and extra top-level keys", async () => {
  enable();
  const variants: Record<string, unknown>[] = [];
  const badTitle = authorizedBody(); badTitle.patch.title += " "; variants.push(badTitle);
  const badOrder = authorizedBody(); badOrder.patch.tags.reverse(); variants.push(badOrder);
  const badCount = authorizedBody(); badCount.patch.tags.pop(); variants.push(badCount);
  const badListing = authorizedBody() as Record<string, unknown>; badListing.listingId = "1"; variants.push(badListing);
  const extra = { ...authorizedBody(), dryRun: false }; variants.push(extra);
  for (const body of variants) {
    const response = await handlePdStock005B01TitleTags(body, request(), {
      repository: new MemoryOperationLedgerRepository(),
      getAccessToken: async () => { throw new Error("must not authenticate"); }
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).providerPatchCount, 0);
  }
});

test("fails closed before PATCH when live identity, state, or preserved taxonomy mismatches", async () => {
  enable();
  for (const listing of [
    { ...beforeListing, shop_id: 1 },
    { ...beforeListing, state: "draft" },
    { ...beforeListing, taxonomy_id: 1 }
  ]) {
    const methods: string[] = [];
    const response = await handlePdStock005B01TitleTags(authorizedBody(), request(), {
      repository: new MemoryOperationLedgerRepository(), getAccessToken: async () => "token",
      now: () => "2026-09-08T10:00:00.000Z",
      fetchImpl: async (_url, init) => { methods.push(String(init?.method)); return Response.json(listing); }
    });
    assert.equal(response.status, 409);
    assert.deepEqual(methods, ["GET"]);
  }
});

test("marks ambiguous when an observable protected field changes after PATCH", async () => {
  enable();
  let reads = 0;
  const response = await handlePdStock005B01TitleTags(authorizedBody(), request(), {
    repository: new MemoryOperationLedgerRepository(), getAccessToken: async () => "token",
    now: () => "2026-09-08T10:00:00.000Z",
    fetchImpl: async (_url, init) => {
      if (init?.method === "GET") return Response.json(reads++ === 0 ? beforeListing : { ...afterListing, quantity: 998 });
      return Response.json(afterListing);
    }
  });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { error: "PD_STOCK_005_B01_POSTREAD_MISMATCH", providerPatchCount: 1 });
});

test("one-shot ledger replay never sends a second PATCH", async () => {
  enable();
  const repository = new MemoryOperationLedgerRepository();
  let reads = 0;
  let patches = 0;
  const runtime = {
    repository, getAccessToken: async () => "token", now: () => "2026-09-08T10:00:00.000Z",
    fetchImpl: async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") { patches += 1; return Response.json(afterListing); }
      return Response.json(reads++ === 0 ? beforeListing : afterListing);
    }
  };
  assert.equal((await handlePdStock005B01TitleTags(authorizedBody(), request(), runtime)).status, 200);
  const replay = await handlePdStock005B01TitleTags(authorizedBody(), request(), runtime);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).status, "REPLAY");
  assert.equal(patches, 1);
});

test("dedicated route exports no Etsy-capable GET/PUT/PATCH/DELETE handler", async () => {
  const source = await readFile(new URL("../app/api/etsy/pd-stock-005/b01/title-tags/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /export\s+async\s+function\s+(GET|PUT|PATCH|DELETE)\b/);
  const helper = await readFile(new URL("../lib/pd-stock-005-b01-title-tags.ts", import.meta.url), "utf8");
  assert.equal((helper.match(/method:\s*"PATCH"/g) ?? []).length, 1);
  assert.doesNotMatch(helper, /method:\s*"(POST|PUT|DELETE)"/);
});
