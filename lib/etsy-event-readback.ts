import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { getStoredEtsyShopId } from "./token-store";
import type { EtsyEventClaimInput, EtsyReadbackState } from "./etsy-event-types";

type JsonRecord = Record<string, unknown>;

export type EtsyReadbackResult = {
  state: Exclude<EtsyReadbackState, "PENDING">;
  listingIds: number[];
};

export type EtsyReadbackDependencies = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  getShopId?: () => Promise<number | null>;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function listingIdsFromReceipt(payload: JsonRecord) {
  const transactions = Array.isArray(payload.transactions)
    ? payload.transactions.filter(isRecord)
    : [];
  return [
    ...new Set(
      transactions
        .map((transaction) => Number(transaction.listing_id))
        .filter((value) => Number.isSafeInteger(value) && value > 0)
    )
  ].sort((a, b) => a - b);
}

export async function readBackEtsyReceipt(
  event: EtsyEventClaimInput,
  dependencies: EtsyReadbackDependencies = {}
): Promise<EtsyReadbackResult> {
  if (!event.shopId || !event.receiptId) {
    return { state: "NOT_AVAILABLE", listingIds: [] };
  }

  try {
    const storedShopId = await (dependencies.getShopId ?? getStoredEtsyShopId)();
    if (!storedShopId || storedShopId !== event.shopId) {
      return { state: "NOT_AVAILABLE", listingIds: [] };
    }

    const accessToken = await (
      dependencies.getAccessToken ?? getValidEtsyAccessToken
    )();
    const endpoint =
      `https://api.etsy.com/v3/application/shops/${event.shopId}` +
      `/receipts/${event.receiptId}`;
    const response = await (dependencies.fetchImpl ?? fetch)(endpoint, {
      method: "GET",
      headers: etsyApiHeaders(accessToken),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) return { state: "FAILED_READ_ONLY", listingIds: [] };

    const payload = (await response.json()) as unknown;
    if (!isRecord(payload) || Number(payload.receipt_id) !== event.receiptId) {
      return { state: "FAILED_READ_ONLY", listingIds: [] };
    }

    return {
      state: "VERIFIED",
      listingIds: listingIdsFromReceipt(payload)
    };
  } catch {
    return { state: "FAILED_READ_ONLY", listingIds: [] };
  }
}
