import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MemoryOperationLedgerRepository } from "../lib/operation-ledger";
import {
  PDT_PCPC_001_DRAFT_RECOVERY_001,
  verifyPdtPcpc001DraftRecovery001ProtectedState
} from "../lib/pdt-pcpc-001-draft-recovery-001";
import {
  PDT_PCPC_001_G01_V01,
  PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT
} from "../lib/pdt-pcpc-001-g01-v01-new-listing";

const routePath = new URL("../app/api/etsy/test/pcpc-recovery/route.ts", import.meta.url);
const NOW = "2026-09-14T15:02:13.203Z";

async function repoWithParent() {
  const repo = new MemoryOperationLedgerRepository();
  await repo.save({
    schemaVersion: "1.0.0",
    operationId: PDT_PCPC_001_DRAFT_RECOVERY_001.parentCreateOperationId,
    requestHash: PDT_PCPC_001_DRAFT_RECOVERY_001.parentCreateRequestHash,
    attempts: 3,
    status: "SUCCEEDED",
    receipt: { providerResourceId: "4574349198", kind: "CREATE_DRAFT", metadata: { readBack: true } },
    recoveryPoint: "PROVIDER_READ_BACK",
    createdAt: "2026-09-13T07:08:25.546Z",
    updatedAt: NOW
  });
  return repo;
}

function listing() {
  return {
    listing_id: 4574349198,
    shop_id: 23582741,
    state: "draft",
    title: PDT_PCPC_001_G01_V01.title,
    description: PDT_PCPC_001_G01_V01.description,
    price: { amount: 1290, divisor: 100, currency_code: "USD" },
    taxonomy_id: PDT_PCPC_001_G01_V01.taxonomyId,
    quantity: PDT_PCPC_001_G01_V01.quantity,
    who_made: PDT_PCPC_001_G01_V01.whoMade,
    when_made: PDT_PCPC_001_G01_V01.whenMade,
    listing_type: PDT_PCPC_001_G01_V01.listingType,
    tags: [...PDT_PCPC_001_G01_V01.tags]
  };
}

function ok(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

const fetchEmptyState: typeof fetch = async (input) => {
  const url = String(input);
  if (url.endsWith("/4574349198")) return ok(listing());
  if (url.includes("/4574349198/")) return ok({ count: 0, results: [] });
  return new Response(null, { status: 404 });
};

async function withEnv<T>(fn: () => Promise<T>) {
  const prior = {
    shop: process.env.ETSY_SHOP_ID,
    key: process.env.ETSY_API_KEY,
    shared: process.env.ETSY_SHARED_SECRET
  };
  process.env.ETSY_SHOP_ID = "23582741";
  process.env.ETSY_API_KEY = "k";
  process.env.ETSY_SHARED_SECRET = "s";
  try { return await fn(); }
  finally {
    if (prior.shop === undefined) delete process.env.ETSY_SHOP_ID; else process.env.ETSY_SHOP_ID = prior.shop;
    if (prior.key === undefined) delete process.env.ETSY_API_KEY; else process.env.ETSY_API_KEY = prior.key;
    if (prior.shared === undefined) delete process.env.ETSY_SHARED_SECRET; else process.env.ETSY_SHARED_SECRET = prior.shared;
  }
}

test("PCPC recovery route is GET-only", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /export async function GET\(/);
  assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)\(/);
});

test("PCPC recovery verifier returns fresh PSV only for exact reconciled empty draft", async () => {
  await withEnv(async () => {
    const response = await verifyPdtPcpc001DraftRecovery001ProtectedState({
      repository: await repoWithParent(),
      fetchImpl: fetchEmptyState,
      getAccessToken: async () => "token"
    });
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.status, "PROTECTED_STATE_MATCH");
    assert.equal(body.ETSY_WRITE_COUNT, 0);
    assert.equal(body.draftListingId, "4574349198");
    assert.equal(body.galleryCount, 0);
    assert.equal(body.buyerFileCount, 0);
    assert.equal(body.videoCount, 0);
    assert.equal(body.parentDownstreamOperationCount, 0);
    assert.equal(body.forbiddenMutation, "CREATE_DRAFT");
    assert.equal(body.listingFingerprint, PDT_PCPC_001_G01_V01_LISTING_FINGERPRINT);
    assert.match(String(body.protectedStateFingerprint), /^[a-f0-9]{64}$/);
  });
});

test("PCPC recovery verifier fails closed when original downstream already started", async () => {
  await withEnv(async () => {
    const repo = await repoWithParent();
    await repo.save({
      schemaVersion: "1.0.0",
      operationId: `${PDT_PCPC_001_G01_V01.operationId}:IMAGE:01`,
      requestHash: "a".repeat(64),
      attempts: 1,
      status: "SUCCEEDED",
      receipt: { providerResourceId: "123", kind: "UPLOAD_IMAGE" },
      createdAt: NOW,
      updatedAt: NOW
    });
    const response = await verifyPdtPcpc001DraftRecovery001ProtectedState({
      repository: repo,
      fetchImpl: fetchEmptyState,
      getAccessToken: async () => "token"
    });
    assert.equal(response.status, 409);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.error, "PDT_PCPC_001_RECOVERY_PARENT_DOWNSTREAM_ALREADY_STARTED");
    assert.equal(body.ETSY_WRITE_COUNT, 0);
  });
});
