import {
  validateAuthorization,
  validateGateRecord,
  type Authorization,
  type GateRecord
} from "./factory-domain-schemas";

export const GATE_INVALIDATION_POLICY_VERSION = "1.0.0" as const;

export const GATE_ORDER = [
  "PRODUCT_TEST",
  "LISTING_TEST",
  "PERSISTENCE_VERIFY",
  "INDEPENDENT_FINAL_QC"
] as const satisfies readonly GateRecord["gateType"][];

export type GateType = (typeof GATE_ORDER)[number];
export type CandidateChangeKind =
  | "PRODUCT_OR_ARTIFACT"
  | "LISTING"
  | "PERSISTENCE_IDENTITY"
  | "FINAL_QC_RELEVANT"
  | "NON_MATERIAL";

export type GateBinding = {
  candidateId: string;
  candidateFingerprint: string;
};

export type GateBindingRequirements = Record<GateType, GateBinding>;

export type GateEvaluation = {
  gateType: GateType;
  status: "PASS" | "FAIL" | "MISSING";
  requiredBinding: GateBinding;
  record?: GateRecord;
};

export type GateChainEvaluation = {
  policyVersion: typeof GATE_INVALIDATION_POLICY_VERSION;
  gates: GateEvaluation[];
  eligibleForProductionAuthorization: boolean;
};

export type InvalidationTarget = GateType | "AUTHORIZATION";

export type GateInvalidationResult = {
  policyVersion: typeof GATE_INVALIDATION_POLICY_VERSION;
  changeKind: CandidateChangeKind;
  invalidatedTargets: InvalidationTarget[];
  preservedTargets: InvalidationTarget[];
};

const ALL_TARGETS: readonly InvalidationTarget[] = [...GATE_ORDER, "AUTHORIZATION"];

export const GATE_CHANGE_MATRIX: Readonly<Record<CandidateChangeKind, readonly InvalidationTarget[]>> = Object.freeze({
  PRODUCT_OR_ARTIFACT: Object.freeze([...ALL_TARGETS]),
  LISTING: Object.freeze(["LISTING_TEST", "PERSISTENCE_VERIFY", "INDEPENDENT_FINAL_QC", "AUTHORIZATION"] as InvalidationTarget[]),
  PERSISTENCE_IDENTITY: Object.freeze(["PERSISTENCE_VERIFY", "INDEPENDENT_FINAL_QC", "AUTHORIZATION"] as InvalidationTarget[]),
  FINAL_QC_RELEVANT: Object.freeze(["INDEPENDENT_FINAL_QC", "AUTHORIZATION"] as InvalidationTarget[]),
  NON_MATERIAL: Object.freeze([] as InvalidationTarget[])
});

function normalizeBinding(binding: GateBinding): GateBinding {
  const candidateId = binding.candidateId.normalize("NFC").trim();
  const candidateFingerprint = binding.candidateFingerprint.normalize("NFC").trim().toLowerCase();
  if (!candidateId) throw new Error("INVALID_GATE_BINDING_CANDIDATE_ID");
  if (!/^[a-f0-9]{64}$/.test(candidateFingerprint)) throw new Error("INVALID_GATE_BINDING_FINGERPRINT");
  return { candidateId, candidateFingerprint };
}

function latestMatchingRecord(
  gateType: GateType,
  binding: GateBinding,
  records: readonly GateRecord[]
): GateRecord | undefined {
  const normalized = normalizeBinding(binding);
  const matching = records
    .map(validateGateRecord)
    .filter((record) =>
      record.gateType === gateType &&
      record.candidateId === normalized.candidateId &&
      record.candidateFingerprint === normalized.candidateFingerprint
    )
    .sort((left, right) => {
      const byTime = Date.parse(left.createdAt) - Date.parse(right.createdAt);
      return byTime || left.gateRecordId.localeCompare(right.gateRecordId, "en");
    });
  return matching.at(-1);
}

export function evaluateGateChain(
  requirements: GateBindingRequirements,
  records: readonly GateRecord[]
): GateChainEvaluation {
  const gates = GATE_ORDER.map((gateType): GateEvaluation => {
    const requiredBinding = normalizeBinding(requirements[gateType]);
    const record = latestMatchingRecord(gateType, requiredBinding, records);
    return {
      gateType,
      status: record?.result ?? "MISSING",
      requiredBinding,
      ...(record ? { record } : {})
    };
  });
  return {
    policyVersion: GATE_INVALIDATION_POLICY_VERSION,
    gates,
    eligibleForProductionAuthorization: gates.every((gate) => gate.status === "PASS")
  };
}

export function invalidationForChange(changeKind: CandidateChangeKind): GateInvalidationResult {
  const invalidatedTargets = [...GATE_CHANGE_MATRIX[changeKind]];
  return {
    policyVersion: GATE_INVALIDATION_POLICY_VERSION,
    changeKind,
    invalidatedTargets,
    preservedTargets: ALL_TARGETS.filter((target) => !invalidatedTargets.includes(target))
  };
}

export function isAuthorizationUsableForGateChain(
  authorizationInput: Authorization,
  target: GateBinding,
  chain: GateChainEvaluation
): boolean {
  const authorization = validateAuthorization(authorizationInput);
  const binding = normalizeBinding(target);
  if (!chain.eligibleForProductionAuthorization) return false;
  if (authorization.state !== "ACTIVE") return false;
  return authorization.candidateId === binding.candidateId && authorization.candidateFingerprint === binding.candidateFingerprint;
}
