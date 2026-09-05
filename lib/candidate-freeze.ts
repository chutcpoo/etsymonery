import {
  FACTORY_DOMAIN_SCHEMA_VERSION,
  validateCandidate,
  type Candidate
} from "./factory-domain-schemas";
import {
  canonicalizeFingerprintPayload,
  createCandidateFingerprint,
  createListingFingerprint,
  type CandidateFingerprintScope
} from "./candidate-fingerprint";

export const CANDIDATE_MANIFEST_SCHEMA_VERSION = "1.0.0" as const;

export type CandidateManifestInput = {
  schemaVersion: typeof CANDIDATE_MANIFEST_SCHEMA_VERSION;
  lineageId: string;
  candidateVersion: number;
  candidateId: string;
  productId: string;
  candidateType: Candidate["candidateType"];
  createdAt: string;
  frozenAt: string;
  artifactIds: readonly string[];
  payload: Record<string, unknown>;
};

export type FrozenCandidateManifest = {
  schemaVersion: typeof CANDIDATE_MANIFEST_SCHEMA_VERSION;
  lineageId: string;
  candidateVersion: number;
  candidate: Candidate & { state: "FROZEN"; fingerprint: string };
  frozenAt: string;
  fingerprintScope: CandidateFingerprintScope;
  canonicalPayload: ReturnType<typeof canonicalizeFingerprintPayload>;
};

function required(value: string, code: string) {
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function timestamp(value: string, code: string) {
  const normalized = required(value, code);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(code);
  return normalized;
}

function version(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("INVALID_CANDIDATE_VERSION");
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function fingerprintScope(candidateType: Candidate["candidateType"]): CandidateFingerprintScope {
  return candidateType === "LISTING" ? "LISTING" : "CANDIDATE";
}

function fingerprintFor(scope: CandidateFingerprintScope, payload: Record<string, unknown>) {
  return scope === "LISTING" ? createListingFingerprint(payload) : createCandidateFingerprint(payload);
}

function manifestMaterial(input: CandidateManifestInput) {
  const artifactIds = [...new Set(input.artifactIds.map((id) => required(id, "INVALID_CANDIDATE_ARTIFACT_ID")))]
    .sort((a, b) => a.localeCompare(b, "en"));
  const canonicalPayload = canonicalizeFingerprintPayload(input.payload);
  return {
    artifactIds,
    canonicalPayload,
    fingerprintMaterial: {
      productId: required(input.productId, "INVALID_CANDIDATE_PRODUCT_ID"),
      candidateType: input.candidateType,
      artifactIds,
      payload: canonicalPayload
    }
  };
}

export function freezeCandidateManifest(input: CandidateManifestInput): FrozenCandidateManifest {
  if (input.schemaVersion !== CANDIDATE_MANIFEST_SCHEMA_VERSION) {
    throw new Error("UNSUPPORTED_CANDIDATE_MANIFEST_SCHEMA_VERSION");
  }
  const candidateVersion = version(input.candidateVersion);
  const lineageId = required(input.lineageId, "INVALID_CANDIDATE_LINEAGE_ID");
  const createdAt = timestamp(input.createdAt, "INVALID_CANDIDATE_CREATED_AT");
  const frozenAt = timestamp(input.frozenAt, "INVALID_CANDIDATE_FROZEN_AT");
  if (Date.parse(frozenAt) < Date.parse(createdAt)) throw new Error("CANDIDATE_FROZEN_BEFORE_CREATED");

  const material = manifestMaterial(input);
  const scope = fingerprintScope(input.candidateType);
  const fingerprint = fingerprintFor(scope, material.fingerprintMaterial);
  const candidate = validateCandidate({
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION,
    candidateId: input.candidateId,
    productId: input.productId,
    candidateType: input.candidateType,
    state: "FROZEN",
    fingerprint,
    createdAt,
    artifactIds: material.artifactIds
  }) as Candidate & { state: "FROZEN"; fingerprint: string };

  return deepFreeze({
    schemaVersion: CANDIDATE_MANIFEST_SCHEMA_VERSION,
    lineageId,
    candidateVersion,
    candidate,
    frozenAt,
    fingerprintScope: scope,
    canonicalPayload: material.canonicalPayload
  });
}

function canonicalManifest(manifest: FrozenCandidateManifest) {
  return JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    lineageId: manifest.lineageId,
    candidateVersion: manifest.candidateVersion,
    candidate: manifest.candidate,
    frozenAt: manifest.frozenAt,
    fingerprintScope: manifest.fingerprintScope,
    canonicalPayload: manifest.canonicalPayload
  });
}

export function verifyFrozenCandidateUnchanged(
  existing: FrozenCandidateManifest,
  proposed: CandidateManifestInput
): FrozenCandidateManifest {
  const next = freezeCandidateManifest(proposed);
  if (
    next.lineageId !== existing.lineageId ||
    next.candidateVersion !== existing.candidateVersion ||
    next.candidate.candidateId !== existing.candidate.candidateId
  ) {
    throw new Error("FROZEN_CANDIDATE_IDENTITY_MISMATCH");
  }
  if (canonicalManifest(next) !== canonicalManifest(existing)) {
    throw new Error("NEW_CANDIDATE_VERSION_REQUIRED");
  }
  return existing;
}

export function createNextCandidateVersion(
  previous: FrozenCandidateManifest,
  input: CandidateManifestInput
): FrozenCandidateManifest {
  if (input.lineageId.normalize("NFC").trim() !== previous.lineageId) {
    throw new Error("CANDIDATE_LINEAGE_MISMATCH");
  }
  if (input.candidateVersion !== previous.candidateVersion + 1) {
    throw new Error("NEXT_CANDIDATE_VERSION_REQUIRED");
  }
  if (input.candidateId.normalize("NFC").trim() === previous.candidate.candidateId) {
    throw new Error("NEW_CANDIDATE_ID_REQUIRED");
  }
  if (input.productId.normalize("NFC").trim() !== previous.candidate.productId) {
    throw new Error("CANDIDATE_PRODUCT_MISMATCH");
  }
  if (input.candidateType !== previous.candidate.candidateType) {
    throw new Error("CANDIDATE_TYPE_MISMATCH");
  }
  return freezeCandidateManifest(input);
}
