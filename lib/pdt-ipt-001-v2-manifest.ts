import { createCandidateFingerprint, createListingFingerprint } from "./candidate-fingerprint";

export const PDT_IPT_001_V2_OPERATION_ID = "PDT-IPT-001-V2-ETSY-DRAFT-R01" as const;
export const PDT_IPT_001_V2_AUTHORIZATION_ID =
  "PDT-IPT-001-V2-ETSY-DRAFT-R01-AUTH-20260920-01" as const;
export const PDT_IPT_001_V2_AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-IPT-001-V2-ETSY-DRAFT-R01-20260920 EXACT SCOPE ONLY" as const;
export const PDT_IPT_001_V2_CANDIDATE_ID =
  "ETSY-LISTING-CANDIDATE-PDT-IPT-001-V2-20260920-R01" as const;

const DESCRIPTION = [
  "Keep invoices, payments, overdue balances, and follow-up actions in one practical Excel workflow.",
  "",
  "This Invoice Payment Tracker is an Excel spreadsheet for freelancers, consultants, independent service providers, and small service businesses that need a clearer way to monitor accounts receivable, partial payments, overdue invoices, aging, and the next follow-up action.",
  "",
  "WHAT YOU RECEIVE",
  "",
  "You receive 2 Microsoft Excel .xlsx files:",
  "",
  "• SAMPLE — fictional example data so you can see how the workflow works",
  "",
  "• CLEAN START — blank working file for your own invoice and payment records",
  "",
  "Both files contain the same 7 tabs:",
  "",
  "1. START HERE",
  "2. SETTINGS",
  "3. INVOICES",
  "4. PAYMENTS",
  "5. AGING & FOLLOW-UP",
  "6. MONTHLY SUMMARY",
  "7. DASHBOARD",
  "",
  "WHAT THIS EXCEL TRACKER HELPS YOU DO",
  "",
  "• Record invoice IDs, clients, invoice dates, due dates, and invoice amounts",
  "• Log payments separately by Invoice ID",
  "• Track partial and full payments",
  "• Calculate remaining balances",
  "• See Open, Paid, Partially Paid, and Overdue status",
  "• See Due Soon, Due Today, and Overdue alerts",
  "• Calculate days overdue and aging buckets",
  "• Flag duplicate Invoice IDs",
  "• Track last follow-up date and follow-up count",
  "• Record contact status",
  "• Record a promise-to-pay date",
  "• Calculate the next follow-up date based on workbook logic",
  "• Show next-action guidance",
  "• Review monthly invoiced amounts and payments received",
  "• Review dashboard KPIs for outstanding and overdue balances",
  "",
  "FOLLOW-UP WORKFLOW",
  "",
  "The workbook is designed to help you move from:",
  "",
  "Invoice",
  "→ Payment record",
  "→ Remaining balance",
  "→ Aging",
  "→ Follow-up status",
  "→ Promise-to-pay where applicable",
  "→ Next follow-up date",
  "→ Next action",
  "→ Dashboard review",
  "",
  "PARTIAL AND MULTIPLE PAYMENTS",
  "",
  "Payments are recorded in a separate PAYMENTS tab and linked to the invoice by Invoice ID.",
  "",
  "This lets the workbook total multiple payment records against the same invoice and calculate the remaining balance.",
  "",
  "WHO THIS IS FOR",
  "",
  "Designed for:",
  "",
  "• Freelancers",
  "• Consultants",
  "• Independent service providers",
  "• Small service businesses",
  "• Solopreneurs",
  "• Client-based businesses that invoice customers and manually track payments",
  "",
  "MICROSOFT EXCEL COMPATIBILITY",
  "",
  "Primary buyer format:",
  "Microsoft Excel .xlsx",
  "",
  "This V2 buyer package includes Excel files only.",
  "",
  "Google Sheets files are not included in this release.",
  "",
  "IMPORTANT PRODUCT BOUNDARIES",
  "",
  "This is an operational tracking workbook.",
  "",
  "It does not:",
  "",
  "• Send invoices",
  "• Send payment reminders automatically",
  "• Process payments",
  "• Connect to bank feeds",
  "• Replace accounting or bookkeeping software",
  "• Provide tax, legal, accounting, or collections advice",
  "• Provide CRM automation",
  "• Guarantee faster payment or collections results",
  "",
  "Manual invoice and payment entry is required.",
  "",
  "For best results, keep Invoice IDs consistent so payments link to the correct invoice.",
  "",
  "DIGITAL PRODUCT",
  "",
  "This is a digital product.",
  "No physical item will be shipped.",
  "",
  "Use the SAMPLE file first to understand the workflow, then keep the CLEAN START file as your working copy."
].join("\n");

const TAGS = Object.freeze([
  "invoice tracker",
  "payment tracker",
  "accounts receivable",
  "invoice spreadsheet",
  "overdue invoices",
  "partial payments",
  "client payment log",
  "small business excel",
  "ar aging report",
  "follow up tracker",
  "invoice dashboard",
  "outstanding balance",
  "receivable tracker"
] as const);

export type PdtIptV2Asset = {
  kind: "UPLOAD_IMAGE" | "UPLOAD_FILE";
  rank: number;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  driveId: string;
  mimeType: string;
  altText?: string;
};

export const PDT_IPT_001_V2_GALLERY = Object.freeze([
  {
    kind: "UPLOAD_IMAGE",
    rank: 1,
    fileName: "PDT-IPT-001_GALLERY_01_HERO_2000x2000.png",
    sizeBytes: 202351,
    sha256: "94c59a032ed3e4cbac17943bf087911141fd39e5704322cd719bc3ceaad59c5d",
    driveId: "1nnabBk2wNZqMiH4z_nyb_p6_uyjdBi55",
    mimeType: "image/png",
    altText: "Square hero image for the Invoice Payment Tracker showing a real Excel workbook dashboard with Overdue, Partial Payments and Next Follow-Up messaging, plus 2 Excel files and 7 tabs."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 2,
    fileName: "PDT-IPT-001_GALLERY_02_DASHBOARD_2000x2000.png",
    sizeBytes: 164723,
    sha256: "10122d4933bdce080b05448c13364d19ffa0d3345f30395e003d4c1194efd318",
    driveId: "1ArAoZzSwcPMFw-cX9jPAHw4Rt5QXQVMn",
    mimeType: "image/png",
    altText: "Real Excel dashboard preview showing Total Invoiced, Total Paid, Outstanding, Overdue and follow-up KPI cards from the fictional SAMPLE workbook."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 3,
    fileName: "PDT-IPT-001_GALLERY_03_INVOICES_2000x2000.png",
    sizeBytes: 169541,
    sha256: "34cbd38eb82d10aef8a48550fc306a67922797f8ea915c82b9b4820a753c7fcc",
    driveId: "1GTqnRj3Kzie5KAwgn-zJY0_YQIeszGDL",
    mimeType: "image/png",
    altText: "Real Excel INVOICES sheet preview showing invoice date, due date, invoice amount, paid amount, balance, status, aging, due alert and duplicate ID check columns."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 4,
    fileName: "PDT-IPT-001_GALLERY_04_PAYMENTS_2000x2000.png",
    sizeBytes: 229385,
    sha256: "1288bb91888e5ec21a37782df46ae87bb319c09efdb7c4335c92a3a8c58d82d9",
    driveId: "1NVX-nTG1ujSuQui7glBvumOTDIdf8r5x",
    mimeType: "image/png",
    altText: "Real Excel PAYMENTS sheet preview showing separate payment records linked to invoice IDs, including payment date, method, amount and notes for partial and multiple payments."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 5,
    fileName: "PDT-IPT-001_GALLERY_05_FOLLOWUP_2000x2000.png",
    sizeBytes: 166926,
    sha256: "40e1fa640673b4f132d9e63b7dd3cadb92bc960a21bdcec781e041cecb1d6b80",
    driveId: "1morkV-_EwWJwIytEJQ4Q9Njccnzgr7Gs",
    mimeType: "image/png",
    altText: "Real Excel AGING & FOLLOW-UP sheet preview showing overdue balance, aging bucket, follow-up priority, next follow-up date, contact status, promise-to-pay date and next action."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 6,
    fileName: "PDT-IPT-001_GALLERY_06_NEXT_ACTION_2000x2000.png",
    sizeBytes: 170981,
    sha256: "bc57b855b47391ef27e872c8a3216fc5323f30490ea8856ad1b454434c1fa013",
    driveId: "16BhCq7ItKXmmJLHydXmBL0U7fk8r0bY-",
    mimeType: "image/png",
    altText: "Gallery image explaining next-action workflow in the Excel tracker: Due Soon, Overdue, Promise to Pay, Next Follow-Up Date and Next Action, with real workbook proof."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 7,
    fileName: "PDT-IPT-001_GALLERY_07_MONTHLY_2000x2000.png",
    sizeBytes: 343654,
    sha256: "ffc84681d80c18468a61567f251e646ca0657ed3ededf58179e0bdba5f38a9ce",
    driveId: "1iewfn2-aZmnJNKEe5FvVJg1xaY33vOM8",
    mimeType: "image/png",
    altText: "Real Excel MONTHLY SUMMARY preview comparing monthly invoiced amounts, payments received and net movement using fictional SAMPLE data."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 8,
    fileName: "PDT-IPT-001_GALLERY_08_WORKFLOW_2000x2000.png",
    sizeBytes: 335776,
    sha256: "7441881e9e3c3e58d9b0faadf2811ca7dc96d8da627bbc57ea5a3b3524771c38",
    driveId: "1LfLnkIDozbU6t4VGZG2VB41325XuafPq",
    mimeType: "image/png",
    altText: "Workflow graphic for the Excel invoice tracker: enter invoice, record payment, review aging and follow-up, take the next action, then check the dashboard."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 9,
    fileName: "PDT-IPT-001_GALLERY_09_WHATS_INCLUDED_2000x2000.png",
    sizeBytes: 374156,
    sha256: "a86f0621e158c6c011fec32a205df291a031a698ac9f319511e1aaaca7d83d74",
    driveId: "1QBcyzT2_Sc1d2O_Z-3nYmfEPFb3ZZYf5",
    mimeType: "image/png",
    altText: "What-you-receive image showing two Microsoft Excel .xlsx files, SAMPLE and CLEAN START, with seven tabs: Start Here, Settings, Invoices, Payments, Aging & Follow-Up, Monthly Summary and Dashboard."
  },
  {
    kind: "UPLOAD_IMAGE",
    rank: 10,
    fileName: "PDT-IPT-001_GALLERY_10_BOUNDARIES_2000x2000.png",
    sizeBytes: 151832,
    sha256: "9e5826b33ab4a79e923cc32ac6f76428785c0916f96d63436df48284417b23bd",
    driveId: "1iKPFmHrvZlzTGMSK-MaQVowT35xIdNb5",
    mimeType: "image/png",
    altText: "Product boundaries image for the Excel tracker stating it supports invoice, payment, aging and follow-up tracking but does not send invoices, process payments, sync banks, automate CRM, provide tax/legal advice or include Google Sheets buyer files."
  }
] as const satisfies readonly PdtIptV2Asset[]);

export const PDT_IPT_001_V2_BUYER_FILES = Object.freeze([
  {
    kind: "UPLOAD_FILE",
    rank: 1,
    fileName: "PDT-IPT-001_V2_Invoice_Payment_FollowUp_Tracker_CLEAN_START.xlsx",
    sizeBytes: 80573,
    sha256: "f98e50642f0d6f3c2811eb86841a7f17327ec60cc3d1e88804e2d20bbc349a8b",
    driveId: "1uuyRPhZH-OtY1UkvDg-mKf2S9fVi3t2F",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  },
  {
    kind: "UPLOAD_FILE",
    rank: 2,
    fileName: "PDT-IPT-001_V2_Invoice_Payment_FollowUp_Tracker_SAMPLE.xlsx",
    sizeBytes: 81123,
    sha256: "7adaa1b492aa838ef85386391f78fffbb7482234a1e700c12808b41bcede3556",
    driveId: "1Kvkgj0nVRnudsbIXUyCF4xWYRofAfnlU",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }
] as const satisfies readonly PdtIptV2Asset[]);

export const PDT_IPT_001_V2_LISTING_IDENTITY = Object.freeze({
  title: "Invoice Payment Tracker Excel | Accounts Receivable Aging & Follow-Up Spreadsheet for Small Business",
  description: DESCRIPTION,
  priceUsd: 7.99,
  tags: [...TAGS],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2026",
  taxonomy_id: 12476,
  type: "download",
  state: "draft"
});

const CANDIDATE_PAYLOAD = Object.freeze({
  candidateId: PDT_IPT_001_V2_CANDIDATE_ID,
  operationId: PDT_IPT_001_V2_OPERATION_ID,
  productId: "PDT-IPT-001",
  productVersion: "V2",
  listing: PDT_IPT_001_V2_LISTING_IDENTITY,
  gallery: PDT_IPT_001_V2_GALLERY.map((asset) => ({ ...asset })),
  buyerFiles: PDT_IPT_001_V2_BUYER_FILES.map((asset) => ({ ...asset }))
});

export const PDT_IPT_001_V2_LISTING_FINGERPRINT =
  createListingFingerprint(PDT_IPT_001_V2_LISTING_IDENTITY);

export const PDT_IPT_001_V2_CANDIDATE_FINGERPRINT =
  createCandidateFingerprint(CANDIDATE_PAYLOAD);

export const PDT_IPT_001_V2_FROZEN_LISTING_FINGERPRINT =
  "7df436b290f42f16ab393c5268e0794965342d7d8c3d55c3f4dd6f83c3c559b7" as const;

export const PDT_IPT_001_V2_FROZEN_CANDIDATE_FINGERPRINT =
  "d8fec26eb95b9924bac8c3717313e72615ec5725cbea76797c6577c529bbad4e" as const;

export const PDT_IPT_001_V2_DRAFT = Object.freeze({
  operationId: PDT_IPT_001_V2_OPERATION_ID,
  authorizationId: PDT_IPT_001_V2_AUTHORIZATION_ID,
  authorizationText: PDT_IPT_001_V2_AUTHORIZATION_TEXT,
  productId: "PDT-IPT-001",
  productVersion: "V2",
  shopId: 23582741,
  candidateId: PDT_IPT_001_V2_CANDIDATE_ID,
  candidateFingerprint: PDT_IPT_001_V2_CANDIDATE_FINGERPRINT,
  listingFingerprint: PDT_IPT_001_V2_LISTING_FINGERPRINT,
  listing: PDT_IPT_001_V2_LISTING_IDENTITY,
  gallery: PDT_IPT_001_V2_GALLERY,
  buyerFiles: PDT_IPT_001_V2_BUYER_FILES,
  publishAuthorized: false
});

export function assertPdtIpt001V2ManifestFrozen() {
  if (PDT_IPT_001_V2_LISTING_FINGERPRINT !== PDT_IPT_001_V2_FROZEN_LISTING_FINGERPRINT) {
    throw new Error("PDT_IPT_V2_LISTING_FINGERPRINT_DRIFT");
  }
  if (PDT_IPT_001_V2_CANDIDATE_FINGERPRINT !== PDT_IPT_001_V2_FROZEN_CANDIDATE_FINGERPRINT) {
    throw new Error("PDT_IPT_V2_CANDIDATE_FINGERPRINT_DRIFT");
  }
  if (PDT_IPT_001_V2_GALLERY.length !== 10 || PDT_IPT_001_V2_BUYER_FILES.length !== 2) {
    throw new Error("PDT_IPT_V2_ASSET_COUNT_DRIFT");
  }
  return true;
}
