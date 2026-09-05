import { neon } from "@neondatabase/serverless";
import { ETSY_CHANNEL_INDEX } from "./catalog-channel-index";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { getStoredEtsyShopId } from "./token-store";

export const CONTROL_CENTER_V2_VERSION = "2.0.0" as const;

type EtsyListing = {
  listing_id?: number;
  shop_id?: number;
  title?: string;
  state?: string;
  url?: string;
};

type EtsyListingsResponse = {
  count?: number;
  results?: EtsyListing[];
  error?: string;
};

export type LiveListingSummary = {
  listingId: number;
  title: string | null;
  state: string | null;
  url: string | null;
  catalogTracked: boolean;
  productId: string | null;
};

export type LatestPublishProof = {
  operationId: string;
  requestHash: string;
  status: string;
  listingId: string | null;
  state: string | null;
  authorizationState: string | null;
  expectedListingFingerprint: string | null;
  actualListingFingerprint: string | null;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function trackedProductId(listingId: number) {
  const entry = ETSY_CHANNEL_INDEX.find((item) => item.listingId === listingId);
  return entry?.productId ?? null;
}

async function readLiveListings() {
  const shopId = await getStoredEtsyShopId();
  if (!shopId) {
    return {
      status: "BLOCKED" as const,
      error: "SHOP_IDENTITY_TEST_REQUIRED",
      shopId: null,
      listings: [] as LiveListingSummary[]
    };
  }

  try {
    const accessToken = await getValidEtsyAccessToken();
    const response = await fetch(
      `https://api.etsy.com/v3/application/shops/${shopId}/listings?state=active&limit=100`,
      {
        method: "GET",
        headers: etsyApiHeaders(accessToken),
        cache: "no-store"
      }
    );
    const payload = (await response.json()) as EtsyListingsResponse;

    if (!response.ok || !Array.isArray(payload.results)) {
      return {
        status: "BLOCKED" as const,
        error: payload.error ?? `ETSY_LISTINGS_LOOKUP_HTTP_${response.status}`,
        shopId,
        listings: [] as LiveListingSummary[]
      };
    }

    const listings: LiveListingSummary[] = [];
    for (const listing of payload.results) {
      if (listing.shop_id != null && listing.shop_id !== shopId) {
        return {
          status: "BLOCKED" as const,
          error: "LISTING_SHOP_ID_MISMATCH",
          shopId,
          listings: [] as LiveListingSummary[]
        };
      }
      if (typeof listing.listing_id !== "number") continue;
      const productId = trackedProductId(listing.listing_id);
      listings.push({
        listingId: listing.listing_id,
        title: listing.title ?? null,
        state: listing.state ?? null,
        url: listing.url ?? null,
        catalogTracked: productId != null,
        productId
      });
    }

    listings.sort((left, right) => right.listingId - left.listingId);
    return { status: "PASS" as const, error: null, shopId, listings };
  } catch (error) {
    return {
      status: "BLOCKED" as const,
      error: error instanceof Error ? error.message : "ETSY_LIVE_READ_FAILED",
      shopId,
      listings: [] as LiveListingSummary[]
    };
  }
}

async function readLatestPublishProof(): Promise<LatestPublishProof | null> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;

  try {
    const sql = neon(databaseUrl);
    const rows = await sql`
      SELECT operation_id, request_hash, status, receipt, updated_at
      FROM channel_operation_ledger
      WHERE operation_id LIKE ${"%PUBLISH%"}
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const receipt = isRecord(row.receipt) ? row.receipt : {};
    const updatedAtValue = row.updated_at;
    const updatedAt =
      updatedAtValue instanceof Date
        ? updatedAtValue.toISOString()
        : new Date(String(updatedAtValue)).toISOString();

    return {
      operationId: String(row.operation_id ?? ""),
      requestHash: String(row.request_hash ?? ""),
      status: String(row.status ?? "UNKNOWN"),
      listingId: asString(receipt.listingId),
      state: asString(receipt.state),
      authorizationState: asString(receipt.authorizationState),
      expectedListingFingerprint: asString(receipt.expectedListingFingerprint),
      actualListingFingerprint: asString(receipt.actualListingFingerprint),
      updatedAt
    };
  } catch {
    return null;
  }
}

export async function getControlCenterV2Snapshot() {
  const [live, latestPublish] = await Promise.all([
    readLiveListings(),
    readLatestPublishProof()
  ]);
  const secureWriteTokenConfigured = Boolean(
    process.env.ETSY_DRAFT_WRITE_TOKEN?.trim()
  );
  const liveOnlyListings = live.listings.filter((listing) => !listing.catalogTracked);

  return {
    version: CONTROL_CENTER_V2_VERSION,
    mode: "READ_ONLY_CONTROL_PLANE",
    generatedAt: new Date().toISOString(),
    live: {
      status: live.status,
      error: live.error,
      shopId: live.shopId,
      activeCount: live.status === "PASS" ? live.listings.length : null,
      catalogTrackedCount: ETSY_CHANNEL_INDEX.length,
      liveOnlyCount: live.status === "PASS" ? liveOnlyListings.length : null,
      listings: live.listings
    },
    production: {
      route: "/api/publish",
      secureWriteTokenConfigured,
      capability: secureWriteTokenConfigured
        ? "READY_SECURE_GATED"
        : "BLOCKED_SECRET_REQUIRED",
      directUiWrite: false,
      executionPolicy: "AUTHORIZED_ACTIONS_ONLY",
      executor: "GitHub Actions secure runner",
      latestPublish
    }
  };
}
