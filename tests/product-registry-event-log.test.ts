import assert from "node:assert/strict";
import test from "node:test";
import {
  EventLogCanonicalProductRegistryRepository,
  MemoryProductRegistryEventLog,
  PRODUCT_REGISTRY_EVENT_SCHEMA_VERSION,
  projectProductRegistryEvents,
  type ProductRegistryEvent
} from "../lib/product-registry-event-log";
import type { CanonicalProductRecord } from "../lib/product-registry";

const source = {
  driveFileId: "drive-1",
  fileName: "catalog.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  accessMode: "READ_ONLY" as const
};

function record(revision: number, name = "Product"): CanonicalProductRecord {
  return {
    schemaVersion: "1.0.0",
    productId: "PDT-001",
    productName: name,
    productVersion: "V1",
    registryRevision: revision,
    importedSource: source,
    references: { listings: [], candidateIds: [], candidateFingerprints: [], passRecordIds: [], authorizationIds: [], evidenceIds: [] },
    migrationReview: { status: "CLEAR", reasons: [] }
  };
}

function event(revision: number, name = "Product"): ProductRegistryEvent {
  return {
    schemaVersion: PRODUCT_REGISTRY_EVENT_SCHEMA_VERSION,
    eventId: `event-${revision}`,
    productId: "PDT-001",
    sequence: revision,
    eventType: revision === 1 ? "REGISTRY_RECORDED" : "REGISTRY_REVISED",
    expectedRevision: revision - 1,
    occurredAt: `2026-09-05T00:0${revision}:00.000Z`,
    record: record(revision, name)
  };
}

test("append-only event log projects the latest canonical registry record", () => {
  const log = new MemoryProductRegistryEventLog();
  assert.equal(log.append(event(1)).status, "APPENDED");
  assert.equal(log.append(event(2, "Updated Product")).status, "APPENDED");
  assert.deepEqual(projectProductRegistryEvents(log.list()), [record(2, "Updated Product")]);
});

test("projection is deterministic regardless of input event order", () => {
  assert.deepEqual(projectProductRegistryEvents([event(2, "Updated Product"), event(1)]), [record(2, "Updated Product")]);
});

test("replaying the identical event is idempotent", () => {
  const log = new MemoryProductRegistryEventLog();
  assert.equal(log.append(event(1)).status, "APPENDED");
  assert.equal(log.append(event(1)).status, "UNCHANGED");
  assert.equal(log.list().length, 1);
});

test("same event ID with different payload fails closed", () => {
  const log = new MemoryProductRegistryEventLog();
  log.append(event(1));
  assert.equal(log.append({ ...event(1), record: record(1, "Tampered") }).status, "EVENT_CONFLICT");
});

test("sequence gaps and revision mismatches are rejected", () => {
  const log = new MemoryProductRegistryEventLog();
  assert.throws(() => log.append(event(2)), /EVENT_SEQUENCE_GAP/);
  assert.throws(() => projectProductRegistryEvents([{ ...event(1), expectedRevision: 1 }]), /EVENT_REVISION_MISMATCH/);
});

test("duplicate event IDs in a replay are rejected", () => {
  assert.throws(() => projectProductRegistryEvents([event(1), { ...event(1), sequence: 2, expectedRevision: 1, eventType: "REGISTRY_REVISED", record: record(2) }]), /DUPLICATE_EVENT_ID/);
});

test("repository save appends events while preserving optimistic conflicts", async () => {
  const repository = new EventLogCanonicalProductRegistryRepository();
  assert.equal((await repository.save(record(1), 0)).status, "APPLIED");
  assert.equal((await repository.save(record(1), 1)).status, "UNCHANGED");
  assert.equal((await repository.save(record(2, "Updated Product"), 1)).status, "APPLIED");
  assert.equal((await repository.save(record(3, "Stale Product"), 0)).status, "STATE_CONFLICT");
  assert.equal((await repository.load("PDT-001"))?.productName, "Updated Product");
});

test("repository lists projected products in stable product order", async () => {
  const repository = new EventLogCanonicalProductRegistryRepository();
  const second = { ...record(1), productId: "PDT-002" };
  await repository.save(second, 0);
  await repository.save(record(1), 0);
  assert.deepEqual((await repository.list()).map((item) => item.productId), ["PDT-001", "PDT-002"]);
});

test("event validation rejects a record revision that does not follow its event", () => {
  assert.throws(() => projectProductRegistryEvents([{ ...event(1), record: record(2) }]), /EVENT_REVISION_MISMATCH/);
});
