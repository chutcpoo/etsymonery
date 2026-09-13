import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createListingFingerprint } from "../lib/candidate-fingerprint";
import {
  exactPdtHbop001B01Body,
  handlePdtHbop001B01TitleTags,
  PDT_HBOP_001_B01
} from "../lib/pdt-hbop-001-b01-title-tags";
import { hashOperationRequest, MemoryOperationLedgerRepository } from "../lib/operation-ledger";

const OLD_TITLE = "Home Bakery Order Tracker & Production Planner | Excel Operations Template";
const OLD_TAGS = [
  "production planner", "baking schedule", "delivery tracker", "batch prep log", "cottage bakery",
  "order tracker excel", "waste log template", "excel bakery tool", "home bakery planner",
  "ingredient planner", "pickup planner", "bakery dashboard", "order management"
];
const DESCRIPTION = "Protected home bakery listing description.\n\nKeep this text byte-for-byte from the fresh preread.";

function listing(target = false) {
  return {
    listing_id: 4566738686,
    shop_id: 23582741,
    title: target ? PDT_HBOP_001_B01.title : OLD_TITLE,
    description: DESCRIPTION,
    price: { amount: 1490, divisor: 100, currency_code: "USD" },
    tags: target ? [...PDT_HBOP_001_B01.tags] : [...OLD_TAGS],
    quantity: 999,
    taxonomy_id: 12476,
    who_made: "i_did",
    when_made: "2020_2026",
    listing_type: "download",
    state: "active"
  };
}

function fingerprint(target: boolean) {
  const value = listing(target);
  return createListingFingerprint({
    title: value.title,
    description: value.description,
    priceUsd: 14.9,
    tags: value.tags,
    quantity: value.quantity,
    who_made: value.who_made,
    when_made: value.when_made,
    taxonomy_id: value.taxonomy_id,
    type: value.listing_type,
    state: value.state
  });
}

const ENV_NAMES = [
  "PUBLISH_WRITES_ENABLED",
  "ETSY_B01_WRITE_TOKEN",
  "ETSY_SHOP_ID",
  "ETSY_API_KEY",
  "ETSY_SHARED_SECRET",
  "ETSY_PDT_HBOP_001_B01_REQUEST_SHA256",
  "ETSY_PDT_HBOP_001_B01_EXPECTED_BEFORE_LISTING_SHA256",
  "ETSY_PDT_HBOP_001_B01_EXPECTED_AFTER_LISTING_SHA256"
] as const;
const prior = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));

test.afterEach(() => {
  for (const name of ENV_NAMES) {
    const value = prior[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function configure() {
  const body = exactPdtHbop001B01Body();
  process.env.PUBLISH_WRITES_ENABLED = "true";
  process.env.ETSY_B01_WRITE_TOKEN = "hbop-secret";
  process.env.ETSY_SHOP_ID = PDT_HBOP_001_B01.shopId;
  process.env.ETSY_API_KEY = "test-key";
  process.env.ETSY_SHARED_SECRET = "test-secret";
  process.env.ETSY_PDT_HBOP_001_B01_REQUEST_SHA256 = hashOperationRequest(body);
  process.env.ETSY_PDT_HBOP_001_B01_EXPECTED_BEFORE_LISTING_SHA256 = fingerprint(false);
  process.env.ETSY_PDT_HBOP_001_B01_EXPECTED_AFTER_LISTING_SHA256 = fingerprint(true);
  return body;
}

function request(token = "hbop-secret") {
  return new Request("https://example.test/api/etsy/pdt-hbop-001/b01/title-tags", {
    method: "POST",
    headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": token }
  });
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("immutable HBOP B01 identity, scope, title, and ordered tag contract are exact", () => {
  const body = exactPdtHbop001B01Body();
  assert.equal(body.operation, "UPDATE_ACTIVE_LISTING_TITLE_TAGS_ONLY");
  assert.equal(body.operationId, "PDT-HBOP-001-B01-TITLE-TAGS-001");
  assert.equal(body.candidateId, "ETSY-KEYWORD-REPAIR-PDT-HBOP-001-V1-2026-09-13-A");
  assert.equal(body.candidateFingerprint, "4721c625cc41e5da25f800aa988e6516c1006150b10bc81cd2f62ad3f3f18103");
  assert.equal(body.buildId, "ETSY-KEYWORD-REPAIR-PDT-HBOP-001-BUILD-20260913-B01");
  assert.equal(body.buildFingerprint, "afc643261deeca6dfac62fc69ad385855616408517bcb7166886b35e9ff95675");
  assert.equal(body.buildFreezeSha256, "9bb6204890546aeca43ac0946cd8dfac31691057adaadcd5cc941a442fa02078");
  assert.equal(body.acceptanceCriteriaId, "ETSY-AC-PDT-HBOP-001-KEYWORD-REPAIR-B01-V1");
  assert.equal(body.acceptanceCriteriaSha256, "d2db7efb24d4de1a9948e31de13559324f016256a63dbf6ff719cb3e80b1b4c1");
  assert.equal(body.shopId, "23582741");
  assert.equal(body.listingId, "4566738686");
  assert.equal(hashOperationRequest(body), "9b7e741a9846bdceca6c10a8aa8f1bb65d374eb9451fa50584b8912f955adb72");
  assert.deepEqual(body.patch.tags, [...PDT_HBOP_001_B01.tags]);
  assert.equal(body.patch.tags.length, 13);
  assert.equal(new Set(body.patch.tags).size, 13);
  assert.ok(body.patch.tags.every((tag) => tag.length <= 20));
});

test("writes disabled fails closed with zero writes and zero provider access", async () => {
  const body = configure();
  process.env.PUBLISH_WRITES_ENABLED = "false";
  let providerCalls = 0;
  const response = await handlePdtHbop001B01TitleTags(body, request(), {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => { providerCalls += 1; return "token"; },
    fetchImpl: async () => { providerCalls += 1; return json({}); }
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "PDT_HBOP_001_B01_WRITES_DISABLED", providerPatchCount: 0, ETSY_WRITE_COUNT: 0 });
  assert.equal(providerCalls, 0);
});

test("write token and dedicated request hash mismatch fail before provider access", async () => {
  const body = configure();
  let providerCalls = 0;
  const runtime = {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => { providerCalls += 1; return "token"; }
  };
  const unauthorized = await handlePdtHbop001B01TitleTags(body, request("wrong"), runtime);
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).ETSY_WRITE_COUNT, 0);
  process.env.ETSY_PDT_HBOP_001_B01_REQUEST_SHA256 = "f".repeat(64);
  const badHash = await handlePdtHbop001B01TitleTags(body, request(), runtime);
  assert.equal(badHash.status, 409);
  assert.deepEqual(await badHash.json(), { error: "PDT_HBOP_001_B01_REQUEST_HASH_MISMATCH", providerPatchCount: 0, ETSY_WRITE_COUNT: 0 });
  assert.equal(providerCalls, 0);
});

test("immutable identity mismatch, extra keys, and caller protected fields are rejected with zero writes", async () => {
  configure();
  const invalid = [
    { ...exactPdtHbop001B01Body(), candidateFingerprint: "0".repeat(64) },
    { ...exactPdtHbop001B01Body(), listingId: "1" },
    { ...exactPdtHbop001B01Body(), dryRun: false },
    { ...exactPdtHbop001B01Body(), patch: { ...exactPdtHbop001B01Body().patch, description: "caller-controlled" } },
    { ...exactPdtHbop001B01Body(), patch: { ...exactPdtHbop001B01Body().patch, tags: [...PDT_HBOP_001_B01.tags].reverse() } }
  ];
  let providerCalls = 0;
  for (const body of invalid) {
    const response = await handlePdtHbop001B01TitleTags(body, request(), {
      repository: new MemoryOperationLedgerRepository(),
      getAccessToken: async () => { providerCalls += 1; return "token"; }
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).providerPatchCount, 0);
  }
  assert.equal(providerCalls, 0);
});

test("preread identity mismatch performs one GET and zero PATCH", async () => {
  const body = configure();
  const methods: string[] = [];
  const response = await handlePdtHbop001B01TitleTags(body, request(), {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => "token",
    fetchImpl: async (_url, init) => {
      methods.push(String(init?.method));
      return json({ ...listing(false), quantity: 998 });
    }
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).ETSY_WRITE_COUNT, 0);
  assert.deepEqual(methods, ["GET"]);
});

test("successful exact update sends one PATCH and verifies the expected-after fingerprint", async () => {
  const body = configure();
  const methods: string[] = [];
  const target = { value: false };
  const response = await handlePdtHbop001B01TitleTags(body, request(), {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => "token",
    now: () => "2026-09-13T10:00:00.000Z",
    fetchImpl: async (_url, init) => {
      const method = String(init?.method);
      methods.push(method);
      if (method === "PATCH") { target.value = true; return json({ listing_id: 4566738686 }); }
      return json(listing(target.value));
    }
  });
  const output = await response.json();
  assert.equal(response.status, 200);
  assert.equal(output.status, "UPDATED_AND_VERIFIED");
  assert.equal(output.providerPatchCount, 1);
  assert.equal(output.ETSY_WRITE_COUNT, 1);
  assert.equal(output.receipt.actualListingFingerprint, fingerprint(true));
  assert.deepEqual(output.receipt.verified, { title: "PASS", tagsExactOrdered13: "PASS", protectedFields: "PASS" });
  assert.deepEqual(methods, ["GET", "PATCH", "GET"]);
});

test("already-applied expected-after state reconciles with zero PATCH", async () => {
  const body = configure();
  const methods: string[] = [];
  const response = await handlePdtHbop001B01TitleTags(body, request(), {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => "token",
    now: () => "2026-09-13T10:00:00.000Z",
    fetchImpl: async (_url, init) => { methods.push(String(init?.method)); return json(listing(true)); }
  });
  const output = await response.json();
  assert.equal(response.status, 200);
  assert.equal(output.status, "RECONCILED");
  assert.equal(output.providerPatchCount, 0);
  assert.equal(output.ETSY_WRITE_COUNT, 0);
  assert.deepEqual(methods, ["GET"]);
});

test("PATCH body takes every API-required protected value from the fresh preread", async () => {
  const body = configure();
  let patchBody = "";
  let target = false;
  const response = await handlePdtHbop001B01TitleTags(body, request(), {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => "token",
    now: () => "2026-09-13T10:00:00.000Z",
    fetchImpl: async (_url, init) => {
      if (init?.method === "PATCH") { patchBody = String(init.body); target = true; return json({ ok: true }); }
      return json(listing(target));
    }
  });
  assert.equal(response.status, 200);
  const form = new URLSearchParams(patchBody);
  assert.deepEqual([...form.keys()], ["title", "description", "price", "quantity", "taxonomy_id", "who_made", "when_made", "type", "tags"]);
  assert.equal(form.get("title"), PDT_HBOP_001_B01.title);
  assert.equal(form.get("tags"), PDT_HBOP_001_B01.tags.join(","));
  assert.equal(form.get("description"), DESCRIPTION);
  assert.equal(form.get("price"), "14.90");
  assert.equal(form.get("quantity"), "999");
  assert.equal(form.get("taxonomy_id"), "12476");
  assert.equal(form.get("who_made"), "i_did");
  assert.equal(form.get("when_made"), "2020_2026");
  assert.equal(form.get("type"), "download");
});

test("ambiguous PATCH outcome is ledgered as reconciliation-required and never retried in the request", async () => {
  const body = configure();
  const repository = new MemoryOperationLedgerRepository();
  const methods: string[] = [];
  const response = await handlePdtHbop001B01TitleTags(body, request(), {
    repository,
    getAccessToken: async () => "token",
    now: () => "2026-09-13T10:00:00.000Z",
    fetchImpl: async (_url, init) => {
      const method = String(init?.method);
      methods.push(method);
      if (method === "PATCH") throw new Error("ambiguous transport failure");
      return json(listing(false));
    }
  });
  const output = await response.json();
  const record = await repository.load(PDT_HBOP_001_B01.operationId);
  assert.equal(response.status, 202);
  assert.equal(output.status, "RECONCILIATION_REQUIRED");
  assert.equal(output.providerPatchCount, 1);
  assert.equal(output.ETSY_WRITE_COUNT, 1);
  assert.equal(record?.status, "RECONCILIATION_REQUIRED");
  assert.equal(record?.recoveryPoint, "POST_PATCH_READBACK");
  assert.deepEqual(methods, ["GET", "PATCH", "GET"]);
});

test("dedicated route is POST-only", async () => {
  const source = await readFile(new URL("../app/api/etsy/pdt-hbop-001/b01/title-tags/route.ts", import.meta.url), "utf8");
  assert.match(source, /export\s+async\s+function\s+POST\b/);
  assert.doesNotMatch(source, /export\s+async\s+function\s+(GET|PUT|PATCH|DELETE)\b/);
});
