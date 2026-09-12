import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  exactPdtBpsc001C09Recovery001Body,
  PDT_BPSC_001_C09_RECOVERY_001,
  pdtBpsc001C09Recovery001AuthorizationRequestHash,
  verifyPdtBpsc001C09Recovery001ProtectedState
} from "../lib/pdt-bpsc-001-c09-recovery-001";
import { PDT_BPSC_001_C09, PDT_BPSC_001_C09_LISTING_FINGERPRINT } from "../lib/pdt-bpsc-001-c09-new-listing";
import { MemoryOperationLedgerRepository, OPERATION_LEDGER_SCHEMA_VERSION } from "../lib/operation-ledger";

const PARENT_CREATE_REQUEST_HASH = "31099794bf0c24917ec26ab806c10681153cbb1983bb7fb772a8301a1f28d887";

function exactDraft() {
  return {
    listing_id: 4573789186,
    shop_id: 23582741,
    state: "draft",
    title: PDT_BPSC_001_C09.title,
    description: PDT_BPSC_001_C09.description,
    price: { amount: 1290, divisor: 100, currency_code: "USD" },
    taxonomy_id: PDT_BPSC_001_C09.taxonomyId,
    who_made: PDT_BPSC_001_C09.whoMade,
    when_made: PDT_BPSC_001_C09.whenMade,
    listing_type: "download",
    quantity: PDT_BPSC_001_C09.quantity,
    tags: [...PDT_BPSC_001_C09.tags]
  };
}

async function parentRepository() {
  const repository = new MemoryOperationLedgerRepository();
  await repository.save({
    schemaVersion: OPERATION_LEDGER_SCHEMA_VERSION,
    operationId: `${PDT_BPSC_001_C09.operationId}:CREATE_DRAFT`,
    requestHash: PARENT_CREATE_REQUEST_HASH,
    attempts: 2,
    status: "RECONCILIATION_REQUIRED",
    recoveryPoint: "PROVIDER_READ_BACK",
    createdAt: "2026-09-12T07:20:02.545Z",
    updatedAt: "2026-09-12T07:20:02.545Z"
  });
  return repository;
}

function fetchState(images: unknown[] = [], files: unknown[] = []) {
  return async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/listings/4573789186")) {
      return new Response(JSON.stringify(exactDraft()), { status: 200 });
    }
    if (url.endsWith("/listings/4573789186/images")) {
      return new Response(JSON.stringify({ count: images.length, results: images }), { status: 200 });
    }
    if (url.endsWith("/shops/23582741/listings/4573789186/files")) {
      return new Response(JSON.stringify({ count: files.length, results: files }), { status: 200 });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
}

function installTestEtsyConfig() {
  const prior = {
    shopId: process.env.ETSY_SHOP_ID,
    apiKey: process.env.ETSY_API_KEY,
    sharedSecret: process.env.ETSY_SHARED_SECRET
  };
  process.env.ETSY_SHOP_ID = "23582741";
  process.env.ETSY_API_KEY = "test-api-key";
  process.env.ETSY_SHARED_SECRET = "test-shared-secret";
  return () => {
    if (prior.shopId === undefined) delete process.env.ETSY_SHOP_ID;
    else process.env.ETSY_SHOP_ID = prior.shopId;
    if (prior.apiKey === undefined) delete process.env.ETSY_API_KEY;
    else process.env.ETSY_API_KEY = prior.apiKey;
    if (prior.sharedSecret === undefined) delete process.env.ETSY_SHARED_SECRET;
    else process.env.ETSY_SHARED_SECRET = prior.sharedSecret;
  };
}

test("C09 recovery is hard-bound to existing exact draft and never to draft creation", () => {
  assert.equal(PDT_BPSC_001_C09_RECOVERY_001.operationId, "PDT-BPSC-001-C09-RECOVERY-001");
  assert.equal(PDT_BPSC_001_C09_RECOVERY_001.parentOperationId, "PDT-BPSC-001-C09-NEW-LISTING-001");
  assert.equal(PDT_BPSC_001_C09_RECOVERY_001.draftListingId, "4573789186");
  assert.equal(PDT_BPSC_001_C09_RECOVERY_001.candidateFingerprint, PDT_BPSC_001_C09.candidateFingerprint);
  assert.equal(PDT_BPSC_001_C09_RECOVERY_001.listingFingerprint, PDT_BPSC_001_C09_LISTING_FINGERPRINT);
  assert.match(PDT_BPSC_001_C09_RECOVERY_001.recoveryScope, /UPLOAD_EXACT_10_GALLERY_PLUS_5_BUYER_FILES_THEN_PUBLISH_EXISTING_DRAFT_ONLY/);
});

test("fresh recovery protected-state verification matches exact draft with 0 gallery and 0 buyer files", async () => {
  const restore = installTestEtsyConfig();
  try {
    const response = await verifyPdtBpsc001C09Recovery001ProtectedState({
      repository: await parentRepository(),
      getAccessToken: async () => "test-token",
      fetchImpl: fetchState() as typeof fetch
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.status, "PROTECTED_STATE_MATCH");
    assert.equal(payload.draftListingId, "4573789186");
    assert.equal(payload.galleryCount, 0);
    assert.equal(payload.buyerFileCount, 0);
    assert.equal(payload.ETSY_WRITE_COUNT, 0);
    assert.match(payload.protectedStateFingerprint, /^[a-f0-9]{64}$/);
  } finally {
    restore();
  }
});

test("recovery protected-state verification fails closed if draft already has an asset", async () => {
  const restore = installTestEtsyConfig();
  try {
    const response = await verifyPdtBpsc001C09Recovery001ProtectedState({
      repository: await parentRepository(),
      getAccessToken: async () => "test-token",
      fetchImpl: fetchState([{ listing_image_id: 1, rank: 1 }]) as typeof fetch
    });
    const payload = await response.json();
    assert.equal(response.status, 409);
    assert.equal(payload.status, "PROTECTED_STATE_MISMATCH");
    assert.equal(payload.ETSY_WRITE_COUNT, 0);
  } finally {
    restore();
  }
});

test("authorization request hash binds authorization id and fresh protected state", () => {
  const auth = "PDT-BPSC-001-C09-RECOVERY-AUTH-TEST";
  const a = "a".repeat(64);
  const b = "b".repeat(64);
  const body = exactPdtBpsc001C09Recovery001Body(auth, a);
  assert.equal(body.draftListingId, "4573789186");
  assert.equal(body.candidateFingerprint, PDT_BPSC_001_C09.candidateFingerprint);
  assert.notEqual(
    pdtBpsc001C09Recovery001AuthorizationRequestHash(auth, a),
    pdtBpsc001C09Recovery001AuthorizationRequestHash(auth, b)
  );
});

test("dedicated recovery ingress and workflow keep write token server-side and forbid generic fallback", async () => {
  const route = await readFile(new URL("../app/api/internal/etsy/pdt-bpsc-001/c09/recovery-001/route.ts", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/pdt-bpsc-001-c09-recovery-001.yml", import.meta.url), "utf8");
  const recovery = await readFile(new URL("../lib/pdt-bpsc-001-c09-recovery-001.ts", import.meta.url), "utf8");

  assert.match(route, /PDT-BPSC-001-C09-RECOVERY-001|PDT_BPSC_001_C09_RECOVERY_001/);
  assert.match(route, /token\.actions\.githubusercontent\.com/);
  assert.match(route, /pdt-bpsc-001-c09-recovery-001\.yml@refs\/heads\/main/);
  assert.match(route, /process\.env\.ETSY_B01_WRITE_TOKEN/);
  assert.match(route, /verifyPdtBpsc001C09Recovery001ProtectedState/);
  assert.match(route, /handlePdtBpsc001C09Recovery001Safe/);
  assert.doesNotMatch(route, /api\.etsy\.com/);

  assert.match(workflow, /PDT-BPSC-001-C09-RECOVERY-001/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /verify_protected_state/);
  assert.match(workflow, /RECONCILIATION_REQUIRED_DO_NOT_RETRY/);
  assert.doesNotMatch(workflow, /ETSY_B01_WRITE_TOKEN/);
  assert.doesNotMatch(workflow, /api\.etsy\.com/);

  assert.match(recovery, /loadAuthorizedAsset\(PARENT_OPERATION_ID, asset\.sha256\)/);
  assert.match(recovery, /DRAFT_LISTING_ID = "4573789186"/);
  assert.doesNotMatch(recovery, /shops\/\$\{PDT_BPSC_001_C09\.shopId\}\/listings`,\s*\{\s*method:\s*"POST"/);
});
