import { GATE_ORDER, type GateChainEvaluation } from "./gate-invalidation-engine";
import { resolveNextExecutableStage } from "./factory-state-machine";
import type { CanonicalProductRecord } from "./product-registry";

export const OPERATOR_DASHBOARD_VERSION = "1.0.0" as const;
export type DashboardGateStatus = "PASS" | "FAIL" | "MISSING" | "NOT_OBSERVED";
export type DashboardBlocker = { code: string; recoveryAction?: string };
export type OperatorDashboardInput = {
  product: CanonicalProductRecord;
  activeCandidateFingerprint?: string;
  gateChain?: GateChainEvaluation;
  blocker?: DashboardBlocker;
};
export type OperatorDashboardSnapshot = {
  version: typeof OPERATOR_DASHBOARD_VERSION;
  readOnly: true;
  mutationMode: "SEPARATE_AUTHORIZED_ACTIONS";
  productId: string;
  currentState: string | null;
  fingerprint: string | null;
  gates: { gateType: (typeof GATE_ORDER)[number]; status: DashboardGateStatus; evidenceIds: string[] }[];
  blocker: DashboardBlocker | null;
  evidenceIds: string[];
  nextExecutableStage: string | null;
};

function normalizedFingerprint(value?: string) {
  if (!value) return null;
  const fp = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fp)) throw new Error("INVALID_DASHBOARD_FINGERPRINT");
  return fp;
}

export function buildOperatorDashboard(input: OperatorDashboardInput): OperatorDashboardSnapshot {
  const product = structuredClone(input.product);
  const explicit = normalizedFingerprint(input.activeCandidateFingerprint);
  const inferred = product.references.candidateFingerprints.length === 1
    ? normalizedFingerprint(product.references.candidateFingerprints[0])
    : null;
  const fingerprint = explicit ?? inferred;
  const next = resolveNextExecutableStage(product);
  const blocker = input.blocker ?? (next.status === "MIGRATION_REVIEW_REQUIRED"
    ? { code: next.reason }
    : null);
  const gateByType = new Map(input.gateChain?.gates.map((gate) => [gate.gateType, gate]));
  const gates = GATE_ORDER.map((gateType) => {
    const gate = gateByType.get(gateType);
    return {
      gateType,
      status: gate?.status ?? "NOT_OBSERVED" as DashboardGateStatus,
      evidenceIds: gate?.record?.evidenceIds ? [...gate.record.evidenceIds].sort() : []
    };
  });
  const evidenceIds = [...new Set([
    ...product.references.evidenceIds,
    ...gates.flatMap((gate) => gate.evidenceIds)
  ])].sort((a, b) => a.localeCompare(b, "en"));
  return {
    version: OPERATOR_DASHBOARD_VERSION,
    readOnly: true,
    mutationMode: "SEPARATE_AUTHORIZED_ACTIONS",
    productId: product.productId,
    currentState: product.currentState?.value ?? null,
    fingerprint,
    gates,
    blocker,
    evidenceIds,
    nextExecutableStage: next.status === "RESOLVED" ? next.stage : "MIGRATION_REVIEW_REQUIRED"
  };
}
