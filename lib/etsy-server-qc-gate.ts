// Read-only, server-pinned reviewer evidence gate for marketplace mutations.
// Caller-supplied qc.state === QC_PASSED is not authoritative.
// The reviewer MUST independently verify the exact current Google Drive
// artifact set and report before configuring the server-side pins.
const SHA = /^[a-f0-9]{64}$/;
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;

export type ServerQcCandidate = {
  productId: string;
  candidateFingerprint: string;
  expectedListingFingerprint: string;
};

export function hasServerVerifiedQc(candidate: ServerQcCandidate): boolean {
  const values = {
    productId: process.env.ETSY_QC_APPROVED_PRODUCT_ID?.trim(),
    candidateFingerprint: process.env.ETSY_QC_APPROVED_CANDIDATE_FINGERPRINT?.trim(),
    listingFingerprint: process.env.ETSY_QC_APPROVED_LISTING_FINGERPRINT?.trim(),
    reportSha256: process.env.ETSY_QC_APPROVED_REPORT_SHA256?.trim(),
    reportDriveId: process.env.ETSY_QC_APPROVED_REPORT_DRIVE_ID?.trim()
  };
  return Boolean(
    values.productId && values.productId === candidate.productId &&
    values.candidateFingerprint && SHA.test(values.candidateFingerprint) &&
    values.candidateFingerprint === candidate.candidateFingerprint &&
    values.listingFingerprint && SHA.test(values.listingFingerprint) &&
    values.listingFingerprint === candidate.expectedListingFingerprint &&
    values.reportSha256 && SHA.test(values.reportSha256) &&
    values.reportDriveId && DRIVE_ID.test(values.reportDriveId)
  );
}
