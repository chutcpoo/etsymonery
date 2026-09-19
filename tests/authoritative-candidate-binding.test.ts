import assert from "node:assert/strict";
import test from "node:test";
import { buildPublishPlan } from "../lib/publisher";
import type { AuthoritativeCandidateBinding, ProductPack } from "../lib/types";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);

const tags = [
  "digital planner", "small business", "operations", "workflow", "business tool",
  "etsy template", "printable pdf", "spreadsheet", "daily planner", "shop workflow",
  "owner toolkit", "business system", "instant download"
];

function basePack(): ProductPack {
  return {
    productId: "TEST-001",
    title: "Digital Operations Template",
    description: "Verified test description",
    priceUsd: 9.99,
    files: ["buyer.zip"],
    channels: ["etsy" as const],
    productTruthVerified: true,
    tags,
    etsy: {
      taxonomyId: 1234,
      quantity: 999,
      whoMade: "i_did" as const,
      whenMade: "2020_2026",
      release: { productionBuildFrozen: true, testerPass: true, finalQcPass: true }
    }
  };
}

function genericBinding(listingFingerprint: string): AuthoritativeCandidateBinding {
  const candidateFingerprint = "d".repeat(64);
  return {
    schemaVersion: "1.0.0",
    candidateId: "CAND-TEST-001-V1",
    candidateFingerprint,
    listingFingerprint,
    productId: "TEST-001",
    buyerWorkbook: { driveId: "drive-buyer", sha256: SHA_A, fileName: "buyer.zip" },
    gallery: [
      { driveId: "drive-image-1", sha256: SHA_B, altText: "Real product preview" }
    ],
    video: { driveId: "drive-video", sha256: SHA_C, fileName: "preview.mp4" },
    testerPassFingerprint: candidateFingerprint,
    finalQcPassFingerprint: candidateFingerprint,
    listingSettings: { renewal: "automatic", featured: false }
  };
}

test("authoritative binding replaces lightweight candidate fingerprint without changing listing fingerprint", () => {
  const baseline = buildPublishPlan(basePack());
  assert.equal(baseline.status, "READY");
  const listingFingerprint = baseline.channels[0].listingFingerprint ?? "";

  const pack = basePack();
  pack.etsy.release.authoritativeCandidate = genericBinding(listingFingerprint);
  const plan = buildPublishPlan(pack);
  const channel = plan.channels[0];

  assert.equal(plan.status, "READY");
  assert.equal(channel.candidateId, "CAND-TEST-001-V1");
  assert.equal(channel.candidateFingerprint, "d".repeat(64));
  assert.equal(channel.listingFingerprint, listingFingerprint);
  assert.equal(channel.authoritativeCandidateBound, true);
  assert.deepEqual(channel.authoritativeCandidate?.gallery, genericBinding(listingFingerprint).gallery);
});

test("authoritative binding fails closed when current listing metadata drifts", () => {
  const baseline = buildPublishPlan(basePack());
  const binding = genericBinding(baseline.channels[0].listingFingerprint ?? "");
  const pack = basePack();
  pack.title = "Changed title";
  pack.etsy.release.authoritativeCandidate = binding;
  const plan = buildPublishPlan(pack);
  assert.equal(plan.status, "BLOCKED");
  assert.ok(plan.gate.errors.includes("AUTHORITATIVE_LISTING_FINGERPRINT_MISMATCH"));
});

test("authoritative binding fails closed when Tester or Final QC identity differs", () => {
  const baseline = buildPublishPlan(basePack());
  const binding = genericBinding(baseline.channels[0].listingFingerprint ?? "");
  binding.finalQcPassFingerprint = "e".repeat(64);
  const pack = basePack();
  pack.etsy.release.authoritativeCandidate = binding;
  const plan = buildPublishPlan(pack);
  assert.equal(plan.status, "BLOCKED");
  assert.ok(plan.gate.errors.includes("AUTHORITATIVE_FINAL_QC_FINGERPRINT_MISMATCH"));
});

const R03_DESCRIPTION = `Keep issued invoices and incoming payments organized in one clear Excel workbook. This invoice tracker is built for freelancers, independent service providers, and solo or small businesses that already create invoices elsewhere and need a simple way to see what has been invoiced, what has been paid, what is still outstanding, and what needs follow-up.

Use the workbook to record issued invoices, log incoming payments by Invoice ID, track partial or full payments, review remaining balances and due dates, identify overdue items, and see monthly invoiced-versus-paid activity in one place.

WHAT THIS WORKBOOK HELPS YOU TRACK
• Issued invoice records
• Incoming payments linked by Invoice ID
• Partial and full payment status
• Remaining balances
• Due dates and overdue days
• Aging and follow-up priorities
• Monthly invoiced vs. payments summary
• Dashboard totals for invoiced, paid, outstanding, overdue, and aging buckets

7 INCLUDED WORKSHEETS
1. START HERE
2. SETTINGS
3. INVOICES
4. PAYMENTS
5. AGING & FOLLOW-UP
6. MONTHLY SUMMARY
7. DASHBOARD

HOW IT WORKS
1. Add issued invoices in the INVOICES sheet.
2. Record incoming payments in PAYMENTS using the related Invoice ID.
3. Review remaining balances, payment status, overdue days, and follow-up priority.
4. Use MONTHLY SUMMARY and DASHBOARD to review invoiced, paid, outstanding, and aging totals.

WHAT YOU RECEIVE
• 1 Microsoft Excel .xlsx workbook
• Digital product only — no physical item is shipped

COMPATIBILITY
Microsoft Excel .xlsx format.
Google Sheets compatibility has not been verified and is not claimed for this product.

IMPORTANT SCOPE
This is an invoice and payment tracking workbook. It does not create or send invoices, process payments, connect to bank accounts, provide bookkeeping or accounting records, calculate taxes, provide tax advice, automate CRM workflows, run payroll, or manage inventory.

Designed as a transparent tracking layer for businesses that already issue invoices elsewhere and want a clearer view of payments, outstanding balances, aging, and follow-up priorities.`;

test("DAY03 R03 exact listing metadata binds to the frozen listing and candidate fingerprints", () => {
  const candidateFingerprint = "fb30b800390d52506e5a5a6a2d2f9d7e2fb70502da2c7767e3f93dd63239fa36";
  const listingFingerprint = "099976dd679b2e08938ffeed91ddcbbc0ff5ca34f1186d6bb56b0e87f040f3f7";
  const pack = {
    productId: "PDT-IPT-001",
    title: "Invoice & Payment Tracker Spreadsheet | Excel Small Business Invoice Tracker with Payments, Aging & Dashboard",
    description: R03_DESCRIPTION,
    priceUsd: 6.90,
    files: ["PDT-IPT-001_V1_Invoice_Payment_Tracker.xlsx"],
    channels: ["etsy" as const],
    productTruthVerified: true,
    tags: [
      "invoice tracker", "payment tracker", "invoice spreadsheet", "invoice organizer",
      "payment log", "invoice log", "payment spreadsheet", "business tracker",
      "excel spreadsheet", "small business", "invoice dashboard", "spreadsheet template",
      "billing tracker"
    ],
    etsy: {
      taxonomyId: 12476,
      quantity: 999,
      whoMade: "i_did" as const,
      whenMade: "2020_2026",
      release: {
        productionBuildFrozen: true,
        testerPass: true,
        finalQcPass: true,
        authoritativeCandidate: {
          schemaVersion: "1.0.0" as const,
          candidateId: "ETSY-LISTING-CANDIDATE-PDT-IPT-001-V1-20260917-R03",
          candidateFingerprint,
          listingFingerprint,
          productId: "PDT-IPT-001",
          buyerWorkbook: {
            driveId: "1Jd9327N6-FxOo1nd1bLgcCeeeeSHqGKt",
            sha256: "5ba3ec9bd23630f086145633557021e273ba0a7b61ed9db2c97a233a3e94c8c4",
            fileName: "PDT-IPT-001_V1_Invoice_Payment_Tracker.xlsx"
          },
          gallery: [
            ["167x2Z8YpycssfP22Lf3B7usKdCyJtC3p","4b6f8ea1f7af1c6e44bf5290ef8ffd01a37f7a632c4f192703ae6dab0bc0a94a"],
            ["1OnUjJhwb2C6T5PgDGar7Dp7-y5C2xaPn","2759a32d7c7074ea4ad46e422482af80139c07947b0165054fd1ecfddf6cbe7b"],
            ["1YpwlcjUCoiERsY9fObqu5JhTyDkcTkML","ec6e6ecfa5fc4f9886a63f93d6ddd792649d2111452fc4837457361617b0ebe6"],
            ["15AzITt0XqvyNC3kSzU5RYNDuL5U_omY1","bd950cfdfa8b353fcf875f5d50b3c57c5adc16498d3dbbdd7dd222efa28e3e96"],
            ["13BaMUGK43-rGEbUbXoH7EtU1AZEoygkI","89cbf7a2e51d500e30be5b1f0e328f1f6adbb636d1477b1b21939160b1941f4d"],
            ["16dhTmGWrMoCsK89qJ3I0TkX9GsNCV792","bc8720fd3da8a756781fd3fb39b56c74127075a7a99cf3b6a6a94bdea4c43465"],
            ["1ew3rXTPu-ztTTC5jT7rT52dwdm21Taru","2042318613643839408bf4d4f45d3bc995e3e9ea3889d81fb31676b6dcf2e60a"],
            ["1yOHUuvdgRi9v5idFKLW1d9wn1WsUVQVg","f11460175a130706e2028f739c34d1c98f5c7ec11042560fb0d069b3c7f71a95"],
            ["12mkgbUDqChP6dDmoMI_GaRksxwMcElcN","d7e5a16d0a0ac0e740bcdb6c8f87197da633ec21250f931e9db943453475492b"],
            ["1zRQVT6hLSxaK9S8pup49AokmwkyEk_x-","0c72b9e1b57b3c82c0e1df1ababc96381a46b7df3840ce202fa9b8b7b1750c4a"]
          ].map(([driveId, sha256], index) => ({ driveId, sha256, altText: ["Invoice and payment tracker hero showing a real Excel dashboard preview with totals for invoiced, paid, outstanding balance and aging or overdue status.","Problem slide showing the real Monthly Summary worksheet with columns for month, invoice amount, payments received and net outstanding movement.","What’s included slide showing a real Invoices worksheet preview from the seven-tab Excel invoice and payment tracker workbook.","Dashboard preview slide showing the real Excel dashboard with total invoiced, total paid, outstanding balance and aging bucket fields.","Aging and follow-up slide showing the real AGING & FOLLOW-UP worksheet used to review overdue invoices and follow-up priorities.","How it works slide showing the real dashboard preview used to review invoice totals, payments, outstanding balances and aging status.","Freelancer and solo business use-case slide showing the real Monthly Summary worksheet with invoice amount, payments received and outstanding movement by month.","Excel XLSX compatibility slide showing a real Invoices worksheet preview from the Microsoft Excel workbook; Google Sheets compatibility is not claimed.","Trust slide showing a real Payments worksheet preview and clarifying that the workbook is for invoice tracking, not accounting or tax advice.","Call-to-action slide showing the real AGING & FOLLOW-UP worksheet preview for reviewing outstanding invoices and follow-up priorities."][index] })),
          video: {
            driveId: "1WejcpyANCS7Umfb3-py_5bvitU-8OLAt",
            sha256: "5899c51bf70a201b8267ea64aa24378cbefd9e91aa9467abbf154eb74815830c",
            fileName: "PDT-IPT-001_VIDEO_invoice-payment-tracker.mp4"
          },
          testerPassFingerprint: candidateFingerprint,
          finalQcPassFingerprint: candidateFingerprint,
          listingSettings: {
            priceUsd: 6.90,
            saleState: "NONE",
            quantity: 999,
            sku: "PDT-IPT-001",
            shopSection: null,
            renewal: "Automatic",
            featured: false,
            restockRequests: false,
            digitalMadeToOrder: false,
            whoMade: "i_did",
            whenMade: "2020_2026",
            listingType: "download"
          }
        }
      }
    }
  };

  const plan = buildPublishPlan(pack);
  assert.equal(plan.status, "READY");
  assert.equal(plan.channels[0].listingFingerprint, listingFingerprint);
  assert.equal(plan.channels[0].candidateFingerprint, candidateFingerprint);
  assert.equal(plan.channels[0].authoritativeCandidateBound, true);
  assert.equal(plan.channels[0].authoritativeCandidate?.gallery.length, 10);
});
