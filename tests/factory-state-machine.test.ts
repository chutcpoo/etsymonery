import assert from "node:assert/strict";
import test from "node:test";
import {
  ALLOWED_FACTORY_TRANSITIONS,
  FACTORY_STATES,
  authorizeCompletedStageRerun,
  evaluateFactoryTransition,
  executeFactoryTransition,
  resolveLastCompletedStage,
  resolveNextExecutableStage,
  routeTargetedRepair,
  type FactoryState,
  type TransitionGuardContext
} from "../lib/factory-state-machine";
import type { CanonicalProductRecord } from "../lib/product-registry";

const fingerprint = "a".repeat(64);

function guardFor(from: FactoryState | null, to: FactoryState): TransitionGuardContext {
  const key = `${from ?? "none"}->${to}`;
  const guards: Record<string, TransitionGuardContext> = {
    "none->DISCOVERED": { uniqueOpportunityId: "opp-1" },
    "DISCOVERED->RESEARCHED": { evidenceSetReference: "evidence-set-1" },
    "RESEARCHED->OPPORTUNITY_APPROVED": { scoringDecision: "BUILD", scoringPolicyVersion: "v1" },
    "RESEARCHED->WATCH": { scoringDecision: "WATCH", scoringPolicyVersion: "v1" },
    "RESEARCHED->REJECTED": { scoringDecision: "REJECT", scoringPolicyVersion: "v1" },
    "OPPORTUNITY_APPROVED->SPEC_LOCKED": {
      productIdAssigned: true,
      productTruthReference: "truth-1",
      acceptanceCriteriaReference: "acceptance-1"
    },
    "SPEC_LOCKED->BUILDING": { buildOperationLockId: "operation-1" },
    "BUILDING->PRODUCT_BUILT": { artifactRegistryReference: "artifacts-1" },
    "PRODUCT_BUILT->PRODUCT_TEST_PASS": { productTesterPassReference: "product-test-1" },
    "PRODUCT_TEST_PASS->LISTING_BUILT": { listingCandidateId: "candidate-1", candidateFingerprint: fingerprint },
    "LISTING_BUILT->DRAFT_PERSISTED": { draftId: "draft-1", uploadsCompleted: true },
    "DRAFT_PERSISTED->PERSISTENCE_PASS": { expectedFingerprint: fingerprint, readBackFingerprint: fingerprint },
    "PERSISTENCE_PASS->FINAL_QC_PASS": {
      independentQcPassReference: "qc-1",
      expectedFingerprint: fingerprint,
      qcFingerprint: fingerprint
    },
    "FINAL_QC_PASS->PRODUCTION_AUTHORIZED": {
      testerPassReference: "tester-1",
      qcPassReference: "qc-1",
      expectedFingerprint: fingerprint,
      qcFingerprint: fingerprint,
      noOpenBlocker: true
    },
    "PRODUCTION_AUTHORIZED->PUBLISHED": {
      publishAuthorizationReference: "publish-auth-1",
      prePublishIdentityMatches: true,
      postPublishStatus: "ACTIVE"
    },
    "PUBLISHED->MONITORING": { baselineSnapshotReference: "baseline-1" },
    "MONITORING->ITERATION_REQUIRED": { growthDecision: "ITERATE", patchScope: "LISTING_ONLY" },
    "ITERATION_REQUIRED->LISTING_BUILT": {
      patchScope: "LISTING_ONLY",
      patchCandidateId: "patch-1",
      patchCandidateFingerprint: fingerprint
    },
    "ITERATION_REQUIRED->SPEC_LOCKED": { patchScope: "PRODUCT_CHANGE", newProductVersion: "V2" },
    "MONITORING->RETIRED": {
      growthDecision: "RETIRE",
      retirementAuthorizationReference: "retire-auth-1",
      channelRetirementConfirmationReference: "channel-confirm-1"
    }
  };
  return guards[key];
}

function registryRecord(state: FactoryState | null, next?: FactoryState): CanonicalProductRecord {
  const evidence = { evidenceReference: "state-evidence-1" };
  return {
    schemaVersion: "1.0.0",
    productId: "PDT-HBOP-001",
    productName: "Home Bakery Operations",
    productVersion: "V1",
    registryRevision: 4,
    importedSource: {
      driveFileId: "1XoIRHCVGGG81ddMhLfyP4TBE9mCgbOft",
      fileName: "DIGITAL_PRODUCT_CATALOG_MASTER.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      accessMode: "READ_ONLY"
    },
    ...(state
      ? {
          currentState: { value: state, ...evidence },
          lastCompletedStage: { value: state, ...evidence }
        }
      : {}),
    ...(next ? { nextExecutableStage: { value: next, ...evidence } } : {}),
    references: {
      listings: [{ channel: "etsy", listingId: "4566738686" }],
      candidateIds: ["candidate-1"],
      candidateFingerprints: [fingerprint],
      passRecordIds: ["tester-1", "qc-1"],
      authorizationIds: ["auth-1"],
      evidenceIds: ["state-evidence-1"]
    },
    migrationReview: { status: "CLEAR", reasons: [] }
  };
}

test("every canonical allowed transition passes with its required guard", () => {
  for (const transition of ALLOWED_FACTORY_TRANSITIONS) {
    assert.equal(
      evaluateFactoryTransition(transition.from, transition.to, guardFor(transition.from, transition.to)).status,
      "ALLOWED",
      `${transition.from ?? "none"}->${transition.to}`
    );
  }
});

test("every canonical transition is blocked when its guard is absent", () => {
  for (const transition of ALLOWED_FACTORY_TRANSITIONS) {
    const result = evaluateFactoryTransition(transition.from, transition.to, {});
    assert.equal(result.status, "TRANSITION_BLOCKED", `${transition.from ?? "none"}->${transition.to}`);
    if (result.status === "TRANSITION_BLOCKED") assert.equal(result.blockers.length, 1);
  }
});

test("every transition pair outside the canonical table is rejected", () => {
  const fromStates: Array<FactoryState | null> = [null, ...FACTORY_STATES];
  const allowed = new Set(ALLOWED_FACTORY_TRANSITIONS.map(({ from, to }) => `${from ?? "none"}->${to}`));
  for (const from of fromStates) {
    for (const to of FACTORY_STATES) {
      if (allowed.has(`${from ?? "none"}->${to}`)) continue;
      assert.equal(evaluateFactoryTransition(from, to, {}).status, "INVALID_TRANSITION", `${from ?? "none"}->${to}`);
    }
  }
});

test("explicitly forbidden shortcut transitions are rejected", () => {
  const forbidden: Array<[FactoryState, FactoryState]> = [
    ["RESEARCHED", "SPEC_LOCKED"],
    ["PRODUCT_BUILT", "LISTING_BUILT"],
    ["LISTING_BUILT", "FINAL_QC_PASS"],
    ["PUBLISHED", "PRODUCT_BUILT"]
  ];
  for (const [from, to] of forbidden) {
    assert.equal(evaluateFactoryTransition(from, to, {}).status, "INVALID_TRANSITION");
  }
});

test("completed stages do not replay without an authorized exception", () => {
  assert.deepEqual(authorizeCompletedStageRerun("LISTING_BUILT", ["LISTING_BUILT"], {}), {
    status: "ALREADY_COMPLETE"
  });
});

test("all four canonical rerun exceptions authorize only the requested rerun", () => {
  const cases = [
    [{ candidateFingerprintChanged: true }, "CANDIDATE_FINGERPRINT_CHANGED"],
    [{ upstreamDependencyChanged: true }, "UPSTREAM_DEPENDENCY_CHANGED"],
    [{ gateDefectStage: "LISTING_BUILT" as const }, "EXACT_STAGE_GATE_DEFECT"],
    [{ userExplicitlyRequestedRerun: true }, "USER_EXPLICIT_RERUN"]
  ] as const;
  for (const [exception, reason] of cases) {
    assert.deepEqual(authorizeCompletedStageRerun("LISTING_BUILT", ["LISTING_BUILT"], exception), {
      status: "RERUN_AUTHORIZED",
      reason
    });
  }
  assert.deepEqual(
    authorizeCompletedStageRerun("LISTING_BUILT", ["LISTING_BUILT"], { gateDefectStage: "PRODUCT_BUILT" }),
    { status: "ALREADY_COMPLETE" }
  );
});

test("LAST_COMPLETED_STAGE resolves from the reused canonical registry record", () => {
  assert.deepEqual(resolveLastCompletedStage(registryRecord("PRODUCT_BUILT")), {
    status: "RESOLVED",
    stage: "PRODUCT_BUILT"
  });
});

test("NEXT_EXECUTABLE_STAGE resolver returns exactly one stage", () => {
  const result = resolveNextExecutableStage(registryRecord("PRODUCT_BUILT"));
  assert.deepEqual(result, { status: "RESOLVED", stage: "PRODUCT_TEST_PASS" });
  assert.equal(Array.isArray(result.status === "RESOLVED" ? result.stage : null), false);
});

test("a valid transition advances lifecycle pointers and resolves exactly one next stage", () => {
  const original = registryRecord("PRODUCT_BUILT", "PRODUCT_TEST_PASS");
  const result = executeFactoryTransition({
    record: original,
    to: "PRODUCT_TEST_PASS",
    guard: guardFor("PRODUCT_BUILT", "PRODUCT_TEST_PASS"),
    transitionEvidenceReference: "product-test-pass-2"
  });
  assert.equal(result.status, "TRANSITION_APPLIED");
  if (result.status !== "TRANSITION_APPLIED") return;
  assert.equal(result.lastCompletedStage, "PRODUCT_TEST_PASS");
  assert.equal(result.nextExecutableStage, "LISTING_BUILT");
  assert.equal(result.record.registryRevision, 5);
  assert.equal(result.record.nextExecutableStage?.value, "LISTING_BUILT");
});

test("targeted repair routing returns one recovery point and never rewinds current history", () => {
  const cases = [
    ["PRODUCT_DEFECT", "BUILDING"],
    ["LISTING_DEFECT", "LISTING_BUILT"],
    ["UPLOAD_FAILURE", "DRAFT_PERSISTED"],
    ["IDENTITY_MISMATCH_BEFORE_PUBLISH", "PRODUCTION_AUTHORIZED"],
    ["API_OFFLINE_OR_RATE_LIMIT", "DRAFT_PERSISTED"],
    ["CREDENTIAL_ERROR", "DRAFT_PERSISTED"],
    ["PARTIAL_PUBLISH_AMBIGUOUS", "DRAFT_PERSISTED"],
    ["QC_FAILURE", "LISTING_BUILT"]
  ] as const;
  for (const [failure, targetStage] of cases) {
    const route = routeTargetedRepair({ failure, currentState: "DRAFT_PERSISTED" });
    assert.equal(route.targetStage, targetStage);
    assert.equal(route.preserveCurrentState, true);
    assert.ok(route.recoveryAction);
  }
  assert.equal(
    routeTargetedRepair({
      failure: "READ_BACK_MISMATCH",
      currentState: "DRAFT_PERSISTED",
      mappedSourceStage: "LISTING_BUILT"
    }).targetStage,
    "LISTING_BUILT"
  );
  assert.throws(
    () => routeTargetedRepair({ failure: "READ_BACK_MISMATCH", currentState: "DRAFT_PERSISTED" }),
    /MAPPED_SOURCE_STAGE_REQUIRED/
  );
});

test("blocked external dependency returns one blocker and one recovery action", () => {
  const result = executeFactoryTransition({
    record: registryRecord("BUILDING", "PRODUCT_BUILT"),
    to: "PRODUCT_BUILT",
    guard: {},
    transitionEvidenceReference: "unused",
    externalDependency: {
      blocker: "GOOGLE_DRIVE_UNAVAILABLE",
      recoveryAction: "RETRY_READ_ONLY_DRIVE_VERIFICATION"
    }
  });
  assert.deepEqual(result, {
    status: "GATE_BLOCKED",
    blocker: "GOOGLE_DRIVE_UNAVAILABLE",
    recoveryAction: "RETRY_READ_ONLY_DRIVE_VERIFICATION"
  });
});

test("unknown or ambiguous migrated lifecycle state fails closed", () => {
  const migrated = registryRecord(null);
  migrated.migrationReview = {
    status: "MIGRATION_REVIEW_REQUIRED",
    reasons: ["UNKNOWN_LIFECYCLE_MAPPING"]
  };
  assert.equal(resolveLastCompletedStage(migrated).status, "MIGRATION_REVIEW_REQUIRED");
  assert.equal(resolveNextExecutableStage(migrated).status, "MIGRATION_REVIEW_REQUIRED");
  assert.equal(
    executeFactoryTransition({
      record: migrated,
      to: "DISCOVERED",
      guard: guardFor(null, "DISCOVERED"),
      transitionEvidenceReference: "discovery-1"
    }).status,
    "MIGRATION_REVIEW_REQUIRED"
  );

  const invalidPointer = registryRecord("PRODUCT_BUILT", "PUBLISHED");
  assert.deepEqual(resolveNextExecutableStage(invalidPointer), {
    status: "MIGRATION_REVIEW_REQUIRED",
    reason: "INVALID_NEXT_STAGE_MAPPING:PRODUCT_BUILT->PUBLISHED"
  });
});

test("IMP-001 identity, source, references, and optimistic revision semantics are preserved", () => {
  const original = registryRecord("SPEC_LOCKED", "BUILDING");
  const result = executeFactoryTransition({
    record: original,
    to: "BUILDING",
    guard: guardFor("SPEC_LOCKED", "BUILDING"),
    transitionEvidenceReference: "build-lock-1"
  });
  assert.equal(result.status, "TRANSITION_APPLIED");
  if (result.status !== "TRANSITION_APPLIED") return;
  assert.equal(result.record.productId, original.productId);
  assert.equal(result.record.schemaVersion, original.schemaVersion);
  assert.deepEqual(result.record.importedSource, original.importedSource);
  assert.deepEqual(result.record.references, original.references);
  assert.equal(result.record.registryRevision, original.registryRevision + 1);
  assert.deepEqual(original, registryRecord("SPEC_LOCKED", "BUILDING"));
});
