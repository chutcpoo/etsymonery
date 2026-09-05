import {
  FACTORY_DOMAIN_SCHEMA_VERSION,
  validateOpportunity,
  type Opportunity,
  type OpportunityDecision,
  type OpportunitySignals
} from "./factory-domain-schemas";

export const OPPORTUNITY_SCORING_RESULT_SCHEMA_VERSION = "1.0.0" as const;
export const DEFAULT_OPPORTUNITY_SCORING_POLICY_VERSION = "1.0.0" as const;

export type OpportunityScoringWeights = {
  [K in keyof OpportunitySignals]: number;
};

export type OpportunityScoringPolicy = {
  policyVersion: string;
  weights: OpportunityScoringWeights;
  buildThreshold: number;
  watchThreshold: number;
  evidenceConfidenceFloor: number;
  hardBlockerDecision: "REJECT";
};

export type OpportunityScoringReason =
  | "BUILD_THRESHOLD_MET"
  | "WATCH_SCORE_BAND"
  | "EVIDENCE_CONFIDENCE_BELOW_BUILD_FLOOR"
  | "SCORE_BELOW_WATCH_THRESHOLD"
  | "HARD_POLICY_BLOCKER";

export type OpportunityScoringResult = {
  schemaVersion: typeof OPPORTUNITY_SCORING_RESULT_SCHEMA_VERSION;
  opportunitySchemaVersion: typeof FACTORY_DOMAIN_SCHEMA_VERSION;
  opportunityId: string;
  policyVersion: string;
  weightedScore: number;
  evidenceConfidence: number;
  decision: OpportunityDecision;
  reasonCodes: OpportunityScoringReason[];
  hardPolicyBlockers: string[];
  componentScores: OpportunitySignals;
};

const SIGNAL_ORDER: readonly (keyof OpportunitySignals)[] = [
  "demand",
  "competitionOpportunity",
  "keywordOpportunity",
  "buyerPainSeverity",
  "commercialIntent",
  "pricePotential",
  "differentiationPotential",
  "productionFeasibility",
  "expectedMargin",
  "evidenceConfidence"
];

export const DEFAULT_OPPORTUNITY_SCORING_POLICY: OpportunityScoringPolicy = Object.freeze({
  policyVersion: DEFAULT_OPPORTUNITY_SCORING_POLICY_VERSION,
  weights: Object.freeze({
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
  }),
  buildThreshold: 75,
  watchThreshold: 55,
  evidenceConfidenceFloor: 60,
  hardBlockerDecision: "REJECT"
});

function normalizedVersion(value: string) {
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw new Error("INVALID_SCORING_POLICY_VERSION");
  return normalized;
}

function bounded(value: number, code: string) {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(code);
  return value;
}

function normalizedWeight(value: number, key: keyof OpportunitySignals) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`INVALID_SCORING_WEIGHT:${key}`);
  }
  return value;
}

function policyFingerprint(policy: OpportunityScoringPolicy) {
  return JSON.stringify({
    policyVersion: policy.policyVersion,
    weights: Object.fromEntries(SIGNAL_ORDER.map((key) => [key, policy.weights[key]])),
    buildThreshold: policy.buildThreshold,
    watchThreshold: policy.watchThreshold,
    evidenceConfidenceFloor: policy.evidenceConfidenceFloor,
    hardBlockerDecision: policy.hardBlockerDecision
  });
}

export function validateOpportunityScoringPolicy(
  policy: OpportunityScoringPolicy
): OpportunityScoringPolicy {
  const policyVersion = normalizedVersion(policy.policyVersion);
  const weights = Object.fromEntries(
    SIGNAL_ORDER.map((key) => [key, normalizedWeight(policy.weights[key], key)])
  ) as OpportunityScoringWeights;
  const totalWeight = SIGNAL_ORDER.reduce((sum, key) => sum + weights[key], 0);
  if (Math.abs(totalWeight - 1) > 1e-12) throw new Error("SCORING_WEIGHTS_MUST_SUM_TO_ONE");

  const buildThreshold = bounded(policy.buildThreshold, "INVALID_BUILD_THRESHOLD");
  const watchThreshold = bounded(policy.watchThreshold, "INVALID_WATCH_THRESHOLD");
  const evidenceConfidenceFloor = bounded(
    policy.evidenceConfidenceFloor,
    "INVALID_EVIDENCE_CONFIDENCE_FLOOR"
  );
  if (watchThreshold >= buildThreshold) throw new Error("SCORING_THRESHOLDS_OUT_OF_ORDER");
  if (policy.hardBlockerDecision !== "REJECT") throw new Error("HARD_BLOCKER_MUST_REJECT");

  const normalized: OpportunityScoringPolicy = {
    policyVersion,
    weights,
    buildThreshold,
    watchThreshold,
    evidenceConfidenceFloor,
    hardBlockerDecision: "REJECT"
  };

  if (
    policyVersion === DEFAULT_OPPORTUNITY_SCORING_POLICY_VERSION &&
    policyFingerprint(normalized) !== policyFingerprint(DEFAULT_OPPORTUNITY_SCORING_POLICY)
  ) {
    throw new Error("SCORING_POLICY_VERSION_CONFLICT");
  }
  return normalized;
}

function roundScore(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function scoreOpportunity(
  input: Opportunity,
  policyInput: OpportunityScoringPolicy = DEFAULT_OPPORTUNITY_SCORING_POLICY
): OpportunityScoringResult {
  const opportunity = validateOpportunity(input);
  const policy = validateOpportunityScoringPolicy(policyInput);
  const weightedScore = roundScore(
    SIGNAL_ORDER.reduce(
      (sum, key) => sum + opportunity.signals[key] * policy.weights[key],
      0
    )
  );
  const evidenceConfidence = opportunity.signals.evidenceConfidence;
  const hardPolicyBlockers = [...opportunity.hardPolicyBlockers].sort((a, b) => a.localeCompare(b, "en"));

  let decision: OpportunityDecision;
  let reasonCodes: OpportunityScoringReason[];

  if (hardPolicyBlockers.length) {
    decision = "REJECT";
    reasonCodes = ["HARD_POLICY_BLOCKER"];
  } else if (weightedScore < policy.watchThreshold) {
    decision = "REJECT";
    reasonCodes = ["SCORE_BELOW_WATCH_THRESHOLD"];
  } else if (
    weightedScore >= policy.buildThreshold &&
    evidenceConfidence >= policy.evidenceConfidenceFloor
  ) {
    decision = "BUILD";
    reasonCodes = ["BUILD_THRESHOLD_MET"];
  } else if (weightedScore >= policy.buildThreshold) {
    decision = "WATCH";
    reasonCodes = ["EVIDENCE_CONFIDENCE_BELOW_BUILD_FLOOR"];
  } else {
    decision = "WATCH";
    reasonCodes = ["WATCH_SCORE_BAND"];
  }

  return {
    schemaVersion: OPPORTUNITY_SCORING_RESULT_SCHEMA_VERSION,
    opportunitySchemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    opportunityId: opportunity.opportunityId,
    policyVersion: policy.policyVersion,
    weightedScore,
    evidenceConfidence,
    decision,
    reasonCodes,
    hardPolicyBlockers,
    componentScores: { ...opportunity.signals }
  };
}
