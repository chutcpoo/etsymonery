import assert from "node:assert/strict";
import test from "node:test";
import { hasServerVerifiedQc } from "../lib/etsy-server-qc-gate";

const keys = [
  "ETSY_QC_APPROVED_PRODUCT_ID", "ETSY_QC_APPROVED_CANDIDATE_FINGERPRINT",
  "ETSY_QC_APPROVED_LISTING_FINGERPRINT", "ETSY_QC_APPROVED_REPORT_SHA256",
  "ETSY_QC_APPROVED_REPORT_DRIVE_ID"
];
const candidate = {
  productId:"PDT-PILOT-001",
  candidateFingerprint:"a".repeat(64),
  expectedListingFingerprint:"b".repeat(64)
};

test("client QC=true never counts as server-reviewed QC without all exact pins",()=>{
  const original = Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try{
    keys.forEach(k=>delete process.env[k]);
    assert.equal(hasServerVerifiedQc(candidate),false);
    process.env.ETSY_QC_APPROVED_PRODUCT_ID=candidate.productId;
    process.env.ETSY_QC_APPROVED_CANDIDATE_FINGERPRINT=candidate.candidateFingerprint;
    process.env.ETSY_QC_APPROVED_LISTING_FINGERPRINT=candidate.expectedListingFingerprint;
    process.env.ETSY_QC_APPROVED_REPORT_SHA256="c".repeat(64);
    assert.equal(hasServerVerifiedQc(candidate),false);
    process.env.ETSY_QC_APPROVED_REPORT_DRIVE_ID="1FakedApprovedReviewReportID1234";
    assert.equal(hasServerVerifiedQc(candidate),true);
    assert.equal(hasServerVerifiedQc({...candidate,productId:"PDT-OTHER"}),false);
    assert.equal(hasServerVerifiedQc({...candidate,expectedListingFingerprint:"d".repeat(64)}),false);
    process.env.ETSY_QC_APPROVED_REPORT_SHA256="fake-report";
    assert.equal(hasServerVerifiedQc(candidate),false);
  } finally{
    for(const k of keys) {
      const v=original[k];
      if(v===undefined)delete process.env[k];else process.env[k]=v;
    }
  }
});
