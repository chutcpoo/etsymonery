import assert from "node:assert/strict";
import test from "node:test";
import { buyerFilenameIssue, inspectChatGptHandoff } from "../lib/etsy-digital-delivery-policy";
import { parseReleaseRequest } from "../lib/etsy-release-checkpoint";

const SHA = "a".repeat(64);
function handoff() {
  return {
    schemaVersion: "1.0.0",
    origin: "CHATGPT_PRODUCED",
    productId: "MY-FIRST-ABC-V3",
    deliveryType: "INSTANT_DOWNLOAD",
    listing: {
      title: "Original ABC Worksheets",
      description: "Original printable alphabet worksheets. Created with the assistance of AI.",
      sellerOriginalDesignAsserted: true,
      aiUsed: true,
      aiDisclosureText: "Created with the assistance of AI."
    },
    buyerFiles: [
      { filename: "ABC_US_Letter.pdf", expectedBytes: 12345, sha256: SHA },
      { filename: "ABC_A4.zip", expectedBytes: 45678, sha256: SHA }
    ],
    gallery: [{ filename: "01_ABC_Preview.jpg", expectedBytes: 10000, sha256: SHA }],
    buyerInstructions: "Print at 100% scale on Letter or A4 paper."
  };
}
test("valid handoff is metadata-only; not independent QC or permission to publish", () => {
  const r = inspectChatGptHandoff(handoff());
  assert.equal(r.status, "METADATA_REVIEW_REQUIRED");
  assert.deepEqual(r.issues, []);
  assert.equal(r.actualBuyerFileBytesVerified, false);
  assert.equal(r.galleryImageContentVerified, false);
  assert.equal(r.independentFinalQcVerified, false);
  assert.equal(r.etsyDraftReadbackVerified, false);
  assert.equal(r.publishAuthorized, false);
  assert.equal(r.ETSY_WRITE_COUNT, 0);
});
test("policy rejects unsupported direct .xlsx but permits .zip delivery", () => {
  assert.equal(buyerFilenameIssue("schedule.xlsx"), "BUYER_FILE_TYPE_NOT_SUPPORTED_BY_ETSY");
  assert.equal(buyerFilenameIssue("schedule.zip"), null);
  assert.equal(buyerFilenameIssue("worksheet.pdf"), null);
});
test("policy rejects 70+ names and unsupported filename characters", () => {
  assert.equal(buyerFilenameIssue("A".repeat(67)+".pdf"), "BUYER_FILE_NAME_EXCEEDS_ETSY_70_CHARS");
  assert.equal(buyerFilenameIssue("abc space.pdf"), "BUYER_FILE_NAME_UNSUPPORTED_CHARACTERS");
  assert.equal(buyerFilenameIssue("../secrets.pdf"), "BUYER_FILE_NAME_UNSUPPORTED_CHARACTERS");
  assert.equal(buyerFilenameIssue("ทดสอบ.pdf"), "BUYER_FILE_NAME_UNSUPPORTED_CHARACTERS");
});
test("policy blocks oversized buyer file, duplicate case-insensitive name, and wrong SHA", () => {
  const v = handoff();
  v.buyerFiles = [
    { filename: "ONE.pdf", expectedBytes: 20_000_001, sha256: "NO_HASH" },
    { filename: "one.pdf", expectedBytes: 6, sha256: SHA }
  ];
  const r = inspectChatGptHandoff(v);
  assert.equal(r.status, "BLOCKED");
  assert.ok(r.issues.includes("BUYER_FILE_SIZE_INVALID_OR_TOO_LARGE"));
  assert.ok(r.issues.includes("DUPLICATE_BUYER_FILE_NAME"));
  assert.ok(r.issues.includes("BUYER_FILE_SHA256_REQUIRED"));
});
test("policy blocks six direct digital files and missing gallery", () => {
  const v = handoff();
  v.buyerFiles = Array.from({ length: 6 }, (_, i) => ({
    filename: `F${i}.pdf`, expectedBytes: 5, sha256: SHA
  }));
  v.gallery = [];
  const r = inspectChatGptHandoff(v);
  assert.equal(r.status, "BLOCKED");
  assert.ok(r.issues.includes("ETSY_BUYER_FILE_COUNT_INVALID"));
  assert.ok(r.issues.includes("GALLERY_COUNT_INVALID"));
});
test("policy blocks missing AI disclosure in actual listing copy", () => {
  const v = handoff();
  v.listing.description = "Printable worksheets";
  const r = inspectChatGptHandoff(v);
  assert.ok(r.issues.includes("AI_USE_MUST_BE_DISCLOSED_IN_LISTING_DESCRIPTION"));
});
test("policy blocks unknown AI usage and lacking seller design assertion", () => {
  const v = handoff();
  (v.listing as {aiUsed:unknown}).aiUsed = undefined;
  v.listing.sellerOriginalDesignAsserted = false;
  const r = inspectChatGptHandoff(v);
  assert.ok(r.issues.includes("AI_USAGE_DECLARATION_REQUIRED"));
  assert.ok(r.issues.includes("SELLER_ORIGINAL_DESIGN_ATTESTATION_REQUIRED"));
});
test("release parser also refuses buyer filenames Etsy will reject", () => {
  const base = {
    action: "PREFLIGHT", operationId: "P1", productId: "P01",
    candidateId: "C1", candidateFingerprint: SHA, expectedListingFingerprint: SHA,
    shopId: 23582741, draftListingId: 123, expectedImageCount: 1
  };
  assert.throws(() => parseReleaseRequest({
    ...base, expectedBuyerFileNames: ["not direct.xlsx"]
  }), /INVALID_EXPECTED_BUYER_FILES/);
  assert.equal(parseReleaseRequest({
    ...base, expectedBuyerFileNames: ["Printable.zip"]
  }).expectedBuyerFileNames[0], "Printable.zip");
});
