import assert from "node:assert/strict";
import test from "node:test";
import { GET, POST } from "../app/api/etsy/chatgpt-handoff-qc/route";

const HEADER = "x-autodigitalpublisher-write-token";
function input() {
  return {
    schemaVersion: "1.0.0", origin: "CHATGPT_PRODUCED",
    productId: "PDT-TEST-QC", deliveryType: "INSTANT_DOWNLOAD",
    listing: {
      title: "An Original Digital Printable",
      description: "Printable activities. Created with the assistance of AI.",
      sellerOriginalDesignAsserted: true, aiUsed: true,
      aiDisclosureText: "Created with the assistance of AI."
    },
    buyerFiles: [{ filename: "buyer.zip", expectedBytes: 120, sha256: "a".repeat(64) }],
    gallery: [{ filename: "preview.png", expectedBytes: 500, sha256: "b".repeat(64) }],
    buyerInstructions: "Unzip the files and print them at 100%."
  };
}
function request(data: unknown, token?: string) {
  return new Request("https://preview.example/api/etsy/chatgpt-handoff-qc", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { [HEADER]: token } : {}) },
    body: JSON.stringify(data)
  });
}
test("handoff QC GET cannot claim file bytes or publish", async () => {
  const res = await GET();
  const value = await res.json();
  assert.equal(value.acceptsActualFileBytes, false);
  assert.equal(value.createsEtsyDraft, false);
  assert.equal(value.publishesEtsyListing, false);
  assert.equal(value.ETSY_WRITE_COUNT, 0);
});
test("handoff QC refuses unauthenticated access", async () => {
  const original = process.env.ETSY_CHAT_SOURCE_PREFLIGHT_TOKEN;
  process.env.ETSY_CHAT_SOURCE_PREFLIGHT_TOKEN = "read-only-qc-secret";
  try {
    const res = await POST(request(input()));
    const value = await res.json();
    assert.equal(res.status, 401);
    assert.equal(value.ETSY_WRITE_COUNT, 0);
  } finally {
    if (original === undefined) delete process.env.ETSY_CHAT_SOURCE_PREFLIGHT_TOKEN;
    else process.env.ETSY_CHAT_SOURCE_PREFLIGHT_TOKEN = original;
  }
});
test("handoff QC preflight validates metadata without claiming final QC", async () => {
  const original = process.env.ETSY_CHAT_SOURCE_PREFLIGHT_TOKEN;
  process.env.ETSY_CHAT_SOURCE_PREFLIGHT_TOKEN = "read-only-qc-secret";
  try {
    const res = await POST(request(input(), "read-only-qc-secret"));
    const value = await res.json();
    assert.equal(res.status, 200);
    assert.equal(value.status, "METADATA_REVIEW_REQUIRED");
    assert.equal(value.actualBuyerFileBytesVerified, false);
    assert.equal(value.independentFinalQcVerified, false);
    assert.equal(value.publishAuthorized, false);
    assert.equal(value.ETSY_WRITE_COUNT, 0);
    const notReady = input();
    notReady.buyerFiles[0].filename = "spreadsheet.xlsx";
    const denied = await POST(request(notReady, "read-only-qc-secret"));
    const report = await denied.json();
    assert.equal(denied.status, 422);
    assert.ok(report.issues.includes("BUYER_FILE_TYPE_NOT_SUPPORTED_BY_ETSY"));
    assert.equal(report.ETSY_WRITE_COUNT, 0);
  } finally {
    if (original === undefined) delete process.env.ETSY_CHAT_SOURCE_PREFLIGHT_TOKEN;
    else process.env.ETSY_CHAT_SOURCE_PREFLIGHT_TOKEN = original;
  }
});
