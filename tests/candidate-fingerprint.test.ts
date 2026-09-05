import assert from "node:assert/strict";
import test from "node:test";
import {
  CANDIDATE_FINGERPRINT_SCHEMA_VERSION,
  canonicalizeFingerprintPayload,
  createCandidateFingerprint,
  createListingFingerprint,
  fingerprintCanonicalPayload
} from "../lib/candidate-fingerprint";
import { buildPublishPlan } from "../lib/publisher";

const payload = {
  title: "  Café planner  ",
  priceUsd: 9.99,
  tags: ["planner", "workflow"],
  nested: { z: " last ", a: " first " }
};

test("canonicalization sorts object keys and normalizes string values", () => {
  assert.deepEqual(canonicalizeFingerprintPayload(payload), {
    nested: { a: "first", z: "last" },
    priceUsd: 9.99,
    tags: ["planner", "workflow"],
    title: "Café planner"
  });
});

test("object insertion order does not change the candidate fingerprint", () => {
  const reordered = {
    tags: ["planner", "workflow"],
    nested: { a: "first", z: "last" },
    title: "Café planner",
    priceUsd: 9.99
  };
  assert.equal(createCandidateFingerprint(payload), createCandidateFingerprint(reordered));
});

test("array order remains meaningful to preserve file and tag identity", () => {
  assert.notEqual(
    createCandidateFingerprint(payload),
    createCandidateFingerprint({ ...payload, tags: ["workflow", "planner"] })
  );
});

test("undefined fields are omitted while null remains meaningful", () => {
  assert.equal(
    createCandidateFingerprint({ title: "x", optional: undefined }),
    createCandidateFingerprint({ title: "x" })
  );
  assert.notEqual(
    createCandidateFingerprint({ title: "x", optional: null }),
    createCandidateFingerprint({ title: "x" })
  );
});

test("non-finite numbers fail closed and negative zero has explicit canonical semantics", () => {
  assert.throws(() => createCandidateFingerprint({ price: Number.NaN }), /UNSUPPORTED_FINGERPRINT_NUMBER/);
  assert.throws(() => createCandidateFingerprint({ price: Number.POSITIVE_INFINITY }), /UNSUPPORTED_FINGERPRINT_NUMBER/);
  assert.throws(() => createCandidateFingerprint({ price: Number.NEGATIVE_INFINITY }), /UNSUPPORTED_FINGERPRINT_NUMBER/);
  assert.equal(createCandidateFingerprint({ price: -0 }), createCandidateFingerprint({ price: 0 }));
});

test("fingerprint is versioned and scope-bound", () => {
  const candidate = fingerprintCanonicalPayload(payload, "CANDIDATE");
  const listing = fingerprintCanonicalPayload(payload, "LISTING");
  assert.equal(candidate.schemaVersion, CANDIDATE_FINGERPRINT_SCHEMA_VERSION);
  assert.equal(candidate.scope, "CANDIDATE");
  assert.equal(candidate.fingerprint.length, 64);
  assert.notEqual(candidate.fingerprint, listing.fingerprint);
  assert.equal(candidate.canonicalJson.includes(CANDIDATE_FINGERPRINT_SCHEMA_VERSION), true);
});

test("candidate and listing fingerprints change when their payload changes", () => {
  assert.notEqual(createCandidateFingerprint(payload), createCandidateFingerprint({ ...payload, priceUsd: 10 }));
  assert.notEqual(createListingFingerprint(payload), createListingFingerprint({ ...payload, priceUsd: 10 }));
});

test("publisher uses the shared versioned fingerprints for Etsy plans", () => {
  const plan = buildPublishPlan({
    productId: "TEST-001",
    title: "Digital Operations Template",
    description: "Verified test description",
    priceUsd: 9.99,
    files: ["buyer.zip"],
    channels: ["etsy"],
    productTruthVerified: true,
    tags: [
      "digital planner", "small business", "operations", "workflow", "business tool",
      "etsy template", "printable pdf", "spreadsheet", "daily planner", "shop workflow",
      "owner toolkit", "business system", "instant download"
    ],
    etsy: {
      taxonomyId: 1234,
      quantity: 999,
      whoMade: "i_did",
      whenMade: "2020_2026",
      release: { productionBuildFrozen: true }
    }
  });
  const channel = plan.channels[0];
  assert.equal(plan.status, "READY");
  assert.match(channel.candidateFingerprint ?? "", /^[0-9a-f]{64}$/);
  assert.match(channel.listingFingerprint ?? "", /^[0-9a-f]{64}$/);
  assert.notEqual(channel.candidateFingerprint, channel.listingFingerprint);
});
