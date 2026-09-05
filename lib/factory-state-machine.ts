import type { CanonicalProductRecord, EvidencedLifecyclePointer } from "./product-registry";

export const FACTORY_STATES = [
  "DISCOVERED",
  "RESEARCHED",
  "OPPORTUNITY_APPROVED",
  "SPEC_LOCKED",
  "BUILDING",
  "PRODUCT_BUILT",
  "PRODUCT_TEST_PASS",
  "LISTING_BUILT",
  "DRAFT_PERSISTED",
  "PERSISTENCE_PASS",
  "FINAL_QC_PASS",
  "PRODUCTION_AUTHORIZED",
  "PUBLISHED",
  "MONITORING",
  "ITERATION_REQUIRED",
  "RETIRED",
  "WATCH",
  "REJECTED"
] as const;

export type FactoryState = (typeof FACTORY_STATES)[number];

export type TransitionGuardContext = {
  uniqueOpportunityId?: string;
  evidenceSetReference?: string;
  scoringDecision?: "BUILD" | "WATCH" | "REJECT";
  scoringPolicyVersion?: string;
  productIdAssigned?: boolean;
  productTruthReference?: string;
  acceptanceCriteriaReference?: string;
  buildOperationLockId?: string;
  artifactRegistryReference?: string;
  productTesterPassReference?: string;
  listingCandidateId?: string;
  candidateFingerprint?: string;
  draftId?: string;
  uploadsCompleted?: boolean;
  expectedFingerprint?: string;
  readBackFingerprint?: string;
  independentQcPassReference?: string;
  testerPassReference?: string;
  qcPassReference?: string;
  qcFingerprint?: string;
  noOpenBlocker?: boolean;
  publishAuthorizationReference?: string;
  prePublishIdentityMatches?: boolean;
  postPublishStatus?: "ACTIVE" | "PUBLISHED";
  baselineSnapshotReference?: string;
  growthDecision?: "KEEP" | "ITERATE" | "NEW_PATCH" | "RETIRE";
  patchScope?: "LISTING_ONLY" | "PRODUCT_CHANGE";
  patchCandidateId?: string;
  patchCandidateFingerprint?: string;
  newProductVersion?: string;
  retirementAuthorizationReference?: string;
  channelRetirementConfirmationReference?: string;
};

export type FactoryTransitionDefinition = {
  from: FactoryState | null;
  to: FactoryState;
  owner: string;
  requiredGuard: string;
};

/** Canonical FACTORY_STATE_MACHINE_V1 transition table. */
export const ALLOWED_FACTORY_TRANSITIONS: readonly FactoryTransitionDefinition[] = [
  { from: null, to: "DISCOVERED", owner: "MARKET_INTELLIGENCE", requiredGuard: "UNIQUE_OPPORTUNITY_ID" },
  { from: "DISCOVERED", to: "RESEARCHED", owner: "MARKET_INTELLIGENCE", requiredGuard: "FRESH_EVIDENCE_SET" },
  { from: "RESEARCHED", to: "OPPORTUNITY_APPROVED", owner: "OPPORTUNITY_SCORING", requiredGuard: "BUILD_DECISION" },
  { from: "RESEARCHED", to: "WATCH", owner: "OPPORTUNITY_SCORING", requiredGuard: "WATCH_DECISION" },
  { from: "RESEARCHED", to: "REJECTED", owner: "OPPORTUNITY_SCORING", requiredGuard: "REJECT_DECISION" },
  { from: "OPPORTUNITY_APPROVED", to: "SPEC_LOCKED", owner: "PRODUCT_FACTORY", requiredGuard: "PRODUCT_TRUTH_LOCKED" },
  { from: "SPEC_LOCKED", to: "BUILDING", owner: "PRODUCT_FACTORY", requiredGuard: "BUILD_LOCK" },
  { from: "BUILDING", to: "PRODUCT_BUILT", owner: "PRODUCT_FACTORY", requiredGuard: "DRIVE_ARTIFACTS_REGISTERED" },
  { from: "PRODUCT_BUILT", to: "PRODUCT_TEST_PASS", owner: "PRODUCTION_GATE", requiredGuard: "PRODUCT_TESTER_PASS" },
  { from: "PRODUCT_TEST_PASS", to: "LISTING_BUILT", owner: "LISTING_INTELLIGENCE", requiredGuard: "FROZEN_LISTING_CANDIDATE" },
  { from: "LISTING_BUILT", to: "DRAFT_PERSISTED", owner: "CHANNEL_EXECUTION", requiredGuard: "DRAFT_AND_UPLOADS_COMPLETE" },
  { from: "DRAFT_PERSISTED", to: "PERSISTENCE_PASS", owner: "PRODUCTION_GATE", requiredGuard: "FRESH_READBACK_MATCH" },
  { from: "PERSISTENCE_PASS", to: "FINAL_QC_PASS", owner: "PRODUCTION_GATE", requiredGuard: "INDEPENDENT_QC_PASS" },
  { from: "FINAL_QC_PASS", to: "PRODUCTION_AUTHORIZED", owner: "PRODUCTION_GATE", requiredGuard: "SAME_FINGERPRINT_PASS_PASS" },
  { from: "PRODUCTION_AUTHORIZED", to: "PUBLISHED", owner: "CHANNEL_EXECUTION", requiredGuard: "EXPLICIT_PUBLISH_AND_POST_READBACK" },
  { from: "PUBLISHED", to: "MONITORING", owner: "GROWTH_ENGINE", requiredGuard: "BASELINE_SNAPSHOT" },
  { from: "MONITORING", to: "ITERATION_REQUIRED", owner: "GROWTH_ENGINE", requiredGuard: "ITERATE_OR_NEW_PATCH" },
  { from: "ITERATION_REQUIRED", to: "LISTING_BUILT", owner: "LISTING_INTELLIGENCE", requiredGuard: "LISTING_PATCH_FROZEN" },
  { from: "ITERATION_REQUIRED", to: "SPEC_LOCKED", owner: "PRODUCT_FACTORY", requiredGuard: "NEW_PRODUCT_VERSION" },
  { from: "MONITORING", to: "RETIRED", owner: "GROWTH_ENGINE_AND_HUMAN", requiredGuard: "EXPLICIT_RETIREMENT" }
] as const;

const stateSet = new Set<string>(FACTORY_STATES);

export function isFactoryState(value: string): value is FactoryState {
  return stateSet.has(value);
}

function present(value: string | undefined) {
  return Boolean(value?.trim());
}

function fingerprintMatch(left: string | undefined, right: string | undefined) {
  return present(left) && present(right) && left === right;
}

function guardBlockers(
  from: FactoryState | null,
  to: FactoryState,
  guard: TransitionGuardContext
): string[] {
  if (from === null && to === "DISCOVERED") return present(guard.uniqueOpportunityId) ? [] : ["UNIQUE_OPPORTUNITY_ID_REQUIRED"];
  if (from === "DISCOVERED" && to === "RESEARCHED") return present(guard.evidenceSetReference) ? [] : ["FRESH_EVIDENCE_SET_REQUIRED"];
  if (from === "RESEARCHED" && ["OPPORTUNITY_APPROVED", "WATCH", "REJECTED"].includes(to)) {
    const expected = to === "OPPORTUNITY_APPROVED" ? "BUILD" : to === "WATCH" ? "WATCH" : "REJECT";
    return guard.scoringDecision === expected && present(guard.scoringPolicyVersion)
      ? []
      : [`${expected}_UNDER_ACTIVE_SCORING_POLICY_REQUIRED`];
  }
  if (from === "OPPORTUNITY_APPROVED" && to === "SPEC_LOCKED") {
    return guard.productIdAssigned && present(guard.productTruthReference) && present(guard.acceptanceCriteriaReference)
      ? []
      : ["PRODUCT_ID_TRUTH_AND_ACCEPTANCE_CRITERIA_REQUIRED"];
  }
  if (from === "SPEC_LOCKED" && to === "BUILDING") return present(guard.buildOperationLockId) ? [] : ["BUILD_OPERATION_LOCK_REQUIRED"];
  if (from === "BUILDING" && to === "PRODUCT_BUILT") return present(guard.artifactRegistryReference) ? [] : ["REGISTERED_DRIVE_ARTIFACTS_REQUIRED"];
  if (from === "PRODUCT_BUILT" && to === "PRODUCT_TEST_PASS") return present(guard.productTesterPassReference) ? [] : ["PRODUCT_TESTER_PASS_REQUIRED"];
  if (from === "PRODUCT_TEST_PASS" && to === "LISTING_BUILT") {
    return present(guard.listingCandidateId) && present(guard.candidateFingerprint)
      ? []
      : ["FROZEN_LISTING_CANDIDATE_REQUIRED"];
  }
  if (from === "LISTING_BUILT" && to === "DRAFT_PERSISTED") {
    return present(guard.draftId) && guard.uploadsCompleted === true ? [] : ["DRAFT_AND_UPLOADS_REQUIRED"];
  }
  if (from === "DRAFT_PERSISTED" && to === "PERSISTENCE_PASS") {
    return fingerprintMatch(guard.expectedFingerprint, guard.readBackFingerprint)
      ? []
      : ["FRESH_READBACK_FINGERPRINT_MATCH_REQUIRED"];
  }
  if (from === "PERSISTENCE_PASS" && to === "FINAL_QC_PASS") {
    return present(guard.independentQcPassReference) && fingerprintMatch(guard.expectedFingerprint, guard.qcFingerprint)
      ? []
      : ["INDEPENDENT_QC_ON_SAME_FINGERPRINT_REQUIRED"];
  }
  if (from === "FINAL_QC_PASS" && to === "PRODUCTION_AUTHORIZED") {
    return present(guard.testerPassReference) &&
      present(guard.qcPassReference) &&
      fingerprintMatch(guard.expectedFingerprint, guard.qcFingerprint) &&
      guard.noOpenBlocker === true
      ? []
      : ["SAME_FINGERPRINT_TESTER_QC_PASS_WITH_NO_BLOCKER_REQUIRED"];
  }
  if (from === "PRODUCTION_AUTHORIZED" && to === "PUBLISHED") {
    return present(guard.publishAuthorizationReference) &&
      guard.prePublishIdentityMatches === true &&
      (guard.postPublishStatus === "ACTIVE" || guard.postPublishStatus === "PUBLISHED")
      ? []
      : ["EXPLICIT_PUBLISH_AUTHORIZATION_AND_READBACK_REQUIRED"];
  }
  if (from === "PUBLISHED" && to === "MONITORING") return present(guard.baselineSnapshotReference) ? [] : ["BASELINE_SNAPSHOT_REQUIRED"];
  if (from === "MONITORING" && to === "ITERATION_REQUIRED") {
    return (guard.growthDecision === "ITERATE" || guard.growthDecision === "NEW_PATCH") &&
      (guard.patchScope === "LISTING_ONLY" || guard.patchScope === "PRODUCT_CHANGE")
      ? []
      : ["ITERATE_OR_NEW_PATCH_DECISION_WITH_PATCH_SCOPE_REQUIRED"];
  }
  if (from === "ITERATION_REQUIRED" && to === "LISTING_BUILT") {
    return guard.patchScope === "LISTING_ONLY" && present(guard.patchCandidateId) && present(guard.patchCandidateFingerprint)
      ? []
      : ["FROZEN_LISTING_PATCH_REQUIRED"];
  }
  if (from === "ITERATION_REQUIRED" && to === "SPEC_LOCKED") {
    return guard.patchScope === "PRODUCT_CHANGE" && present(guard.newProductVersion)
      ? []
      : ["NEW_PRODUCT_VERSION_REQUIRED"];
  }
  if (from === "MONITORING" && to === "RETIRED") {
    return guard.growthDecision === "RETIRE" &&
      present(guard.retirementAuthorizationReference) &&
      present(guard.channelRetirementConfirmationReference)
      ? []
      : ["EXPLICIT_RETIREMENT_AND_CHANNEL_CONFIRMATION_REQUIRED"];
  }
  return ["INVALID_TRANSITION"];
}

export type TransitionEvaluation =
  | { status: "ALLOWED"; definition: FactoryTransitionDefinition }
  | { status: "TRANSITION_BLOCKED"; blockers: string[] }
  | { status: "INVALID_TRANSITION"; from: FactoryState | null; to: FactoryState };

export function evaluateFactoryTransition(
  from: FactoryState | null,
  to: FactoryState,
  guard: TransitionGuardContext
): TransitionEvaluation {
  const definition = ALLOWED_FACTORY_TRANSITIONS.find(
    (candidate) => candidate.from === from && candidate.to === to
  );
  if (!definition) return { status: "INVALID_TRANSITION", from, to };
  const blockers = guardBlockers(from, to, guard);
  return blockers.length ? { status: "TRANSITION_BLOCKED", blockers } : { status: "ALLOWED", definition };
}

export type RerunExceptions = {
  candidateFingerprintChanged?: boolean;
  upstreamDependencyChanged?: boolean;
  gateDefectStage?: FactoryState;
  userExplicitlyRequestedRerun?: boolean;
};

export function authorizeCompletedStageRerun(
  stage: FactoryState,
  completedStages: readonly FactoryState[],
  exceptions: RerunExceptions
) {
  if (!completedStages.includes(stage)) return { status: "NOT_COMPLETED" as const };
  const reason = exceptions.candidateFingerprintChanged
    ? "CANDIDATE_FINGERPRINT_CHANGED"
    : exceptions.upstreamDependencyChanged
      ? "UPSTREAM_DEPENDENCY_CHANGED"
      : exceptions.gateDefectStage === stage
        ? "EXACT_STAGE_GATE_DEFECT"
        : exceptions.userExplicitlyRequestedRerun
          ? "USER_EXPLICIT_RERUN"
          : null;
  return reason
    ? { status: "RERUN_AUTHORIZED" as const, reason }
    : { status: "ALREADY_COMPLETE" as const };
}

export type StageResolution =
  | { status: "RESOLVED"; stage: FactoryState | null }
  | { status: "MIGRATION_REVIEW_REQUIRED"; reason: string };

function resolvePointer(pointer: EvidencedLifecyclePointer | undefined, label: string): StageResolution {
  if (!pointer) return { status: "RESOLVED", stage: null };
  return isFactoryState(pointer.value)
    ? { status: "RESOLVED", stage: pointer.value }
    : { status: "MIGRATION_REVIEW_REQUIRED", reason: `UNKNOWN_${label}:${pointer.value}` };
}

export function resolveLastCompletedStage(record: CanonicalProductRecord): StageResolution {
  if (record.migrationReview.status === "MIGRATION_REVIEW_REQUIRED") {
    return { status: "MIGRATION_REVIEW_REQUIRED", reason: record.migrationReview.reasons[0] ?? "UNKNOWN_LEGACY_STATE" };
  }
  return resolvePointer(record.lastCompletedStage, "LAST_COMPLETED_STAGE");
}

const primaryNextStage: Partial<Record<FactoryState, FactoryState | null>> = {
  DISCOVERED: "RESEARCHED",
  RESEARCHED: "OPPORTUNITY_APPROVED",
  OPPORTUNITY_APPROVED: "SPEC_LOCKED",
  SPEC_LOCKED: "BUILDING",
  BUILDING: "PRODUCT_BUILT",
  PRODUCT_BUILT: "PRODUCT_TEST_PASS",
  PRODUCT_TEST_PASS: "LISTING_BUILT",
  LISTING_BUILT: "DRAFT_PERSISTED",
  DRAFT_PERSISTED: "PERSISTENCE_PASS",
  PERSISTENCE_PASS: "FINAL_QC_PASS",
  FINAL_QC_PASS: "PRODUCTION_AUTHORIZED",
  PRODUCTION_AUTHORIZED: "PUBLISHED",
  PUBLISHED: "MONITORING",
  MONITORING: "ITERATION_REQUIRED",
  RETIRED: null,
  WATCH: null,
  REJECTED: null
};

export function resolveNextExecutableStage(record: CanonicalProductRecord): StageResolution {
  if (record.migrationReview.status === "MIGRATION_REVIEW_REQUIRED") {
    return { status: "MIGRATION_REVIEW_REQUIRED", reason: record.migrationReview.reasons[0] ?? "UNKNOWN_LEGACY_STATE" };
  }
  if (record.nextExecutableStage) {
    const next = resolvePointer(record.nextExecutableStage, "NEXT_EXECUTABLE_STAGE");
    if (next.status !== "RESOLVED" || next.stage === null) return next;
    const current = resolvePointer(record.currentState, "CURRENT_STATE");
    if (current.status !== "RESOLVED") return current;
    const mappingExists = ALLOWED_FACTORY_TRANSITIONS.some(
      (transition) => transition.from === current.stage && transition.to === next.stage
    );
    return mappingExists
      ? next
      : {
          status: "MIGRATION_REVIEW_REQUIRED",
          reason: `INVALID_NEXT_STAGE_MAPPING:${current.stage ?? "none"}->${next.stage}`
        };
  }
  if (!record.currentState) return { status: "RESOLVED", stage: "DISCOVERED" };
  if (!isFactoryState(record.currentState.value)) {
    return { status: "MIGRATION_REVIEW_REQUIRED", reason: `UNKNOWN_CURRENT_STATE:${record.currentState.value}` };
  }
  if (record.currentState.value === "ITERATION_REQUIRED") {
    return { status: "MIGRATION_REVIEW_REQUIRED", reason: "PATCH_SCOPE_REQUIRED" };
  }
  if (!(record.currentState.value in primaryNextStage)) {
    return { status: "MIGRATION_REVIEW_REQUIRED", reason: `NEXT_STAGE_AMBIGUOUS:${record.currentState.value}` };
  }
  return { status: "RESOLVED", stage: primaryNextStage[record.currentState.value] ?? null };
}

function nextAfterTransition(to: FactoryState, guard: TransitionGuardContext): FactoryState | null {
  if (to === "ITERATION_REQUIRED") {
    if (guard.patchScope === "LISTING_ONLY") return "LISTING_BUILT";
    if (guard.patchScope === "PRODUCT_CHANGE") return "SPEC_LOCKED";
    throw new Error("PATCH_SCOPE_REQUIRED_FOR_NEXT_EXECUTABLE_STAGE");
  }
  return primaryNextStage[to] ?? null;
}

export type ExternalDependencyBlock = { blocker: string; recoveryAction: string };

export type ExecuteTransitionInput = {
  record: CanonicalProductRecord;
  to: FactoryState;
  guard: TransitionGuardContext;
  transitionEvidenceReference: string;
  completedStages?: readonly FactoryState[];
  rerunExceptions?: RerunExceptions;
  externalDependency?: ExternalDependencyBlock;
};

export type ExecuteTransitionResult =
  | { status: "TRANSITION_APPLIED"; record: CanonicalProductRecord; lastCompletedStage: FactoryState; nextExecutableStage: FactoryState | null }
  | { status: "TRANSITION_BLOCKED"; blockers: string[] }
  | { status: "INVALID_TRANSITION"; from: FactoryState | null; to: FactoryState }
  | { status: "ALREADY_COMPLETE" | "RERUN_AUTHORIZED"; stage: FactoryState; nextExecutableStage: FactoryState | null; reason?: string }
  | { status: "GATE_BLOCKED"; blocker: string; recoveryAction: string }
  | { status: "MIGRATION_REVIEW_REQUIRED"; reason: string };

export function executeFactoryTransition(input: ExecuteTransitionInput): ExecuteTransitionResult {
  if (input.externalDependency) {
    if (!present(input.externalDependency.blocker) || !present(input.externalDependency.recoveryAction)) {
      throw new Error("INVALID_EXTERNAL_DEPENDENCY_BLOCK");
    }
    return { status: "GATE_BLOCKED", ...input.externalDependency };
  }
  if (input.record.migrationReview.status === "MIGRATION_REVIEW_REQUIRED") {
    return {
      status: "MIGRATION_REVIEW_REQUIRED",
      reason: input.record.migrationReview.reasons[0] ?? "UNKNOWN_LEGACY_STATE"
    };
  }
  if (!present(input.transitionEvidenceReference)) throw new Error("TRANSITION_EVIDENCE_REQUIRED");

  const currentResolution = resolvePointer(input.record.currentState, "CURRENT_STATE");
  if (currentResolution.status !== "RESOLVED") return currentResolution;
  const from = currentResolution.stage;
  const completed = input.completedStages ?? (from ? [from] : []);
  const rerun = authorizeCompletedStageRerun(input.to, completed, input.rerunExceptions ?? {});
  if (rerun.status === "ALREADY_COMPLETE" || rerun.status === "RERUN_AUTHORIZED") {
    const next = resolveNextExecutableStage(input.record);
    if (next.status !== "RESOLVED") return next;
    return {
      status: rerun.status,
      stage: input.to,
      nextExecutableStage: next.stage,
      ...(rerun.status === "RERUN_AUTHORIZED" ? { reason: rerun.reason } : {})
    };
  }

  const evaluation = evaluateFactoryTransition(from, input.to, input.guard);
  if (evaluation.status !== "ALLOWED") return evaluation;
  const nextExecutableStage = nextAfterTransition(input.to, input.guard);
  const evidence: EvidencedLifecyclePointer = {
    value: input.to,
    evidenceReference: input.transitionEvidenceReference.trim()
  };
  const nextRecord: CanonicalProductRecord = {
    ...structuredClone(input.record),
    registryRevision: input.record.registryRevision + 1,
    currentState: evidence,
    lastCompletedStage: evidence
  };
  if (nextExecutableStage) {
    nextRecord.nextExecutableStage = {
      value: nextExecutableStage,
      evidenceReference: input.transitionEvidenceReference.trim()
    };
  } else {
    delete nextRecord.nextExecutableStage;
  }
  return {
    status: "TRANSITION_APPLIED",
    record: nextRecord,
    lastCompletedStage: input.to,
    nextExecutableStage
  };
}

export type RepairFailure =
  | "PRODUCT_DEFECT"
  | "LISTING_DEFECT"
  | "UPLOAD_FAILURE"
  | "READ_BACK_MISMATCH"
  | "IDENTITY_MISMATCH_BEFORE_PUBLISH"
  | "API_OFFLINE_OR_RATE_LIMIT"
  | "CREDENTIAL_ERROR"
  | "PARTIAL_PUBLISH_AMBIGUOUS"
  | "QC_FAILURE";

export type RepairRoute = {
  status: "REPAIR_REQUIRED";
  targetStage: FactoryState;
  recoveryAction: string;
  preserveCurrentState: true;
};

/** Repair selects one recovery point and never rewinds history or restarts the pipeline. */
export function routeTargetedRepair(input: {
  failure: RepairFailure;
  currentState: FactoryState;
  mappedSourceStage?: FactoryState;
}): RepairRoute {
  const routes: Record<Exclude<RepairFailure, "READ_BACK_MISMATCH">, Omit<RepairRoute, "status" | "preserveCurrentState">> = {
    PRODUCT_DEFECT: { targetStage: "BUILDING", recoveryAction: "CREATE_NEW_ARTIFACT_VERSION_AND_RETEST_AFFECTED_SCOPE" },
    LISTING_DEFECT: { targetStage: "LISTING_BUILT", recoveryAction: "CREATE_NEW_LISTING_CANDIDATE_VERSION" },
    UPLOAD_FAILURE: { targetStage: "DRAFT_PERSISTED", recoveryAction: "RESUME_MISSING_UPLOAD_WITH_SAME_OPERATION_ID" },
    IDENTITY_MISMATCH_BEFORE_PUBLISH: { targetStage: "PRODUCTION_AUTHORIZED", recoveryAction: "STOP_NO_PUBLISH_AND_RECONCILE_IDENTITY" },
    API_OFFLINE_OR_RATE_LIMIT: { targetStage: input.currentState, recoveryAction: "RETRY_AFTER_BACKOFF_WITH_SAME_OPERATION_ID" },
    CREDENTIAL_ERROR: { targetStage: input.currentState, recoveryAction: "AUTHORIZED_OWNER_RECONNECTS_CREDENTIAL" },
    PARTIAL_PUBLISH_AMBIGUOUS: { targetStage: input.currentState, recoveryAction: "QUERY_EXTERNAL_IDENTITY_WITH_OPERATION_ID_NO_REPUBLISH" },
    QC_FAILURE: { targetStage: "LISTING_BUILT", recoveryAction: "CREATE_TARGETED_FIX_CANDIDATE_RETEST_THEN_RERUN_QC" }
  };

  if (input.failure === "READ_BACK_MISMATCH") {
    if (!input.mappedSourceStage) throw new Error("MAPPED_SOURCE_STAGE_REQUIRED");
    return {
      status: "REPAIR_REQUIRED",
      targetStage: input.mappedSourceStage,
      recoveryAction: "COMPARE_NORMALIZED_FIELDS_AND_REPAIR_ONLY_MAPPED_SOURCE_STAGE",
      preserveCurrentState: true
    };
  }
  return { status: "REPAIR_REQUIRED", ...routes[input.failure], preserveCurrentState: true };
}
