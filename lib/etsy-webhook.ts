import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual
} from "node:crypto";
import { NeonEtsyEventRepository, type EtsyEventRepository } from "./etsy-event-ledger";
import { readBackEtsyReceipt, type EtsyReadbackDependencies } from "./etsy-event-readback";
import {
  ETSY_WRITE_COUNT,
  normalizeProviderEventType,
  type EtsyEventClaimInput
} from "./etsy-event-types";

const DEFAULT_TOLERANCE_SECONDS = 300;
const MIN_TOLERANCE_SECONDS = 60;
const MAX_TOLERANCE_SECONDS = 600;
const MAX_BODY_BYTES = 256 * 1024;
const WEBHOOK_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const EVENT_TYPE_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

type JsonRecord = Record<string, unknown>;

export type EtsyWebhookDependencies = EtsyReadbackDependencies & {
  repository?: EtsyEventRepository;
  signingSecret?: string;
  now?: () => Date;
  toleranceSeconds?: number;
  correlationId?: () => string;
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return Response.json(
    { ...body, mode: "READ_ONLY", ETSY_WRITE_COUNT },
    { status, headers: { "cache-control": "no-store" } }
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strictBase64Decode(value: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 === 1) {
    return null;
  }
  const unpadded = value.replace(/=+$/, "");
  const padded = unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, "=");
  const decoded = Buffer.from(padded, "base64");
  return decoded.toString("base64").replace(/=+$/, "") === unpadded
    ? decoded
    : null;
}

function signingKey(secret: string) {
  if (!secret.startsWith("whsec_")) return null;
  return strictBase64Decode(secret.slice("whsec_".length));
}

export function isValidEtsySigningSecretFormat(secret: string) {
  return signingKey(secret) !== null;
}

function candidateSignatures(header: string) {
  return header
    .trim()
    .split(/\s+/)
    .map((entry) => entry.split(",", 2))
    .filter(([version, signature]) => version === "v1" && Boolean(signature))
    .map(([, signature]) => strictBase64Decode(signature))
    .filter((signature) => signature !== null);
}

export function verifyEtsyWebhookSignature(input: {
  secret: string;
  webhookId: string;
  webhookTimestamp: string;
  signatureHeader: string;
  rawBody: Buffer;
}) {
  const key = signingKey(input.secret);
  if (!key) return false;
  const signedPrefix = Buffer.from(
    `${input.webhookId}.${input.webhookTimestamp}.`,
    "utf8"
  );
  const expected = createHmac("sha256", key)
    .update(Buffer.concat([signedPrefix, input.rawBody]))
    .digest();

  return candidateSignatures(input.signatureHeader).some(
    (candidate) =>
      candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

export function getEtsyWebhookToleranceSeconds(raw?: number | string) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_TOLERANCE_SECONDS;
  return Math.min(
    MAX_TOLERANCE_SECONDS,
    Math.max(MIN_TOLERANCE_SECONDS, Math.floor(parsed))
  );
}

function positiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function receiptIdentity(resourceUrl: unknown, shopId: number | null) {
  if (typeof resourceUrl !== "string" || !shopId) return null;
  try {
    const url = new URL(resourceUrl);
    if (
      url.protocol !== "https:" ||
      !["api.etsy.com", "openapi.etsy.com"].includes(url.hostname) ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    const match = url.pathname.match(
      /^\/v3\/application\/shops\/(\d+)\/receipts\/(\d+)\/?$/
    );
    if (!match || Number(match[1]) !== shopId) return null;
    return positiveInteger(match[2]);
  } catch {
    return null;
  }
}

function normalizedEvent(input: {
  payload: JsonRecord;
  webhookId: string;
  timestampSeconds: number;
  rawBody: Buffer;
  receivedAt: Date;
  correlationId: string;
}) {
  if (
    typeof input.payload.event_type !== "string" ||
    !EVENT_TYPE_PATTERN.test(input.payload.event_type.trim())
  ) {
    return null;
  }

  const providerEventType = input.payload.event_type.trim().toLowerCase();
  const eventType = normalizeProviderEventType(providerEventType);
  const shopId = positiveInteger(input.payload.shop_id);
  const receiptId = receiptIdentity(input.payload.resource_url, shopId);
  const unsupported = eventType === "UNSUPPORTED_EVENT";

  return {
    eventId: input.webhookId,
    provider: "etsy" as const,
    eventType,
    providerEventType,
    webhookId: input.webhookId,
    eventTimestamp: new Date(input.timestampSeconds * 1000).toISOString(),
    receivedAt: input.receivedAt.toISOString(),
    payloadSha256: createHash("sha256").update(input.rawBody).digest("hex"),
    shopId,
    receiptId,
    listingIds: [],
    processingState: unsupported ? "UNSUPPORTED_EVENT" as const : "PROCESSING" as const,
    verificationState: "SIGNATURE_VERIFIED" as const,
    readbackState: unsupported ? "NOT_AVAILABLE" as const : "PENDING" as const,
    correlationId: input.correlationId
  } satisfies EtsyEventClaimInput;
}

async function recordSignatureFailure(repository: EtsyEventRepository) {
  try {
    await repository.recordSignatureFailure();
  } catch {
    // The request still fails closed; no unverified payload is persisted.
  }
}

export async function handleEtsyWebhook(
  request: Request,
  dependencies: EtsyWebhookDependencies = {}
) {
  let rawBody: Buffer;
  try {
    rawBody = Buffer.from(await request.arrayBuffer());
  } catch {
    return jsonResponse({ status: "REJECTED", error: "RAW_BODY_UNREADABLE" }, 400);
  }

  if (rawBody.length === 0 || rawBody.length > MAX_BODY_BYTES) {
    return jsonResponse({ status: "REJECTED", error: "INVALID_BODY_SIZE" }, 400);
  }

  const webhookId = request.headers.get("webhook-id")?.trim() ?? "";
  const webhookTimestamp = request.headers.get("webhook-timestamp")?.trim() ?? "";
  const signatureHeader = request.headers.get("webhook-signature")?.trim() ?? "";
  if (!webhookId || !WEBHOOK_ID_PATTERN.test(webhookId)) {
    return jsonResponse({ status: "REJECTED", error: "WEBHOOK_ID_REQUIRED" }, 400);
  }
  if (!webhookTimestamp || !/^\d{1,12}$/.test(webhookTimestamp)) {
    return jsonResponse(
      { status: "REJECTED", error: "WEBHOOK_TIMESTAMP_REQUIRED" },
      400
    );
  }

  const repository = dependencies.repository ?? new NeonEtsyEventRepository();
  if (!signatureHeader) {
    await recordSignatureFailure(repository);
    return jsonResponse({ status: "REJECTED", error: "SIGNATURE_REQUIRED" }, 401);
  }

  const secret =
    dependencies.signingSecret ?? process.env.ETSY_WEBHOOK_SIGNING_SECRET?.trim();
  if (!secret) {
    return jsonResponse(
      { status: "BLOCKED", error: "ETSY_WEBHOOK_SIGNING_SECRET_NOT_CONFIGURED" },
      503
    );
  }
  if (!isValidEtsySigningSecretFormat(secret)) {
    return jsonResponse(
      { status: "BLOCKED", error: "ETSY_WEBHOOK_SIGNING_SECRET_INVALID" },
      503
    );
  }

  if (
    !verifyEtsyWebhookSignature({
      secret,
      webhookId,
      webhookTimestamp,
      signatureHeader,
      rawBody
    })
  ) {
    await recordSignatureFailure(repository);
    return jsonResponse({ status: "REJECTED", error: "INVALID_SIGNATURE" }, 401);
  }

  const timestampSeconds = Number(webhookTimestamp);
  const receivedAt = dependencies.now?.() ?? new Date();
  const toleranceSeconds = getEtsyWebhookToleranceSeconds(
    dependencies.toleranceSeconds ?? process.env.ETSY_WEBHOOK_TOLERANCE_SECONDS
  );
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(Math.floor(receivedAt.getTime() / 1000) - timestampSeconds) >
      toleranceSeconds
  ) {
    return jsonResponse({ status: "REJECTED", error: "STALE_TIMESTAMP" }, 408);
  }

  let payload: unknown;
  try {
    const rawJson = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
    payload = JSON.parse(rawJson) as unknown;
  } catch {
    return jsonResponse({ status: "REJECTED", error: "MALFORMED_JSON" }, 400);
  }
  if (!isRecord(payload)) {
    return jsonResponse({ status: "REJECTED", error: "MALFORMED_PAYLOAD" }, 400);
  }

  const event = normalizedEvent({
    payload,
    webhookId,
    timestampSeconds,
    rawBody,
    receivedAt,
    correlationId: dependencies.correlationId?.() ?? randomUUID()
  });
  if (!event) {
    return jsonResponse({ status: "REJECTED", error: "MALFORMED_PAYLOAD" }, 400);
  }

  let claim;
  try {
    claim = await repository.claim(event);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ETSY_EVENT_IDENTITY_CONFLICT"
    ) {
      return jsonResponse(
        { status: "REJECTED", error: "ETSY_EVENT_IDENTITY_CONFLICT" },
        409
      );
    }
    return jsonResponse({ status: "BLOCKED", error: "EVENT_STORAGE_FAILED" }, 503);
  }

  if (!claim.claimed) {
    return jsonResponse(
      {
        status: "ALREADY_PROCESSED",
        eventId: event.eventId,
        duplicate: true
      },
      200
    );
  }

  if (event.eventType === "UNSUPPORTED_EVENT") {
    return jsonResponse(
      {
        status: "ACCEPTED",
        eventId: event.eventId,
        eventType: event.eventType,
        processingState: "UNSUPPORTED_EVENT",
        readbackState: "NOT_AVAILABLE",
        duplicate: false
      },
      200
    );
  }

  const readback = await readBackEtsyReceipt(event, dependencies);
  try {
    await repository.completeReadback(
      event.eventId,
      readback.state,
      readback.listingIds
    );
  } catch {
    return jsonResponse({ status: "BLOCKED", error: "EVENT_STORAGE_FAILED" }, 503);
  }

  return jsonResponse(
    {
      status: "ACCEPTED",
      eventId: event.eventId,
      eventType: event.eventType,
      processingState: "PROCESSED",
      readbackState: readback.state,
      duplicate: false
    },
    200
  );
}
