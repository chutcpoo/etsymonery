import { etsyApiHeaders } from "./etsy";

const ETSY_API_ROOT = "https://api.etsy.com/v3/application";
export const ETSY_TRANSACTION_PAGE_SIZE = 100;
export const ETSY_MAX_OFFSET = 12_000;
export const ETSY_MAX_EXACT_TRANSACTION_COUNT =
  ETSY_MAX_OFFSET + ETSY_TRANSACTION_PAGE_SIZE;

type EtsyTransaction = {
  transaction_id?: unknown;
  quantity?: unknown;
};

type EtsyTransactionsPage = {
  count?: unknown;
  results?: unknown;
  error?: unknown;
};

export type ExactListingSales = {
  transactionCount: number;
  unitsSold: number;
  pagination: {
    pageSize: number;
    pagesFetched: number;
    fetchedTransactionCount: number;
    reportedTransactionCount: number;
    verificationPasses: 2;
    apiRequestCount: number;
    complete: true;
  };
};

export class EtsyListingSalesError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502
  ) {
    super(message);
    this.name = "EtsyListingSalesError";
  }
}

function positiveInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new EtsyListingSalesError(`INVALID_${field}`, 400);
  }
}

function transactionRecord(value: unknown): EtsyTransaction {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EtsyListingSalesError("ETSY_TRANSACTION_INVALID");
  }
  return value as EtsyTransaction;
}

function transactionId(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new EtsyListingSalesError("ETSY_TRANSACTION_ID_INVALID");
  }
  return value;
}

function transactionQuantity(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new EtsyListingSalesError("ETSY_TRANSACTION_QUANTITY_INVALID");
  }
  return value;
}

function safeAdd(left: number, right: number) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new EtsyListingSalesError("ETSY_UNITS_SOLD_OVERFLOW");
  }
  return result;
}

async function jsonPage(response: Response): Promise<EtsyTransactionsPage> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new EtsyListingSalesError(
      `ETSY_LISTING_TRANSACTIONS_INVALID_JSON:${response.status}`
    );
  }

  if (!response.ok) {
    throw new EtsyListingSalesError(
      `ETSY_LISTING_TRANSACTIONS_HTTP_${response.status}`,
      response.status
    );
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new EtsyListingSalesError("ETSY_LISTING_TRANSACTIONS_INVALID_RESPONSE");
  }
  return payload as EtsyTransactionsPage;
}

export async function fetchExactListingSales(input: {
  accessToken: string;
  shopId: number;
  listingId: number;
  fetchImpl?: typeof fetch;
}): Promise<ExactListingSales> {
  positiveInteger(input.shopId, "SHOP_ID");
  positiveInteger(input.listingId, "LISTING_ID");

  const fetchImpl = input.fetchImpl ?? fetch;
  const endpoint = `${ETSY_API_ROOT}/shops/${input.shopId}/listings/${input.listingId}/transactions`;

  async function fetchCompletePass() {
    const quantities = new Map<number, number>();
    let reportedTransactionCount: number | null = null;
    let unitsSold = 0;
    let offset = 0;
    let pagesFetched = 0;

    do {
      if (offset > ETSY_MAX_OFFSET) {
        throw new EtsyListingSalesError(
          "ETSY_TRANSACTION_COUNT_EXCEEDS_EXACT_OFFSET_WINDOW",
          422
        );
      }

      const url = new URL(endpoint);
      url.searchParams.set("limit", String(ETSY_TRANSACTION_PAGE_SIZE));
      url.searchParams.set("offset", String(offset));

      const response = await fetchImpl(url, {
        method: "GET",
        headers: etsyApiHeaders(input.accessToken),
        cache: "no-store"
      });
      const payload = await jsonPage(response);

      if (
        typeof payload.count !== "number" ||
        !Number.isSafeInteger(payload.count) ||
        payload.count < 0 ||
        !Array.isArray(payload.results)
      ) {
        throw new EtsyListingSalesError("ETSY_LISTING_TRANSACTIONS_INVALID_PAGE");
      }
      if (payload.count > ETSY_MAX_EXACT_TRANSACTION_COUNT) {
        throw new EtsyListingSalesError(
          "ETSY_TRANSACTION_COUNT_EXCEEDS_EXACT_OFFSET_WINDOW",
          422
        );
      }

      if (reportedTransactionCount === null) {
        reportedTransactionCount = payload.count;
      } else if (payload.count !== reportedTransactionCount) {
        throw new EtsyListingSalesError(
          "ETSY_TRANSACTION_COUNT_CHANGED_DURING_PAGINATION",
          409
        );
      }

      if (payload.results.length > ETSY_TRANSACTION_PAGE_SIZE) {
        throw new EtsyListingSalesError("ETSY_TRANSACTION_PAGE_LIMIT_EXCEEDED");
      }
      if (offset < reportedTransactionCount && payload.results.length === 0) {
        throw new EtsyListingSalesError("ETSY_TRANSACTION_PAGINATION_STALLED");
      }

      for (const value of payload.results) {
        const transaction = transactionRecord(value);
        const id = transactionId(transaction.transaction_id);
        if (quantities.has(id)) {
          throw new EtsyListingSalesError("ETSY_DUPLICATE_TRANSACTION_ID");
        }
        const quantity = transactionQuantity(transaction.quantity);
        quantities.set(id, quantity);
        unitsSold = safeAdd(unitsSold, quantity);
      }

      offset += payload.results.length;
      pagesFetched += 1;
      if (offset > reportedTransactionCount) {
        throw new EtsyListingSalesError("ETSY_TRANSACTION_COUNT_MISMATCH");
      }
    } while (offset < (reportedTransactionCount ?? 0));

    const exactCount = reportedTransactionCount ?? 0;
    if (quantities.size !== exactCount) {
      throw new EtsyListingSalesError("ETSY_TRANSACTION_COUNT_MISMATCH");
    }
    return { quantities, unitsSold, pagesFetched, exactCount };
  }

  const firstPass = await fetchCompletePass();
  const verificationPass = await fetchCompletePass();
  if (
    firstPass.exactCount !== verificationPass.exactCount ||
    firstPass.unitsSold !== verificationPass.unitsSold ||
    firstPass.quantities.size !== verificationPass.quantities.size ||
    [...firstPass.quantities].some(
      ([id, quantity]) => verificationPass.quantities.get(id) !== quantity
    )
  ) {
    throw new EtsyListingSalesError(
      "ETSY_TRANSACTIONS_CHANGED_DURING_VERIFICATION",
      409
    );
  }

  return {
    transactionCount: verificationPass.quantities.size,
    unitsSold: verificationPass.unitsSold,
    pagination: {
      pageSize: ETSY_TRANSACTION_PAGE_SIZE,
      pagesFetched: verificationPass.pagesFetched,
      fetchedTransactionCount: verificationPass.quantities.size,
      reportedTransactionCount: verificationPass.exactCount,
      verificationPasses: 2,
      apiRequestCount: firstPass.pagesFetched + verificationPass.pagesFetched,
      complete: true
    }
  };
}
