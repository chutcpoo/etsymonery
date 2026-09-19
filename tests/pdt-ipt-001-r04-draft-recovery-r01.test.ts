import assert from "node:assert/strict";
import test from "node:test";
import {
  MemoryOperationLedgerRepository,
  OPERATION_LEDGER_SCHEMA_VERSION
} from "../lib/operation-ledger";
import {
  exactPdtIpt001R04RecoveryR01Body,
  handlePdtIpt001R04RecoveryR01,
  PDT_IPT_001_R04_DRAFT_RECOVERY_R01,
  pdtIpt001R04RecoveryR01AuthorizationRequestHash,
  verifyPdtIpt001R04RecoveryR01PostRelease,
  verifyPdtIpt001R04RecoveryR01ProtectedState
} from "../lib/pdt-ipt-001-r04-draft-recovery-r01";
import { PDT_IPT_001_R04_DRAFT } from "../lib/pdt-ipt-001-r04-draft";

const TOKEN = "write-token";
const COMMIT = "b".repeat(40);
const AUTHORIZATION_ID =
  "PDT-IPT-001-R04-DRAFT-RECOVERY-R01-AUTH-20260919-01";
const PARENT_OPERATION_ID = "PDT-IPT-001-R04-DRAFT-001";
const PARENT_REQUEST_HASH =
  "c42321fa9e1add9f2325ed5b48e3eaacea6bfe2db47f563a58ebe2925e29c646";

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

async function seededRepository() {
  const repository = new MemoryOperationLedgerRepository();
  await repository.save({
    schemaVersion: OPERATION_LEDGER_SCHEMA_VERSION,
    operationId: PARENT_OPERATION_ID,
    requestHash: PARENT_REQUEST_HASH,
    attempts: 2,
    status: "RECONCILIATION_REQUIRED",
    receipt: {
      authorizationId: "PDT-IPT-001-R04-DRAFT-AUTH-20260919-01",
      publishPerformed: false
    },
    recoveryPoint: "PDT_IPT_R04_FINAL_SKU_MISMATCH",
    createdAt: "2026-09-19T11:20:10.105Z",
    updatedAt: "2026-09-19T11:20:49.138Z"
  });
  return repository;
}

function listingRecord() {
  return {
    listing_id: 4578391569,
    shop_id: 23582741,
    state: "draft",
    title: PDT_IPT_001_R04_DRAFT.title,
    description: PDT_IPT_001_R04_DRAFT.description,
    price: { amount: 690, divisor: 100, currency_code: "USD" },
    tags: [...PDT_IPT_001_R04_DRAFT.tags],
    quantity: PDT_IPT_001_R04_DRAFT.quantity,
    who_made: PDT_IPT_001_R04_DRAFT.whoMade,
    when_made: PDT_IPT_001_R04_DRAFT.whenMade,
    taxonomy_id: PDT_IPT_001_R04_DRAFT.taxonomyId,
    listing_type: "download",
    is_supply: false,
    should_auto_renew: true
  };
}

function imageRows() {
  return PDT_IPT_001_R04_DRAFT.gallery.map((asset, index) => ({
    listing_image_id: 8500000000 + index + 1,
    rank: asset.rank,
    alt_text: asset.altText,
    full_width: 2500,
    full_height: 2000
  }));
}

function fileRows() {
  return [{
    listing_file_id: 1517386907853,
    rank: 1,
    filename: PDT_IPT_001_R04_DRAFT.buyerFile.fileName,
    size_bytes: PDT_IPT_001_R04_DRAFT.buyerFile.sizeBytes
  }];
}

function videoRows() {
  return [{
    video_id: 843278491,
    width: PDT_IPT_001_R04_DRAFT.video.width,
    height: PDT_IPT_001_R04_DRAFT.video.height,
    video_state: "active"
  }];
}

function inventoryRecord(sku: string) {
  return {
    products: [{
      product_id: 34713863804,
      sku,
      property_values: [],
      offerings: [{
        offering_id: 99901,
        price: { amount: 690, divisor: 100, currency_code: "USD" },
        quantity: 999,
        is_enabled: true,
        readiness_state_id: 1
      }]
    }],
    price_on_property: [],
    quantity_on_property: [],
    sku_on_property: [],
    readiness_state_on_property: []
  };
}

function makeFetch() {
  let sku = "";
  const writes: Array<{ method: string; url: string; body: unknown }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";

    if (
      url.pathname === "/v3/application/listings/4578391569" &&
      method === "GET"
    ) {
      return Response.json(listingRecord());
    }
    if (
      url.pathname === "/v3/application/listings/4578391569/images" &&
      method === "GET"
    ) {
      return Response.json({ count: 10, results: imageRows() });
    }
    if (
      url.pathname ===
        "/v3/application/shops/23582741/listings/4578391569/files" &&
      method === "GET"
    ) {
      return Response.json({ count: 1, results: fileRows() });
    }
    if (
      url.pathname === "/v3/application/listings/4578391569/videos" &&
      method === "GET"
    ) {
      return Response.json({ count: 1, results: videoRows() });
    }
    if (
      url.pathname === "/v3/application/listings/4578391569/inventory" &&
      method === "GET"
    ) {
      return Response.json(inventoryRecord(sku));
    }
    if (
      url.pathname === "/v3/application/listings/batch/inventory" &&
      method === "GET"
    ) {
      assert.equal(url.searchParams.get("listing_ids"), "4578391569");
      return Response.json({
        count: 1,
        results: [{
          listing_id: 4578391569,
          inventory: inventoryRecord(sku)
        }]
      });
    }
    if (
      url.pathname === "/v3/application/shops/23582741/listings" &&
      method === "GET"
    ) {
      assert.equal(url.searchParams.get("state"), "draft");
      return Response.json({
        count: 2,
        results: [
          {
            listing_id: 4578391569,
            title: PDT_IPT_001_R04_DRAFT.title,
            state: "draft"
          },
          {
            listing_id: 4574349198,
            title:
              "Pricing Calculator for Private Chefs | Excel Food Cost, Labor, Profit Margin & Scenario Tool",
            state: "draft"
          }
        ]
      });
    }
    if (
      url.pathname === "/v3/application/listings/4578391569/inventory" &&
      method === "PUT"
    ) {
      const parsed = JSON.parse(String(init?.body)) as {
        products: Array<{
          sku: string;
          property_values: unknown[];
          offerings: Array<{
            price: number;
            quantity: number;
            is_enabled: boolean;
            readiness_state_id?: number;
          }>;
        }>;
        price_on_property: unknown[];
        quantity_on_property: unknown[];
        sku_on_property: unknown[];
        readiness_state_on_property: unknown[];
      };
      writes.push({ method, url: url.toString(), body: parsed });
      assert.equal(parsed.products.length, 1);
      assert.equal(parsed.products[0].sku, "PDT-IPT-001");
      assert.deepEqual(parsed.products[0].property_values, []);
      assert.equal(parsed.products[0].offerings.length, 1);
      assert.equal(parsed.products[0].offerings[0].price, 6.9);
      assert.equal(parsed.products[0].offerings[0].quantity, 999);
      assert.equal(parsed.products[0].offerings[0].is_enabled, true);
      assert.equal(parsed.products[0].offerings[0].readiness_state_id, 1);
      assert.deepEqual(parsed.price_on_property, []);
      assert.deepEqual(parsed.quantity_on_property, []);
      assert.deepEqual(parsed.sku_on_property, []);
      assert.deepEqual(parsed.readiness_state_on_property, []);
      sku = parsed.products[0].sku;
      return Response.json({ ok: true });
    }

    throw new Error(`UNEXPECTED_${method}_${url.pathname}`);
  };
  return { fetchImpl, writes, getSku: () => sku };
}

test("Recovery R01 identity is frozen to existing draft SKU-only scope", () => {
  assert.equal(
    PDT_IPT_001_R04_DRAFT_RECOVERY_R01.operationId,
    "PDT-IPT-001-R04-DRAFT-RECOVERY-R01-001"
  );
  assert.equal(PDT_IPT_001_R04_DRAFT_RECOVERY_R01.listingId, 4578391569);
  assert.equal(
    PDT_IPT_001_R04_DRAFT_RECOVERY_R01.candidateFingerprint,
    "37c0dab257ad2e90f456ddedefd7a22df5fa922db1df510b2d8581d7079a1562"
  );
  assert.equal(
    PDT_IPT_001_R04_DRAFT_RECOVERY_R01.listingFingerprint,
    "0659c764fa3fe6f0372399c0b2dd38ce363bc5ebb91b75bb23311f87a41f2055"
  );
  assert.equal(
    PDT_IPT_001_R04_DRAFT_RECOVERY_R01.recoveryScopeSha256,
    "78c4cbaa56d05599e5222bf2262e276535e278dc8ad62442ca4920c0bd68651b"
  );
  assert.equal(PDT_IPT_001_R04_DRAFT_RECOVERY_R01.requiredSku, "PDT-IPT-001");
  assert.equal(PDT_IPT_001_R04_DRAFT_RECOVERY_R01.publishAuthorized, false);
});

test("protected-state verification is read-only and sees exact empty SKU defect", async () => {
  await withEnv(async () => {
    const repository = await seededRepository();
    const { fetchImpl, writes } = makeFetch();
    const response = await verifyPdtIpt001R04RecoveryR01ProtectedState({
      repository,
      fetchImpl,
      getAccessToken: async () => "token"
    });
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.equal(payload.status, "PROTECTED_STATE_MATCH");
    assert.equal(payload.listingId, 4578391569);
    assert.equal(payload.currentSkuDirect, "");
    assert.equal(payload.currentSkuBatch, "");
    assert.equal(payload.requiredSku, "PDT-IPT-001");
    assert.equal(payload.publishAuthorized, false);
    assert.equal(payload.ETSY_WRITE_COUNT, 0);
    assert.equal(writes.length, 0);
    assert.match(
      String(payload.protectedStateFingerprint),
      /^[a-f0-9]{64}$/
    );
  });
});

test("Recovery R01 performs exactly one inventory PUT and no other Etsy mutation", async () => {
  await withEnv(async () => {
    const repository = await seededRepository();
    const { fetchImpl, writes, getSku } = makeFetch();

    const psvResponse = await verifyPdtIpt001R04RecoveryR01ProtectedState({
      repository,
      fetchImpl,
      getAccessToken: async () => "token"
    });
    const psv = await psvResponse.json() as {
      protectedStateFingerprint: string;
    };

    const body = exactPdtIpt001R04RecoveryR01Body(
      AUTHORIZATION_ID,
      psv.protectedStateFingerprint,
      COMMIT
    );
    const requestHash =
      pdtIpt001R04RecoveryR01AuthorizationRequestHash(
        AUTHORIZATION_ID,
        psv.protectedStateFingerprint,
        COMMIT
      );
    const request = new Request("https://example.test/internal", {
      method: "POST",
      headers: { "x-autodigitalpublisher-write-token": TOKEN }
    });

    const response = await handlePdtIpt001R04RecoveryR01(
      body,
      requestHash,
      request,
      {
        repository,
        fetchImpl,
        getAccessToken: async () => "token",
        now: () => "2026-09-19T12:00:00.000Z"
      }
    );
    const payload = await response.json() as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(payload.status, "UPDATED_AND_VERIFIED");
    assert.equal(payload.mode, "WRITE_ONCE_EXISTING_DRAFT_SKU_ONLY");
    assert.equal(payload.listingId, 4578391569);
    assert.equal(payload.directSku, "PDT-IPT-001");
    assert.equal(payload.batchSku, "PDT-IPT-001");
    assert.equal(payload.publishPerformed, false);
    assert.equal(payload.ETSY_WRITE_ATTEMPT_COUNT, 1);
    assert.equal(payload.ETSY_WRITE_COUNT, 1);
    assert.equal(getSku(), "PDT-IPT-001");

    assert.equal(writes.length, 1);
    assert.equal(writes[0].method, "PUT");
    assert.match(writes[0].url, /\/listings\/4578391569\/inventory$/);
  });
});

test("post-release verifier returns PERSISTENCE_PASS after SKU persists", async () => {
  await withEnv(async () => {
    const repository = await seededRepository();
    const { fetchImpl } = makeFetch();

    const psvResponse = await verifyPdtIpt001R04RecoveryR01ProtectedState({
      repository,
      fetchImpl,
      getAccessToken: async () => "token"
    });
    const psv = await psvResponse.json() as {
      protectedStateFingerprint: string;
    };
    const body = exactPdtIpt001R04RecoveryR01Body(
      AUTHORIZATION_ID,
      psv.protectedStateFingerprint,
      COMMIT
    );
    const requestHash =
      pdtIpt001R04RecoveryR01AuthorizationRequestHash(
        AUTHORIZATION_ID,
        psv.protectedStateFingerprint,
        COMMIT
      );
    const request = new Request("https://example.test/internal", {
      method: "POST",
      headers: { "x-autodigitalpublisher-write-token": TOKEN }
    });

    const update = await handlePdtIpt001R04RecoveryR01(
      body,
      requestHash,
      request,
      {
        repository,
        fetchImpl,
        getAccessToken: async () => "token",
        now: () => "2026-09-19T12:00:00.000Z"
      }
    );
    assert.equal(update.status, 200);

    const verify = await verifyPdtIpt001R04RecoveryR01PostRelease({
      repository,
      fetchImpl,
      getAccessToken: async () => "token"
    });
    const payload = await verify.json() as Record<string, unknown>;
    assert.equal(verify.status, 200);
    assert.equal(payload.status, "PERSISTENCE_PASS");
    assert.equal(payload.directSku, "PDT-IPT-001");
    assert.equal(payload.batchSku, "PDT-IPT-001");
    assert.equal(payload.galleryCount, 10);
    assert.equal(payload.buyerFileCount, 1);
    assert.equal(payload.videoCount, 1);
    assert.equal(payload.publishPerformed, false);
    assert.equal(payload.ETSY_WRITE_COUNT, 0);
  });
});

test("Recovery R01 fails closed if parent reconciliation identity is wrong", async () => {
  await withEnv(async () => {
    const repository = new MemoryOperationLedgerRepository();
    await repository.save({
      schemaVersion: OPERATION_LEDGER_SCHEMA_VERSION,
      operationId: PARENT_OPERATION_ID,
      requestHash: PARENT_REQUEST_HASH,
      attempts: 2,
      status: "RECONCILIATION_REQUIRED",
      recoveryPoint: "WRONG_RECOVERY_POINT",
      createdAt: "2026-09-19T11:20:10.105Z",
      updatedAt: "2026-09-19T11:20:49.138Z"
    });
    const { fetchImpl, writes } = makeFetch();
    const response = await verifyPdtIpt001R04RecoveryR01ProtectedState({
      repository,
      fetchImpl,
      getAccessToken: async () => "token"
    });
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 409);
    assert.equal(payload.status, "PROTECTED_STATE_MISMATCH");
    assert.equal(payload.reason, "PARENT_RECONCILIATION_MISMATCH");
    assert.equal(writes.length, 0);
  });
});
