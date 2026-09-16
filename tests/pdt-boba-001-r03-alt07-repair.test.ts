import assert from "node:assert/strict";
import test from "node:test";
import {
  PDT_BOBA_001_R03_ALT07_REPAIR,
  exactPdtBoba001R03Alt07AuthorizationHash,
  handlePdtBoba001R03Alt07Repair,
  verifyPdtBoba001R03Alt07ProtectedState
} from "../lib/pdt-boba-001-r03-alt07-repair";
import { MemoryOperationLedgerRepository } from "../lib/operation-ledger";

const WRONG = PDT_BOBA_001_R03_ALT07_REPAIR.expectedWrongAltText;
const TARGET = PDT_BOBA_001_R03_ALT07_REPAIR.targetAltText;

function listing() {
  return {
    listing_id: 4560696421,
    shop_id: 23582741,
    state: "active",
    title: "Boba Shop Operations Toolkit, Cafe Daily SOP, Checklist, Excel Google Sheets Template (Digital Download)",
    description: "Product: PDT-BOBA-001 V1",
    price: { amount: 1290, divisor: 100, currency_code: "USD" },
    quantity: 999,
    taxonomy_id: 12476,
    who_made: "i_did",
    when_made: "2020_2026",
    listing_type: "download",
    tags: ["boba checklist", "bubble tea template"]
  };
}

function images(alt07 = WRONG) {
  const ids = [8529888810, 8529888820, 8529888830, 8529888840, 8529888850, 8529888860, 8529888870, 8529888880, 8529888890];
  return ids.map((id, index) => ({
    listing_id: 4560696421,
    listing_image_id: id,
    rank: index + 1,
    full_width: 2500,
    full_height: 2000,
    alt_text: index === 6 ? alt07 : `alt-${index + 1}`
  }));
}

function files() {
  return [
    { listing_file_id: 1, rank: 1, filename: "PoonthaiDigital_Boba_Checklist_A4.pdf", size_bytes: 17459, filetype: "application/pdf" },
    { listing_file_id: 2, rank: 2, filename: "PoonthaiDigital_Boba_Checklist_US_Letter.pdf", size_bytes: 16632, filetype: "application/pdf" },
    { listing_file_id: 3, rank: 3, filename: "Boba_Read_Me_License.pdf", size_bytes: 4620, filetype: "application/pdf" },
    { listing_file_id: 4, rank: 4, filename: "Boba_Quick_Start.pdf", size_bytes: 4564, filetype: "application/pdf" },
    { listing_file_id: 5, rank: 5, filename: "PoonthaiDigital_Boba_Shop_Operations_Tracker.zip", size_bytes: 22264, filetype: "application/zip" }
  ];
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function mockFetch() {
  let repaired = false;
  let postCount = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "GET" && /\/listings\/4560696421$/.test(url)) return json(listing());
    if (method === "GET" && url.endsWith("/listings/4560696421/images")) return json({ count: 9, results: images(repaired ? TARGET : WRONG) });
    if (method === "GET" && url.endsWith("/shops/23582741/listings/4560696421/files")) return json({ count: 5, results: files() });
    if (method === "POST" && url.endsWith("/shops/23582741/listings/4560696421/images")) {
      postCount += 1;
      assert.ok(init?.body instanceof FormData);
      const form = init.body as FormData;
      assert.equal(form.get("listing_image_id"), "8529888870");
      assert.equal(form.get("rank"), "7");
      assert.equal(form.get("overwrite"), "true");
      assert.equal(form.get("alt_text"), TARGET);
      repaired = true;
      return json({ listing_image_id: 8529888870, rank: 7, alt_text: TARGET }, 201);
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
  return { fetchImpl, getPostCount: () => postCount };
}

test("protected-state verifier is read-only and returns the exact ALT07 defect", async () => {
  const mock = mockFetch();
  const response = await verifyPdtBoba001R03Alt07ProtectedState({
    fetchImpl: mock.fetchImpl,
    getAccessToken: async () => "token"
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "PROTECTED_STATE_MATCH");
  assert.equal(body.imageId, "8529888870");
  assert.equal(body.imageRank, 7);
  assert.equal(body.currentAltText, WRONG);
  assert.match(body.protectedStateFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(body.ETSY_WRITE_COUNT, 0);
  assert.equal(mock.getPostCount(), 0);
});

test("execute performs exactly one image metadata write and verifies all protected state", async () => {
  process.env.PUBLISH_WRITES_ENABLED = "true";
  process.env.ETSY_B01_WRITE_TOKEN = "write-token";
  process.env.ETSY_SHOP_ID = "23582741";

  const mock = mockFetch();
  const verifier = await verifyPdtBoba001R03Alt07ProtectedState({
    fetchImpl: mock.fetchImpl,
    getAccessToken: async () => "token"
  });
  const verified = await verifier.json();
  const protectedState = String(verified.protectedStateFingerprint);
  const authorizationId = "PDT-BOBA-001-R03-ALT07-AUTH-TEST-01";
  const authorizationHash = exactPdtBoba001R03Alt07AuthorizationHash(authorizationId, protectedState);
  const repository = new MemoryOperationLedgerRepository();
  const request = new Request("https://example.test/alt07", {
    method: "POST",
    headers: { "x-autodigitalpublisher-write-token": "write-token" }
  });

  const response = await handlePdtBoba001R03Alt07Repair(
    authorizationId,
    protectedState,
    authorizationHash,
    request,
    {
      fetchImpl: mock.fetchImpl,
      getAccessToken: async () => "token",
      repository,
      now: () => "2026-09-16T02:00:00.000Z"
    }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "UPDATED_AND_VERIFIED");
  assert.equal(body.providerWriteCount, 1);
  assert.equal(body.receipt.authorizationState, "CONSUMED");
  assert.equal(body.receipt.scope, "ALT_TEXT_IMAGE_07_ONLY");
  assert.equal(body.receipt.verified.alt07, "PASS");
  assert.equal(mock.getPostCount(), 1);
});

test("authorization binding mismatch fails before any Etsy write", async () => {
  process.env.PUBLISH_WRITES_ENABLED = "true";
  process.env.ETSY_B01_WRITE_TOKEN = "write-token";
  process.env.ETSY_SHOP_ID = "23582741";

  const mock = mockFetch();
  const verifier = await verifyPdtBoba001R03Alt07ProtectedState({ fetchImpl: mock.fetchImpl, getAccessToken: async () => "token" });
  const verified = await verifier.json();
  const request = new Request("https://example.test/alt07", {
    method: "POST",
    headers: { "x-autodigitalpublisher-write-token": "write-token" }
  });
  const response = await handlePdtBoba001R03Alt07Repair(
    "AUTH-ID",
    String(verified.protectedStateFingerprint),
    "0".repeat(64),
    request,
    { fetchImpl: mock.fetchImpl, getAccessToken: async () => "token", repository: new MemoryOperationLedgerRepository() }
  );
  assert.equal(response.status, 409);
  assert.equal(mock.getPostCount(), 0);
});
