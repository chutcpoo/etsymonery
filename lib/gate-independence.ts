import { validateGateRecord, type GateRecord } from "./factory-domain-schemas";

export const GATE_INDEPENDENCE_POLICY_VERSION = "1.0.0" as const;

export type CandidateGenerationIdentity = {
  candidateId: string;
  candidateFingerprint: string;
  executionId: string;
  actorId: string;
};

export type IndependenceDecision = {
  policyVersion: typeof GATE_INDEPENDENCE_POLICY_VERSION;
  independent: boolean;
  reasons: readonly string[];
};

function required(value: string, code: string) {
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function fingerprint(value: string) {
  const normalized = value.normalize("NFC").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error("INVALID_GENERATION_FINGERPRINT");
  return normalized;
}

export function validateGenerationIdentity(value: CandidateGenerationIdentity): CandidateGenerationIdentity {
  return {
    candidateId: required(value.candidateId, "INVALID_GENERATION_CANDIDATE_ID"),
    candidateFingerprint: fingerprint(value.candidateFingerprint),
    executionId: required(value.executionId, "INVALID_GENERATION_EXECUTION_ID"),
    actorId: required(value.actorId, "INVALID_GENERATION_ACTOR_ID")
  };
}

export function evaluateFinalQcIndependence(
  generationInput: CandidateGenerationIdentity,
  finalQcInput: GateRecord
): IndependenceDecision {
  const generation = validateGenerationIdentity(generationInput);
  const finalQc = validateGateRecord(finalQcInput);
  if (finalQc.gateType !== "INDEPENDENT_FINAL_QC") throw new Error("FINAL_QC_GATE_REQUIRED");
  if (finalQc.candidateId !== generation.candidateId || finalQc.candidateFingerprint !== generation.candidateFingerprint) {
    throw new Error("FINAL_QC_CANDIDATE_BINDING_MISMATCH");
  }
  const reasons: string[] = [];
  if (finalQc.executionId === generation.executionId) reasons.push("SAME_EXECUTION");
  if (finalQc.actorId === generation.actorId) reasons.push("SAME_ACTOR");
  return Object.freeze({
    policyVersion: GATE_INDEPENDENCE_POLICY_VERSION,
    independent: reasons.length === 0,
    reasons: Object.freeze(reasons.sort((a, b) => a.localeCompare(b, "en")))
  });
}

export function assertIndependentFinalQc(
  generation: CandidateGenerationIdentity,
  finalQc: GateRecord
): GateRecord {
  const decision = evaluateFinalQcIndependence(generation, finalQc);
  if (!decision.independent) throw new Error(`INDEPENDENT_FINAL_QC_REQUIRED:${decision.reasons.join(",")}`);
  return validateGateRecord(finalQc);
}
