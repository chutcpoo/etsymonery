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
  LEGACY_MIGRATION_INPUT_SCHEMA_VERSION,
  importLegacyMigrationSnapshot,
  type LegacyMigrationInput
} from "../lib/legacy-snapshot-importer";
import { serializeCanonicalRegistrySnapshot } from "../lib/product-registry";
import { MemoryProductRegistryEventLog } from "../lib/product-registry-event-log";

function catalogFixture(): CatalogRegistrySeedInput {
  return {
    source: {
      driveFileId: CANONICAL_CATALOG_DRIVE_FILE_ID,
      fileName: CANONICAL_CATALOG_FILE_NAME,
      mimeType: CANONICAL_CATALOG_MIME_TYPE,
      accessMode: "READ_ONLY"
    },
    products: [
      {
        productId: "PDT-HBOP-001",
        productName: "Home Bakery Toolkit",
        productVersion: "V1",
        rawStatus: "ACTIVE ETSY / RELEASED",
        candidateIds: ["catalog-candidate"],
        evidenceIds: ["catalog-evidence"]
      },
      {
        productId: "PDT-PCSO-001",
        productName: "Private Chef System",
        productVersion: "UNKNOWN"
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

function migrationInput(): LegacyMigrationInput {
  return {
    schemaVersion: LEGACY_MIGRATION_INPUT_SCHEMA_VERSION,
    catalogSeed: catalogFixture(),
    legacyEvidence: []
  };
}

test("catalog-only IMP-105 import preserves IMP-001 snapshot semantics", () => {
  const input = migrationInput();
  assert.equal(
    serializeCanonicalRegistrySnapshot(importLegacyMigrationSnapshot(input)),
    serializeCanonicalRegistrySnapshot(importCanonicalCatalogSeed(input.catalogSeed))
  );
});

test("canonical product identity and existing listing ID remain unchanged", () => {
  const input = migrationInput();
  input.legacyEvidence = [
    {
      productId: "PDT-HBOP-001",
      evidenceReference: "legacy:identity:1",
      listingReferences: [{ channel: "etsy", listingId: "4566738686" }]
    }
  ];
  const [record] = importLegacyMigrationSnapshot(input).records;
  assert.equal(record.productId, "PDT-HBOP-001");
  assert.equal(record.references.listings[0].listingId, "4566738686");
  assert.equal(record.importedSource.driveFileId, CANONICAL_CATALOG_DRIVE_FILE_ID);
});

test("explicit legacy references are preserved through canonical normalization", () => {
  const input = migrationInput();
  input.legacyEvidence = [
    {
      productId: "PDT-HBOP-001",
      evidenceReference: "legacy:refs:1",
      candidateIds: ["candidate-z"],
      candidateFingerprints: ["ABCDEF1234"],
      passRecordIds: ["pass-1"],
      authorizationIds: ["auth-1"],
      evidenceIds: ["evidence-legacy"]
    }
  ];
  const [record] = importLegacyMigrationSnapshot(input).records;
  assert.ok(record.references.candidateIds.includes("candidate-z"));
  assert.ok(record.references.candidateFingerprints.includes("abcdef1234"));
  assert.ok(record.references.passRecordIds.includes("pass-1"));
  assert.ok(record.references.authorizationIds.includes("auth-1"));
  assert.ok(record.references.evidenceIds.includes("evidence-legacy"));
});

test("lifecycle pointers import only from value plus explicit evidence reference", () => {
  const input = migrationInput();
  input.legacyEvidence = [
    {
      productId: "PDT-HBOP-001",
      evidenceReference: "legacy:lifecycle:1",
      currentState: { value: "PRODUCTION_AUTHORIZED", evidenceReference: "qc:state:1" },
      lastCompletedStage: { value: "FINAL_QC", evidenceReference: "qc:last:1" },
      nextExecutableStage: { value: "PUBLISH", evidenceReference: "qc:next:1" }
    }
  ];
  const [record] = importLegacyMigrationSnapshot(input).records;
  assert.equal(record.currentState?.value, "PRODUCTION_AUTHORIZED");
  assert.equal(record.currentState?.evidenceReference, "qc:state:1");
  assert.equal(record.lastCompletedStage?.value, "FINAL_QC");
  assert.equal(record.nextExecutableStage?.value, "PUBLISH");
});

test("raw legacy text never causes lifecycle inference", () => {
  const input = migrationInput();
  input.legacyEvidence = [
    {
      productId: "PDT-HBOP-001",
      evidenceReference: "legacy:raw:1",
      rawLegacyText: "PRODUCTION AUTHORIZED / RELEASED / MONITORING"
    }
  ];
  const [record] = importLegacyMigrationSnapshot(input).records;
  assert.equal(record.currentState, undefined);
  assert.equal(record.lastCompletedStage, undefined);
  assert.equal(record.nextExecutableStage, undefined);
});

test("legacy evidence for an unknown Product ID fails closed", () => {
  const input = migrationInput();
  input.legacyEvidence = [{ productId: "PDT-UNKNOWN-999", evidenceReference: "legacy:unknown:1" }];
  assert.throws(() => importLegacyMigrationSnapshot(input), /UNKNOWN_PRODUCT_ID:PDT-UNKNOWN-999/);
});

test("incompatible explicit lifecycle observations require migration review without an array-order winner", () => {
  const input = migrationInput();
  const evidence = [
    {
      productId: "PDT-HBOP-001",
      evidenceReference: "legacy:conflict:a",
      currentState: { value: "DRAFT", evidenceReference: "legacy:state:a" }
    },
    {
      productId: "PDT-HBOP-001",
      evidenceReference: "legacy:conflict:b",
      currentState: { value: "PUBLISHED", evidenceReference: "legacy:state:b" }
    }
  ];
  input.legacyEvidence = evidence;
  const first = importLegacyMigrationSnapshot(input);
  const [record] = first.records;
  assert.equal(record.currentState, undefined);
  assert.equal(record.migrationReview.status, "MIGRATION_REVIEW_REQUIRED");
  assert.ok(record.migrationReview.reasons.includes("CURRENT_STATE_CONFLICT"));

  const reversed = importLegacyMigrationSnapshot({ ...input, legacyEvidence: [...evidence].reverse() });
  assert.equal(serializeCanonicalRegistrySnapshot(first), serializeCanonicalRegistrySnapshot(reversed));
});

test("reversing legacy evidence order produces byte-identical canonical serialization", () => {
  const input = migrationInput();
  const evidence = [
    {
      productId: "PDT-HBOP-001",
      evidenceReference: "legacy:order:b",
      candidateIds: ["candidate-b", "candidate-a"],
      currentState: { value: "READY", evidenceReference: "state:b" }
    },
    {
      productId: "PDT-HBOP-001",
      evidenceReference: "legacy:order:a",
      candidateIds: ["candidate-c"],
      currentState: { value: "READY", evidenceReference: "state:a" }
    }
  ];
  const first = importLegacyMigrationSnapshot({ ...input, legacyEvidence: evidence });
  const second = importLegacyMigrationSnapshot({ ...input, legacyEvidence: [...evidence].reverse() });
  assert.equal(serializeCanonicalRegistrySnapshot(first), serializeCanonicalRegistrySnapshot(second));
});

test("duplicate legacy references are canonically deduplicated", () => {
  const input = migrationInput();
  const duplicate = {
    productId: "PDT-HBOP-001",
    evidenceReference: "legacy:dedupe:1",
    listingReferences: [{ channel: "ETSY", listingId: "4566738686", listingUrl: "https://www.etsy.com/listing/4566738686" }],
    candidateIds: ["candidate-dup", "candidate-dup"],
    passRecordIds: ["pass-dup", "pass-dup"]
  };
  input.legacyEvidence = [duplicate, { ...duplicate, evidenceReference: "legacy:dedupe:2" }];
  const [record] = importLegacyMigrationSnapshot(input).records;
  assert.equal(record.references.listings.length, 1);
  assert.equal(record.references.candidateIds.filter((value) => value === "candidate-dup").length, 1);
  assert.equal(record.references.passRecordIds.filter((value) => value === "pass-dup").length, 1);
});

test("IMP-105 leaves both Catalog seed and legacy evidence input unchanged", () => {
  const input = migrationInput();
  input.legacyEvidence = [
    {
      productId: "PDT-HBOP-001",
      evidenceReference: "legacy:readonly:1",
      candidateIds: ["candidate-readonly"],
      currentState: { value: "READY", evidenceReference: "state:readonly" }
    }
  ];
  const before = structuredClone(input);
  importLegacyMigrationSnapshot(input);
  assert.deepEqual(input, before);
});

test("existing IMP-001 migration-review uncertainty is retained", () => {
  const input = migrationInput();
  input.legacyEvidence = [
    {
      productId: "PDT-HBOP-001",
      evidenceReference: "legacy:uncertainty:1",
      evidenceIds: ["legacy-evidence"]
    }
  ];
  const snapshot = importLegacyMigrationSnapshot(input);
  const hbop = snapshot.records.find((record) => record.productId === "PDT-HBOP-001");
  const pcso = snapshot.records.find((record) => record.productId === "PDT-PCSO-001");
  assert.ok(hbop?.migrationReview.reasons.includes("UNKNOWN_LIFECYCLE_MAPPING"));
  assert.ok(pcso?.migrationReview.reasons.includes("PRODUCT_VERSION_UNKNOWN"));
});

test("incomplete lifecycle evidence is review-required and never becomes a canonical pointer", () => {
  const input = migrationInput();
  input.legacyEvidence = [
    {
      productId: "PDT-HBOP-001",
      evidenceReference: "legacy:incomplete:1",
      nextExecutableStage: { value: "PUBLISH" }
    }
  ];
  const [record] = importLegacyMigrationSnapshot(input).records;
  assert.equal(record.nextExecutableStage, undefined);
  assert.ok(record.migrationReview.reasons.includes("NEXT_EXECUTABLE_STAGE_EVIDENCE_INCOMPLETE"));
});

test("IMP-105 neither executes lifecycle transitions nor appends IMP-103 events", () => {
  const eventLog = new MemoryProductRegistryEventLog();
  const input = migrationInput();
  input.legacyEvidence = [
    {
      productId: "PDT-HBOP-001",
      evidenceReference: "legacy:boundary:1",
      rawLegacyText: "DRAFT -> TESTER_PASS -> PRODUCTION_AUTHORIZED -> PUBLISHED"
    }
  ];
  const [record] = importLegacyMigrationSnapshot(input).records;
  assert.equal(record.currentState, undefined);
  assert.equal(record.nextExecutableStage, undefined);
  assert.equal(eventLog.list().length, 0);
});
