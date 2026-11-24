import test from "node:test";
import { emptyVisual, visualWeights } from "../lib/mosselorastudio-visual-dna";
import assert from "node:assert/strict";
import {
  evaluateProductReleaseEvidence,
  type ProductReleaseCandidate,
  type ProductQaCase,
  type ProductPlatform,
  type QaScope
} from "../lib/product-release-evidence";

const fingerprint = "a".repeat(64);
function caseFor(
  id: string, scope: QaScope, platform: ProductPlatform | "ALL",
  requirementId?: string, claimId?: string
): ProductQaCase {
  return {
    id, scope, platform, ...(requirementId ? { requirementId } : {}),
    ...(claimId ? { claimId } : {}),
    result: "PASS", expected: "Verified scenario output", actual: "Verified scenario output",
    evidenceUrl: "https://docs.google.com/document/d/qa-evidence/edit",
    testedAt: "2026-11-24T09:00:00+07:00", testedFingerprint: fingerprint
  };
}
function completeVisual() {
  const v=emptyVisual(fingerprint);
  const url="https://drive.google.com/file/d/synthetic-test-fixture/view";
  v.images=v.images.map(i=>({...i,headline:"Synthetic headline",benefit:"Synthetic benefit",input:"Input",output:"Output",action:"Decision",screenshotUrl:url,requirementId:"R01",testId:"T01-excel",result:"PASS"}));
  for(const [key,max] of Object.entries(visualWeights)) v.checks[key]={expected:"Expected",actual:"Actual",result:"PASS",evidenceUrl:url,tester:"Synthetic test",testedAt:"2026-11-24T00:00:00Z",score:max};
  return v;
}
function validCandidate(): ProductReleaseCandidate {
  return {
    productId: "M11",
    shop: "MosseloraStudio",
    visualEvidence: completeVisual(),
    targetBuyer: "Wedding florist handling multiple events",
    customerProblem: "Cannot reliably identify unallocated usable stems per event",
    promisedDecision: "Show shortage and same-flower available stock before ordering",
    researchEvidenceUrl: "https://docs.google.com/document/d/market-research/edit",
    supportedPlatforms: ["EXCEL", "GOOGLE_SHEETS"],
    fingerprint,
    requirements: [{
      id: "R01", buyerScenario: "Allocate 113 usable stems for a 120-stem event",
      expectedOutcome: "Show 7 stems short without counting pending substitutes",
      platforms: ["EXCEL", "GOOGLE_SHEETS"]
    }],
    claims: [{ id: "C01", requirementId: "R01", text: "Track event shortages" }],
    qaCases: [
      caseFor("T01-excel", "FUNCTIONAL", "EXCEL", "R01"),
      caseFor("T01-sheets", "FUNCTIONAL", "GOOGLE_SHEETS", "R01"),
      caseFor("T08-excel", "NEGATIVE", "EXCEL", "R01"),
      caseFor("T08-sheets", "NEGATIVE", "GOOGLE_SHEETS", "R01"),
      caseFor("buyer-excel", "BUYER_ACCESS", "EXCEL"),
      caseFor("buyer-sheets", "BUYER_ACCESS", "GOOGLE_SHEETS"),
      caseFor("zip-download", "DELIVERY", "ALL"),
      caseFor("listing-screenshot", "LISTING_CLAIM", "ALL", "R01", "C01")
    ],
    openCriticalDefects: 0,
    approval: {
      approvedBy: "Shop owner", approvedAt: "2026-11-24T10:00:00+07:00", fingerprint
    }
  };
}

test("complete buyer outcome and platform evidence can pass a pure release contract", () => {
  const result = evaluateProductReleaseEvidence(validCandidate());
  assert.equal(result.readyForOwnerRelease, true);
  assert.equal(result.evaluatedTestCount, 8);
  assert.deepEqual(result.blockers, []);
});

test("Google Sheets computation cannot inherit an Excel pass", () => {
  const value = validCandidate();
  value.qaCases = value.qaCases.filter(t => t.id !== "T01-sheets");
  const result = evaluateProductReleaseEvidence(value);
  assert.equal(result.readyForOwnerRelease, false);
  assert.ok(result.blockers.includes("FUNCTIONAL_TEST_MISSING_R01_GOOGLE_SHEETS"));
});

test("buyer Google copy/access test is a mandatory separate gate", () => {
  const value = validCandidate();
  value.qaCases = value.qaCases.filter(t => t.id !== "buyer-sheets");
  const result = evaluateProductReleaseEvidence(value);
  assert.ok(result.blockers.includes("BUYER_ACCESS_TEST_MISSING_GOOGLE_SHEETS"));
});

test("NOT_VERIFIED, FAIL or BLOCKED are never treated as PASS", () => {
  for (const status of ["NOT_VERIFIED", "FAIL", "BLOCKED"] as const) {
    const value = validCandidate();
    value.qaCases = value.qaCases.map(t =>
      t.id === "T01-excel" ? { ...t, result: status } : t);
    const result = evaluateProductReleaseEvidence(value);
    assert.ok(result.blockers.includes("QA_NOT_PASS_T01-excel"));
    assert.ok(result.blockers.includes("FUNCTIONAL_TEST_MISSING_R01_EXCEL"));
  }
});

test("a PASS assertion without matching actual and expected is blocked", () => {
  const value = validCandidate();
  value.qaCases = value.qaCases.map(t =>
    t.id === "T01-excel" ? { ...t, actual: "Incorrect" } : t);
  assert.ok(evaluateProductReleaseEvidence(value).blockers
    .includes("QA_EXPECTED_ACTUAL_MISMATCH_T01-excel"));
});

test("evidence from a different file fingerprint is not accepted", () => {
  const value = validCandidate();
  value.qaCases = value.qaCases.map(t =>
    t.id === "buyer-sheets" ? { ...t, testedFingerprint: "b".repeat(64) } : t);
  const result = evaluateProductReleaseEvidence(value);
  assert.ok(result.blockers.includes("STALE_QA_FINGERPRINT_buyer-sheets"));
  assert.ok(result.blockers.includes("BUYER_ACCESS_TEST_MISSING_GOOGLE_SHEETS"));
});

test("an untested listing promise blocks customer release", () => {
  const value = validCandidate();
  value.claims = [...value.claims, { id: "C02", requirementId: "R01", text: "No manual allocation required" }];
  assert.ok(evaluateProductReleaseEvidence(value).blockers.includes("LISTING_CLAIM_TEST_MISSING_C02"));
});

test("unsupported marketing claims cannot be used to pass", () => {
  const value = validCandidate();
  value.claims = [{ id: "C01", requirementId: "R99", text: "Automatic marketplace synchronization" }];
  const result = evaluateProductReleaseEvidence(value);
  assert.ok(result.blockers.includes("UNSUPPORTED_LISTING_CLAIM_C01"));
});

test("approval must match exact tested candidate", () => {
  const value = validCandidate();
  value.approval = { approvedBy: "Shop owner", approvedAt: "2026-11-24", fingerprint: "b".repeat(64) };
  const result = evaluateProductReleaseEvidence(value);
  assert.ok(result.blockers.includes("OWNER_APPROVAL_FOR_CURRENT_BUILD_REQUIRED"));
});

test("open critical defects and missing customer outcome remain blockers", () => {
  const value = validCandidate();
  value.openCriticalDefects = 1;
  value.promisedDecision = "";
  value.researchEvidenceUrl = "";
  const result = evaluateProductReleaseEvidence(value);
  for (const code of ["OPEN_CRITICAL_DEFECTS", "BUYER_OUTCOME_CONTRACT_REQUIRED", "MARKET_EVIDENCE_REQUIRED"]) {
    assert.ok(result.blockers.includes(code));
  }
});

test("document-only products do not require spreadsheet negative tests", () => {
  const value = validCandidate();
  value.productId = "DOC01";
  value.shop = "PoonthaiDigital";
  value.visualEvidence = undefined;
  value.supportedPlatforms = ["WORD_DOCS"];
  value.requirements = [{ ...value.requirements[0], platforms: ["WORD_DOCS"] }];
  value.qaCases = [
    caseFor("docs-functional", "FUNCTIONAL", "WORD_DOCS", "R01"),
    caseFor("docs-buyer", "BUYER_ACCESS", "WORD_DOCS"),
    caseFor("docs-delivery", "DELIVERY", "ALL"),
    caseFor("docs-claims", "LISTING_CLAIM", "ALL", "R01", "C01")
  ];
  assert.equal(evaluateProductReleaseEvidence(value).readyForOwnerRelease, true);
});

test("missing ZIP delivery evidence must block even with functional passes", () => {
  const value = validCandidate();
  value.qaCases = value.qaCases.filter(t => t.scope !== "DELIVERY");
  assert.ok(evaluateProductReleaseEvidence(value).blockers.includes("CUSTOMER_DELIVERY_TEST_MISSING"));
});

test("duplicated test IDs and absent dated evidence cannot pass", () => {
  const value = validCandidate();
  value.qaCases = [
    ...value.qaCases,
    { ...caseFor("T01-excel", "FUNCTIONAL", "EXCEL", "R01"), evidenceUrl: "invalid" }
  ];
  const result = evaluateProductReleaseEvidence(value);
  assert.ok(result.blockers.includes("DUPLICATE_QA_TEST_IDS"));
  assert.ok(result.blockers.includes("QA_EVIDENCE_MISSING_T01-excel"));
});
