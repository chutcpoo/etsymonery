import assert from "node:assert/strict";
import test from "node:test";
import {
  exactPdtBoba001C03GalleryRepairBody,
  handlePdtBoba001C03GalleryRepair,
  PDT_BOBA_001_C03_GALLERY_REPAIR
} from "../lib/pdt-boba-001-c03-gallery-mobile-safe-repair";
import { MemoryOperationLedgerRepository } from "../lib/operation-ledger";

const DESCRIPTION = `Streamline your bubble tea & boba cafe daily operations with this all-in-one Operations Toolkit!

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

const TAGS = ["bubble tea business", "boba shop toolkit", "boba operations", "boba shop sop", "cafe opening closing", "daily prep log", "stock waste tracker", "shift handoff log", "tea cafe template", "milktea inventory", "cafe cleaning sheet", "drink shop checklist", "google sheets boba"];
const INITIAL_GALLERY = [
  [8485017526, 1, 2000, 1600], [8485017504, 2, 2000, 1600], [8532915667, 3, 2000, 1600],
  [8532915695, 4, 2000, 1600], [8485017508, 5, 2000, 1600], [8532915683, 6, 2000, 1600],
  [8485017512, 7, 2000, 1600], [8485017510, 8, 2000, 1600], [8532915679, 9, 2000, 1600],
  [8485017528, 10, 2000, 1600]
];
const BUYER_FILES = [
  [1509032655604, 1, "PoonthaiDigital_Boba_Checklist_A4.pdf", 17459, "application/pdf"],
  [1509032655658, 2, "PoonthaiDigital_Boba_Checklist_US_Letter.pdf", 16632, "application/pdf"],
  [1509891952828, 3, "Boba_Read_Me_License.pdf", 4620, "application/pdf"],
  [1509891952826, 4, "Boba_Quick_Start.pdf", 4564, "application/pdf"],
  [1509980398204, 5, "PoonthaiDigital_Boba_Shop_Operations_Tracker.zip", 22370, "application/zip"]
];

function listing(overrides: Record<string, unknown> = {}) {
  return {
    listing_id: 4560696421,
    shop_id: 23582741,
    state: "active",
    title: "Boba Shop Operations Toolkit, Cafe Daily SOP, Checklist, Excel Google Sheets Template (Digital Download)",
    description: DESCRIPTION,
    price: { amount: 1290, divisor: 100, currency_code: "USD" },
    taxonomy_id: 12476,
    quantity: 999,
    who_made: "i_did",
    when_made: "2020_2026",
    listing_type: "download",
    tags: [...TAGS],
    ...overrides
  };
}

function images(rows: readonly (readonly number[])[]) {
  return rows.map(([listing_image_id, rank, full_width, full_height]) => ({ listing_image_id, rank, full_width, full_height }));
}
function files() {
  return BUYER_FILES.map(([listing_file_id, rank, filename, size_bytes, filetype]) => ({ listing_file_id, rank, filename, size_bytes, filetype }));
}
function request(body: Record<string, unknown>, token = "test-write-token") {
  return new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": token }, body: JSON.stringify(body) });
}
async function json(response: Response) { return response.json() as Promise<Record<string, unknown>>; }
function enableWrites() {
  process.env.PUBLISH_WRITES_ENABLED = "true";
  process.env.ETSY_B01_WRITE_TOKEN = "test-write-token";
  process.env.ETSY_SHOP_ID = "23582741";
  process.env.ETSY_API_KEY = "test-api-key";
  process.env.ETSY_SHARED_SECRET = "test-shared-secret";
}

function protectedMismatchFetch() {
  let writes = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET";
    if (method !== "GET") { writes += 1; return new Response("{}", { status: 500 }); }
    if (url.endsWith("/listings/4560696421")) return Response.json(listing({ title: "drifted title" }));
    if (url.endsWith("/images")) return Response.json({ results: images(INITIAL_GALLERY) });
    if (url.endsWith("/properties")) return Response.json({ results: [] });
    if (url.endsWith("/files")) return Response.json({ results: files() });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, writes: () => writes };
}

function successFetch() {
  let gallery = images(INITIAL_GALLERY);
  const methods: string[] = [];
  const writeUrls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET";
    methods.push(method);
    if (method === "POST") {
      writeUrls.push(url);
      assert.ok(init?.body instanceof FormData);
      const rank = Number(init.body.get("rank"));
      const asset = PDT_BOBA_001_C03_GALLERY_REPAIR.gallery[rank - 1];
      assert.equal(init.body.get("overwrite"), "true");
      assert.equal(url, "https://api.etsy.com/v3/application/shops/23582741/listings/4560696421/images");
      const id = 9900000000 + rank;
      gallery = gallery.filter((image) => Number(image.rank) !== rank);
      gallery.push({ listing_image_id: id, rank, full_width: asset.width, full_height: asset.height });
      gallery.sort((a, b) => Number(a.rank) - Number(b.rank));
      return Response.json({ listing_image_id: id }, { status: 201 });
    }
    if (url.endsWith("/listings/4560696421")) return Response.json(listing());
    if (url.endsWith("/images")) return Response.json({ results: gallery });
    if (url.endsWith("/properties")) return Response.json({ results: [] });
    if (url.endsWith("/files")) return Response.json({ results: files() });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, methods, writeUrls };
}

test("C03 contract is exact gallery-only immutable identity", () => {
  const body = exactPdtBoba001C03GalleryRepairBody();
  assert.equal(body.operationId, "PDT-BOBA-001-C03-GALLERY-MOBILE-SAFE-REPAIR-001");
  assert.equal(body.operation, "GALLERY_MOBILE_SAFE_REPAIR_ONLY");
  assert.equal(body.listingId, "4560696421");
  assert.equal(body.candidateFingerprint, "bd07c992673bf3c339b5b2f336bb5a38d24c9c34d7799b17b9021fa29ac8515c");
  assert.equal(body.buildFingerprint, "bd07c992673bf3c339b5b2f336bb5a38d24c9c34d7799b17b9021fa29ac8515c");
  assert.equal(body.acceptanceCriteriaSha256, "56d838d64a9c8be8772dc8967eae34eb4532693a8f8677f1667adafb4e49f6c7");
  assert.equal(body.gallery.length, 12);
  assert.deepEqual(body.gallery.map((asset) => asset.order), [1,2,3,4,5,6,7,8,9,10,11,12]);
  for (const forbidden of ["patch", "title", "tags", "description", "price", "taxonomy", "attributes", "quantity", "buyerFiles"]) assert.equal(Object.hasOwn(body, forbidden), false);
});

test("writes-disabled and write-token guards stop before Etsy", async () => {
  const body = exactPdtBoba001C03GalleryRepairBody();
  process.env.PUBLISH_WRITES_ENABLED = "false";
  let response = await handlePdtBoba001C03GalleryRepair(body, request(body), {});
  assert.equal(response.status, 403);
  assert.equal((await json(response)).providerWriteCount, 0);

  enableWrites();
  response = await handlePdtBoba001C03GalleryRepair(body, request(body, "wrong"), {});
  assert.equal(response.status, 401);
  assert.equal((await json(response)).providerWriteCount, 0);
});

test("contract or staged asset identity mismatch fails closed with zero provider writes", async () => {
  enableWrites();
  const body = exactPdtBoba001C03GalleryRepairBody();
  const changed = structuredClone(body) as Record<string, unknown>;
  changed.listingId = "wrong";
  let response = await handlePdtBoba001C03GalleryRepair(changed, request(changed), {});
  assert.equal(response.status, 409);
  assert.equal((await json(response)).providerWriteCount, 0);

  response = await handlePdtBoba001C03GalleryRepair(body, request(body), {
    repository: new MemoryOperationLedgerRepository(),
    loadAsset: async () => Buffer.from("not-the-frozen-png"),
    verifyAsset: () => false
  });
  assert.equal(response.status, 409);
  assert.match(String((await json(response)).error), /ASSET_IDENTITY_MISMATCH/);
});

test("fresh protected-state drift blocks before any Etsy POST", async () => {
  enableWrites();
  const body = exactPdtBoba001C03GalleryRepairBody();
  const fake = protectedMismatchFetch();
  const response = await handlePdtBoba001C03GalleryRepair(body, request(body), {
    repository: new MemoryOperationLedgerRepository(),
    getAccessToken: async () => "token",
    loadAsset: async () => Buffer.from("test"),
    verifyAsset: () => true,
    fetchImpl: fake.fetchImpl
  });
  assert.equal(response.status, 409);
  assert.equal((await json(response)).error, "PDT_BOBA_001_C03_PROTECTED_STATE_MISMATCH");
  assert.equal(fake.writes(), 0);
});

test("success performs exactly 12 image POSTs, no listing PATCH/DELETE, preserves protected fields, and replays with zero writes", async () => {
  enableWrites();
  const body = exactPdtBoba001C03GalleryRepairBody();
  const repository = new MemoryOperationLedgerRepository();
  const fake = successFetch();
  const runtime = {
    repository,
    getAccessToken: async () => "token",
    loadAsset: async () => Buffer.from("test"),
    clearAsset: async () => undefined,
    verifyAsset: () => true,
    fetchImpl: fake.fetchImpl,
    now: () => "2026-09-09T07:00:00.000Z"
  };
  let response = await handlePdtBoba001C03GalleryRepair(body, request(body), runtime);
  assert.equal(response.status, 200);
  let payload = await json(response);
  assert.equal(payload.status, "UPDATED_AND_VERIFIED");
  assert.equal(payload.providerWriteCount, 12);
  assert.equal(fake.writeUrls.length, 12);
  assert.equal(fake.methods.filter((method) => method === "POST").length, 12);
  assert.equal(fake.methods.includes("PATCH"), false);
  assert.equal(fake.methods.includes("DELETE"), false);
  const receipt = payload.receipt as Record<string, unknown>;
  assert.deepEqual(receipt.verified, { galleryExactOrdered12: "PASS", title: "PRESERVED", tags: "PRESERVED", description: "PRESERVED", price: "PRESERVED", taxonomy: "PRESERVED", attributes: "PRESERVED", quantity: "PRESERVED", buyerFiles: "PRESERVED" });

  const callsBeforeReplay = fake.methods.length;
  response = await handlePdtBoba001C03GalleryRepair(body, request(body), runtime);
  payload = await json(response);
  assert.equal(response.status, 200);
  assert.equal(payload.status, "REPLAY");
  assert.equal(payload.providerWriteCount, 0);
  assert.equal(fake.methods.length, callsBeforeReplay);
});
