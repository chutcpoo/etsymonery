// Evidence belongs to a reviewed server record. Never build it from request JSON,
// legacy release locks, product-plan scores or caller-supplied identities.
export type ReleaseTarget = {
  shopId: number;
  productId: string;
  candidateSha256: string; // frozen manifest including description, previews and buyer-file hashes
  operation: "draft" | "publish";
};
export type ReviewEvidence = ReleaseTarget & {
  creator: string;
  seller: string;
  reviewer: string;
  originalSourceSha256: string;
  rightsRecordSha256: string;
  humanContributionSha256: string;
  contentReviewSha256: string;
  digitalContent: "seller-original" | "ai-prompt-bundle" | "third-party-compilation" | "ai-functional-instructions" | "prohibited" | "unknown";
  aiUse: "none" | "seller-directed" | "automated" | "unknown";
  listingDisclosureSha256?: string;
  buyerFileSetSha256: string;
  previewSetSha256: string;
  previewAndDeliveryAuditSha256: string;
  qcReportSha256: string;
  sellerApprovalSha256: string;
};

const digest = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const identity = (value: unknown) => typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,127}$/.test(value);

export function assessEtsyRelease(target?: ReleaseTarget, record?: ReviewEvidence) {
  const missing: string[] = [];
  if (!target || !record || !Number.isSafeInteger(target.shopId) || target.shopId < 1 ||
      !target.productId?.trim() || !digest(target.candidateSha256) ||
      !["draft", "publish"].includes(target.operation) || record.shopId !== target.shopId ||
      record.productId !== target.productId || record.candidateSha256 !== target.candidateSha256 ||
      record.operation !== target.operation) missing.push("EXACT_SHOP_CANDIDATE_OPERATION");
  if (!digest(record?.originalSourceSha256)) missing.push("ORIGINAL_SOURCE");
  if (!digest(record?.rightsRecordSha256)) missing.push("RIGHTS_AND_LICENSES");
  if (!identity(record?.creator) || !digest(record?.humanContributionSha256)) missing.push("ITEM_SPECIFIC_HUMAN_CONTRIBUTION");
  if (record?.digitalContent !== "seller-original" || !digest(record?.contentReviewSha256)) missing.push("ELIGIBLE_DIGITAL_CONTENT");
  if (record?.aiUse !== "none" && !(record?.aiUse === "seller-directed" && digest(record.listingDisclosureSha256))) missing.push("AI_USE_AND_LISTING_DISCLOSURE");
  if (!digest(record?.buyerFileSetSha256) || !digest(record?.previewSetSha256) || !digest(record?.previewAndDeliveryAuditSha256)) missing.push("ACCURATE_IMAGES_AND_DELIVERED_FILES");
  if (!identity(record?.reviewer) || record?.reviewer === record?.creator || record?.reviewer === record?.seller ||
      !digest(record?.qcReportSha256)) missing.push("INDEPENDENT_QC");
  if (!identity(record?.seller) || !digest(record?.sellerApprovalSha256)) missing.push("SELLER_APPROVAL_FOR_OPERATION");
  return { status: missing.length ? "BLOCKED" as const : "PASS" as const, missing, marketplaceWritesEnabled: false as const };
}

// Entries are added only after checking the evidence files, actor identities,
// item classification and seller authorization in the owner's evidence store.
const verifiedReviews: readonly ReviewEvidence[] = [];

export function reviewMarketplaceRequest(headers: Headers, operation: "draft" | "publish") {
  const target: ReleaseTarget = {
    shopId: Number(process.env.ETSY_SHOP_ID),
    productId: headers.get("x-product-id") ?? "",
    candidateSha256: headers.get("x-candidate-sha256") ?? "",
    operation
  };
  const record = verifiedReviews.find((item) => item.shopId === target.shopId &&
    item.productId === target.productId && item.operation === target.operation &&
    item.candidateSha256 === target.candidateSha256);
  return assessEtsyRelease(target, record);
}
