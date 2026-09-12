import { NextResponse } from "next/server";
import { NeonEtsyEventRepository } from "../../../../lib/etsy-event-ledger";
import {
  normalizeProviderEventType,
  type EtsyCommerceEventType
} from "../../../../lib/etsy-event-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_FILTERS = new Set<EtsyCommerceEventType>([
  "ORDER_PAID",
  "ORDER_CANCELED",
  "ORDER_SHIPPED",
  "ORDER_DELIVERED",
  "UNSUPPORTED_EVENT"
]);

function limitFromRequest(request: Request) {
  const raw = new URL(request.url).searchParams.get("limit");
  if (!raw) return 50;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(1, Math.floor(value)));
}

function eventTypeFromRequest(request: Request) {
  const raw = new URL(request.url).searchParams.get("event_type")?.trim();
  if (!raw) return null;
  const normalized = raw.toUpperCase() === "UNSUPPORTED_EVENT"
    ? "UNSUPPORTED_EVENT"
    : normalizeProviderEventType(raw);
  return EVENT_FILTERS.has(normalized) ? normalized : null;
}

export async function GET(request: Request) {
  const limit = limitFromRequest(request);
  const eventType = eventTypeFromRequest(request);
  try {
    const snapshot = await new NeonEtsyEventRepository().getSnapshot(limit, eventType);
    return NextResponse.json(snapshot, {
      status: 200,
      headers: { "cache-control": "no-store" }
    });
  } catch {
    return NextResponse.json(
      {
        status: "BLOCKED",
        mode: "READ_ONLY",
        error: "ETSY_EVENT_LEDGER_UNAVAILABLE",
        ETSY_WRITE_COUNT: 0
      },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}

