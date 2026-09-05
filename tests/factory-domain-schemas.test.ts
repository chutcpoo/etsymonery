import assert from "node:assert/strict";
import test from "node:test";
import {
  FACTORY_DOMAIN_SCHEMA_VERSION,
  validateArtifact,
  validateAuditEvent,
  validateAuthorization,
  validateCandidate,
  validateChannelOperation,
  validateEvidence,
  validateGateRecord,
  validateGrowthDecision,
  validateListing,
  validateOpportunity,
  validatePerformanceSnapshot,
  validateProduct,
  validateSpecification,
  type Opportunity,
  type Product
} from "../lib/factory-domain-schemas";
import { CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION } from "../lib/product-registry";

const SHA = "a".repeat(64);
const NOW = "2026-09-05T03:30:00.000Z";
const LATER = "2026-09-06T03:30:00.000Z";

function productFixture(): Product {
  return {
    schemaVersion: CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION,
    productId: "PDT-HBOP-001",
    productVersion: "V1",
    registryRevision: 1,
    importedSource: {
      driveFileId: "1XoIRHCVGGG81ddMhLfyP4TBE9mCgbOft",
      fileName: "DIGITAL_PRODUCT_CATALOG_MASTER.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      accessMode: "READ_ONLY"
    },
    references: {
      listings: [],
      candidateIds: [],
      candidateFingerprints: [],
      passRecordIds: [],
      authorizationIds: [],
      evidenceIds: []
    },
    migrationReview: { status: "CLEAR", reasons: [] }
  };
}

function opportunityFixture(): Opportunity {
  return {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    opportunityId: "OPP-001",
    status: "OPPORTUNITY_CANDIDATE",
    market: "Thailand",
    channel: "Etsy",
    buyer: "Home bakery owner",
    language: "en",
    observedAt: NOW,
    freshnessExpiresAt: LATER,
    confidence: 80,
    hardPolicyBlockers: [],
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
    evidence: [{
      schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
      evidenceId: "EVIDENCE-001",
      source: "market-research",
      capturedAt: NOW,
      freshnessExpiresAt: LATER
    }]
  };
}

test("Product reuses the exact IMP-001 CanonicalProductRecord contract", () => {
  const product = productFixture();
  const normalized = validateProduct(product);
  assert.equal(normalized.schemaVersion, CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION);
  assert.equal(normalized.productId, "PDT-HBOP-001");
  assert.equal(normalized.registryRevision, 1);
});

test("Opportunity candidate preserves provenance, freshness, confidence and ten bounded signals", () => {
  const opportunity = opportunityFixture();
  opportunity.hardPolicyBlockers = ["POLICY-Z", "POLICY-A", "POLICY-A"];
  const normalized = validateOpportunity(opportunity);
  assert.equal(normalized.channel, "etsy");
  assert.deepEqual(normalized.hardPolicyBlockers, ["POLICY-A", "POLICY-Z"]);
  assert.equal(normalized.evidence.length, 1);
  assert.equal(Object.keys(normalized.signals).length, 10);
  assert.throws(() => validateOpportunity({ ...opportunity, confidence: 101 }), /INVALID_OPPORTUNITY_CONFIDENCE/);
  assert.throws(() => validateOpportunity({ ...opportunity, evidence: [] }), /OPPORTUNITY_EVIDENCE_REQUIRED/);
});

test("Evidence freshness cannot precede capture and hashes are canonicalized", () => {
  const normalized = validateEvidence({
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    evidenceId: "E-1",
    source: "Etsy",
    capturedAt: NOW,
    freshnessExpiresAt: LATER,
    sha256: SHA.toUpperCase()
  });
  assert.equal(normalized.sha256, SHA);
  assert.throws(() => validateEvidence({ ...normalized, freshnessExpiresAt: "2026-09-01T00:00:00.000Z" }), /EVIDENCE_FRESHNESS_PRECEDES_CAPTURE/);
});

test("Specification accepts only locked product specifications with stable identity", () => {
  const normalized = validateSpecification({
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    specificationId: "SPEC-001",
    productId: "PDT-HBOP-001",
    version: "V1",
    status: "PRODUCT_SPEC_LOCKED",
    lockedAt: NOW,
    evidenceIds: ["E-2", "E-1", "E-1"]
  });
  assert.deepEqual(normalized.evidenceIds, ["E-1", "E-2"]);
  assert.throws(() => validateSpecification({ ...normalized, status: "DRAFT" as "PRODUCT_SPEC_LOCKED" }), /INVALID_SPECIFICATION_STATUS/);
});

test("Artifact requires canonical Google Drive identity, bytes and SHA-256", () => {
  const artifact = {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    artifactId: "ART-001",
    productId: "PDT-HBOP-001",
    kind: "BUYER_ZIP",
    driveFileId: "drive-file-1",
    driveUrl: "https://drive.google.com/file/d/drive-file-1/view",
    mimeType: "application/zip",
    bytes: 100,
    sha256: SHA,
    stage: "PRODUCTION",
    status: "FROZEN" as const
  };
  assert.equal(validateArtifact(artifact).driveFileId, "drive-file-1");
  assert.throws(() => validateArtifact({ ...artifact, driveFileId: "" }), /ARTIFACT_DRIVE_ID_REQUIRED/);
  assert.throws(() => validateArtifact({ ...artifact, bytes: -1 }), /INVALID_ARTIFACT_BYTES/);
});

test("Frozen Candidate must bind to an immutable fingerprint", () => {
  const candidate = {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    candidateId: "CAND-001",
    productId: "PDT-HBOP-001",
    candidateType: "LISTING" as const,
    state: "FROZEN" as const,
    fingerprint: SHA,
    createdAt: NOW,
    artifactIds: ["ART-002", "ART-001", "ART-001"]
  };
  assert.deepEqual(validateCandidate(candidate).artifactIds, ["ART-001", "ART-002"]);
  assert.throws(() => validateCandidate({ ...candidate, fingerprint: undefined }), /FROZEN_CANDIDATE_FINGERPRINT_REQUIRED/);
});

test("PASS GateRecord is candidate-fingerprint bound and requires evidence", () => {
  const gate = {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    gateRecordId: "GATE-001",
    gateType: "INDEPENDENT_FINAL_QC" as const,
    result: "PASS" as const,
    candidateId: "CAND-001",
    candidateFingerprint: SHA,
    executionId: "EXEC-001",
    actorId: "CHAT-QC-001",
    createdAt: NOW,
    evidenceIds: ["E-1"]
  };
  assert.equal(validateGateRecord(gate).candidateFingerprint, SHA);
  assert.throws(() => validateGateRecord({ ...gate, evidenceIds: [] }), /PASS_GATE_EVIDENCE_REQUIRED/);
  assert.throws(() => validateGateRecord({ ...gate, candidateFingerprint: "bad" }), /INVALID_GATE_CANDIDATE_FINGERPRINT/);
});

test("Verified Listing requires complete candidate identity while migration-review listing may preserve legacy identity", () => {
  const verified = {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    listingRecordId: "LISTING-RECORD-001",
    productId: "PDT-HBOP-001",
    channel: "Etsy",
    listingId: "4566738686",
    state: "ACTIVE" as const,
    identityStatus: "VERIFIED" as const,
    candidateId: "CAND-001",
    candidateFingerprint: SHA,
    observedAt: NOW
  };
  assert.equal(validateListing(verified).identityStatus, "VERIFIED");
  assert.throws(() => validateListing({ ...verified, candidateId: undefined, candidateFingerprint: undefined }), /VERIFIED_LISTING_CANDIDATE_IDENTITY_REQUIRED/);

  const migrated = validateListing({
    ...verified,
    listingRecordId: "LISTING-LEGACY-001",
    identityStatus: "MIGRATION_REVIEW_REQUIRED",
    candidateId: undefined,
    candidateFingerprint: undefined
  });
  assert.equal(migrated.listingId, "4566738686");
});

test("Authorization binds publish authority to exact candidate fingerprint and enforces consumption state", () => {
  const authorization = {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    authorizationId: "AUTH-001",
    scope: "PUBLISH" as const,
    candidateId: "CAND-001",
    candidateFingerprint: SHA,
    channel: "Etsy",
    state: "ACTIVE" as const,
    issuedAt: NOW,
    expiresAt: LATER
  };
  assert.equal(validateAuthorization(authorization).channel, "etsy");
  assert.throws(() => validateAuthorization({ ...authorization, state: "CONSUMED" as const }), /CONSUMED_AUTHORIZATION_TIMESTAMP_REQUIRED/);
  assert.throws(() => validateAuthorization({ ...authorization, consumedAt: LATER }), /AUTHORIZATION_CONSUMED_AT_STATE_MISMATCH/);
});

test("Mutating ChannelOperation requires operation identity, expected state and authorization", () => {
  const operation = {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    operationId: "OP-001",
    operationType: "PUBLISH" as const,
    status: "PENDING" as const,
    requestHash: SHA,
    createdAt: NOW,
    candidateId: "CAND-001",
    expectedFingerprint: SHA,
    expectedState: "PRODUCTION_AUTHORIZED",
    authorizationId: "AUTH-001"
  };
  assert.equal(validateChannelOperation(operation).operationType, "PUBLISH");
  assert.throws(() => validateChannelOperation({ ...operation, authorizationId: undefined }), /MUTATING_OPERATION_IDENTITY_REQUIRED/);

  const readBack = validateChannelOperation({
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    operationId: "OP-READ-001",
    operationType: "READ_BACK",
    status: "SUCCEEDED",
    requestHash: SHA,
    createdAt: NOW
  });
  assert.equal(readBack.operationType, "READ_BACK");
});

test("PerformanceSnapshot distinguishes NOT_AVAILABLE metrics from measured values", () => {
  const snapshot = {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    snapshotId: "SNAP-001",
    productId: "PDT-HBOP-001",
    listingId: "4566738686",
    windowStart: NOW,
    windowEnd: LATER,
    metrics: {
      views: 100,
      visits: 50,
      favorites: 5,
      orders: 2,
      revenue: 20,
      conversionRate: 4,
      etsySearchVisits: null
    },
    unavailableFields: ["etsySearchVisits"] as const
  };
  assert.equal(validatePerformanceSnapshot(snapshot).metrics.orders, 2);
  assert.throws(() => validatePerformanceSnapshot({
    ...snapshot,
    metrics: { ...snapshot.metrics, etsySearchVisits: 1 }
  }), /PERFORMANCE_UNAVAILABLE_FIELD_HAS_VALUE:etsySearchVisits/);
});

test("GrowthDecision requires explicit evidence and valid KEEP/ITERATE/NEW_PATCH/RETIRE decision", () => {
  const decision = {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    growthDecisionId: "GROWTH-001",
    productId: "PDT-HBOP-001",
    performanceSnapshotId: "SNAP-001",
    decision: "KEEP" as const,
    createdAt: NOW,
    rationaleEvidenceIds: ["E-1"]
  };
  assert.equal(validateGrowthDecision(decision).decision, "KEEP");
  assert.throws(() => validateGrowthDecision({ ...decision, rationaleEvidenceIds: [] }), /GROWTH_DECISION_EVIDENCE_REQUIRED/);
});

test("AuditEvent keeps correlation/causation identity and rejects self-causation", () => {
  const event = {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    eventId: "EVENT-001",
    aggregateType: "Candidate",
    aggregateId: "CAND-001",
    eventType: "CANDIDATE_FROZEN",
    occurredAt: NOW,
    correlationId: "CORR-001",
    causationId: "EVENT-000",
    evidenceIds: ["E-1"]
  };
  assert.equal(validateAuditEvent(event).causationId, "EVENT-000");
  assert.throws(() => validateAuditEvent({ ...event, causationId: "EVENT-001" }), /AUDIT_EVENT_SELF_CAUSATION/);
});

test("migration fixture preserves uncertain legacy listing and IMP-001 product without inventing identity", () => {
  const product = validateProduct({
    ...productFixture(),
    rawLegacyCatalogStatus: "ACTIVE ETSY / RELEASED",
    migrationReview: { status: "MIGRATION_REVIEW_REQUIRED", reasons: ["UNKNOWN_LIFECYCLE_MAPPING"] }
  });
  const listing = validateListing({
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    listingRecordId: "LISTING-LEGACY-002",
    productId: product.productId,
    channel: "etsy",
    listingId: "4566738686",
    state: "ACTIVE",
    identityStatus: "MIGRATION_REVIEW_REQUIRED",
    observedAt: NOW
  });
  assert.equal(product.migrationReview.status, "MIGRATION_REVIEW_REQUIRED");
  assert.equal(listing.candidateId, undefined);
  assert.equal(listing.candidateFingerprint, undefined);
});
