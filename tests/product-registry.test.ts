import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_CATALOG_DRIVE_FILE_ID,
  CANONICAL_CATALOG_FILE_NAME,
  CANONICAL_CATALOG_MIME_TYPE,
  importCanonicalCatalogSeed,
  type CatalogRegistrySeedInput
} from "../lib/catalog-product-registry-importer";
import {
  normalizeCanonicalRegistrySnapshot,
  serializeCanonicalRegistrySnapshot,
  type CanonicalProductRecord
} from "../lib/product-registry";
import {
  MemoryCanonicalProductRegistryRepository,
  seedCanonicalProductRegistry
} from "../lib/product-registry-repository";

function catalogFixture(): CatalogRegistrySeedInput {
  return {
    source: {
      driveFileId: CANONICAL_CATALOG_DRIVE_FILE_ID,
      fileName: CANONICAL_CATALOG_FILE_NAME,
      mimeType: CANONICAL_CATALOG_MIME_TYPE,
      accessMode: "READ_ONLY",
      modifiedTime: "2026-09-04T09:32:41.463Z",
      sizeBytes: 112545
    },
    products: [
      {
        productId: "PDT-HBOP-001",
        productName: "Home Bakery Order & Production Operations Toolkit",
        productVersion: "V1",
        rawStatus: "ACTIVE ETSY / RELEASED / READ-ONLY",
        legacyEvidenceSnapshot: "Production release evidence is retained in the Catalog.",
        evidenceIds: ["evidence-2", "evidence-1"]
      },
      {
        productId: "PDT-PCSO-001",
        productName: "Private Chef Client-to-Service Operations System",
        productVersion: "V1",
        rawStatus: "TEST / NOT PRODUCTION AUTHORIZED"
      }
    ],
    channels: [
      {
        productId: "PDT-HBOP-001",
        channel: "Etsy",
        listingId: "4566738686",
        listingUrl: "https://www.etsy.com/listing/4566738686"
      }
    ]
  };
}

test("product IDs are unique in one canonical registry snapshot", () => {
  const snapshot = importCanonicalCatalogSeed(catalogFixture());
  assert.deepEqual(
    snapshot.records.map((record) => record.productId),
    ["PDT-HBOP-001", "PDT-PCSO-001"]
  );
  assert.throws(
    () => normalizeCanonicalRegistrySnapshot({ ...snapshot, records: [...snapshot.records, snapshot.records[0]] }),
    /DUPLICATE_PRODUCT_ID:PDT-HBOP-001/
  );
});

test("normalization and serialization are deterministic across input ordering", () => {
  const input = catalogFixture();
  const first = importCanonicalCatalogSeed(input);
  const second = importCanonicalCatalogSeed({
    ...input,
    products: [...input.products].reverse(),
    channels: [...(input.channels ?? [])].reverse()
  });
  assert.equal(serializeCanonicalRegistrySnapshot(first), serializeCanonicalRegistrySnapshot(second));
});

test("re-importing the same Catalog snapshot is idempotent", async () => {
  const repository = new MemoryCanonicalProductRegistryRepository();
  const snapshot = importCanonicalCatalogSeed(catalogFixture());
  assert.deepEqual(
    (await seedCanonicalProductRegistry(repository, snapshot)).map((result) => result.status),
    ["APPLIED", "APPLIED"]
  );
  assert.deepEqual(
    (await seedCanonicalProductRegistry(repository, snapshot)).map((result) => result.status),
    ["UNCHANGED", "UNCHANGED"]
  );
  assert.deepEqual(await repository.list(), snapshot.records);
});

test("the exact canonical Catalog Drive identity and read-only mode are required", () => {
  const fixture = catalogFixture();
  assert.throws(
    () =>
      importCanonicalCatalogSeed({
        ...fixture,
        source: { ...fixture.source, driveFileId: "wrong-drive-id" }
      }),
    /CATALOG_SOURCE_IDENTITY_MISMATCH/
  );
  assert.throws(
    () =>
      importCanonicalCatalogSeed({
        ...fixture,
        source: { ...fixture.source, accessMode: "WRITE" as "READ_ONLY" }
      }),
    /CATALOG_SOURCE_NOT_READ_ONLY/
  );
});

test("duplicate and ambiguous Product IDs fail closed without auto-merge", () => {
  const fixture = catalogFixture();
  assert.throws(
    () => importCanonicalCatalogSeed({ ...fixture, products: [...fixture.products, fixture.products[0]] }),
    /DUPLICATE_PRODUCT_ID/
  );
  assert.throws(
    () =>
      importCanonicalCatalogSeed({
        ...fixture,
        channels: [{ productId: "UNKNOWN-PRODUCT", channel: "Etsy", listingId: "123" }]
      }),
    /AMBIGUOUS_PRODUCT_ID/
  );
});

test("unknown lifecycle mappings are preserved as raw status and never guessed", () => {
  const [record] = importCanonicalCatalogSeed(catalogFixture()).records;
  assert.equal(record.rawLegacyCatalogStatus, "ACTIVE ETSY / RELEASED / READ-ONLY");
  assert.equal(record.currentState, undefined);
  assert.equal(record.lastCompletedStage, undefined);
  assert.equal(record.nextExecutableStage, undefined);
  assert.equal(record.migrationReview.status, "MIGRATION_REVIEW_REQUIRED");
  assert.ok(record.migrationReview.reasons.includes("UNKNOWN_LIFECYCLE_MAPPING"));
});

test("lifecycle pointers are retained only with explicit evidence", () => {
  const fixture = catalogFixture();
  fixture.products = [
    {
      productId: "PDT-HBOP-001",
      productVersion: "V1",
      currentState: "PUBLISHED",
      currentStateEvidenceReference: "catalog:qc-row:8",
      lastCompletedStage: "PUBLISHED",
      lastCompletedStageEvidenceReference: "catalog:qc-row:8",
      nextExecutableStage: "MONITORING",
      nextExecutableStageEvidenceReference: "catalog:qc-row:8"
    }
  ];
  fixture.channels = [];
  const [record] = importCanonicalCatalogSeed(fixture).records;
  assert.equal(record.currentState?.value, "PUBLISHED");
  assert.equal(record.nextExecutableStage?.value, "MONITORING");
  assert.equal(record.migrationReview.status, "CLEAR");
});

test("stale revision returns STATE_CONFLICT and preserves the newer registry state", async () => {
  const repository = new MemoryCanonicalProductRegistryRepository();
  const [initial] = importCanonicalCatalogSeed(catalogFixture()).records;
  assert.equal((await repository.save(initial, 0)).status, "APPLIED");

  const newer: CanonicalProductRecord = {
    ...structuredClone(initial),
    registryRevision: 2,
    productName: "Newer Registry Name"
  };
  assert.equal((await repository.save(newer, 1)).status, "APPLIED");

  const stale: CanonicalProductRecord = {
    ...structuredClone(initial),
    registryRevision: 2,
    productName: "Stale Overwrite"
  };
  const result = await repository.save(stale, 1);
  assert.equal(result.status, "STATE_CONFLICT");
  assert.equal((await repository.load(initial.productId))?.productName, "Newer Registry Name");
  assert.equal((await repository.load(initial.productId))?.registryRevision, 2);
});

test("Catalog seed import is read-only and leaves the input snapshot unchanged", () => {
  const fixture = catalogFixture();
  const before = structuredClone(fixture);
  importCanonicalCatalogSeed(fixture);
  assert.deepEqual(fixture, before);
});

test("IMP-001 does not calculate or execute lifecycle transitions", () => {
  const fixture = catalogFixture();
  fixture.products = [
    {
      productId: "PDT-HBOP-001",
      productVersion: "V1",
      rawStatus: "PRODUCTION AUTHORIZED / RELEASED / MONITORING"
    }
  ];
  fixture.channels = [];
  const [record] = importCanonicalCatalogSeed(fixture).records;
  assert.equal(record.currentState, undefined);
  assert.equal(record.lastCompletedStage, undefined);
  assert.equal(record.nextExecutableStage, undefined);
});
