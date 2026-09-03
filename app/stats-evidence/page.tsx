"use client";

import { useEffect, useMemo, useState } from "react";
import { ETSY_CHANNEL_INDEX } from "../../lib/catalog-channel-index";

type ListingInput = {
  views: string;
  orders: string;
  revenue: string;
  favorites: string;
};

type ApiListingEvidence = {
  favoriteCount: number | null;
  transactionCount: number | null;
  transactionEvidence: string;
  title: string | null;
  state: string | null;
};

const SHOP_ID = 23582741;
const STATS_URL =
  "https://www.etsy.com/your/shops/me/stats?ref=seller-platform-mcnav";

function blankListingInputs() {
  return Object.fromEntries(
    ETSY_CHANNEL_INDEX.map((entry) => [
      String(entry.listingId),
      { views: "", orders: "", revenue: "", favorites: "" }
    ])
  ) as Record<string, ListingInput>;
}

function requiredNumber(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function optionalNumber(value: string) {
  if (value.trim() === "") return null;
  return requiredNumber(value);
}

export default function ShopStatsEvidencePage() {
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [refreshedAt, setRefreshedAt] = useState("");
  const [visits, setVisits] = useState("");
  const [orders, setOrders] = useState("");
  const [revenue, setRevenue] = useState("");
  const [conversionRate, setConversionRate] = useState("");
  const [etsySearchVisits, setEtsySearchVisits] = useState("");
  const [listingInputs, setListingInputs] =
    useState<Record<string, ListingInput>>(blankListingInputs);
  const [searchTerms, setSearchTerms] = useState("");
  const [noSearchTermsVisible, setNoSearchTermsVisible] = useState(false);
  const [output, setOutput] = useState("");
  const [copyState, setCopyState] = useState("");
  const [apiListingEvidence, setApiListingEvidence] =
    useState<Record<string, ApiListingEvidence>>({});
  const [apiEnrichmentState, setApiEnrichmentState] =
    useState<"LOADING" | "CONNECTED" | "UNAVAILABLE">("LOADING");

  useEffect(() => {
    let cancelled = false;

    async function loadApiEvidence() {
      try {
        const response = await fetch("/api/etsy/control-center", {
          cache: "no-store"
        });
        const payload = (await response.json()) as {
          status?: string;
          listings?: Array<{
            listingId?: number;
            favoriteCount?: number | null;
            transactionCount?: number | null;
            transactionEvidence?: string;
            title?: string | null;
            state?: string | null;
          }>;
        };

        if (!response.ok || payload.status !== "PASS" || !Array.isArray(payload.listings)) {
          throw new Error("CONTROL_CENTER_API_UNAVAILABLE");
        }

        const evidence: Record<string, ApiListingEvidence> = {};

        for (const listing of payload.listings) {
          if (typeof listing.listingId !== "number") continue;
          evidence[String(listing.listingId)] = {
            favoriteCount:
              typeof listing.favoriteCount === "number"
                ? listing.favoriteCount
                : null,
            transactionCount:
              typeof listing.transactionCount === "number"
                ? listing.transactionCount
                : null,
            transactionEvidence:
              listing.transactionEvidence ?? "UNKNOWN",
            title: listing.title ?? null,
            state: listing.state ?? null
          };
        }

        if (cancelled) return;

        setApiListingEvidence(evidence);
        setListingInputs((current) => {
          const next = { ...current };

          for (const entry of ETSY_CHANNEL_INDEX) {
            const key = String(entry.listingId);
            const apiRow = evidence[key];
            const currentRow = next[key];

            if (
              currentRow &&
              currentRow.favorites.trim() === "" &&
              typeof apiRow?.favoriteCount === "number"
            ) {
              next[key] = {
                ...currentRow,
                favorites: String(apiRow.favoriteCount)
              };
            }
          }

          return next;
        });
        setApiEnrichmentState("CONNECTED");
      } catch {
        if (!cancelled) setApiEnrichmentState("UNAVAILABLE");
      }
    }

    void loadApiEvidence();

    return () => {
      cancelled = true;
    };
  }, []);

  const completeness = useMemo(() => {
    const shopComplete =
      periodStart !== "" &&
      periodEnd !== "" &&
      requiredNumber(visits) !== null &&
      requiredNumber(orders) !== null &&
      requiredNumber(conversionRate) !== null;

    const listingsComplete = ETSY_CHANNEL_INDEX.every((entry) => {
      const row = listingInputs[String(entry.listingId)];
      return (
        row &&
        requiredNumber(row.views) !== null &&
        requiredNumber(row.orders) !== null
      );
    });

    const searchComplete =
      noSearchTermsVisible || searchTerms.trim().length > 0;

    return shopComplete && listingsComplete && searchComplete;
  }, [
    periodStart,
    periodEnd,
    visits,
    orders,
    conversionRate,
    listingInputs,
    noSearchTermsVisible,
    searchTerms
  ]);

  function updateListing(
    listingId: number,
    field: keyof ListingInput,
    value: string
  ) {
    setListingInputs((current) => ({
      ...current,
      [String(listingId)]: {
        ...current[String(listingId)],
        [field]: value
      }
    }));
  }

  function buildEvidence() {
    const capturedAt = new Date().toISOString();
    const evidence = {
      schemaVersion: "ETSY_SHOP_STATS_EVIDENCE_V1",
      evidenceStatus: completeness
        ? "COMPLETE_FOR_ROOT_CAUSE_REVIEW"
        : "PARTIAL",
      apiEnrichmentState,
      source: {
        platform: "Etsy",
        area: "Shop Manager > Stats",
        sourceUrl: STATS_URL,
        captureMethod: "USER_TRANSCRIBED_FROM_LIVE_SELLER_STATS",
        capturedAt,
        sellerStatsLastRefreshText: refreshedAt.trim() || null
      },
      period: {
        startDate: periodStart || null,
        endDate: periodEnd || null
      },
      shop: {
        shopId: SHOP_ID,
        visits: requiredNumber(visits),
        orders: requiredNumber(orders),
        revenueUsd: optionalNumber(revenue),
        conversionRatePercent: requiredNumber(conversionRate),
        etsySearchVisits: optionalNumber(etsySearchVisits)
      },
      listings: ETSY_CHANNEL_INDEX.map((entry) => {
        const row = listingInputs[String(entry.listingId)];
        return {
          productId: entry.productId,
          listingId: entry.listingId,
          views: requiredNumber(row?.views ?? ""),
          orders: requiredNumber(row?.orders ?? ""),
          revenueUsd: optionalNumber(row?.revenue ?? ""),
          favorites: optionalNumber(row?.favorites ?? ""),
          apiEvidence: apiListingEvidence[String(entry.listingId)] ?? null
        };
      }),
      searchTermEvidence: noSearchTermsVisible
        ? {
            status: "NONE_VISIBLE_IN_SELECTED_PERIOD",
            rawLines: []
          }
        : {
            status: searchTerms.trim()
              ? "CAPTURED"
              : "NOT_CAPTURED",
            rawLines: searchTerms
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
          },
      evidenceBoundary: {
        listingViewsAreNotSearchImpressions: true,
        ctrStatus: "UNKNOWN_UNLESS_IMPRESSIONS_AND_CLICKS_ARE_SUPPLIED",
        notes: [
          "Do not infer Etsy search CTR from listing views.",
          "Use this snapshot for root-cause review; do not auto-patch listings from this page.",
          "Keep Product Truth, buyer files and canonical Catalog unchanged."
        ]
      }
    };

    setOutput(JSON.stringify(evidence, null, 2));
    setCopyState("");
  }

  async function copyEvidence() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopyState("COPIED");
  }

  return (
    <main className="shell salesShell">
      <section className="hero">
        <div>
          <p className="eyebrow">ETSY SHOP STATS EVIDENCE</p>
          <h1>Capture what Etsy actually shows.</h1>
          <p className="lede">
            This page does not read or change Etsy listings. Enter the exact
            values visible in Shop Manager → Stats, then generate one normalized
            evidence snapshot for root-cause review.
          </p>
        </div>
        <div className="badge">LOCAL FORM · NO LISTING WRITES</div>
      </section>

      <section className="notice">
        <div>
          <p className="eyebrow">SOURCE</p>
          <h2>Live Etsy Shop Stats</h2>
          <p>
            Use one consistent date range for the shop metrics and all six
            listing rows. Do not estimate missing values. Favorites are
            auto-filled from the read-only Etsy Open API when available.
          </p>
          <p>API enrichment: <strong>{apiEnrichmentState}</strong></p>
        </div>
        <a className="connectButton" href={STATS_URL} target="_blank" rel="noreferrer">
          Open Etsy Stats
        </a>
      </section>

      <section className="captureSection">
        <div className="captureGrid">
          <label>
            <span>Period start *</span>
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </label>
          <label>
            <span>Period end *</span>
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </label>
          <label>
            <span>Etsy “last refreshed” text</span>
            <input value={refreshedAt} onChange={(e) => setRefreshedAt(e.target.value)} placeholder="Optional exact text from Stats" />
          </label>
        </div>
      </section>

      <section className="captureSection">
        <p className="eyebrow">SHOP-LEVEL METRICS</p>
        <div className="captureGrid metricsCapture">
          <label>
            <span>Visits *</span>
            <input inputMode="numeric" value={visits} onChange={(e) => setVisits(e.target.value)} />
          </label>
          <label>
            <span>Orders *</span>
            <input inputMode="numeric" value={orders} onChange={(e) => setOrders(e.target.value)} />
          </label>
          <label>
            <span>Revenue USD</span>
            <input inputMode="decimal" value={revenue} onChange={(e) => setRevenue(e.target.value)} />
          </label>
          <label>
            <span>Conversion rate % *</span>
            <input inputMode="decimal" value={conversionRate} onChange={(e) => setConversionRate(e.target.value)} />
          </label>
          <label>
            <span>Etsy Search visits</span>
            <input inputMode="numeric" value={etsySearchVisits} onChange={(e) => setEtsySearchVisits(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="captureSection">
        <p className="eyebrow">EXACT SIX LISTINGS</p>
        <div className="statsTableWrap">
          <table className="statsTable">
            <thead>
              <tr>
                <th>Product</th>
                <th>Listing ID</th>
                <th>Views *</th>
                <th>Orders *</th>
                <th>Revenue USD</th>
                <th>Favorites (API)</th>
              </tr>
            </thead>
            <tbody>
              {ETSY_CHANNEL_INDEX.map((entry) => {
                const row = listingInputs[String(entry.listingId)];
                return (
                  <tr key={entry.listingId}>
                    <td>{entry.productId}</td>
                    <td>{entry.listingId}</td>
                    {(["views", "orders", "revenue", "favorites"] as const).map((field) => (
                      <td key={field}>
                        <input
                          inputMode={field === "revenue" ? "decimal" : "numeric"}
                          aria-label={`${entry.productId} ${field}`}
                          value={row[field]}
                          readOnly={
                            field === "favorites" &&
                            typeof apiListingEvidence[String(entry.listingId)]
                              ?.favoriteCount === "number"
                          }
                          onChange={(e) =>
                            updateListing(entry.listingId, field, e.target.value)
                          }
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="captureSection">
        <p className="eyebrow">ETSY SEARCH TERMS</p>
        <p>
          In Stats, open Etsy search under “How shoppers found you”. Paste the
          visible terms exactly, one line per row. Add counts after a vertical
          bar when Etsy shows them, for example: <code>boba checklist | 3</code>.
        </p>
        <textarea
          className="evidenceTextarea"
          value={searchTerms}
          onChange={(e) => setSearchTerms(e.target.value)}
          disabled={noSearchTermsVisible}
          placeholder={"search term | count\nsecond term | count"}
        />
        <label className="checkRow">
          <input
            type="checkbox"
            checked={noSearchTermsVisible}
            onChange={(e) => setNoSearchTermsVisible(e.target.checked)}
          />
          <span>No Etsy search terms are visible for this selected period</span>
        </label>
      </section>

      <section className="notice">
        <div>
          <p className="eyebrow">EVIDENCE COMPLETENESS</p>
          <h2>{completeness ? "READY FOR ROOT-CAUSE REVIEW" : "PARTIAL"}</h2>
          <p>
            Required: date range, shop visits/orders/conversion rate, views and
            orders for all six listings, plus search-term evidence or an explicit
            “none visible” statement.
          </p>
        </div>
        <button className="connectButton buttonReset" type="button" onClick={buildEvidence}>
          Generate Evidence JSON
        </button>
      </section>

      {output ? (
        <section className="captureSection">
          <div className="outputHeader">
            <div>
              <p className="eyebrow">NORMALIZED SNAPSHOT</p>
              <h2>Copy this JSON back into the project chat.</h2>
            </div>
            <button className="connectButton buttonReset" type="button" onClick={copyEvidence}>
              {copyState || "Copy Evidence JSON"}
            </button>
          </div>
          <textarea className="evidenceTextarea outputTextarea" readOnly value={output} />
        </section>
      ) : null}

      <section className="notice warningNotice">
        <div>
          <p className="eyebrow">BOUNDARY</p>
          <h2>Views are not search impressions.</h2>
          <p>
            This capture does not invent CTR. CTR remains UNKNOWN unless exact
            impression and click evidence is separately available.
          </p>
        </div>
        <code>NO DATA → NO RANDOM REDESIGN</code>
      </section>
    </main>
  );
}
