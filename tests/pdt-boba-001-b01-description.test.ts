import assert from "node:assert/strict";
import test from "node:test";
import {
  exactPdtBoba001B01DescriptionBody,
  handlePdtBoba001B01Description,
  PDT_BOBA_001_B01_DESCRIPTION,
  PDT_BOBA_001_B01_PROTECTED_GALLERY_IDS,
  verifyPdtBoba001B01ProtectedState
} from "../lib/pdt-boba-001-b01-description";
import { hashOperationRequest, MemoryOperationLedgerRepository } from "../lib/operation-ledger";

const prior = {
  writes: process.env.PUBLISH_WRITES_ENABLED,
  token: process.env.ETSY_B01_WRITE_TOKEN,
  shop: process.env.ETSY_SHOP_ID,
  auth: process.env.ETSY_BOBA_B01_DESCRIPTION_AUTHORIZATION_ID,
  sha: process.env.ETSY_BOBA_B01_DESCRIPTION_REQUEST_SHA256,
  key: process.env.ETSY_API_KEY,
  secret: process.env.ETSY_SHARED_SECRET
};

const TAGS = [
  "bubble tea business",
  "boba shop toolkit",
  "boba operations",
  "boba shop sop",
  "cafe opening closing",
  "daily prep log",
  "stock waste tracker",
  "shift handoff log",
  "tea cafe template",
  "milktea inventory",
  "cafe cleaning sheet",
  "drink shop checklist",
  "google sheets boba"
];

const OLD_DESCRIPTION = `Streamline your bubble tea & boba cafe daily operations with this all-in-one Operations Toolkit!

Designed specifically for boba shop owners, store managers, and cafe staff to eliminate opening/closing chaos, standardize employee training, prevent ingredient wastage, and guarantee smooth shift transitions.

Unlike simple printable sheets, this comprehensive 9-tab operations system combines automated spreadsheets (Google Sheets & Excel) with print-ready checklists—giving your team clarity from open to close.

─────────────────────────────────
✨ WHAT YOU WILL RECEIVE
─────────────────────────────────
Upon purchase, you will receive immediate access to download:

1. Boba Shop Operations Tracker (.ZIP)
   - Fully customizable & automated 9-tab workbook
   - Compatible with Google Sheets & Microsoft Excel (.xlsx)
2. Daily Operations Checklist - Printable PDF (A4 Size - 8 Pages)
3. Daily Operations Checklist - Printable PDF (US Letter Size - 8 Pages)
4. Quick Start Guide (PDF - 2 Pages) - Step-by-step setup in under 5 minutes
5. License & Read-Me Guide (PDF - 2 Pages)

─────────────────────────────────
📋 9 COMPREHENSIVE WORKBOOK TABS
─────────────────────────────────
• 1. Start Here / Quick Dashboard: Instant progress meters & reorder summaries.
• 2. Opening Checklist: Equipment warm-up, tea brewing, POS float, and store prep.
• 3. Closing Checklist: Station breakdown, cash drop, waste recording, and lock-up.
• 4. Prep Log: Daily batch tracking for tapioca pearls, syrups, and tea bases.
• 5. Cleaning & Hygiene Schedule: Daily, weekly, and monthly sanitation tasks.
• 6. Stock, Reorder & Waste Tracker: Monitor inventory, auto-calculate closing stock & waste costs.
• 7. Cash Close & Shift Handoff: Verify cash drawer, calculate variance, and log shift notes.
• 8. Blank Custom Checklist: Easily add shop-specific recurring tasks.
• 9. Setup Assistant: Quick store profile configuration.

─────────────────────────────────
💻 SOFTWARE COMPATIBILITY
─────────────────────────────────
• Google Sheets: Works directly in your browser (Free with any Google account).
• Microsoft Excel: Compatible with Excel 2016 and newer / Microsoft 365.
• Printable PDFs: Print at home/work or use on iPad/tablet via GoodNotes or Notability.

─────────────────────────────────
⚡ INSTANT DOWNLOAD INSTRUCTIONS
─────────────────────────────────
1. Complete your purchase.
2. Go to Etsy.com in a web browser (desktop or mobile) -&gt; Purchases and Reviews.
3. Download your files immediately.
4. Open the Quick Start Guide and begin streamlining your shop!

─────────────────────────────────
⚠️ IMPORTANT NOTES
─────────────────────────────────
• This is an INSTANT DIGITAL DOWNLOAD. No physical item will be shipped.
• For personal and single-business use only. Commercial resale or redistribution is strictly prohibited.
• If you need any assistance, feel free to reach out via Etsy Messages!`;

function restore() {
  for (const [key, value] of Object.entries(prior)) {
    const name = {
      writes: "PUBLISH_WRITES_ENABLED",
      token: "ETSY_B01_WRITE_TOKEN",
      shop: "ETSY_SHOP_ID",
      auth: "ETSY_BOBA_B01_DESCRIPTION_AUTHORIZATION_ID",
      sha: "ETSY_BOBA_B01_DESCRIPTION_REQUEST_SHA256",
      key: "ETSY_API_KEY",
      secret: "ETSY_SHARED_SECRET"
    }[key as keyof typeof prior];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function request(token?: string) {
  return new Request("https://x", { method: "POST", headers: token ? { "x-autodigitalpublisher-write-token": token } : {} });
}

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function configure() {
  process.env.PUBLISH_WRITES_ENABLED = "true";
  process.env.ETSY_B01_WRITE_TOKEN = "secret";
  process.env.ETSY_SHOP_ID = PDT_BOBA_001_B01_DESCRIPTION.shopId;
  process.env.ETSY_BOBA_B01_DESCRIPTION_AUTHORIZATION_ID = "AUTH-EXPLICIT-ONE-SHOT";
  process.env.ETSY_API_KEY = "key";
  process.env.ETSY_SHARED_SECRET = "secret";
  const body = exactPdtBoba001B01DescriptionBody("AUTH-EXPLICIT-ONE-SHOT");
  process.env.ETSY_BOBA_B01_DESCRIPTION_REQUEST_SHA256 = hashOperationRequest(body);
  return body;
}

function matchingListing() {
  return {
    listing_id: 4560696421,
    shop_id: 23582741,
    state: "active",
    title: "Boba Shop Operations Toolkit, Cafe Daily SOP, Checklist, Excel Google Sheets Template (Digital Download)",
    description: OLD_DESCRIPTION,
    price: { amount: 1290, divisor: 100, currency_code: "USD" },
    taxonomy_id: 12476,
    quantity: 999,
    who_made: "i_did",
    when_made: "2020_2026",
    listing_type: "download",
    tags: TAGS
  };
}

function matchingImages() {
  return PDT_BOBA_001_B01_PROTECTED_GALLERY_IDS.map((listing_image_id, index) => ({ listing_image_id, rank: index + 1 }));
}

function matchingFiles() {
  return [
    [1509032655604, 1, "PoonthaiDigital_Boba_Checklist_A4.pdf", 17459, "application/pdf"],
    [1509032655658, 2, "PoonthaiDigital_Boba_Checklist_US_Letter.pdf", 16632, "application/pdf"],
    [1509891952828, 3, "Boba_Read_Me_License.pdf", 4620, "application/pdf"],
    [1509891952826, 4, "Boba_Quick_Start.pdf", 4564, "application/pdf"],
    [1509980398204, 5, "PoonthaiDigital_Boba_Shop_Operations_Tracker.zip", 22370, "application/zip"]
  ].map(([listing_file_id, rank, filename, size_bytes, filetype]) => ({ listing_file_id, rank, filename, size_bytes, filetype }));
}

test.afterEach(restore);

test("fails closed without write enablement or write token before Etsy access", async () => {
  delete process.env.PUBLISH_WRITES_ENABLED;
  let calls = 0;
  const body = exactPdtBoba001B01DescriptionBody("A");
  const disabled = await handlePdtBoba001B01Description(body, request(), { getAccessToken: async () => { calls += 1; return "x"; } });
  assert.equal(disabled.status, 403);
  process.env.PUBLISH_WRITES_ENABLED = "true";
  delete process.env.ETSY_B01_WRITE_TOKEN;
  const unauth = await handlePdtBoba001B01Description(body, request(), { getAccessToken: async () => { calls += 1; return "x"; } });
  assert.equal(unauth.status, 503);
  assert.equal(calls, 0);
});

test("exact contract is canonical Drive-bound, fingerprint-bound, and description-only", () => {
  const body = exactPdtBoba001B01DescriptionBody("AUTH-EXPLICIT-ONE-SHOT");
  assert.equal(body.canonicalDriveId, "1poNRPlqzb2q1se6Diqssg_7CdH0eVrw2es1zioOOwXg");
  assert.equal(body.candidateId, "ETSY-OPT-RC-PDT-BOBA-001-V1-2026-09-10-B");
  assert.equal(body.candidateFingerprint, "4f56c4ad4ccb39a51d034ac8c01e17f6b0d927fa1a291d5ba91dfc7d64fae497");
  assert.equal(body.buildId, "ETSY-OPT-RC-PDT-BOBA-001-BUILD-20260910-B01");
  assert.equal(body.buildFingerprint, "06203979b91476aa50d04f45056ca20ad8f863952a86b71da660495c21a046b1");
  assert.equal(body.acceptanceCriteriaId, "ETSY-OPT-RC-PDT-BOBA-001-AC-20260910-B01");
  assert.equal(body.acceptanceCriteriaSha256, "f16ebf363c02864ec7496f3b050b8bd2795e061b6a806d451a0d31d63065b558");
  assert.equal(body.targetDescriptionSha256, PDT_BOBA_001_B01_DESCRIPTION.targetDescriptionSha256);
  assert.deepEqual(Object.keys(body.patch), ["description"]);
});

test("protected gallery contract is the exact ordered current 12-image baseline", () => {
  assert.equal(PDT_BOBA_001_B01_PROTECTED_GALLERY_IDS.length, 12);
  assert.deepEqual([...PDT_BOBA_001_B01_PROTECTED_GALLERY_IDS], [
    8547319609,
    8547319665,
    8547319731,
    8547319783,
    8547319831,
    8547319873,
    8499440812,
    8499440860,
    8499440896,
    8547320067,
    8547320117,
    8499441032
  ]);
});

test("request-hash mismatch fails before Etsy and ledger access", async () => {
  const body = configure();
  process.env.ETSY_BOBA_B01_DESCRIPTION_REQUEST_SHA256 = "f".repeat(64);
  let calls = 0;
  const result = await handlePdtBoba001B01Description(body, request("secret"), {
    getAccessToken: async () => { calls += 1; return "x"; },
    repository: new MemoryOperationLedgerRepository()
  });
  assert.equal(result.status, 409);
  assert.equal(calls, 0);
});

test("fresh protected-state mismatch performs four GETs and zero Etsy writes", async () => {
  const body = configure();
  const methods: string[] = [];
  const fetchImpl = async (_url: URL | RequestInfo, init?: RequestInit) => {
    methods.push(String(init?.method));
    return response(String(_url).endsWith("/images") || String(_url).endsWith("/properties") || String(_url).endsWith("/files") ? { results: [] } : { shop_id: 23582741, state: "active" });
  };
  const result = await handlePdtBoba001B01Description(body, request("secret"), {
    getAccessToken: async () => "token",
    fetchImpl,
    repository: new MemoryOperationLedgerRepository()
  });
  assert.equal(result.status, 409);
  assert.deepEqual(methods, ["GET", "GET", "GET", "GET"]);
});

test("zero-write staging returns PROTECTED_STATE_MATCH only for exact canonical state and never sends a non-GET", async () => {
  process.env.ETSY_API_KEY = "key";
  process.env.ETSY_SHARED_SECRET = "secret";
  const methods: string[] = [];
  const result = await verifyPdtBoba001B01ProtectedState({
    getAccessToken: async () => "token",
    fetchImpl: async (url, init) => {
      methods.push(String(init?.method));
      const value = String(url);
      if (value.endsWith("/listings/4560696421")) return response(matchingListing());
      if (value.endsWith("/images")) return response({ results: matchingImages() });
      if (value.endsWith("/properties")) return response({ results: [] });
      if (value.endsWith("/files")) return response({ results: matchingFiles() });
      return response({}, 404);
    }
  });
  const output = await result.json();
  assert.equal(result.status, 200);
  assert.equal(output.status, "PROTECTED_STATE_MATCH");
  assert.equal(output.ETSY_WRITE_COUNT, 0);
  assert.equal(output.protectedStateBaselineSha256, "6614a60dab611e28260b60989a9bed2c877ec4657a54cb7726bbd4dd3f1cb248");
  assert.deepEqual(methods, ["GET", "GET", "GET", "GET"]);
});
