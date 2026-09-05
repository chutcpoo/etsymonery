import {
  normalizeCanonicalProductRecord,
  type CanonicalProductRecord
} from "./product-registry";

export const FACTORY_DOMAIN_SCHEMA_VERSION = "1.0.0" as const;

export type Product = CanonicalProductRecord;
export type OpportunityDecision = "BUILD" | "WATCH" | "REJECT";
export type GrowthDecisionKind = "KEEP" | "ITERATE" | "NEW_PATCH" | "RETIRE";

export type Evidence = {
  schemaVersion: typeof FACTORY_DOMAIN_SCHEMA_VERSION;
  evidenceId: string;
  source: string;
  capturedAt: string;
  freshnessExpiresAt?: string;
  provenanceUri?: string;
  sha256?: string;
};

export type OpportunitySignals = {
  demand: number;
  competitionOpportunity: number;
  keywordOpportunity: number;
  buyerPainSeverity: number;
  commercialIntent: number;
  pricePotential: number;
  differentiationPotential: number;
  productionFeasibility: number;
  expectedMargin: number;
  evidenceConfidence: number;
};

export type Opportunity = {
  schemaVersion: typeof FACTORY_DOMAIN_SCHEMA_VERSION;
  opportunityId: string;
  status: "OPPORTUNITY_CANDIDATE";
  market: string;
  channel: string;
  buyer: string;
  language: string;
  observedAt: string;
  freshnessExpiresAt?: string;
  confidence: number;
  signals: OpportunitySignals;
  hardPolicyBlockers: readonly string[];
  evidence: readonly Evidence[];
};

export type Specification = {
  schemaVersion: typeof FACTORY_DOMAIN_SCHEMA_VERSION;
  specificationId: string;
  productId: string;
  version: string;
  status: "PRODUCT_SPEC_LOCKED";
  lockedAt: string;
  evidenceIds: readonly string[];
};

export type Artifact = {
  schemaVersion: typeof FACTORY_DOMAIN_SCHEMA_VERSION;
  artifactId: string;
  productId: string;
  kind: string;
  driveFileId: string;
  driveUrl: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  stage: string;
  status: "REGISTERED" | "FROZEN";
};

export type Candidate = {
  schemaVersion: typeof FACTORY_DOMAIN_SCHEMA_VERSION;
  candidateId: string;
  productId: string;
  candidateType: "PRODUCT" | "LISTING" | "PATCH";
  state: "DRAFT" | "FROZEN";
  fingerprint?: string;
  createdAt: string;
  artifactIds: readonly string[];
};

export type GateRecord = {
  schemaVersion: typeof FACTORY_DOMAIN_SCHEMA_VERSION;
  gateRecordId: string;
  gateType: "PRODUCT_TEST" | "LISTING_TEST" | "PERSISTENCE_VERIFY" | "INDEPENDENT_FINAL_QC";
  result: "PASS" | "FAIL";
  candidateId: string;
  candidateFingerprint: string;
  executionId: string;
  actorId: string;
  createdAt: string;
  evidenceIds: readonly string[];
};

export type Listing = {
  schemaVersion: typeof FACTORY_DOMAIN_SCHEMA_VERSION;
  listingRecordId: string;
  productId: string;
  channel: string;
  listingId: string;
  state: "DRAFT" | "ACTIVE" | "INACTIVE";
  identityStatus: "VERIFIED" | "MIGRATION_REVIEW_REQUIRED";
  candidateId?: string;
  candidateFingerprint?: string;
  observedAt: string;
};

export type Authorization = {
  schemaVersion: typeof FACTORY_DOMAIN_SCHEMA_VERSION;
  authorizationId: string;
  scope: "PUBLISH";
  candidateId: string;
  candidateFingerprint: string;
  channel: string;
  state: "ACTIVE" | "CONSUMED" | "REVOKED" | "EXPIRED";
  issuedAt: string;
  expiresAt?: string;
  consumedAt?: string;
};

export type ChannelOperation = {
  schemaVersion: typeof FACTORY_DOMAIN_SCHEMA_VERSION;
  operationId: string;
  operationType: "CREATE_DRAFT" | "UPDATE_DRAFT" | "UPLOAD_IMAGE" | "UPLOAD_FILE" | "PUBLISH" | "READ_BACK";
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "RECONCILIATION_REQUIRED";
  requestHash: string;
  createdAt: string;
  candidateId?: string;
  expectedFingerprint?: string;
  expectedState?: string;
  authorizationId?: string;
};

export type PerformanceMetrics = {
  views: number | null;
  visits: number | null;
  favorites: number | null;
  orders: number | null;
  revenue: number | null;
  conversionRate: number | null;
  etsySearchVisits: number | null;
};

export type PerformanceSnapshot = {
  schemaVersion: typeof FACTORY_DOMAIN_SCHEMA_VERSION;
  snapshotId: string;
  productId: string;
  listingId: string;
  windowStart: string;
  windowEnd: string;
  metrics: PerformanceMetrics;
  unavailableFields: readonly (keyof PerformanceMetrics)[];
};

export type GrowthDecision = {
  schemaVersion: typeof FACTORY_DOMAIN_SCHEMA_VERSION;
  growthDecisionId: string;
  productId: string;
  performanceSnapshotId: string;
  decision: GrowthDecisionKind;
  createdAt: string;
  rationaleEvidenceIds: readonly string[];
};

export type AuditEvent = {
  schemaVersion: typeof FACTORY_DOMAIN_SCHEMA_VERSION;
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  occurredAt: string;
  correlationId: string;
  causationId?: string;
  evidenceIds: readonly string[];
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

function required(value: string, code: string) {
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function stableId(value: string, code: string) {
  const normalized = required(value, code);
  if (!ID_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

function timestamp(value: string, code: string) {
  const normalized = required(value, code);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(code);
  return normalized;
}

function score(value: number, code: string) {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(code);
  return value;
}

function nonNegative(value: number, code: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(code);
  return value;
}

function sha256(value: string, code: string) {
  const normalized = required(value, code).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

function sortedUnique(values: readonly string[], code: string) {
  return [...new Set(values.map((value) => required(value, code)))].sort((a, b) => a.localeCompare(b, "en"));
}

function assertVersion(value: string) {
  if (value !== FACTORY_DOMAIN_SCHEMA_VERSION) throw new Error("UNSUPPORTED_FACTORY_DOMAIN_SCHEMA_VERSION");
}

export function validateProduct(product: Product): Product {
  return normalizeCanonicalProductRecord(product);
}

export function validateEvidence(value: Evidence): Evidence {
  assertVersion(value.schemaVersion);
  const capturedAt = timestamp(value.capturedAt, "INVALID_EVIDENCE_CAPTURED_AT");
  const freshnessExpiresAt = value.freshnessExpiresAt
    ? timestamp(value.freshnessExpiresAt, "INVALID_EVIDENCE_FRESHNESS_EXPIRES_AT")
    : undefined;
  if (freshnessExpiresAt && Date.parse(freshnessExpiresAt) < Date.parse(capturedAt)) {
    throw new Error("EVIDENCE_FRESHNESS_PRECEDES_CAPTURE");
  }
  const normalized: Evidence = {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    evidenceId: stableId(value.evidenceId, "INVALID_EVIDENCE_ID"),
    source: required(value.source, "INVALID_EVIDENCE_SOURCE"),
    capturedAt
  };
  if (freshnessExpiresAt) normalized.freshnessExpiresAt = freshnessExpiresAt;
  if (value.provenanceUri) normalized.provenanceUri = required(value.provenanceUri, "INVALID_EVIDENCE_PROVENANCE_URI");
  if (value.sha256) normalized.sha256 = sha256(value.sha256, "INVALID_EVIDENCE_SHA256");
  return normalized;
}

export function validateOpportunity(value: Opportunity): Opportunity {
  assertVersion(value.schemaVersion);
  if (value.status !== "OPPORTUNITY_CANDIDATE") throw new Error("INVALID_OPPORTUNITY_STATUS");
  const observedAt = timestamp(value.observedAt, "INVALID_OPPORTUNITY_OBSERVED_AT");
  const freshnessExpiresAt = value.freshnessExpiresAt
    ? timestamp(value.freshnessExpiresAt, "INVALID_OPPORTUNITY_FRESHNESS_EXPIRES_AT")
    : undefined;
  if (freshnessExpiresAt && Date.parse(freshnessExpiresAt) < Date.parse(observedAt)) {
    throw new Error("OPPORTUNITY_FRESHNESS_PRECEDES_OBSERVATION");
  }
  const evidence = value.evidence.map(validateEvidence).sort((a, b) => a.evidenceId.localeCompare(b.evidenceId, "en"));
  if (!evidence.length) throw new Error("OPPORTUNITY_EVIDENCE_REQUIRED");
  const signals: OpportunitySignals = {
    demand: score(value.signals.demand, "INVALID_DEMAND_SCORE"),
    competitionOpportunity: score(value.signals.competitionOpportunity, "INVALID_COMPETITION_OPPORTUNITY_SCORE"),
    keywordOpportunity: score(value.signals.keywordOpportunity, "INVALID_KEYWORD_OPPORTUNITY_SCORE"),
    buyerPainSeverity: score(value.signals.buyerPainSeverity, "INVALID_BUYER_PAIN_SEVERITY_SCORE"),
    commercialIntent: score(value.signals.commercialIntent, "INVALID_COMMERCIAL_INTENT_SCORE"),
    pricePotential: score(value.signals.pricePotential, "INVALID_PRICE_POTENTIAL_SCORE"),
    differentiationPotential: score(value.signals.differentiationPotential, "INVALID_DIFFERENTIATION_POTENTIAL_SCORE"),
    productionFeasibility: score(value.signals.productionFeasibility, "INVALID_PRODUCTION_FEASIBILITY_SCORE"),
    expectedMargin: score(value.signals.expectedMargin, "INVALID_EXPECTED_MARGIN_SCORE"),
    evidenceConfidence: score(value.signals.evidenceConfidence, "INVALID_EVIDENCE_CONFIDENCE_SCORE")
  };
  return {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    opportunityId: stableId(value.opportunityId, "INVALID_OPPORTUNITY_ID"),
    status: "OPPORTUNITY_CANDIDATE",
    market: required(value.market, "INVALID_OPPORTUNITY_MARKET"),
    channel: required(value.channel, "INVALID_OPPORTUNITY_CHANNEL").toLowerCase(),
    buyer: required(value.buyer, "INVALID_OPPORTUNITY_BUYER"),
    language: required(value.language, "INVALID_OPPORTUNITY_LANGUAGE"),
    observedAt,
    ...(freshnessExpiresAt ? { freshnessExpiresAt } : {}),
    confidence: score(value.confidence, "INVALID_OPPORTUNITY_CONFIDENCE"),
    signals,
    hardPolicyBlockers: sortedUnique(value.hardPolicyBlockers, "INVALID_HARD_POLICY_BLOCKER"),
    evidence
  };
}

export function validateSpecification(value: Specification): Specification {
  assertVersion(value.schemaVersion);
  if (value.status !== "PRODUCT_SPEC_LOCKED") throw new Error("INVALID_SPECIFICATION_STATUS");
  return {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    specificationId: stableId(value.specificationId, "INVALID_SPECIFICATION_ID"),
    productId: stableId(value.productId, "INVALID_SPECIFICATION_PRODUCT_ID"),
    version: required(value.version, "INVALID_SPECIFICATION_VERSION"),
    status: "PRODUCT_SPEC_LOCKED",
    lockedAt: timestamp(value.lockedAt, "INVALID_SPECIFICATION_LOCKED_AT"),
    evidenceIds: sortedUnique(value.evidenceIds, "INVALID_SPECIFICATION_EVIDENCE_ID")
  };
}

export function validateArtifact(value: Artifact): Artifact {
  assertVersion(value.schemaVersion);
  if (value.status !== "REGISTERED" && value.status !== "FROZEN") throw new Error("INVALID_ARTIFACT_STATUS");
  return {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    artifactId: stableId(value.artifactId, "INVALID_ARTIFACT_ID"),
    productId: stableId(value.productId, "INVALID_ARTIFACT_PRODUCT_ID"),
    kind: required(value.kind, "INVALID_ARTIFACT_KIND"),
    driveFileId: required(value.driveFileId, "ARTIFACT_DRIVE_ID_REQUIRED"),
    driveUrl: required(value.driveUrl, "ARTIFACT_DRIVE_URL_REQUIRED"),
    mimeType: required(value.mimeType, "INVALID_ARTIFACT_MIME_TYPE"),
    bytes: nonNegative(value.bytes, "INVALID_ARTIFACT_BYTES"),
    sha256: sha256(value.sha256, "INVALID_ARTIFACT_SHA256"),
    stage: required(value.stage, "INVALID_ARTIFACT_STAGE"),
    status: value.status
  };
}

export function validateCandidate(value: Candidate): Candidate {
  assertVersion(value.schemaVersion);
  const normalized: Candidate = {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    candidateId: stableId(value.candidateId, "INVALID_CANDIDATE_ID"),
    productId: stableId(value.productId, "INVALID_CANDIDATE_PRODUCT_ID"),
    candidateType: value.candidateType,
    state: value.state,
    createdAt: timestamp(value.createdAt, "INVALID_CANDIDATE_CREATED_AT"),
    artifactIds: sortedUnique(value.artifactIds, "INVALID_CANDIDATE_ARTIFACT_ID")
  };
  if (!(["PRODUCT", "LISTING", "PATCH"] as const).includes(value.candidateType)) throw new Error("INVALID_CANDIDATE_TYPE");
  if (!(["DRAFT", "FROZEN"] as const).includes(value.state)) throw new Error("INVALID_CANDIDATE_STATE");
  if (value.fingerprint) normalized.fingerprint = sha256(value.fingerprint, "INVALID_CANDIDATE_FINGERPRINT");
  if (value.state === "FROZEN" && !normalized.fingerprint) throw new Error("FROZEN_CANDIDATE_FINGERPRINT_REQUIRED");
  return normalized;
}

export function validateGateRecord(value: GateRecord): GateRecord {
  assertVersion(value.schemaVersion);
  if (!(["PRODUCT_TEST", "LISTING_TEST", "PERSISTENCE_VERIFY", "INDEPENDENT_FINAL_QC"] as const).includes(value.gateType)) {
    throw new Error("INVALID_GATE_TYPE");
  }
  if (value.result !== "PASS" && value.result !== "FAIL") throw new Error("INVALID_GATE_RESULT");
  const evidenceIds = sortedUnique(value.evidenceIds, "INVALID_GATE_EVIDENCE_ID");
  if (value.result === "PASS" && !evidenceIds.length) throw new Error("PASS_GATE_EVIDENCE_REQUIRED");
  return {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    gateRecordId: stableId(value.gateRecordId, "INVALID_GATE_RECORD_ID"),
    gateType: value.gateType,
    result: value.result,
    candidateId: stableId(value.candidateId, "INVALID_GATE_CANDIDATE_ID"),
    candidateFingerprint: sha256(value.candidateFingerprint, "INVALID_GATE_CANDIDATE_FINGERPRINT"),
    executionId: stableId(value.executionId, "INVALID_GATE_EXECUTION_ID"),
    actorId: stableId(value.actorId, "INVALID_GATE_ACTOR_ID"),
    createdAt: timestamp(value.createdAt, "INVALID_GATE_CREATED_AT"),
    evidenceIds
  };
}

export function validateListing(value: Listing): Listing {
  assertVersion(value.schemaVersion);
  if (!(["DRAFT", "ACTIVE", "INACTIVE"] as const).includes(value.state)) throw new Error("INVALID_LISTING_STATE");
  if (value.identityStatus !== "VERIFIED" && value.identityStatus !== "MIGRATION_REVIEW_REQUIRED") {
    throw new Error("INVALID_LISTING_IDENTITY_STATUS");
  }
  const candidateId = value.candidateId ? stableId(value.candidateId, "INVALID_LISTING_CANDIDATE_ID") : undefined;
  const candidateFingerprint = value.candidateFingerprint
    ? sha256(value.candidateFingerprint, "INVALID_LISTING_CANDIDATE_FINGERPRINT")
    : undefined;
  if (value.identityStatus === "VERIFIED" && (!candidateId || !candidateFingerprint)) {
    throw new Error("VERIFIED_LISTING_CANDIDATE_IDENTITY_REQUIRED");
  }
  if ((candidateId && !candidateFingerprint) || (!candidateId && candidateFingerprint)) {
    throw new Error("LISTING_CANDIDATE_IDENTITY_INCOMPLETE");
  }
  return {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    listingRecordId: stableId(value.listingRecordId, "INVALID_LISTING_RECORD_ID"),
    productId: stableId(value.productId, "INVALID_LISTING_PRODUCT_ID"),
    channel: required(value.channel, "INVALID_LISTING_CHANNEL").toLowerCase(),
    listingId: required(value.listingId, "INVALID_LISTING_ID"),
    state: value.state,
    identityStatus: value.identityStatus,
    ...(candidateId ? { candidateId } : {}),
    ...(candidateFingerprint ? { candidateFingerprint } : {}),
    observedAt: timestamp(value.observedAt, "INVALID_LISTING_OBSERVED_AT")
  };
}

export function validateAuthorization(value: Authorization): Authorization {
  assertVersion(value.schemaVersion);
  if (value.scope !== "PUBLISH") throw new Error("INVALID_AUTHORIZATION_SCOPE");
  if (!(["ACTIVE", "CONSUMED", "REVOKED", "EXPIRED"] as const).includes(value.state)) throw new Error("INVALID_AUTHORIZATION_STATE");
  const issuedAt = timestamp(value.issuedAt, "INVALID_AUTHORIZATION_ISSUED_AT");
  const expiresAt = value.expiresAt ? timestamp(value.expiresAt, "INVALID_AUTHORIZATION_EXPIRES_AT") : undefined;
  const consumedAt = value.consumedAt ? timestamp(value.consumedAt, "INVALID_AUTHORIZATION_CONSUMED_AT") : undefined;
  if (expiresAt && Date.parse(expiresAt) < Date.parse(issuedAt)) throw new Error("AUTHORIZATION_EXPIRY_PRECEDES_ISSUE");
  if (value.state === "CONSUMED" && !consumedAt) throw new Error("CONSUMED_AUTHORIZATION_TIMESTAMP_REQUIRED");
  if (value.state !== "CONSUMED" && consumedAt) throw new Error("AUTHORIZATION_CONSUMED_AT_STATE_MISMATCH");
  return {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    authorizationId: stableId(value.authorizationId, "INVALID_AUTHORIZATION_ID"),
    scope: "PUBLISH",
    candidateId: stableId(value.candidateId, "INVALID_AUTHORIZATION_CANDIDATE_ID"),
    candidateFingerprint: sha256(value.candidateFingerprint, "INVALID_AUTHORIZATION_CANDIDATE_FINGERPRINT"),
    channel: required(value.channel, "INVALID_AUTHORIZATION_CHANNEL").toLowerCase(),
    state: value.state,
    issuedAt,
    ...(expiresAt ? { expiresAt } : {}),
    ...(consumedAt ? { consumedAt } : {})
  };
}

export function validateChannelOperation(value: ChannelOperation): ChannelOperation {
  assertVersion(value.schemaVersion);
  if (!(["CREATE_DRAFT", "UPDATE_DRAFT", "UPLOAD_IMAGE", "UPLOAD_FILE", "PUBLISH", "READ_BACK"] as const).includes(value.operationType)) {
    throw new Error("INVALID_CHANNEL_OPERATION_TYPE");
  }
  if (!(["PENDING", "SUCCEEDED", "FAILED", "RECONCILIATION_REQUIRED"] as const).includes(value.status)) {
    throw new Error("INVALID_CHANNEL_OPERATION_STATUS");
  }
  const mutating = value.operationType !== "READ_BACK";
  if (mutating && (!value.candidateId || !value.expectedFingerprint || !value.expectedState || !value.authorizationId)) {
    throw new Error("MUTATING_OPERATION_IDENTITY_REQUIRED");
  }
  return {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    operationId: stableId(value.operationId, "INVALID_CHANNEL_OPERATION_ID"),
    operationType: value.operationType,
    status: value.status,
    requestHash: sha256(value.requestHash, "INVALID_CHANNEL_OPERATION_REQUEST_HASH"),
    createdAt: timestamp(value.createdAt, "INVALID_CHANNEL_OPERATION_CREATED_AT"),
    ...(value.candidateId ? { candidateId: stableId(value.candidateId, "INVALID_CHANNEL_OPERATION_CANDIDATE_ID") } : {}),
    ...(value.expectedFingerprint ? { expectedFingerprint: sha256(value.expectedFingerprint, "INVALID_CHANNEL_OPERATION_FINGERPRINT") } : {}),
    ...(value.expectedState ? { expectedState: required(value.expectedState, "INVALID_CHANNEL_OPERATION_EXPECTED_STATE") } : {}),
    ...(value.authorizationId ? { authorizationId: stableId(value.authorizationId, "INVALID_CHANNEL_OPERATION_AUTHORIZATION_ID") } : {})
  };
}

const PERFORMANCE_FIELDS: readonly (keyof PerformanceMetrics)[] = [
  "views", "visits", "favorites", "orders", "revenue", "conversionRate", "etsySearchVisits"
];

export function validatePerformanceSnapshot(value: PerformanceSnapshot): PerformanceSnapshot {
  assertVersion(value.schemaVersion);
  const windowStart = timestamp(value.windowStart, "INVALID_PERFORMANCE_WINDOW_START");
  const windowEnd = timestamp(value.windowEnd, "INVALID_PERFORMANCE_WINDOW_END");
  if (Date.parse(windowEnd) <= Date.parse(windowStart)) throw new Error("INVALID_PERFORMANCE_WINDOW_ORDER");
  const unavailableFields = [...new Set(value.unavailableFields)].sort();
  for (const field of unavailableFields) {
    if (!PERFORMANCE_FIELDS.includes(field)) throw new Error("INVALID_PERFORMANCE_UNAVAILABLE_FIELD");
    if (value.metrics[field] !== null) throw new Error(`PERFORMANCE_UNAVAILABLE_FIELD_HAS_VALUE:${field}`);
  }
  const metrics = Object.fromEntries(
    PERFORMANCE_FIELDS.map((field) => {
      const metric = value.metrics[field];
      if (metric === null) return [field, null];
      return [field, nonNegative(metric, `INVALID_PERFORMANCE_METRIC:${field}`)];
    })
  ) as PerformanceMetrics;
  return {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    snapshotId: stableId(value.snapshotId, "INVALID_PERFORMANCE_SNAPSHOT_ID"),
    productId: stableId(value.productId, "INVALID_PERFORMANCE_PRODUCT_ID"),
    listingId: required(value.listingId, "INVALID_PERFORMANCE_LISTING_ID"),
    windowStart,
    windowEnd,
    metrics,
    unavailableFields
  };
}

export function validateGrowthDecision(value: GrowthDecision): GrowthDecision {
  assertVersion(value.schemaVersion);
  if (!(["KEEP", "ITERATE", "NEW_PATCH", "RETIRE"] as const).includes(value.decision)) throw new Error("INVALID_GROWTH_DECISION");
  const rationaleEvidenceIds = sortedUnique(value.rationaleEvidenceIds, "INVALID_GROWTH_EVIDENCE_ID");
  if (!rationaleEvidenceIds.length) throw new Error("GROWTH_DECISION_EVIDENCE_REQUIRED");
  return {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    growthDecisionId: stableId(value.growthDecisionId, "INVALID_GROWTH_DECISION_ID"),
    productId: stableId(value.productId, "INVALID_GROWTH_PRODUCT_ID"),
    performanceSnapshotId: stableId(value.performanceSnapshotId, "INVALID_GROWTH_SNAPSHOT_ID"),
    decision: value.decision,
    createdAt: timestamp(value.createdAt, "INVALID_GROWTH_CREATED_AT"),
    rationaleEvidenceIds
  };
}

export function validateAuditEvent(value: AuditEvent): AuditEvent {
  assertVersion(value.schemaVersion);
  const eventId = stableId(value.eventId, "INVALID_AUDIT_EVENT_ID");
  const causationId = value.causationId ? stableId(value.causationId, "INVALID_AUDIT_CAUSATION_ID") : undefined;
  if (causationId === eventId) throw new Error("AUDIT_EVENT_SELF_CAUSATION");
  return {
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    eventId,
    aggregateType: required(value.aggregateType, "INVALID_AUDIT_AGGREGATE_TYPE"),
    aggregateId: stableId(value.aggregateId, "INVALID_AUDIT_AGGREGATE_ID"),
    eventType: required(value.eventType, "INVALID_AUDIT_EVENT_TYPE"),
    occurredAt: timestamp(value.occurredAt, "INVALID_AUDIT_OCCURRED_AT"),
    correlationId: stableId(value.correlationId, "INVALID_AUDIT_CORRELATION_ID"),
    ...(causationId ? { causationId } : {}),
    evidenceIds: sortedUnique(value.evidenceIds, "INVALID_AUDIT_EVIDENCE_ID")
  };
}
