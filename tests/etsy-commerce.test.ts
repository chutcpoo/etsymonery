import assert from "node:assert/strict";
import test from "node:test";
import {
  moneyValue,
  summarizeCommerceEvidence,
  type EtsyLedgerEntry,
  type EtsyPayment,
  type EtsyReceipt,
  type EtsyReview
} from "../lib/etsy-commerce";

test("moneyValue respects Etsy Money divisor", () => {
  assert.equal(moneyValue({ amount: 573, divisor: 100, currency_code: "USD" }), 5.73);
  assert.equal(moneyValue({ amount: 1500, divisor: 1000, currency_code: "USD" }), 1.5);
  assert.equal(moneyValue(undefined), null);
});

test("summarizes orders payments reviews and listing signals without buyer PII", () => {
  const receipts: EtsyReceipt[] = [
    {
      receipt_id: 1001,
      status: "paid",
      was_paid: true,
      created_timestamp: 1_789_000_000,
      grandtotal: { amount: 890, divisor: 100, currency_code: "USD" },
      transactions: [
        { listing_id: 4561819638, title: "Restaurant Toolkit", quantity: 1 }
      ]
    }
  ];

  const paymentsByReceipt: Record<
    string,
    { status: "VERIFIED" | "UNAVAILABLE"; payments: EtsyPayment[] }
  > = {
    "1001": {
      status: "VERIFIED",
      payments: [
        {
          payment_id: 2001,
          receipt_id: 1001,
          amount_gross: { amount: 890, divisor: 100, currency_code: "USD" },
          amount_fees: { amount: 117, divisor: 100, currency_code: "USD" },
          amount_net: { amount: 773, divisor: 100, currency_code: "USD" }
        }
      ]
    }
  };

  const reviews: EtsyReview[] = [
    {
      listing_id: 4561819638,
      rating: 5,
      review: "Useful and clear.",
      created_timestamp: 1_789_000_100
    }
  ];

  const ledgerEntries: EtsyLedgerEntry[] = [
    {
      entry_id: 3001,
      ledger_id: 4001,
      amount: 773,
      balance: 773,
      currency: "USD",
      description: "Payment",
      created_timestamp: 1_789_000_200
    }
  ];

  const summary = summarizeCommerceEvidence({
    receipts,
    paymentsByReceipt,
    ledgerEntries,
    reviews
  });

  assert.equal(summary.orderCount, 1);
  assert.equal(summary.paidOrderCount, 1);
  assert.equal(summary.unitsSold, 1);
  assert.equal(summary.paymentVerifiedOrderCount, 1);
  assert.deepEqual(summary.money.gross, [{ currency: "USD", amount: 8.9 }]);
  assert.deepEqual(summary.money.fees, [{ currency: "USD", amount: 1.17 }]);
  assert.deepEqual(summary.money.net, [{ currency: "USD", amount: 7.73 }]);
  assert.equal(summary.reviews.averageRating, 5);
  assert.equal(summary.reviews.lowRatingCount, 0);
  assert.deepEqual(summary.listings[0], {
    listingId: 4561819638,
    title: "Restaurant Toolkit",
    orderCount: 1,
    unitsSold: 1,
    reviewCount: 1,
    averageRating: 5
  });
  assert.deepEqual(summary.orders[0].total, { amount: 8.9, currency: "USD" });

  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes("buyer_email"), false);
  assert.equal(serialized.includes("buyer@example.com"), false);
  assert.equal(serialized.includes("first_line"), false);
});

test("keeps ledger integers as minor units instead of inventing a divisor", () => {
  const summary = summarizeCommerceEvidence({
    receipts: [],
    paymentsByReceipt: {},
    ledgerEntries: [
      {
        entry_id: 1,
        amount: -20,
        balance: 753,
        currency: "USD",
        description: "Listing fee"
      }
    ],
    reviews: []
  });

  assert.equal(summary.ledger.recent[0]?.amountMinorUnits, -20);
  assert.equal(summary.ledger.recent[0]?.balanceMinorUnits, 753);
  assert.deepEqual(summary.money.gross, []);
});

test("flags low-rating review evidence without creating a repair decision", () => {
  const summary = summarizeCommerceEvidence({
    receipts: [],
    paymentsByReceipt: {},
    ledgerEntries: [],
    reviews: [
      { listing_id: 1, rating: 2, review: "Needs clearer instructions." },
      { listing_id: 1, rating: 5, review: "Good." }
    ]
  });

  assert.equal(summary.reviews.lowRatingCount, 1);
  assert.equal(summary.reviews.averageRating, 3.5);
  assert.equal(summary.listings[0]?.reviewCount, 2);
  assert.equal(summary.listings[0]?.averageRating, 3.5);
});
