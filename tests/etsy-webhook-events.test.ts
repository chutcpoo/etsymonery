import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import type { EtsyEventRepository } from "../lib/etsy-event-ledger";
import type {
  EtsyCommerceEvent,
  EtsyCommerceEventType,
  EtsyEventClaimInput,
  EtsyEventClaimResult,
  EtsyEventsSnapshot,
  EtsyReadbackState
} from "../lib/etsy-event-types";
import {
  getEtsyWebhookToleranceSeconds,
  handleEtsyWebhook
} from "../lib/etsy-webhook";

const NOW_SECONDS = 1_789_000_000;
const NOW = new Date(NOW_SECONDS * 1000);
const SECRET_BYTES = Buffer.from("etsy-webhook-test-secret-32-bytes");
const SECRET = `whsec_${SECRET_BYTES.toString("base64")}`;
const previousApiKey = process.env.ETSY_API_KEY;
const previousSharedSecret = process.env.ETSY_SHARED_SECRET;
const previousWebhookSecret = process.env.ETSY_WEBHOOK_SIGNING_SECRET;

before(() => {
  process.env.ETSY_API_KEY = "test-key";
  process.env.ETSY_SHARED_SECRET = "test-shared-secret";
  delete process.env.ETSY_WEBHOOK_SIGNING_SECRET;
});

after(() => {
  if (previousApiKey === undefined) delete process.env.ETSY_API_KEY;
  else process.env.ETSY_API_KEY = previousApiKey;
  if (previousSharedSecret === undefined) delete process.env.ETSY_SHARED_SECRET;
  else process.env.ETSY_SHARED_SECRET = previousSharedSecret;
  if (previousWebhookSecret === undefined) delete process.env.ETSY_WEBHOOK_SIGNING_SECRET;
  else process.env.ETSY_WEBHOOK_SIGNING_SECRET = previousWebhookSecret;
});

function iso(value: string) {
  return new Date(value).toISOString();
}

class MemoryRepository implements EtsyEventRepository {
  readonly events = new Map<string, EtsyCommerceEvent>();
  signatureFailures = 0;

  async claim(input: EtsyEventClaimInput): Promise<EtsyEventClaimResult> {
    const existing = this.events.get(input.eventId);
    if (existing) {
      existing.duplicateCount += 1;
      existing.lastDuplicateAt = NOW.toISOString();
      existing.updatedAt = NOW.toISOString();
      return { claimed: false, event: structuredClone(existing) };
    }
    const event: EtsyCommerceEvent = {
      ...structuredClone(input),
      duplicateCount: 0,
      lastDuplicateAt: null,
      readbackVerifiedAt: null,
      createdAt: iso(input.receivedAt),
      updatedAt: iso(input.receivedAt)
    };
    this.events.set(input.eventId, event);
    return { claimed: true, event: structuredClone(event) };
  }

  async completeReadback(
    eventId: string,
    readbackState: Exclude<EtsyReadbackState, "PENDING">,
    listingIds: number[]
  ) {
    const event = this.events.get(eventId);
    if (!event) throw new Error("missing event");
    event.processingState = "PROCESSED";
    event.readbackState = readbackState;
    event.listingIds = [...listingIds];
    event.readbackVerifiedAt =
      readbackState === "VERIFIED" ? NOW.toISOString() : null;
  }

  async recordSignatureFailure() {
    this.signatureFailures += 1;
  }

  async getSnapshot(
    limit: number,
    eventType: EtsyCommerceEventType | null
  ): Promise<EtsyEventsSnapshot> {
    const events = [...this.events.values()]
      .filter((event) => !eventType || event.eventType === eventType)
      .slice(0, limit);
    return {
      status: "PASS",
      mode: "READ_ONLY",
      generatedAt: NOW.toISOString(),
      filters: { limit, eventType },
      health: {
        webhookSigningSecretConfigured: true,
        lastVerifiedEtsyEvent: events[0]?.receivedAt ?? null,
        eventsReceived:
          this.events.size +
          [...this.events.values()].reduce(
            (sum, event) => sum + event.duplicateCount,
            0
          ),
        duplicateDeliveriesSafelyIgnored: [...this.events.values()].reduce(
          (sum, event) => sum + event.duplicateCount,
          0
        ),
        signatureFailures: this.signatureFailures,
        readbackFailures: [...this.events.values()].filter(
          (event) => event.readbackState === "FAILED_READ_ONLY"
        ).length,
        ETSY_WRITE_COUNT: 0
      },
      events,
      privacy: { buyerPiiReturned: false, rawPayloadStored: false },
      ETSY_WRITE_COUNT: 0
    };
  }
}

function signature(body: string, webhookId: string, timestamp: number, secret = SECRET) {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  return createHmac("sha256", key)
    .update(`${webhookId}.${timestamp}.${body}`)
    .digest("base64");
}

function request(input: {
  body?: string;
  signedBody?: string;
  webhookId?: string;
  timestamp?: number;
  secret?: string;
  signatureHeader?: string;
  omit?: "webhook-id" | "webhook-timestamp" | "webhook-signature";
}) {
  const body = input.body ?? JSON.stringify({
    event_type: "order.paid",
    resource_url:
      "https://api.etsy.com/v3/application/shops/42/receipts/1001",
    shop_id: 42
  });
  const webhookId = input.webhookId ?? "msg_test_001";
  const timestamp = input.timestamp ?? NOW_SECONDS;
  const headers = new Headers({ "content-type": "application/json" });
  if (input.omit !== "webhook-id") headers.set("webhook-id", webhookId);
  if (input.omit !== "webhook-timestamp") {
    headers.set("webhook-timestamp", String(timestamp));
  }
  if (input.omit !== "webhook-signature") {
    headers.set(
      "webhook-signature",
      input.signatureHeader ??
        `v1,${signature(input.signedBody ?? body, webhookId, timestamp, input.secret)}`
    );
  }
  return new Request("https://example.test/api/webhooks/etsy", {
    method: "POST",
    headers,
    body
  });
}

function dependencies(repository: MemoryRepository, overrides: Record<string, unknown> = {}) {
  return {
    repository,
    signingSecret: SECRET,
    now: () => NOW,
    correlationId: () => "00000000-0000-4000-8000-000000000001",
    getShopId: async () => 42,
    getAccessToken: async () => "42.test-access-token",
    fetchImpl: async (_url: string | URL | Request, init?: RequestInit) => {
      assert.equal(init?.method, "GET");
      return Response.json({
        receipt_id: 1001,
        buyer_email: "must-not-be-projected@example.test",
        name: "Private Buyer",
        first_line: "Private address",
        transactions: [
          { listing_id: 4560696421 },
          { listing_id: 4560696421 },
          { listing_id: 4569445414 }
        ]
      });
    },
    ...overrides
  };
}

test("A. valid Etsy signature is accepted and read back with GET only", async () => {
  const repository = new MemoryRepository();
  const response = await handleEtsyWebhook(
    request({ signatureHeader: `v1,invalid v1,${signature(JSON.stringify({
      event_type: "order.paid",
      resource_url: "https://api.etsy.com/v3/application/shops/42/receipts/1001",
      shop_id: 42
    }), "msg_test_001", NOW_SECONDS)}` }),
    dependencies(repository)
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ACCEPTED");
  assert.equal(body.readbackState, "VERIFIED");
  assert.equal(body.ETSY_WRITE_COUNT, 0);
  assert.deepEqual(repository.events.get("msg_test_001")?.listingIds, [
    4560696421,
    4569445414
  ]);
});

test("B. invalid signature is rejected and counted", async () => {
  const repository = new MemoryRepository();
  const response = await handleEtsyWebhook(
    request({ signatureHeader: "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" }),
    dependencies(repository)
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "INVALID_SIGNATURE");
  assert.equal(repository.signatureFailures, 1);
  assert.equal(repository.events.size, 0);
});

test("C. a signature made with the wrong secret is rejected", async () => {
  const repository = new MemoryRepository();
  const wrongSecret = `whsec_${Buffer.from("wrong-secret-material").toString("base64")}`;
  const response = await handleEtsyWebhook(
    request({ secret: wrongSecret }),
    dependencies(repository)
  );
  assert.equal(response.status, 401);
  assert.equal(repository.events.size, 0);
});

test("D. a body mutated after signing is rejected", async () => {
  const repository = new MemoryRepository();
  const original = JSON.stringify({ event_type: "order.paid", shop_id: 42 });
  const mutated = JSON.stringify({ event_type: "order.canceled", shop_id: 42 });
  const response = await handleEtsyWebhook(
    request({ body: mutated, signedBody: original }),
    dependencies(repository)
  );
  assert.equal(response.status, 401);
  assert.equal(repository.events.size, 0);
});

test("E. every required webhook header fails closed when missing", async () => {
  for (const omitted of [
    "webhook-id",
    "webhook-timestamp",
    "webhook-signature"
  ] as const) {
    const response = await handleEtsyWebhook(
      request({ omit: omitted }),
      dependencies(new MemoryRepository())
    );
    assert.ok(response.status === 400 || response.status === 401);
  }
});

test("F. stale and excessively future timestamps are rejected", async () => {
  for (const timestamp of [NOW_SECONDS - 301, NOW_SECONDS + 301]) {
    const response = await handleEtsyWebhook(
      request({ timestamp }),
      dependencies(new MemoryRepository())
    );
    assert.equal(response.status, 408);
    assert.equal((await response.json()).error, "STALE_TIMESTAMP");
  }
  assert.equal(getEtsyWebhookToleranceSeconds(5), 60);
  assert.equal(getEtsyWebhookToleranceSeconds(9999), 600);
  assert.equal(getEtsyWebhookToleranceSeconds("invalid"), 300);
});

test("G. duplicate delivery is idempotent", async () => {
  const repository = new MemoryRepository();
  const deps = dependencies(repository);
  assert.equal((await handleEtsyWebhook(request({}), deps)).status, 200);
  const duplicate = await handleEtsyWebhook(request({}), deps);
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).status, "ALREADY_PROCESSED");
  assert.equal(repository.events.size, 1);
  assert.equal(repository.events.get("msg_test_001")?.duplicateCount, 1);
});

test("H. concurrent duplicates claim once and cannot double-readback", async () => {
  const repository = new MemoryRepository();
  let readbackCalls = 0;
  const deps = dependencies(repository, {
    fetchImpl: async () => {
      readbackCalls += 1;
      await Promise.resolve();
      return Response.json({ receipt_id: 1001, transactions: [] });
    }
  });
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => handleEtsyWebhook(request({}), deps))
  );
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(repository.events.size, 1);
  assert.equal(readbackCalls, 1);
  assert.equal(repository.events.get("msg_test_001")?.duplicateCount, 7);
});

test("I. signed malformed JSON fails closed before persistence", async () => {
  const repository = new MemoryRepository();
  const response = await handleEtsyWebhook(
    request({ body: "{" }),
    dependencies(repository)
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "MALFORMED_JSON");
  assert.equal(repository.events.size, 0);
});

test("J. a valid unsupported event is preserved without downstream action", async () => {
  const repository = new MemoryRepository();
  let fetchCalls = 0;
  const body = JSON.stringify({
    event_type: "listing.experimental",
    resource_url: "https://api.etsy.com/v3/application/shops/42/receipts/1001",
    shop_id: 42
  });
  const response = await handleEtsyWebhook(
    request({ body }),
    dependencies(repository, { fetchImpl: async () => { fetchCalls += 1; throw new Error("not reachable"); } })
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).processingState, "UNSUPPORTED_EVENT");
  assert.equal(repository.events.get("msg_test_001")?.providerEventType, "listing.experimental");
  assert.equal(fetchCalls, 0);
});

test("K. buyer PII from webhook and readback is never projected", async () => {
  const repository = new MemoryRepository();
  const body = JSON.stringify({
    event_type: "order.paid",
    resource_url: "https://api.etsy.com/v3/application/shops/42/receipts/1001",
    shop_id: 42,
    buyer_email: "private@example.test",
    name: "Private Buyer",
    formatted_address: "Private street"
  });
  const response = await handleEtsyWebhook(request({ body }), dependencies(repository));
  const serialized = JSON.stringify({
    response: await response.json(),
    events: [...repository.events.values()]
  });
  for (const forbidden of [
    "private@example.test",
    "must-not-be-projected@example.test",
    "Private Buyer",
    "Private street",
    "buyer_email",
    "formatted_address"
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("L. webhook processing exposes no Etsy marketplace mutation method", async () => {
  const files = await Promise.all([
    readFile(new URL("../lib/etsy-webhook.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/etsy-event-readback.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/webhooks/etsy/route.ts", import.meta.url), "utf8")
  ]);
  const source = files.join("\n");
  const routeSource = files[2];
  assert.match(routeSource, /export async function POST/);
  assert.doesNotMatch(
    routeSource,
    /export async function (?:GET|PUT|PATCH|DELETE)/
  );
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  assert.doesNotMatch(source, /fetch\([^)]*etsy[^)]*,\s*\{[^}]*method:\s*["'](?:POST|PUT|PATCH|DELETE)/s);
  assert.match(source, /ETSY_WRITE_COUNT/);
});

test("M. readback failure is recorded truthfully without inventing success", async () => {
  const repository = new MemoryRepository();
  const response = await handleEtsyWebhook(
    request({}),
    dependencies(repository, {
      fetchImpl: async () => new Response("unavailable", { status: 503 })
    })
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).readbackState, "FAILED_READ_ONLY");
  assert.equal(repository.events.get("msg_test_001")?.readbackState, "FAILED_READ_ONLY");
});

test("N. missing signing secret fails closed", async () => {
  const repository = new MemoryRepository();
  const response = await handleEtsyWebhook(request({}), {
    ...dependencies(repository),
    signingSecret: undefined
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "ETSY_WEBHOOK_SIGNING_SECRET_NOT_CONFIGURED");
  assert.equal(repository.events.size, 0);
});
