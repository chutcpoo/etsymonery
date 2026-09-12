import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { getStoredEtsyShopId, loadEtsyTokens } from "./token-store";

export type EtsyMoney = {
  amount?: number;
  divisor?: number;
  currency_code?: string;
};

type EtsyReceiptTransaction = {
  listing_id?: number;
  title?: string;
  quantity?: number;
};

export type EtsyReceipt = {
  receipt_id?: number;
  status?: string;
  was_paid?: boolean;
  was_shipped?: boolean;
  was_delivered?: boolean;
  create_timestamp?: number;
  created_timestamp?: number;
  transactions?: EtsyReceiptTransaction[];
  grandtotal?: EtsyMoney;
  total_price?: EtsyMoney;
};

export type EtsyPayment = {
  payment_id?: number;
  receipt_id?: number;
  amount_gross?: EtsyMoney;
  amount_fees?: EtsyMoney;
  amount_net?: EtsyMoney;
  posted_gross?: EtsyMoney;
  posted_fees?: EtsyMoney;
  posted_net?: EtsyMoney;
  adjusted_gross?: EtsyMoney;
  adjusted_fees?: EtsyMoney;
  adjusted_net?: EtsyMoney;
};

export type EtsyLedgerEntry = {
  entry_id?: number;
  ledger_id?: number;
  amount?: number;
  currency?: string;
  description?: string;
  balance?: number;
  create_date?: number;
  created_timestamp?: number;
  ledger_type?: string;
  reference_type?: string;
  reference_id?: string;
};

export type EtsyReview = {
  shop_id?: number;
  listing_id?: number;
  rating?: number;
  review?: string;
  language?: string;
  image_url_fullxfull?: string;
  create_timestamp?: number;
  created_timestamp?: number;
  update_timestamp?: number;
  updated_timestamp?: number;
};

type EtsyListResponse<T> = {
  count?: number;
  results?: T[];
  error?: string;
};

type PaymentReceiptEvidence = {
  status: "VERIFIED" | "UNAVAILABLE";
  payments: EtsyPayment[];
};

type MoneyTotal = {
  currency: string;
  amount: number;
};

type CommerceSummaryInput = {
  receipts: EtsyReceipt[];
  paymentsByReceipt: Record<string, PaymentReceiptEvidence>;
  ledgerEntries: EtsyLedgerEntry[];
  reviews: EtsyReview[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeScope(scope?: string) {
  return new Set(
    (scope ?? "")
      .split(/[ ,]+/)
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

export function moneyValue(money?: EtsyMoney) {
  if (!money || typeof money.amount !== "number") return null;
  const divisor = typeof money.divisor === "number" && money.divisor > 0 ? money.divisor : 100;
  return money.amount / divisor;
}

function moneyCurrency(money?: EtsyMoney) {
  return money?.currency_code?.trim() || null;
}

function addMoney(
  totals: Map<string, number>,
  money: EtsyMoney | undefined
) {
  const value = moneyValue(money);
  const currency = moneyCurrency(money);
  if (value == null || !currency) return;
  totals.set(currency, (totals.get(currency) ?? 0) + value);
}

function serializeMoneyTotals(totals: Map<string, number>): MoneyTotal[] {
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function receiptTimestamp(receipt: EtsyReceipt) {
  return receipt.created_timestamp ?? receipt.create_timestamp ?? null;
}

function reviewTimestamp(review: EtsyReview) {
  return review.created_timestamp ?? review.create_timestamp ?? null;
}

function safeReviewText(value?: string) {
  const text = value?.trim() ?? "";
  return text.length > 500 ? `${text.slice(0, 497)}...` : text;
}

export function summarizeCommerceEvidence(input: CommerceSummaryInput) {
  const grossTotals = new Map<string, number>();
  const feeTotals = new Map<string, number>();
  const netTotals = new Map<string, number>();
  const listingMap = new Map<
    number,
    {
      listingId: number;
      title: string | null;
      unitsSold: number;
      orderIds: Set<number>;
      reviewCount: number;
      ratingSum: number;
    }
  >();

  let unitsSold = 0;
  let paidOrderCount = 0;
  let paymentVerifiedOrderCount = 0;

  for (const receipt of input.receipts) {
    const receiptId = receipt.receipt_id;
    const isPaid = receipt.was_paid === true || receipt.status === "paid" || receipt.status === "completed";
    if (isPaid) paidOrderCount += 1;

    for (const transaction of receipt.transactions ?? []) {
      if (typeof transaction.listing_id !== "number") continue;
      const quantity = typeof transaction.quantity === "number" ? transaction.quantity : 0;
      unitsSold += quantity;
      const existing = listingMap.get(transaction.listing_id) ?? {
        listingId: transaction.listing_id,
        title: transaction.title?.trim() || null,
        unitsSold: 0,
        orderIds: new Set<number>(),
        reviewCount: 0,
        ratingSum: 0
      };
      existing.unitsSold += quantity;
      if (typeof receiptId === "number") existing.orderIds.add(receiptId);
      if (!existing.title && transaction.title?.trim()) existing.title = transaction.title.trim();
      listingMap.set(transaction.listing_id, existing);
    }

    if (typeof receiptId !== "number") continue;
    const paymentEvidence = input.paymentsByReceipt[String(receiptId)];
    if (!paymentEvidence || paymentEvidence.status !== "VERIFIED") continue;
    paymentVerifiedOrderCount += 1;

    for (const payment of paymentEvidence.payments) {
      addMoney(grossTotals, payment.amount_gross ?? payment.posted_gross ?? payment.adjusted_gross);
      addMoney(feeTotals, payment.amount_fees ?? payment.posted_fees ?? payment.adjusted_fees);
      addMoney(netTotals, payment.amount_net ?? payment.posted_net ?? payment.adjusted_net);
    }
  }

  let ratingSum = 0;
  let ratingCount = 0;
  let lowRatingCount = 0;

  for (const review of input.reviews) {
    const rating = typeof review.rating === "number" ? review.rating : null;
    if (rating != null) {
      ratingSum += rating;
      ratingCount += 1;
      if (rating <= 3) lowRatingCount += 1;
    }

    if (typeof review.listing_id !== "number") continue;
    const existing = listingMap.get(review.listing_id) ?? {
      listingId: review.listing_id,
      title: null,
      unitsSold: 0,
      orderIds: new Set<number>(),
      reviewCount: 0,
      ratingSum: 0
    };
    existing.reviewCount += 1;
    if (rating != null) existing.ratingSum += rating;
    listingMap.set(review.listing_id, existing);
  }

  const orders = input.receipts
    .map((receipt) => ({
      receiptId: receipt.receipt_id ?? null,
      status: receipt.status ?? null,
      wasPaid: receipt.was_paid ?? null,
      wasShipped: receipt.was_shipped ?? null,
      wasDelivered: receipt.was_delivered ?? null,
      createdTimestamp: receiptTimestamp(receipt),
      total: (() => {
        const money = receipt.grandtotal ?? receipt.total_price;
        return {
          amount: moneyValue(money),
          currency: moneyCurrency(money)
        };
      })(),
      lineCount: receipt.transactions?.length ?? 0,
      units: (receipt.transactions ?? []).reduce(
        (sum, transaction) => sum + (typeof transaction.quantity === "number" ? transaction.quantity : 0),
        0
      )
    }))
    .sort((a, b) => (b.createdTimestamp ?? 0) - (a.createdTimestamp ?? 0));

  const reviews = input.reviews
    .map((review) => ({
      listingId: review.listing_id ?? null,
      rating: typeof review.rating === "number" ? review.rating : null,
      review: safeReviewText(review.review),
      language: review.language ?? null,
      imageUrl: review.image_url_fullxfull ?? null,
      createdTimestamp: reviewTimestamp(review)
    }))
    .sort((a, b) => (b.createdTimestamp ?? 0) - (a.createdTimestamp ?? 0));

  const listings = [...listingMap.values()]
    .map((listing) => ({
      listingId: listing.listingId,
      title: listing.title,
      orderCount: listing.orderIds.size,
      unitsSold: listing.unitsSold,
      reviewCount: listing.reviewCount,
      averageRating:
        listing.reviewCount > 0 ? listing.ratingSum / listing.reviewCount : null
    }))
    .sort((a, b) => b.unitsSold - a.unitsSold || b.orderCount - a.orderCount);

  return {
    orderCount: input.receipts.length,
    paidOrderCount,
    unitsSold,
    paymentVerifiedOrderCount,
    paymentCoverage:
      input.receipts.length > 0 ? paymentVerifiedOrderCount / input.receipts.length : null,
    money: {
      gross: serializeMoneyTotals(grossTotals),
      fees: serializeMoneyTotals(feeTotals),
      net: serializeMoneyTotals(netTotals)
    },
    reviews: {
      sampleCount: input.reviews.length,
      averageRating: ratingCount > 0 ? ratingSum / ratingCount : null,
      lowRatingCount,
      recent: reviews.slice(0, 20)
    },
    ledger: {
      entryCount: input.ledgerEntries.length,
      recent: [...input.ledgerEntries]
        .sort(
          (a, b) =>
            (b.created_timestamp ?? b.create_date ?? 0) -
            (a.created_timestamp ?? a.create_date ?? 0)
        )
        .slice(0, 20)
        .map((entry) => ({
          entryId: entry.entry_id ?? null,
          ledgerId: entry.ledger_id ?? null,
          amountMinorUnits: typeof entry.amount === "number" ? entry.amount : null,
          balanceMinorUnits: typeof entry.balance === "number" ? entry.balance : null,
          currency: entry.currency ?? null,
          description: entry.description ?? null,
          ledgerType: entry.ledger_type ?? null,
          referenceType: entry.reference_type ?? null,
          referenceId: entry.reference_id ?? null,
          createdTimestamp: entry.created_timestamp ?? entry.create_date ?? null
        }))
    },
    listings,
    orders
  };
}

async function fetchEtsyList<T>(url: string, accessToken: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: etsyApiHeaders(accessToken),
    cache: "no-store"
  });
  const payload = (await response.json()) as EtsyListResponse<T>;
  if (!response.ok || !Array.isArray(payload.results)) {
    throw new Error(payload.error ?? `ETSY_HTTP_${response.status}`);
  }
  return payload;
}

async function fetchReceiptPayments(
  accessToken: string,
  shopId: number,
  receiptIds: number[]
) {
  const result: Record<string, PaymentReceiptEvidence> = {};

  for (const receiptId of receiptIds.slice(0, 25)) {
    try {
      const payload = await fetchEtsyList<EtsyPayment>(
        `https://api.etsy.com/v3/application/shops/${shopId}/receipts/${receiptId}/payments`,
        accessToken
      );
      result[String(receiptId)] = {
        status: "VERIFIED",
        payments: payload.results ?? []
      };
    } catch {
      result[String(receiptId)] = { status: "UNAVAILABLE", payments: [] };
    }
    await sleep(100);
  }

  return result;
}

export async function getCommerceIntelligenceSnapshot(days = 30) {
  const shopId = await getStoredEtsyShopId();
  if (!shopId) throw new Error("SHOP_IDENTITY_TEST_REQUIRED");

  const accessToken = await getValidEtsyAccessToken();
  const stored = await loadEtsyTokens();
  const grantedScopes = normalizeScope(stored?.scope);
  const transactionScopeGranted = grantedScopes.has("transactions_r");
  const boundedDays = Math.min(90, Math.max(1, Math.floor(days)));
  const maxCreated = Math.floor(Date.now() / 1000);
  const minCreated = maxCreated - boundedDays * 24 * 60 * 60;

  const errors: string[] = [];
  let receipts: EtsyReceipt[] = [];
  let receiptApiCount = 0;
  let ledgerEntries: EtsyLedgerEntry[] = [];
  let ledgerApiCount = 0;
  let reviews: EtsyReview[] = [];
  let reviewApiCount = 0;
  let paymentsByReceipt: Record<string, PaymentReceiptEvidence> = {};

  if (transactionScopeGranted) {
    try {
      const receiptPayload = await fetchEtsyList<EtsyReceipt>(
        `https://api.etsy.com/v3/application/shops/${shopId}/receipts?min_created=${minCreated}&max_created=${maxCreated}&limit=100&offset=0&sort_on=created&sort_order=desc&was_paid=true`,
        accessToken
      );
      receipts = receiptPayload.results ?? [];
      receiptApiCount = receiptPayload.count ?? receipts.length;
      const receiptIds = receipts
        .map((receipt) => receipt.receipt_id)
        .filter((value): value is number => typeof value === "number");
      paymentsByReceipt = await fetchReceiptPayments(accessToken, shopId, receiptIds);
    } catch (error) {
      errors.push(error instanceof Error ? `RECEIPTS:${error.message}` : "RECEIPTS:UNKNOWN");
    }

    try {
      const ledgerPayload = await fetchEtsyList<EtsyLedgerEntry>(
        `https://api.etsy.com/v3/application/shops/${shopId}/payment-account/ledger-entries?min_created=${minCreated}&max_created=${maxCreated}&limit=100&offset=0`,
        accessToken
      );
      ledgerEntries = ledgerPayload.results ?? [];
      ledgerApiCount = ledgerPayload.count ?? ledgerEntries.length;
    } catch (error) {
      errors.push(error instanceof Error ? `LEDGER:${error.message}` : "LEDGER:UNKNOWN");
    }
  } else {
    errors.push("TRANSACTIONS_R_SCOPE_REQUIRED");
  }

  try {
    const reviewPayload = await fetchEtsyList<EtsyReview>(
      `https://api.etsy.com/v3/application/shops/${shopId}/reviews?min_created=${minCreated}&max_created=${maxCreated}&limit=100&offset=0`,
      accessToken
    );
    reviews = reviewPayload.results ?? [];
    reviewApiCount = reviewPayload.count ?? reviews.length;
  } catch (error) {
    errors.push(error instanceof Error ? `REVIEWS:${error.message}` : "REVIEWS:UNKNOWN");
  }

  const summary = summarizeCommerceEvidence({
    receipts,
    paymentsByReceipt,
    ledgerEntries,
    reviews
  });

  return {
    status: errors.length === 0 ? "PASS" : "PARTIAL",
    mode: "READ_ONLY",
    generatedAt: new Date().toISOString(),
    shopId,
    period: {
      days: boundedDays,
      minCreated,
      maxCreated
    },
    authorization: {
      requestedScope: "transactions_r",
      transactionScopeGranted,
      requiresReauthorization: !transactionScopeGranted
    },
    sourceCoverage: {
      receipts: {
        returned: receipts.length,
        apiCount: receiptApiCount,
        truncated: receiptApiCount > receipts.length
      },
      receiptPayments: {
        attempted: Math.min(25, receipts.length),
        verified: Object.values(paymentsByReceipt).filter((value) => value.status === "VERIFIED").length,
        note: "Payment detail is fetched for at most the 25 most recent receipts per snapshot."
      },
      ledger: {
        returned: ledgerEntries.length,
        apiCount: ledgerApiCount,
        truncated: ledgerApiCount > ledgerEntries.length,
        amountSemantics: "Ledger amount and balance are preserved as API minor-unit integers because this model does not expose a divisor."
      },
      reviews: {
        returned: reviews.length,
        apiCount: reviewApiCount,
        truncated: reviewApiCount > reviews.length
      }
    },
    privacy: {
      buyerPiiReturned: false,
      note: "Buyer name, email and postal address fields from receipt payloads are intentionally excluded from the dashboard response."
    },
    errors,
    ...summary
  };
}
