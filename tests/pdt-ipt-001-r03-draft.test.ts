import assert from "node:assert/strict";
import test from "node:test";
import { MemoryOperationLedgerRepository } from "../lib/operation-ledger";
import {
  exactPdtIpt001R03DraftBody,
  handlePdtIpt001R03Draft,
  pdtIpt001R03AuthorizationRequestHash,
  PDT_IPT_001_R03_DRAFT,
  PDT_IPT_001_R03_DRAFT_ASSETS,
  PDT_IPT_001_R03_LISTING_FINGERPRINT,
  verifyPdtIpt001R03DraftProtectedState
} from "../lib/pdt-ipt-001-r03-draft";

const COMMIT = "a".repeat(40);
const TOKEN = "write-token";

function listingRecord(id = 9000000001) {
  return {
    listing_id: id,
    shop_id: 23582741,
    state: "draft",
    title: PDT_IPT_001_R03_DRAFT.title,
    description: PDT_IPT_001_R03_DRAFT.description,
    price: { amount: 690, divisor: 100, currency_code: "USD" },
    tags: [...PDT_IPT_001_R03_DRAFT.tags],
    quantity: PDT_IPT_001_R03_DRAFT.quantity,
    who_made: PDT_IPT_001_R03_DRAFT.whoMade,
    when_made: PDT_IPT_001_R03_DRAFT.whenMade,
    taxonomy_id: PDT_IPT_001_R03_DRAFT.taxonomyId,
    listing_type: "download",
    is_supply: false,
    should_auto_renew: true
  };
}

function withEnv<T>(fn: () => Promise<T>) {
  const keys = [
    "ETSY_SHOP_ID",
    "PUBLISH_WRITES_ENABLED",
    "ETSY_DRAFT_WRITES_ENABLED",
    "ETSY_B01_WRITE_TOKEN",
    "VERCEL_GIT_COMMIT_SHA",
    "ETSY_API_KEY",
    "ETSY_SHARED_SECRET"
  ] as const;
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.ETSY_SHOP_ID = "23582741";
  process.env.PUBLISH_WRITES_ENABLED = "true";
  process.env.ETSY_DRAFT_WRITES_ENABLED = "true";
  process.env.ETSY_B01_WRITE_TOKEN = TOKEN;
  process.env.VERCEL_GIT_COMMIT_SHA = COMMIT;
  process.env.ETSY_API_KEY = "test-key";
  process.env.ETSY_SHARED_SECRET = "test-secret";
  return fn().finally(() => {
    for (const key of keys) {
      const value = old[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("DAY03 compiled listing identity is the canonical frozen R03 fingerprint", () => {
  assert.equal(
    PDT_IPT_001_R03_LISTING_FINGERPRINT,
    "099976dd679b2e08938ffeed91ddcbbc0ff5ca34f1186d6bb56b0e87f040f3f7"
  );
  assert.equal(
    PDT_IPT_001_R03_DRAFT.candidateFingerprint,
    "fb30b800390d52506e5a5a6a2d2f9d7e2fb70502da2c7767e3f93dd63239fa36"
  );
  assert.equal(PDT_IPT_001_R03_DRAFT.gallery.length, 10);
  assert.equal(PDT_IPT_001_R03_DRAFT_ASSETS.length, 12);
  assert.equal(
    PDT_IPT_001_R03_DRAFT.gallery.every((asset) => asset.altText.trim().length > 0),
    true
  );
});

test("protected-state verification is read-only and checks all seller states", async () => {
  await withEnv(async () => {
    const methods: string[] = [];
    const states: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      methods.push(init?.method ?? "GET");
      if (url.pathname.endsWith("/listings")) {
        states.push(url.searchParams.get("state") ?? "");
        return Response.json({ count: 0, results: [] });
      }
      throw new Error("UNEXPECTED_URL:" + url.toString());
    };
    const response = await verifyPdtIpt001R03DraftProtectedState({
      fetchImpl,
      getAccessToken: async () => "token"
    });
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.equal(payload.status, "PROTECTED_STATE_MATCH");
    assert.equal(payload.ETSY_WRITE_COUNT, 0);
    assert.deepEqual(
      states.sort(),
      ["active", "draft", "expired", "inactive", "sold_out"].sort()
    );
    assert.equal(methods.every((method) => method === "GET"), true);
  });
});

test("full DAY03 executor creates exactly one verified draft package and never publishes", async () => {
  await withEnv(async () => {
    const listingId = 9000000001;
    let created = false;
    let sku = "";
    const images: Record<string, unknown>[] = [];
    const files: Record<string, unknown>[] = [];
    const videos: Record<string, unknown>[] = [];
    const writeCalls: Array<{ method: string; url: string }> = [];
    let imageId = 8100000000;
    let fileId = 1510000000000;
    let videoId = 880000000;

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";

      if (url.pathname === "/v3/application/shops/23582741/listings" && method === "GET") {
        return Response.json({ count: 0, results: [] });
      }

      if (url.pathname === "/v3/application/shops/23582741/listings" && method === "POST") {
        writeCalls.push({ method, url: url.toString() });
        assert.equal(created, false);
        const body = new URLSearchParams(String(init?.body ?? ""));
        assert.equal(body.get("is_supply"), "false");
        assert.equal(body.get("should_auto_renew"), "true");
        assert.equal(body.get("type"), "download");
        assert.equal(init?.headers && new Headers(init.headers).get("content-type"), "application/x-www-form-urlencoded; charset=utf-8");
        created = true;
        return Response.json({ listing_id: listingId }, { status: 201 });
      }

      if (url.pathname === `/v3/application/listings/${listingId}` && method === "GET") {
        assert.equal(created, true);
        return Response.json(listingRecord(listingId));
      }

      if (url.pathname === `/v3/application/listings/${listingId}/inventory` && method === "GET") {
        return Response.json({
          products: [{
            product_id: 1,
            sku,
            property_values: [],
            offerings: [{
              offering_id: 2,
              quantity: 999,
              is_enabled: true,
              price: { amount: 690, divisor: 100, currency_code: "USD" }
            }]
          }],
          price_on_property: [],
          quantity_on_property: [],
          sku_on_property: []
        });
      }

      if (url.pathname === `/v3/application/listings/${listingId}/inventory` && method === "PUT") {
        writeCalls.push({ method, url: url.toString() });
        const body = JSON.parse(String(init?.body)) as { products: Array<{ sku: string }> };
        sku = body.products[0].sku;
        return Response.json({ ok: true });
      }

      if (url.pathname === `/v3/application/listings/${listingId}/images` && method === "GET") {
        return Response.json({ count: images.length, results: images });
      }

      if (url.pathname === `/v3/application/shops/23582741/listings/${listingId}/images` && method === "POST") {
        writeCalls.push({ method, url: url.toString() });
        assert.ok(init?.body instanceof FormData);
        const form = init.body as FormData;
        const rank = Number(form.get("rank"));
        const altText = String(form.get("alt_text") ?? "");
        assert.equal(altText, PDT_IPT_001_R03_DRAFT.gallery[rank - 1].altText);
        const row = {
          listing_image_id: ++imageId,
          rank,
          alt_text: altText,
          full_width: 2500,
          full_height: 2000
        };
        images.push(row);
        return Response.json(row, { status: 201 });
      }

      if (url.pathname === `/v3/application/shops/23582741/listings/${listingId}/files` && method === "GET") {
        return Response.json({ count: files.length, results: files });
      }

      if (url.pathname === `/v3/application/shops/23582741/listings/${listingId}/files` && method === "POST") {
        writeCalls.push({ method, url: url.toString() });
        assert.ok(init?.body instanceof FormData);
        const form = init.body as FormData;
        const row = {
          listing_file_id: ++fileId,
          rank: Number(form.get("rank")),
          filename: String(form.get("name") ?? ""),
          size_bytes: PDT_IPT_001_R03_DRAFT.buyerFile.sizeBytes
        };
        files.push(row);
        return Response.json(row, { status: 201 });
      }

      if (url.pathname === `/v3/application/listings/${listingId}/videos` && method === "GET") {
        return Response.json({ count: videos.length, results: videos });
      }

      if (url.pathname === `/v3/application/shops/23582741/listings/${listingId}/videos` && method === "POST") {
        writeCalls.push({ method, url: url.toString() });
        const row = {
          video_id: ++videoId,
          width: 1920,
          height: 1080,
          video_state: "active",
          video_url: "https://example.test/video"
        };
        videos.push(row);
        return Response.json(row, { status: 201 });
      }

      throw new Error(`UNEXPECTED_${method}_${url.pathname}`);
    };

    const runtime = {
      fetchImpl,
      getAccessToken: async () => "token",
      repository: new MemoryOperationLedgerRepository(),
      loadAsset: async () => Buffer.from("test"),
      verifyAsset: () => true,
      clearAsset: async () => {},
      now: () => "2026-09-19T08:40:00.000Z"
    };

    const psvResponse = await verifyPdtIpt001R03DraftProtectedState(runtime);
    const psv = await psvResponse.json() as { protectedStateFingerprint: string };
    const authorizationId = "PDT-IPT-001-R03-DRAFT-RECOVERY-R02-AUTH-20260919-01";
    const body = exactPdtIpt001R03DraftBody(
      authorizationId,
      psv.protectedStateFingerprint,
      COMMIT
    );
    const requestHash = pdtIpt001R03AuthorizationRequestHash(
      authorizationId,
      psv.protectedStateFingerprint,
      COMMIT
    );
    const request = new Request("https://example.test/internal", {
      method: "POST",
      headers: { "x-autodigitalpublisher-write-token": TOKEN }
    });

    const response = await handlePdtIpt001R03Draft(
      body,
      requestHash,
      request,
      runtime
    );
    const payload = await response.json() as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(payload.status, "DRAFT_CREATED_VERIFIED_API_SCOPE");
    assert.equal(payload.draftListingId, listingId);
    assert.equal(payload.publishPerformed, false);
    assert.equal(payload.DAY03_OPERATION_WRITE_COUNT, 1);
    assert.equal(payload.ETSY_PROVIDER_WRITE_COUNT, 14);
    assert.equal(images.length, 10);
    assert.equal(files.length, 1);
    assert.equal(videos.length, 1);
    assert.equal(sku, "PDT-IPT-001");
    assert.equal(writeCalls.length, 14);
    assert.equal(writeCalls.some((call) => call.method === "PATCH"), false);
    assert.equal(writeCalls.some((call) => call.method === "DELETE"), false);
    assert.equal(
      writeCalls.some((call) => call.url.includes("state=active")),
      false
    );
  });
});

test("executor fails closed before provider writes when authorized production commit differs", async () => {
  await withEnv(async () => {
    let writes = 0;
    const fetchImpl: typeof fetch = async (_input, init) => {
      if ((init?.method ?? "GET") !== "GET") writes += 1;
      return Response.json({ count: 0, results: [] });
    };
    const authorizationId = "PDT-IPT-001-R03-DRAFT-RECOVERY-R02-AUTH-20260919-01";
    const protectedState = "b".repeat(64);
    const wrongCommit = "c".repeat(40);
    const body = exactPdtIpt001R03DraftBody(authorizationId, protectedState, wrongCommit);
    const hash = pdtIpt001R03AuthorizationRequestHash(authorizationId, protectedState, wrongCommit);
    const request = new Request("https://example.test/internal", {
      method: "POST",
      headers: { "x-autodigitalpublisher-write-token": TOKEN }
    });
    const response = await handlePdtIpt001R03Draft(body, hash, request, {
      fetchImpl,
      getAccessToken: async () => "token",
      repository: new MemoryOperationLedgerRepository(),
      loadAsset: async () => Buffer.from("test"),
      verifyAsset: () => true
    });
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 409);
    assert.equal(payload.error, "PDT_IPT_R03_PRODUCTION_COMMIT_MISMATCH");
    assert.equal(writes, 0);
  });
});
