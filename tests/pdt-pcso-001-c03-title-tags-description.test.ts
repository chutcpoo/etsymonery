import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  exactPdtPcso001C03Body,
  handlePdtPcso001C03TitleTagsDescription,
  PDT_PCSO_001_C03
} from "../lib/pdt-pcso-001-c03-title-tags-description";
import { hashOperationRequest, MemoryOperationLedgerRepository } from "../lib/operation-ledger";

const AUTH_ID = "TEST-PCSO-C03-AUTH-001";
const request = () => new Request("https://example.test/api/internal/etsy/authorized-operation", {
  method: "POST",
  headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": "test-write-token" }
});
const body = () => exactPdtPcso001C03Body(AUTH_ID);

const sourceDescription = PDT_PCSO_001_C03.description
  .replace("• 1 .xlsx workbook with 12 linked tabs", "• 1 Microsoft Excel workbook with 12 linked tabs")
  .replace(
    "COMPATIBILITY\n• Google Sheets: verified on an exact converted copy of the same production candidate",
    "COMPATIBILITY\n• Microsoft Excel Desktop: verified on the exact production candidate\n• Google Sheets: verified on an exact converted copy of the same production candidate"
  );

const beforeListing = {
  listing_id: 4569445414,
  shop_id: 23582741,
  state: "active",
  title: "Private Chef Business Spreadsheet | Client Service Tracker | Pricing, Profit & Rebooking Dashboard | Excel + Google Sheets",
  description: sourceDescription,
  price: { amount: 1490, divisor: 100, currency_code: "USD" },
  taxonomy_id: 12478,
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2026",
  listing_type: "download",
  tags: [
    "private chef", "personal chef", "chef business", "chef spreadsheet", "client tracker",
    "service tracker", "chef pricing", "profit tracker", "booking tracker", "rebooking tracker",
    "food cost tracker", "excel template", "google sheets"
  ]
};
const afterListing = {
  ...beforeListing,
  title: PDT_PCSO_001_C03.title,
  tags: [...PDT_PCSO_001_C03.tags],
  description: PDT_PCSO_001_C03.description
};
const images = { results: [
  [8480115528,1],[8480115746,2],[8528020775,3],[8480116096,4],
  [8480116374,5],[8480116568,6],[8480116820,7],[8528021909,8]
].map(([listing_image_id, rank]) => ({ listing_image_id, rank })) };
const attributes = { results: [] };
const files = { results: [{ listing_file_id: 1512525825958, rank: 1, filename: "PDT-PCSO-001_Private_Chef_Operations_V1.zip", size_bytes: 30182, filetype: "application/octet-stream" }] };

function enable() {
  process.env.PUBLISH_WRITES_ENABLED = "true";
  process.env.ETSY_B01_WRITE_TOKEN = "test-write-token";
  process.env.ETSY_SHOP_ID = PDT_PCSO_001_C03.shopId;
  process.env.ETSY_API_KEY = "test-api-key";
  process.env.ETSY_SHARED_SECRET = "test-shared-secret";
  process.env.ETSY_PCSO_C03_AUTHORIZATION_ID = AUTH_ID;
  process.env.ETSY_PCSO_C03_REQUEST_SHA256 = hashOperationRequest(body());
}

function stateFetch(options: {
  before?: typeof beforeListing;
  after?: typeof afterListing;
  patchThrows?: boolean;
  onPatch?: (form: URLSearchParams) => void;
} = {}) {
  let listingReads = 0;
  return async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url);
    if (init?.method === "PATCH") {
      options.onPatch?.(init.body as URLSearchParams);
      if (options.patchThrows) throw new Error("network ambiguity");
      return Response.json(options.after ?? afterListing);
    }
    if (href.endsWith("/images")) return Response.json(images);
    if (href.endsWith("/properties")) return Response.json(attributes);
    if (href.endsWith("/files")) return Response.json(files);
    if (href.endsWith(`/listings/${PDT_PCSO_001_C03.listingId}`)) {
      return Response.json(listingReads++ === 0 ? (options.before ?? beforeListing) : (options.after ?? afterListing));
    }
    throw new Error(`unexpected URL ${href}`);
  };
}

test("C04 frozen target hashes are internally self-consistent", () => {
  assert.equal(createHash("sha256").update(PDT_PCSO_001_C03.title, "utf8").digest("hex"), PDT_PCSO_001_C03.targetTitleSha256);
  assert.equal(createHash("sha256").update(JSON.stringify(PDT_PCSO_001_C03.tags), "utf8").digest("hex"), PDT_PCSO_001_C03.targetOrderedTagsSha256);
  assert.equal(createHash("sha256").update(PDT_PCSO_001_C03.description, "utf8").digest("hex"), PDT_PCSO_001_C03.targetDescriptionSha256);
  assert.equal(createHash("sha256").update(sourceDescription, "utf8").digest("hex"), "3aff33ab799654ef6ec95004e8b9ed380fa943afd891cfe9c259d3da8cc033a5");
  assert.equal(PDT_PCSO_001_C03.tags.length, 13);
  assert.equal(PDT_PCSO_001_C03.tags.every((tag) => tag.length <= 20), true);
});

test("write flag, write token, and production authorization config fail closed before Etsy access", async () => {
  enable();
  let providerCalls = 0;
  const runtime = { repository: new MemoryOperationLedgerRepository(), getAccessToken: async () => { providerCalls += 1; return "token"; } };
  process.env.PUBLISH_WRITES_ENABLED = "false";
  assert.equal((await handlePdtPcso001C03TitleTagsDescription(body(), request(), runtime)).status, 403);
  process.env.PUBLISH_WRITES_ENABLED = "true";
  assert.equal((await handlePdtPcso001C03TitleTagsDescription(body(), new Request("https://example.test", { method: "POST" }), runtime)).status, 401);
  process.env.ETSY_PCSO_C03_AUTHORIZATION_ID = "";
  assert.equal((await handlePdtPcso001C03TitleTagsDescription(body(), request(), runtime)).status, 503);
  assert.equal(providerCalls, 0);
});

test("authorized path sends exactly one Etsy PATCH with title, tags, description only", async () => {
  enable();
  let patches = 0;
  const response = await handlePdtPcso001C03TitleTagsDescription(body(), request(), {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => "token",
    now: () => "2026-09-10T05:00:00.000Z",
    fetchImpl: stateFetch({ onPatch: (form) => {
      patches += 1;
      assert.deepEqual([...form.keys()], ["title", "tags", "description"]);
      assert.equal(form.get("title"), PDT_PCSO_001_C03.title);
      assert.deepEqual(form.get("tags")?.split(","), PDT_PCSO_001_C03.tags);
      assert.equal(form.get("description"), PDT_PCSO_001_C03.description);
      for (const forbidden of ["price", "taxonomy_id", "quantity", "who_made", "when_made", "type", "image_ids", "files", "attributes", "shipping_profile_id", "return_policy_id"]) {
        assert.equal(form.has(forbidden), false, forbidden);
      }
    } })
  });
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.status, "UPDATED_AND_VERIFIED");
  assert.equal(json.providerPatchCount, 1);
  assert.equal(patches, 1);
});

test("non-exact contract or request hash is rejected before Etsy access", async () => {
  enable();
  let providerCalls = 0;
  const bad = body() as ReturnType<typeof body> & { patch: Record<string, unknown> };
  bad.patch.price = "14.90";
  let response = await handlePdtPcso001C03TitleTagsDescription(bad, request(), {
    repository: new MemoryOperationLedgerRepository(), getAccessToken: async () => { providerCalls += 1; return "token"; }
  });
  assert.equal(response.status, 409);
  process.env.ETSY_PCSO_C03_REQUEST_SHA256 = "0".repeat(64);
  response = await handlePdtPcso001C03TitleTagsDescription(body(), request(), {
    repository: new MemoryOperationLedgerRepository(), getAccessToken: async () => { providerCalls += 1; return "token"; }
  });
  assert.equal(response.status, 409);
  assert.equal(providerCalls, 0);
});

test("fresh pre-write mismatch fails closed with zero PATCH", async () => {
  enable();
  for (const mutated of [
    { ...beforeListing, quantity: 998 },
    { ...beforeListing, taxonomy_id: 1 },
    { ...beforeListing, state: "draft" },
    { ...beforeListing, description: beforeListing.description + " drift" }
  ]) {
    let patches = 0;
    const response = await handlePdtPcso001C03TitleTagsDescription(body(), request(), {
      repository: new MemoryOperationLedgerRepository(), getAccessToken: async () => "token",
      now: () => "2026-09-10T05:00:00.000Z",
      fetchImpl: stateFetch({ before: mutated as typeof beforeListing, onPatch: () => { patches += 1; } })
    });
    assert.equal(response.status, 409);
    assert.equal(patches, 0);
  }
});

test("gallery, attributes, and buyer-file drift fail closed before PATCH", async () => {
  enable();
  const cases = [
    { images: { results: images.results.map((x, i) => i === 0 ? { ...x, listing_image_id: 1 } : x) }, attributes, files },
    { images, attributes: { results: [{ property_id: 1 }] }, files },
    { images, attributes, files: { results: [{ ...files.results[0], size_bytes: 1 }] } }
  ];
  for (const state of cases) {
    let patches = 0, listingReads = 0;
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url);
      if (init?.method === "PATCH") { patches += 1; return Response.json(afterListing); }
      if (href.endsWith("/images")) return Response.json(state.images);
      if (href.endsWith("/properties")) return Response.json(state.attributes);
      if (href.endsWith("/files")) return Response.json(state.files);
      return Response.json(listingReads++ === 0 ? beforeListing : afterListing);
    };
    const response = await handlePdtPcso001C03TitleTagsDescription(body(), request(), {
      repository: new MemoryOperationLedgerRepository(), getAccessToken: async () => "token",
      now: () => "2026-09-10T05:00:00.000Z", fetchImpl
    });
    assert.equal(response.status, 409);
    assert.equal(patches, 0);
  }
});

test("ambiguous provider outcome reconciles only after exact post-readback match", async () => {
  enable();
  let patches = 0;
  const response = await handlePdtPcso001C03TitleTagsDescription(body(), request(), {
    repository: new MemoryOperationLedgerRepository(), getAccessToken: async () => "token",
    now: () => "2026-09-10T05:00:00.000Z",
    fetchImpl: stateFetch({ patchThrows: true, onPatch: () => { patches += 1; } })
  });
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.status, "RECONCILED");
  assert.equal(json.providerPatchCount, 1);
  assert.equal(patches, 1);
});

test("post-write protected drift becomes reconciliation required and never retries", async () => {
  enable();
  let patches = 0;
  const driftedAfter = { ...afterListing, quantity: 998 };
  const response = await handlePdtPcso001C03TitleTagsDescription(body(), request(), {
    repository: new MemoryOperationLedgerRepository(), getAccessToken: async () => "token",
    now: () => "2026-09-10T05:00:00.000Z",
    fetchImpl: stateFetch({ after: driftedAfter, onPatch: () => { patches += 1; } })
  });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).error, "PDT_PCSO_001_C03_RECONCILIATION_REQUIRED");
  assert.equal(patches, 1);
});

test("one-shot replay never sends a second PATCH", async () => {
  enable();
  const repository = new MemoryOperationLedgerRepository();
  let patches = 0;
  const runtime = {
    repository, getAccessToken: async () => "token", now: () => "2026-09-10T05:00:00.000Z",
    fetchImpl: stateFetch({ onPatch: () => { patches += 1; } })
  };
  assert.equal((await handlePdtPcso001C03TitleTagsDescription(body(), request(), runtime)).status, 200);
  const replay = await handlePdtPcso001C03TitleTagsDescription(body(), request(), runtime);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).status, "REPLAY");
  assert.equal(patches, 1);
});

test("executor source exposes one provider PATCH and no other provider mutation methods", async () => {
  const source = await readFile(new URL("../lib/pdt-pcso-001-c03-title-tags-description.ts", import.meta.url), "utf8");
  assert.equal((source.match(/method:\s*"PATCH"/g) ?? []).length, 1);
  assert.doesNotMatch(source, /method:\s*"(POST|PUT|DELETE)"/);
  assert.match(source, /patchBody\.set\("title"/);
  assert.match(source, /patchBody\.set\("tags"/);
  assert.match(source, /patchBody\.set\("description"/);
  assert.doesNotMatch(source, /patchBody\.set\("(price|taxonomy_id|quantity|who_made|when_made|type)"/);
});
