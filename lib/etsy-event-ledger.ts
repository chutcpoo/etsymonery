import { neon } from "@neondatabase/serverless";
import {
  ETSY_WRITE_COUNT,
  type EtsyCommerceEvent,
  type EtsyCommerceEventType,
  type EtsyEventClaimInput,
  type EtsyEventClaimResult,
  type EtsyEventsSnapshot,
  type EtsyProcessingState,
  type EtsyReadbackState
} from "./etsy-event-types";

type EventRow = {
  event_id: string;
  provider: "etsy";
  event_type: EtsyCommerceEventType;
  provider_event_type: string;
  webhook_id: string;
  event_timestamp: string | Date;
  received_at: string | Date;
  payload_sha256: string;
  shop_id: string | number | null;
  receipt_id: string | number | null;
  listing_ids: Array<string | number> | null;
  processing_state: EtsyProcessingState;
  verification_state: "SIGNATURE_VERIFIED";
  readback_state: EtsyReadbackState;
  correlation_id: string;
  duplicate_count: string | number;
  last_duplicate_at: string | Date | null;
  readback_verified_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export interface EtsyEventRepository {
  claim(input: EtsyEventClaimInput): Promise<EtsyEventClaimResult>;
  completeReadback(
    eventId: string,
    readbackState: Exclude<EtsyReadbackState, "PENDING">,
    listingIds: number[]
  ): Promise<void>;
  recordSignatureFailure(): Promise<void>;
  getSnapshot(
    limit: number,
    eventType: EtsyCommerceEventType | null
  ): Promise<EtsyEventsSnapshot>;
}

function databaseSql() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL_NOT_CONFIGURED");
  return neon(databaseUrl);
}

function iso(value: string | Date) {
  return new Date(value).toISOString();
}

function optionalIso(value: string | Date | null) {
  return value == null ? null : iso(value);
}

function safePositiveInteger(value: string | number | null) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function eventFromRow(row: EventRow): EtsyCommerceEvent {
  return {
    eventId: row.event_id,
    provider: "etsy",
    eventType: row.event_type,
    providerEventType: row.provider_event_type,
    webhookId: row.webhook_id,
    eventTimestamp: iso(row.event_timestamp),
    receivedAt: iso(row.received_at),
    payloadSha256: row.payload_sha256,
    shopId: safePositiveInteger(row.shop_id),
    receiptId: safePositiveInteger(row.receipt_id),
    listingIds: (row.listing_ids ?? [])
      .map((value) => Number(value))
      .filter((value) => Number.isSafeInteger(value) && value > 0),
    processingState: row.processing_state,
    verificationState: row.verification_state,
    readbackState: row.readback_state,
    correlationId: row.correlation_id,
    duplicateCount: Number(row.duplicate_count),
    lastDuplicateAt: optionalIso(row.last_duplicate_at),
    readbackVerifiedAt: optionalIso(row.readback_verified_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

export class NeonEtsyEventRepository implements EtsyEventRepository {
  async claim(input: EtsyEventClaimInput): Promise<EtsyEventClaimResult> {
    const sql = databaseSql();
    const rows = await sql`
      INSERT INTO etsy_webhook_events (
        event_id, provider, event_type, provider_event_type, webhook_id,
        event_timestamp, received_at, payload_sha256, shop_id, receipt_id,
        listing_ids, processing_state, verification_state, readback_state,
        correlation_id
      )
      VALUES (
        ${input.eventId}, ${input.provider}, ${input.eventType},
        ${input.providerEventType}, ${input.webhookId},
        ${input.eventTimestamp}, ${input.receivedAt}, ${input.payloadSha256},
        ${input.shopId}, ${input.receiptId}, ${input.listingIds},
        ${input.processingState}, ${input.verificationState},
        ${input.readbackState}, ${input.correlationId}
      )
      ON CONFLICT (provider, webhook_id)
      DO UPDATE SET
        duplicate_count = etsy_webhook_events.duplicate_count + 1,
        last_duplicate_at = now(),
        updated_at = now()
      WHERE etsy_webhook_events.payload_sha256 = EXCLUDED.payload_sha256
      RETURNING (xmax = 0) AS claimed, *
    `;

    const row = rows[0] as (EventRow & { claimed: boolean }) | undefined;
    if (!row) throw new Error("ETSY_EVENT_IDENTITY_CONFLICT");
    return { claimed: row.claimed, event: eventFromRow(row) };
  }

  async completeReadback(
    eventId: string,
    readbackState: Exclude<EtsyReadbackState, "PENDING">,
    listingIds: number[]
  ) {
    const sql = databaseSql();
    const rows = await sql`
      UPDATE etsy_webhook_events
      SET
        listing_ids = ${listingIds},
        readback_state = ${readbackState},
        processing_state = 'PROCESSED',
        readback_verified_at = CASE
          WHEN ${readbackState} = 'VERIFIED' THEN now()
          ELSE NULL
        END,
        updated_at = now()
      WHERE event_id = ${eventId}
      RETURNING event_id
    `;
    if (rows.length !== 1) throw new Error("ETSY_EVENT_COMPLETION_FAILED");
  }

  async recordSignatureFailure() {
    const sql = databaseSql();
    await sql`
      INSERT INTO etsy_webhook_health (
        provider, signature_failure_count, last_signature_failure_at, updated_at
      )
      VALUES ('etsy', 1, now(), now())
      ON CONFLICT (provider)
      DO UPDATE SET
        signature_failure_count = etsy_webhook_health.signature_failure_count + 1,
        last_signature_failure_at = now(),
        updated_at = now()
    `;
  }

  async getSnapshot(limit: number, eventType: EtsyCommerceEventType | null) {
    const sql = databaseSql();
    const [eventRows, aggregateRows, healthRows] = await Promise.all([
      eventType
        ? sql`
            SELECT *
            FROM etsy_webhook_events
            WHERE event_type = ${eventType}
            ORDER BY received_at DESC
            LIMIT ${limit}
          `
        : sql`
            SELECT *
            FROM etsy_webhook_events
            ORDER BY received_at DESC
            LIMIT ${limit}
          `,
      sql`
        SELECT
          COUNT(*) + COALESCE(SUM(duplicate_count), 0) AS delivery_count,
          COALESCE(SUM(duplicate_count), 0) AS duplicate_count,
          COUNT(*) FILTER (WHERE readback_state = 'FAILED_READ_ONLY') AS readback_failure_count,
          MAX(event_timestamp) FILTER (
            WHERE verification_state = 'SIGNATURE_VERIFIED'
          ) AS last_verified_at
        FROM etsy_webhook_events
      `,
      sql`
        SELECT signature_failure_count
        FROM etsy_webhook_health
        WHERE provider = 'etsy'
        LIMIT 1
      `
    ]);

    const aggregate = aggregateRows[0] as
      | {
          delivery_count: string | number;
          duplicate_count: string | number;
          readback_failure_count: string | number;
          last_verified_at: string | Date | null;
        }
      | undefined;
    const health = healthRows[0] as
      | { signature_failure_count: string | number }
      | undefined;

    return {
      status: "PASS" as const,
      mode: "READ_ONLY" as const,
      generatedAt: new Date().toISOString(),
      filters: { limit, eventType },
      health: {
        webhookSigningSecretConfigured: Boolean(
          process.env.ETSY_WEBHOOK_SIGNING_SECRET?.trim()
        ),
        lastVerifiedEtsyEvent: aggregate?.last_verified_at
          ? iso(aggregate.last_verified_at)
          : null,
        eventsReceived: Number(aggregate?.delivery_count ?? 0),
        duplicateDeliveriesSafelyIgnored: Number(
          aggregate?.duplicate_count ?? 0
        ),
        signatureFailures: Number(health?.signature_failure_count ?? 0),
        readbackFailures: Number(aggregate?.readback_failure_count ?? 0),
        ETSY_WRITE_COUNT
      },
      events: (eventRows as EventRow[]).map(eventFromRow),
      privacy: {
        buyerPiiReturned: false as const,
        rawPayloadStored: false as const
      },
      ETSY_WRITE_COUNT
    } satisfies EtsyEventsSnapshot;
  }
}
