import assert from "node:assert/strict";
import test, { after, mock } from "node:test";

mock.module("../lib/etsy-auth", {
  namedExports: {
    getValidEtsyAccessToken: async () => "etsy-access-token"
  }
});

const previousEnv = {
  draftWrites: process.env.ETSY_DRAFT_WRITES_ENABLED,
  draftToken: process.env.ETSY_DRAFT_WRITE_TOKEN,
  shopId: process.env.ETSY_SHOP_ID,
  apiKey: process.env.ETSY_API_KEY,
  sharedSecret: process.env.ETSY_SHARED_SECRET
};
const originalFetch = globalThis.fetch;

function assignEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

after(() => {
  assignEnv("ETSY_DRAFT_WRITES_ENABLED", previousEnv.draftWrites);
  assignEnv("ETSY_DRAFT_WRITE_TOKEN", previousEnv.draftToken);
  assignEnv("ETSY_SHOP_ID", previousEnv.shopId);
  assignEnv("ETSY_API_KEY", previousEnv.apiKey);
  assignEnv("ETSY_SHARED_SECRET", previousEnv.sharedSecret);
  globalThis.fetch = originalFetch;
  mock.restoreAll();
});

test("CREATE_ETSY_DRAFT sends type=download in the initial Etsy POST body", async () => {
  process.env.ETSY_DRAFT_WRITES_ENABLED = "true";
  process.env.ETSY_DRAFT_WRITE_TOKEN = "draft-secret";
  process.env.ETSY_SHOP_ID = "23582741";
  process.env.ETSY_API_KEY = "api-key";
  process.env.ETSY_SHARED_SECRET = "shared-secret";

  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });

    if (calls.length === 1) {
      return Response.json({ listing_id: 900000001 }, { status: 201 });
    }
    if (calls.length === 2) {
      return Response.json({ listing_id: 900000001, type: "download" });
    }
    return Response.json({
      listing_id: 900000001,
      state: "draft",
      title: "Digital Operations Template",
      description: "Verified test description",
      quantity: 999,
      taxonomy_id: 1234,
      who_made: "i_did",
      when_made: "2020_2026",
      tags: [
        "digital planner",
        "small business",
        "operations",
        "workflow",
        "business tool",
        "etsy template",
        "printable pdf",
        "spreadsheet",
        "daily planner",
        "shop workflow",
        "owner toolkit",
        "business system",
        "instant download"
      ],
      price: { amount: 999, divisor: 100 },
      type: "download"
    });
  };

  const { POST } = await import("../app/api/publish/route");

  const request = new Request("https://example.test/api/publish", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-autodigitalpublisher-write-token": "draft-secret"
    },
    body: JSON.stringify({
      operation: "CREATE_ETSY_DRAFT",
      productId: "TEST-001",
      title: "Digital Operations Template",
      description: "Verified test description",
      priceUsd: 9.99,
      files: ["buyer.zip"],
      channels: ["etsy"],
      productTruthVerified: true,
      tags: [
        "digital planner",
        "small business",
        "operations",
        "workflow",
        "business tool",
        "etsy template",
        "printable pdf",
        "spreadsheet",
        "daily planner",
        "shop workflow",
        "owner toolkit",
        "business system",
        "instant download"
      ],
      etsy: {
        taxonomyId: 1234,
        quantity: 999,
        whoMade: "i_did",
        whenMade: "2020_2026",
        release: { productionBuildFrozen: true }
      }
    })
  });

  const response = await POST(request);

  assert.equal(response.status, 201);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(
    String(calls[0].input),
    "https://api.etsy.com/v3/application/shops/23582741/listings"
  );
  assert.ok(calls[0].init?.body instanceof URLSearchParams);
  assert.equal(calls[0].init.body.get("type"), "download");
  assert.equal(calls[1].init?.method, "PATCH");
  assert.equal((calls[1].init?.body as URLSearchParams).get("type"), "download");
  assert.equal(calls[2].init?.method, "GET");
});
