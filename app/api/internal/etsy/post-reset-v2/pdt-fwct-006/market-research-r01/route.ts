import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { fetchEtsyReadWithRetry } from "../../../../../../../lib/etsy-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TERMS = Object.freeze([
  "restaurant food waste spreadsheet",
  "food waste tracker",
  "food spoilage tracker",
  "commercial kitchen food waste cost tracker",
  "restaurant waste cost tracker",
  "kitchen waste cost tracker"
] as const);

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}

function price(row: Rec) {
  const p = row.price;
  if (!isRec(p)) return null;
  const amount = Number(p.amount);
  const divisor = Number(p.divisor);
  const currency = text(p.currency_code);
  if (!Number.isFinite(amount) || !Number.isFinite(divisor) || divisor <= 0 || !currency) return null;
  return { amount: amount / divisor, currency };
}

async function searchTerm(term: string) {
  const endpoint =
    "https://api.etsy.com/v3/application/listings/active?" +
    new URLSearchParams({
      keywords: term,
      limit: "25",
      offset: "0",
      sort_on: "score",
      sort_order: "desc"
    }).toString();

  const response = await fetchEtsyReadWithRetry(fetch, endpoint, {
    method: "GET",
    headers: etsyApiHeaders(),
    cache: "no-store"
  });

  const raw = await response.text();
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }

  if (!response.ok || !isRec(body)) {
    return {
      term,
      status: "ERROR",
      httpStatus: response.status,
      totalCount: null,
      results: []
    };
  }

  const results = Array.isArray(body.results) ? body.results.filter(isRec) : [];
  return {
    term,
    status: "PASS",
    httpStatus: response.status,
    totalCount: Number.isFinite(Number(body.count)) ? Number(body.count) : null,
    results: results.map((row) => ({
      listingId: Number(row.listing_id),
      shopId: Number(row.shop_id),
      title: text(row.title),
      state: text(row.state),
      price: price(row),
      url: text(row.url),
      numFavorers: Number.isFinite(Number(row.num_favorers)) ? Number(row.num_favorers) : null,
      tags: Array.isArray(row.tags) ? row.tags.filter((x): x is string => typeof x === "string") : []
    }))
  };
}

export async function GET() {
  try {
    const evidence = [];
    for (const term of TERMS) evidence.push(await searchTerm(term));

    return NextResponse.json(
      {
        status: evidence.every((item) => item.status === "PASS") ? "PASS" : "PARTIAL",
        mode: "READ_ONLY",
        productId: "PDT-FWCT-006",
        candidate: "Restaurant Food Waste Cost Tracker",
        market: "Etsy USA / English",
        evidenceSource: "Etsy Open API v3 findAllListingsActive",
        terms: evidence,
        caveat:
          "Marketplace listing count and ranked samples are supply/intent evidence only. They are not eRank Avg Searches, Avg Clicks, CTR or KD.",
        eRankStatus: "NOT_AVAILABLE_FROM_THIS_ROUTE",
        EtsyWriteCount: 0,
        mutationEnabled: false,
        generatedAt: new Date().toISOString()
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        mode: "READ_ONLY",
        productId: "PDT-FWCT-006",
        error: error instanceof Error ? error.message : "UNKNOWN",
        EtsyWriteCount: 0,
        mutationEnabled: false
      },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
