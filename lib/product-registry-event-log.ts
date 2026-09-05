import {
  normalizeCanonicalProductRecord,
  stableSerialize,
  type CanonicalProductRecord
} from "./product-registry";
import type {
  CanonicalProductRegistryRepository,
  RegistryWriteResult
} from "./product-registry-repository";

export const PRODUCT_REGISTRY_EVENT_SCHEMA_VERSION = "1.0.0" as const;

export type ProductRegistryEvent = {
  schemaVersion: typeof PRODUCT_REGISTRY_EVENT_SCHEMA_VERSION;
  eventId: string;
  productId: string;
  sequence: number;
  eventType: "REGISTRY_RECORDED" | "REGISTRY_REVISED";
  expectedRevision: number;
  occurredAt: string;
  record: CanonicalProductRecord;
};

export type EventAppendResult =
  | { status: "APPENDED"; event: ProductRegistryEvent }
  | { status: "UNCHANGED"; event: ProductRegistryEvent }
  | { status: "EVENT_CONFLICT"; event: ProductRegistryEvent };

function required(value: string, field: string) {
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw new Error(`INVALID_${field}`);
  return normalized;
}

function validateEvent(event: ProductRegistryEvent) {
  if (event.schemaVersion !== PRODUCT_REGISTRY_EVENT_SCHEMA_VERSION) {
    throw new Error("UNSUPPORTED_PRODUCT_REGISTRY_EVENT_SCHEMA_VERSION");
  }
  const eventId = required(event.eventId, "EVENT_ID");
  const productId = required(event.productId, "PRODUCT_ID");
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) {
    throw new Error("INVALID_EVENT_SEQUENCE");
  }
  if (!Number.isSafeInteger(event.expectedRevision) || event.expectedRevision < 0) {
    throw new Error("INVALID_EVENT_EXPECTED_REVISION");
  }
  if (!Number.isSafeInteger(Date.parse(event.occurredAt))) {
    throw new Error("INVALID_EVENT_OCCURRED_AT");
  }
  const record = normalizeCanonicalProductRecord(event.record);
  if (record.productId !== productId) throw new Error("EVENT_PRODUCT_ID_MISMATCH");
  if (record.registryRevision !== event.expectedRevision + 1) {
    throw new Error("EVENT_REVISION_MISMATCH");
  }
  const expectedType = event.sequence === 1 ? "REGISTRY_RECORDED" : "REGISTRY_REVISED";
  if (event.eventType !== expectedType) throw new Error("INVALID_EVENT_TYPE_FOR_SEQUENCE");
  return { ...event, eventId, productId, record };
}

export function projectProductRegistryEvents(
  events: readonly ProductRegistryEvent[]
): CanonicalProductRecord[] {
  const ordered = events.map(validateEvent).sort((left, right) =>
    left.productId === right.productId
      ? left.sequence - right.sequence
      : left.productId.localeCompare(right.productId, "en")
  );
  const projected = new Map<string, CanonicalProductRecord>();
  const seenEventIds = new Set<string>();
  for (const event of ordered) {
    if (seenEventIds.has(event.eventId)) throw new Error(`DUPLICATE_EVENT_ID:${event.eventId}`);
    seenEventIds.add(event.eventId);
    const previous = projected.get(event.productId);
    const expectedSequence = previous ? previous.registryRevision + 1 : 1;
    const expectedRevision = previous?.registryRevision ?? 0;
    if (event.sequence !== expectedSequence) throw new Error("EVENT_SEQUENCE_GAP");
    if (event.expectedRevision !== expectedRevision) throw new Error("EVENT_PROJECTION_REVISION_CONFLICT");
    projected.set(event.productId, structuredClone(event.record));
  }
  return [...projected.values()].sort((left, right) => left.productId.localeCompare(right.productId, "en"));
}

export class MemoryProductRegistryEventLog {
  private readonly events: ProductRegistryEvent[] = [];

  append(event: ProductRegistryEvent): EventAppendResult {
    const normalized = validateEvent(event);
    const existing = this.events.find((candidate) => candidate.eventId === normalized.eventId);
    if (existing) {
      return stableSerialize(existing) === stableSerialize(normalized)
        ? { status: "UNCHANGED", event: structuredClone(existing) }
        : { status: "EVENT_CONFLICT", event: structuredClone(existing) };
    }
    const current = this.events.filter((candidate) => candidate.productId === normalized.productId);
    if (normalized.sequence !== current.length + 1) throw new Error("EVENT_SEQUENCE_GAP");
    if (normalized.expectedRevision !== (current.at(-1)?.record.registryRevision ?? 0)) {
      throw new Error("EVENT_APPEND_REVISION_CONFLICT");
    }
    this.events.push(structuredClone(normalized));
    return { status: "APPENDED", event: structuredClone(normalized) };
  }

  list(productId?: string) {
    return this.events
      .filter((event) => productId === undefined || event.productId === productId)
      .sort((left, right) => left.productId.localeCompare(right.productId, "en") || left.sequence - right.sequence)
      .map((event) => structuredClone(event));
  }
}

export class EventLogCanonicalProductRegistryRepository implements CanonicalProductRegistryRepository {
  constructor(private readonly eventLog: MemoryProductRegistryEventLog = new MemoryProductRegistryEventLog()) {}

  async load(productId: string) {
    return projectProductRegistryEvents(this.eventLog.list(productId))[0] ?? null;
  }

  async list() {
    return projectProductRegistryEvents(this.eventLog.list());
  }

  async save(record: CanonicalProductRecord, expectedRevision: number): Promise<RegistryWriteResult> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error("INVALID_EXPECTED_REGISTRY_REVISION");
    }
    const normalized = normalizeCanonicalProductRecord(record);
    const current = await this.load(normalized.productId);
    if ((current?.registryRevision ?? 0) !== expectedRevision) {
      return { status: "STATE_CONFLICT", current };
    }
    if (current && stableSerialize(current) === stableSerialize(normalized)) {
      return { status: "UNCHANGED", record: current };
    }
    const event: ProductRegistryEvent = {
      schemaVersion: PRODUCT_REGISTRY_EVENT_SCHEMA_VERSION,
      eventId: `registry:${normalized.productId}:${normalized.registryRevision}`,
      productId: normalized.productId,
      sequence: normalized.registryRevision,
      eventType: normalized.registryRevision === 1 ? "REGISTRY_RECORDED" : "REGISTRY_REVISED",
      expectedRevision,
      occurredAt: new Date().toISOString(),
      record: normalized
    };
    const result = this.eventLog.append(event);
    if (result.status === "EVENT_CONFLICT") return { status: "STATE_CONFLICT", current };
    return result.status === "UNCHANGED"
      ? { status: "UNCHANGED", record: normalized }
      : { status: "APPLIED", record: normalized };
  }
}

export function exportProductRegistryEventLog(eventLog: MemoryProductRegistryEventLog) {
  return eventLog.list();
}