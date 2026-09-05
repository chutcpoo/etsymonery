import assert from "node:assert/strict";
import test from "node:test";
import {
  FACTORY_DOMAIN_SCHEMA_VERSION,
  type Opportunity,
  type OpportunitySignals
} from "../lib/factory-domain-schemas";
import {
  DEFAULT_OPPORTUNITY_SCORING_POLICY,
  DEFAULT_OPPORTUNITY_SCORING_POLICY_VERSION,
  OPPORTUNITY_SCORING_RESULT_SCHEMA_VERSION,
  scoreOpportunity,
  validateOpportunityScoringPolicy,
  type OpportunityScoringPolicy
} from "../lib/opportunity-scoring";

const NOW = "2026-09-05T04:00:00.000Z";
const LATER = "2026-09-06T04:00:00.000Z";

function signals(value: number): OpportunitySignals {
  return {
    demand: value,
    competitionOpportunity: value,
    keywordOpportunity: value,
    buyerPainSeverity: value,
    commercialIntent: value,
    pricePotential: value,
    differentiationPotential: value,
    productionFeasibility: value,
    expectedMargin: value,
    evidenceConfidence: value
  };
}

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    opportunityId: "OPP-201-001",
    status: "OPPORTUNITY_CANDIDATE",
    market: "Global",
    channel: "Etsy",
    buyer: "Small business owner",
    language: "en",
    observedAt: NOW,
    freshnessExpiresAt: LATER,
    confidence: 80,
    signals: {
      demand: 80,
      competitionOpportunity: 70,
      keywordOpportunity: 75,
      buyerPainSeverity: 85,
      commercialIntent: 80,
      pricePotential: 70,
      differentiationPotential: 90,
      productionFeasibility: 95,
      expectedMargin: 90,
      evidenceConfidence: 80
    },
    hardPolicyBlockers: [],
    evidence: [{
      schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
      evidenceId: "EVIDENCE-201-001",
      source: "market-intelligence",
      capturedAt: NOW,
      freshnessExpiresAt: LATER
    }],
    ...overrides
  };
}

test("default policy exactly matches canonical Factory OS weights and thresholds", () => {
  assert.deepEqual(DEFAULT_OPPORTUNITY_SCORING_POLICY.weights, {
    demand: 0.15,
    competitionOpportunity: 0.10,
    keywordOpportunity: 0.10,
    buyerPainSeverity: 0.10,
    commercialIntent: 0.10,
    pricePotential: 0.10,
    differentiationPotential: 0.15,
    productionFeasibility: 0.05,
    expectedMargin: 0.10,
    evidenceConfidence: 0.05
  });
  assert.equal(DEFAULT_OPPORTUNITY_SCORING_POLICY.buildThreshold, 75);
  assert.equal(DEFAULT_OPPORTUNITY_SCORING_POLICY.watchThreshold, 55);
  assert.equal(DEFAULT_OPPORTUNITY_SCORING_POLICY.evidenceConfidenceFloor, 60);
});

test("deterministic golden fixture scores 81.25 and returns BUILD", () => {
  const result = scoreOpportunity(opportunity());
  assert.equal(result.schemaVersion, OPPORTUNITY_SCORING_RESULT_SCHEMA_VERSION);
  assert.equal(result.weightedScore, 81.25);
  assert.equal(result.decision, "BUILD");
  assert.deepEqual(result.reasonCodes, ["BUILD_THRESHOLD_MET"]);
  assert.equal(result.policyVersion, DEFAULT_OPPORTUNITY_SCORING_POLICY_VERSION);
});

test("exact BUILD threshold is BUILD when evidence confidence meets floor", () => {
  const result = scoreOpportunity(opportunity({ signals: signals(75) }));
  assert.equal(result.weightedScore, 75);
  assert.equal(result.evidenceConfidence, 75);
  assert.equal(result.decision, "BUILD");
});

test("WATCH band begins at 55 and values below 55 are REJECT", () => {
  const watch = scoreOpportunity(opportunity({ signals: signals(55) }));
  const reject = scoreOpportunity(opportunity({ signals: signals(54.999) }));
  assert.equal(watch.weightedScore, 55);
  assert.equal(watch.decision, "WATCH");
  assert.deepEqual(watch.reasonCodes, ["WATCH_SCORE_BAND"]);
  assert.equal(reject.weightedScore, 54.999);
  assert.equal(reject.decision, "REJECT");
  assert.deepEqual(reject.reasonCodes, ["SCORE_BELOW_WATCH_THRESHOLD"]);
});

test("high score below evidence-confidence floor is WATCH rather than BUILD", () => {
  const high = signals(80);
  high.evidenceConfidence = 59;
  const result = scoreOpportunity(opportunity({ signals: high }));
  assert.ok(result.weightedScore >= 75);
  assert.equal(result.evidenceConfidence, 59);
  assert.equal(result.decision, "WATCH");
  assert.deepEqual(result.reasonCodes, ["EVIDENCE_CONFIDENCE_BELOW_BUILD_FLOOR"]);
});

test("any explicit hard-policy blocker forces REJECT regardless of score", () => {
  const result = scoreOpportunity(opportunity({
    signals: signals(100),
    hardPolicyBlockers: ["POLICY-B", "POLICY-A"]
  }));
  assert.equal(result.weightedScore, 100);
  assert.equal(result.decision, "REJECT");
  assert.deepEqual(result.reasonCodes, ["HARD_POLICY_BLOCKER"]);
  assert.deepEqual(result.hardPolicyBlockers, ["POLICY-A", "POLICY-B"]);
});

test("changed thresholds require a new policy version and the decision captures it", () => {
  const policy: OpportunityScoringPolicy = {
    ...DEFAULT_OPPORTUNITY_SCORING_POLICY,
    policyVersion: "1.1.0",
    buildThreshold: 85,
    watchThreshold: 60,
    evidenceConfidenceFloor: 70
  };
  const result = scoreOpportunity(opportunity(), policy);
  assert.equal(result.policyVersion, "1.1.0");
  assert.equal(result.decision, "WATCH");

  assert.throws(
    () => validateOpportunityScoringPolicy({ ...policy, policyVersion: DEFAULT_OPPORTUNITY_SCORING_POLICY_VERSION }),
    /SCORING_POLICY_VERSION_CONFLICT/
  );
});

test("policy validation fails closed for invalid weights, thresholds or hard-blocker behavior", () => {
  assert.throws(
    () => validateOpportunityScoringPolicy({
      ...DEFAULT_OPPORTUNITY_SCORING_POLICY,
      policyVersion: "bad-weight-policy",
      weights: { ...DEFAULT_OPPORTUNITY_SCORING_POLICY.weights, demand: 0.10 }
    }),
    /SCORING_WEIGHTS_MUST_SUM_TO_ONE/
  );
  assert.throws(
    () => validateOpportunityScoringPolicy({
      ...DEFAULT_OPPORTUNITY_SCORING_POLICY,
      policyVersion: "bad-threshold-policy",
      watchThreshold: 80
    }),
    /SCORING_THRESHOLDS_OUT_OF_ORDER/
  );
  assert.throws(
    () => validateOpportunityScoringPolicy({
      ...DEFAULT_OPPORTUNITY_SCORING_POLICY,
      policyVersion: "bad-blocker-policy",
      hardBlockerDecision: "WATCH" as "REJECT"
    }),
    /HARD_BLOCKER_MUST_REJECT/
  );
});

test("equivalent logical opportunity inputs produce identical scoring results", () => {
  const first = opportunity({ hardPolicyBlockers: [] });
  const second = {
    ...first,
    evidence: [...first.evidence].reverse(),
    hardPolicyBlockers: [...first.hardPolicyBlockers].reverse(),
    signals: {
      evidenceConfidence: first.signals.evidenceConfidence,
      expectedMargin: first.signals.expectedMargin,
      productionFeasibility: first.signals.productionFeasibility,
      differentiationPotential: first.signals.differentiationPotential,
      pricePotential: first.signals.pricePotential,
      commercialIntent: first.signals.commercialIntent,
      buyerPainSeverity: first.signals.buyerPainSeverity,
      keywordOpportunity: first.signals.keywordOpportunity,
      competitionOpportunity: first.signals.competitionOpportunity,
      demand: first.signals.demand
    }
  };
  assert.deepEqual(scoreOpportunity(first), scoreOpportunity(second));
});

test("scoring is read-only and never mutates the opportunity candidate", () => {
  const input = opportunity();
  const before = structuredClone(input);
  scoreOpportunity(input);
  assert.deepEqual(input, before);
});

test("invalid Opportunity candidate fails before any score decision is emitted", () => {
  const invalid = opportunity({ signals: { ...signals(80), demand: 101 } });
  assert.throws(() => scoreOpportunity(invalid), /INVALID_DEMAND_SCORE/);
});
