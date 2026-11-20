import test from "node:test";
import assert from "node:assert/strict";
import { assessEtsyRelease, type ReviewEvidence } from "../lib/etsy-policy";

const hash = "a".repeat(64);
const evidence: ReviewEvidence = {
  shopId: 123, productId: "fixture", operation: "draft", candidateSha256: hash,
  creator: "artist", seller: "shop-owner", reviewer: "reviewer",
  originalSourceSha256: hash, rightsRecordSha256: hash, humanContributionSha256: hash,
  contentReviewSha256: hash, digitalContent: "seller-original", aiUse: "none",
  buyerFileSetSha256: hash, previewSetSha256: hash, previewAndDeliveryAuditSha256: hash, qcReportSha256: hash, sellerApprovalSha256: hash
};
test("complete human or disclosed seller-directed work can pass evidence review with writes locked", () => {
  for (const record of [evidence, { ...evidence, aiUse: "seller-directed" as const, listingDisclosureSha256: hash }])
    assert.deepEqual(assessEtsyRelease(evidence, record), { status: "PASS", missing: [], marketplaceWritesEnabled: false });
});
test("each absent receipt, prohibited item, missing AI disclosure or stale authorization blocks release", () => {
  for (const key of Object.keys(evidence)) {
    const partial = { ...evidence };
    Reflect.deleteProperty(partial, key);
    assert.equal(assessEtsyRelease(evidence, partial).status, "BLOCKED", key);
  }
  for (const change of [
    { digitalContent: "ai-prompt-bundle" }, { digitalContent: "ai-functional-instructions" },
    { digitalContent: "third-party-compilation" }, { digitalContent: "prohibited" },
    { aiUse: "automated" }, { aiUse: "seller-directed" }, { reviewer: evidence.creator },
    { reviewer: evidence.seller }, { operation: "publish" }, { shopId: 888 },
    { productId: "different" }, { candidateSha256: "b".repeat(64) }
  ] as Partial<ReviewEvidence>[]) assert.equal(assessEtsyRelease(evidence, { ...evidence, ...change }).status, "BLOCKED");
});
