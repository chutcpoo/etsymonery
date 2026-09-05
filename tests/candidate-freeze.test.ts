import assert from "node:assert/strict";
import test from "node:test";
import {
  CANDIDATE_MANIFEST_SCHEMA_VERSION,
  createNextCandidateVersion,
  freezeCandidateManifest,
  verifyFrozenCandidateUnchanged,
  type CandidateManifestInput
} from "../lib/candidate-freeze";
import { createCandidateFingerprint, createListingFingerprint } from "../lib/candidate-fingerprint";

const NOW = "2026-09-05T05:00:00.000Z";
const LATER = "2026-09-05T05:01:00.000Z";

function input(overrides: Partial<CandidateManifestInput> = {}): CandidateManifestInput {
  return {
    schemaVersion: CANDIDATE_MANIFEST_SCHEMA_VERSION,
    lineageId: "PDT-HBOP-001-LISTING",
    candidateVersion: 1,
    candidateId: "CAND-HBOP-LISTING-V1",
    productId: "PDT-HBOP-001",
    candidateType: "LISTING",
    createdAt: NOW,
    frozenAt: LATER,
    artifactIds: ["ART-2", "ART-1", "ART-1"],
    payload: {
      title: "Home Bakery Planner",
      price: 14.9,
      tags: ["bakery planner", "order tracker"]
    },
    ...overrides
  };
}

test("freezes a listing candidate into an immutable canonical manifest", () => {
  const manifest = freezeCandidateManifest(input());
  assert.equal(manifest.candidate.state, "FROZEN");
  assert.equal(manifest.candidateVersion, 1);
  assert.deepEqual(manifest.candidate.artifactIds, ["ART-1", "ART-2"]);
  assert.equal(manifest.fingerprintScope, "LISTING");
  assert.ok(Object.isFrozen(manifest));
  assert.ok(Object.isFrozen(manifest.candidate));
  assert.ok(Object.isFrozen(manifest.canonicalPayload));
});

test("listing manifest uses the IMP-104 listing fingerprint over canonical manifest material", () => {
  const value = input();
  const manifest = freezeCandidateManifest(value);
  const expected = createListingFingerprint({
    productId: value.productId,
    candidateType: value.candidateType,
    artifactIds: ["ART-1", "ART-2"],
    payload: value.payload
  });
  assert.equal(manifest.candidate.fingerprint, expected);
});

test("product and patch candidates use candidate fingerprint scope", () => {
  const value = input({ candidateType: "PRODUCT", lineageId: "PDT-HBOP-001-PRODUCT", candidateId: "CAND-HBOP-PRODUCT-V1" });
  const manifest = freezeCandidateManifest(value);
  assert.equal(manifest.fingerprintScope, "CANDIDATE");
  assert.equal(manifest.candidate.fingerprint, createCandidateFingerprint({
    productId: value.productId,
    candidateType: value.candidateType,
    artifactIds: ["ART-1", "ART-2"],
    payload: value.payload
  }));
});

test("equivalent logical payload/object order yields identical frozen fingerprint", () => {
  const a = freezeCandidateManifest(input());
  const b = freezeCandidateManifest(input({ payload: { tags: ["bakery planner", "order tracker"], price: 14.9, title: "Home Bakery Planner" } }));
  assert.equal(a.candidate.fingerprint, b.candidate.fingerprint);
});

test("freezing is read-only and detached from source input", () => {
  const source = input();
  const before = structuredClone(source);
  const manifest = freezeCandidateManifest(source);
  assert.deepEqual(source, before);
  source.payload.title = "Changed outside";
  assert.equal((manifest.canonicalPayload as Record<string, unknown>).title, "Home Bakery Planner");
});

test("same frozen identity with an attempted field mutation requires a new candidate version", () => {
  const frozen = freezeCandidateManifest(input());
  assert.throws(() => verifyFrozenCandidateUnchanged(frozen, input({
    payload: { ...input().payload, price: 19.9 }
  })), /NEW_CANDIDATE_VERSION_REQUIRED/);
});

test("identical frozen candidate verification is idempotent", () => {
  const frozen = freezeCandidateManifest(input());
  assert.equal(verifyFrozenCandidateUnchanged(frozen, input()), frozen);
});

test("same version with a different candidate ID is identity mismatch, not mutation", () => {
  const frozen = freezeCandidateManifest(input());
  assert.throws(() => verifyFrozenCandidateUnchanged(frozen, input({ candidateId: "CAND-OTHER" })), /FROZEN_CANDIDATE_IDENTITY_MISMATCH/);
});

test("next candidate version must increment exactly by one", () => {
  const frozen = freezeCandidateManifest(input());
  assert.throws(() => createNextCandidateVersion(frozen, input({
    candidateVersion: 3,
    candidateId: "CAND-HBOP-LISTING-V3"
  })), /NEXT_CANDIDATE_VERSION_REQUIRED/);
});

test("next candidate version requires a new candidate ID", () => {
  const frozen = freezeCandidateManifest(input());
  assert.throws(() => createNextCandidateVersion(frozen, input({ candidateVersion: 2 })), /NEW_CANDIDATE_ID_REQUIRED/);
});

test("next candidate version preserves lineage, product and candidate type", () => {
  const frozen = freezeCandidateManifest(input());
  const base = { candidateVersion: 2, candidateId: "CAND-HBOP-LISTING-V2" };
  assert.throws(() => createNextCandidateVersion(frozen, input({ ...base, lineageId: "OTHER" })), /CANDIDATE_LINEAGE_MISMATCH/);
  assert.throws(() => createNextCandidateVersion(frozen, input({ ...base, productId: "PDT-OTHER-001" })), /CANDIDATE_PRODUCT_MISMATCH/);
  assert.throws(() => createNextCandidateVersion(frozen, input({ ...base, candidateType: "PATCH" })), /CANDIDATE_TYPE_MISMATCH/);
});

test("changed content is accepted only as the next candidate version and gets a new fingerprint", () => {
  const frozen = freezeCandidateManifest(input());
  const next = createNextCandidateVersion(frozen, input({
    candidateVersion: 2,
    candidateId: "CAND-HBOP-LISTING-V2",
    createdAt: "2026-09-05T05:02:00.000Z",
    frozenAt: "2026-09-05T05:03:00.000Z",
    payload: { ...input().payload, price: 19.9 }
  }));
  assert.equal(next.candidateVersion, 2);
  assert.notEqual(next.candidate.candidateId, frozen.candidate.candidateId);
  assert.notEqual(next.candidate.fingerprint, frozen.candidate.fingerprint);
});

test("invalid candidate versions and freeze chronology fail closed", () => {
  assert.throws(() => freezeCandidateManifest(input({ candidateVersion: 0 })), /INVALID_CANDIDATE_VERSION/);
  assert.throws(() => freezeCandidateManifest(input({ frozenAt: "2026-09-05T04:59:00.000Z" })), /CANDIDATE_FROZEN_BEFORE_CREATED/);
});
