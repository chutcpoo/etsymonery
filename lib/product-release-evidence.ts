/**
 * Product-release evidence contract for Product Factory issue #298.
 *
 * Pure validation only: recording PASS is not proof that the test ran.
 * A reviewer must inspect evidence on the actual Excel/Sheets runtime and
 * a buyer account. Do not call this a live Etsy verification.
 *
 * This module does NOT mutate workflow state, Neon, Drive or Etsy.
 */
export const PRODUCT_PLATFORMS = ["EXCEL", "GOOGLE_SHEETS", "WORD_DOCS"] as const;
export type ProductPlatform = typeof PRODUCT_PLATFORMS[number];
export const QA_SCOPES = ["FUNCTIONAL", "NEGATIVE", "BUYER_ACCESS", "DELIVERY", "LISTING_CLAIM"] as const;
export type QaScope = typeof QA_SCOPES[number];
export type QaResult = "PASS" | "FAIL" | "NOT_VERIFIED" | "BLOCKED";
export type QaPlatform = ProductPlatform | "ALL";

export type BuyerRequirement = {
  id: string;
  buyerScenario: string;
  expectedOutcome: string;
  platforms: readonly ProductPlatform[];
};
export type ListingClaim = { id: string; requirementId: string; text: string };
export type ProductQaCase = {
  id: string;
  requirementId?: string;
  claimId?: string;
  scope: QaScope;
  platform: QaPlatform;
  result: QaResult;
  expected: string;
  actual: string;
  evidenceUrl: string;
  testedAt: string;
  testedFingerprint: string;
};
export type ProductReleaseCandidate = {
  productId: string;
  targetBuyer: string;
  customerProblem: string;
  promisedDecision: string;
  researchEvidenceUrl: string;
  supportedPlatforms: readonly ProductPlatform[];
  fingerprint: string;
  requirements: readonly BuyerRequirement[];
  claims: readonly ListingClaim[];
  qaCases: readonly ProductQaCase[];
  openCriticalDefects: number;
  approval?: {
    approvedBy: string;
    approvedAt: string;
    fingerprint: string;
  };
};
export type ReleaseEvidenceEvaluation = {
  readyForOwnerRelease: boolean;
  blockers: string[];
  evaluatedTestCount: number;
};

const sha = /^[a-f0-9]{64}$/i;
const nonempty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const https = (v: unknown) => typeof v === "string" && /^https:\/\/[^/\s]+/.test(v) && !/\s/.test(v);
const validDate = (v: unknown) => nonempty(v) && Number.isFinite(Date.parse(v));
const unique = (values: readonly string[]) => values.length === new Set(values).size;
const isPlatform = (v: unknown): v is ProductPlatform =>
  PRODUCT_PLATFORMS.some(item => item === v);
const isScope = (v: unknown): v is QaScope => QA_SCOPES.some(item => item === v);

/**
 * Fail closed. An approval is tied to the exact candidate fingerprint, and
 * each promised buyer action needs test evidence for every advertised platform.
 */
export function evaluateProductReleaseEvidence(candidate: ProductReleaseCandidate): ReleaseEvidenceEvaluation {
  const blockers: string[] = [];
  const block = (code: string) => { if (!blockers.includes(code)) blockers.push(code); };
  if (!nonempty(candidate.productId) || !nonempty(candidate.targetBuyer) ||
      !nonempty(candidate.customerProblem) || !nonempty(candidate.promisedDecision)) {
    block("BUYER_OUTCOME_CONTRACT_REQUIRED");
  }
  if (!https(candidate.researchEvidenceUrl)) block("MARKET_EVIDENCE_REQUIRED");
  if (!sha.test(candidate.fingerprint)) block("CANDIDATE_FINGERPRINT_REQUIRED");
  if (!candidate.supportedPlatforms.length ||
      !unique(candidate.supportedPlatforms) ||
      candidate.supportedPlatforms.some(p => !isPlatform(p))) {
    block("SUPPORTED_PLATFORMS_INVALID");
  }
  if (!candidate.requirements.length ||
      !unique(candidate.requirements.map(r => r.id))) block("BUYER_REQUIREMENTS_INVALID");

  const requirementIds = new Set(candidate.requirements.map(r => r.id));
  const supported = new Set(candidate.supportedPlatforms);
  for (const requirement of candidate.requirements) {
    if (!nonempty(requirement.id) || !nonempty(requirement.buyerScenario) ||
        !nonempty(requirement.expectedOutcome) || !requirement.platforms.length ||
        !unique(requirement.platforms) || requirement.platforms.some(p => !supported.has(p))) {
      block("INVALID_REQUIREMENT_" + requirement.id);
    }
  }

  if (!candidate.claims.length || !unique(candidate.claims.map(c => c.id))) {
    block("LISTING_CLAIMS_INVALID");
  }
  for (const claim of candidate.claims) {
    if (!nonempty(claim.id) || !nonempty(claim.text) || !requirementIds.has(claim.requirementId)) {
      block("UNSUPPORTED_LISTING_CLAIM_" + claim.id);
    }
  }

  if (!Number.isSafeInteger(candidate.openCriticalDefects) || candidate.openCriticalDefects !== 0) {
    block("OPEN_CRITICAL_DEFECTS");
  }
  if (!unique(candidate.qaCases.map(t => t.id))) block("DUPLICATE_QA_TEST_IDS");
  for (const test of candidate.qaCases) {
    if (!nonempty(test.id) || !isScope(test.scope) ||
        (test.platform !== "ALL" && !supported.has(test.platform))) {
      block("INVALID_QA_TEST_" + test.id);
      continue;
    }
    if ((test.scope === "FUNCTIONAL" || test.scope === "NEGATIVE" ||
         test.scope === "LISTING_CLAIM") && !requirementIds.has(test.requirementId ?? "")) {
      block("QA_REQUIREMENT_MISSING_" + test.id);
    }
    if (test.scope === "LISTING_CLAIM" &&
        !candidate.claims.some(c => c.id === test.claimId && c.requirementId === test.requirementId)) {
      block("QA_CLAIM_MISSING_" + test.id);
    }
    if (test.result !== "PASS") block("QA_NOT_PASS_" + test.id);
    if (!nonempty(test.expected) || !nonempty(test.actual) || test.expected !== test.actual) {
      block("QA_EXPECTED_ACTUAL_MISMATCH_" + test.id);
    }
    if (!https(test.evidenceUrl) || !validDate(test.testedAt)) {
      block("QA_EVIDENCE_MISSING_" + test.id);
    }
    if (test.testedFingerprint !== candidate.fingerprint) {
      block("STALE_QA_FINGERPRINT_" + test.id);
    }
  }

  // Every buyer promise must be exercised on the specific advertised runtime.
  const passed = (scope: QaScope, platform: QaPlatform, requirementId?: string, claimId?: string) =>
    candidate.qaCases.some(t => t.scope === scope && t.platform === platform &&
      (requirementId === undefined || t.requirementId === requirementId) &&
      (claimId === undefined || t.claimId === claimId) &&
      t.result === "PASS" && t.expected === t.actual &&
      nonempty(t.expected) && https(t.evidenceUrl) && validDate(t.testedAt) &&
      t.testedFingerprint === candidate.fingerprint);

  for (const requirement of candidate.requirements) {
    for (const platform of requirement.platforms) {
      if (!passed("FUNCTIONAL", platform, requirement.id)) {
        block("FUNCTIONAL_TEST_MISSING_" + requirement.id + "_" + platform);
      }
    }
  }
  for (const platform of candidate.supportedPlatforms) {
    if ((platform === "EXCEL" || platform === "GOOGLE_SHEETS") &&
        !passed("NEGATIVE", platform)) block("NEGATIVE_TEST_MISSING_" + platform);
    if (!passed("BUYER_ACCESS", platform)) block("BUYER_ACCESS_TEST_MISSING_" + platform);
  }
  if (!passed("DELIVERY", "ALL")) block("CUSTOMER_DELIVERY_TEST_MISSING");
  for (const claim of candidate.claims) {
    if (!passed("LISTING_CLAIM", "ALL", claim.requirementId, claim.id)) {
      block("LISTING_CLAIM_TEST_MISSING_" + claim.id);
    }
  }
  if (!candidate.approval || !nonempty(candidate.approval.approvedBy) ||
      !validDate(candidate.approval.approvedAt) ||
      candidate.approval.fingerprint !== candidate.fingerprint) {
    block("OWNER_APPROVAL_FOR_CURRENT_BUILD_REQUIRED");
  }
  return { readyForOwnerRelease: blockers.length === 0, blockers, evaluatedTestCount: candidate.qaCases.length };
}
