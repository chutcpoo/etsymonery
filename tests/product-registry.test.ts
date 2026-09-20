import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION,
  normalizeCanonicalRegistrySnapshot,
  serializeCanonicalRegistrySnapshot,
  type CanonicalProductRecord
} from "../lib/product-registry";
import {
  MemoryCanonicalProductRegistryRepository,
  seedCanonicalProductRegistry
} from "../lib/product-registry-repository";

const source = {
  driveFileId: "post-reset-drive-source",
  fileName: "POST_RESET_PRODUCT_REGISTRY",
  mimeType: "application/json",
  accessMode: "READ_ONLY" as const
};

function record(id: string): CanonicalProductRecord {
  return {
    schemaVersion: CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION,
    productId: id,
    productName: "New Product",
    productVersion: "V1",
    registryRevision: 1,
    importedSource: source,
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

test("post-reset registry accepts new product records with no pre-existing listing", () => {
  const snapshot = normalizeCanonicalRegistrySnapshot({
    schemaVersion: CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION,
    source,
    records: [record("NEW-PRODUCT-001")]
  });
  assert.equal(snapshot.records.length, 1);
  assert.equal(snapshot.records[0].references.listings.length, 0);
});

test("duplicate product IDs fail closed", () => {
  assert.throws(
    () => normalizeCanonicalRegistrySnapshot({
      schemaVersion: CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION,
      source,
      records: [record("NEW-PRODUCT-001"), record("NEW-PRODUCT-001")]
    }),
    /DUPLICATE_PRODUCT_ID/
  );
});

test("serialization is deterministic", () => {
  const a = normalizeCanonicalRegistrySnapshot({
    schemaVersion: CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION,
    source,
    records: [record("NEW-PRODUCT-002"), record("NEW-PRODUCT-001")]
  });
  const b = normalizeCanonicalRegistrySnapshot({
    schemaVersion: CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION,
    source,
    records: [record("NEW-PRODUCT-001"), record("NEW-PRODUCT-002")]
  });
  assert.equal(serializeCanonicalRegistrySnapshot(a), serializeCanonicalRegistrySnapshot(b));
});

test("registry repository is idempotent for the same post-reset snapshot", async () => {
  const repository = new MemoryCanonicalProductRegistryRepository();
  const snapshot = normalizeCanonicalRegistrySnapshot({
    schemaVersion: CANONICAL_PRODUCT_REGISTRY_SCHEMA_VERSION,
    source,
    records: [record("NEW-PRODUCT-001")]
  });
  assert.deepEqual((await seedCanonicalProductRegistry(repository, snapshot)).map(x => x.status), ["APPLIED"]);
  assert.deepEqual((await seedCanonicalProductRegistry(repository, snapshot)).map(x => x.status), ["UNCHANGED"]);
});
