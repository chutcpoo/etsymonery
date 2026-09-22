import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { fetchEtsyReadWithRetry } from "../../../../../../../lib/etsy-http";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../../../lib/etsy-seller-state-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = 23582741;
const TARGET_LISTING_ID = 4580126260;
const AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-CBEO-004-V1-ETSY-PUBLISH-R01-20260922 EXACT SCOPE ONLY";
const NONCE_SHA256 =
  "3ce109bd0893bf1c80430e2be673e7a7d8285fd3dfb9b01288a1f90753a887ef";
const CANDIDATE_FINGERPRINT =
  "758335490c54ba8a293045867a1344eed4e27aec2a4bef5c8919d026d8edd067";
const LISTING_FINGERPRINT =
  "2c19e1f00b8786f264e6091d9286723f3116dc9810a189ac82557cb38387eafb";

const TITLE =
  "Banquet Event Order Template | Catering BEO & Event Tracker | Excel Spreadsheet";
const DESCRIPTION = `This Excel-based Banquet Event Order template helps independent caterers organize event details, menu and service items, staffing and equipment requirements, payments, and a BEO-style operational summary in one connected workbook.

WHAT YOU GET
• 1 SAMPLE workbook with fictional demonstration data
• 1 CLEAN START workbook for your own events
• Microsoft Excel .xlsx files
• 8 connected tabs:
  01 START HERE
  02 EVENTS
  03 EVENT DETAILS
  04 MENU & SERVICES
  05 STAFF & EQUIPMENT
  06 PAYMENTS
  07 BEO OUTPUT
  08 DASHBOARD

WHAT IT HELPS YOU TRACK
• Client and event details
• Event date, venue, guest count, service times, and status
• Menu and service line items
• Staff, equipment, rental, and AV requirements
• User-entered tax, service fee, and deposit settings
• Deposits, payments, refunds, net paid, and balance due
• A selectable BEO-style operational event summary
• Upcoming events and practical dashboard rollups

HOW IT WORKS
Create a unique Event ID, enter the event facts, add menu/service items, record operational requirements and payment activity, then select the Event ID in the BEO OUTPUT tab. The workbook pulls the connected records into one readable event-order summary and rolls current records into the dashboard.

GOOD FIT FOR
• Independent caterers and small catering companies
• Restaurant operators with catering or private-event service
• Small banquet/event teams managing food-service-led events
• Private chefs managing multi-detail catered events

IMPORTANT PRODUCT BOUNDARIES
• Built and tested for Microsoft Excel desktop
• Google Sheets compatibility is not claimed in V1
• Manual data entry; no CRM, POS, calendar, email, accounting, or payment integrations
• Does not process or transmit payments
• Staff/equipment sections track requirements only; they are not scheduling or inventory systems
• Tax and service-fee calculations use rates entered by the user and do not provide tax advice
• BEO OUTPUT is an operational summary, not a legal contract, invoice, e-signature document, or payment-processing system

Digital product. No physical item is shipped.

AI DISCLOSURE
This digital workbook was created with AI-assisted tools under seller direction and was reviewed and tested before release.`;

const TAGS = Object.freeze([
  "banquet event order",
  "catering event form",
  "catering planner",
  "BEO template",
  "catering spreadsheet",
  "event order template",
  "banquet order form",
  "catering workflow",
  "event detail tracker",
  "deposit tracker",
  "event service sheet",
  "private chef planner",
  "catering excel"
] as const);

const GALLERY = Object.freeze([
  [1, 8559552838, "Banquet Event Order template hero image showing the real Excel BEO operational event summary workbook."],
  [2, 8607411247, "Real Excel catering dashboard showing upcoming events, guest counts, balances, deposits, and event status."],
  [3, 8559553094, "BEO output worksheet showing one selected catering event with operational notes, menu items, requirements, payments, and totals."],
  [4, 8607411449, "Excel master event register showing client, venue, guest count, timing, rates, and event status fields."],
  [5, 8559553326, "Menu and Services worksheet showing billable food, beverage, service, and rental line items by Event ID."],
  [6, 8607411699, "Staff and Equipment worksheet showing catering staff, equipment, rental, AV, quantity, and needed-by requirements."],
  [7, 8607411775, "Payments worksheet showing manual deposits, payments, refunds, methods, references, and signed amounts by Event ID."],
  [8, 8559553570, "Start Here worksheet and overview of the eight connected Excel tabs in the catering BEO workflow."],
  [9, 8559553692, "Digital product contents showing SAMPLE and CLEAN START Microsoft Excel XLSX workbook files."],
  [10, 8559553838, "Buyer fit and product boundaries for the catering BEO Excel tracker, including supported and unsupported use cases."]
] as const);

const BUYER_FILES = Object.freeze([
  [1, 1518077137293, "PDT-CBEO-004_V1_Catering_BEO_Event_Planning_Tracker_SAMPLE.xlsx", 88292],
  [2, 1516837916828, "PDT-CBEO-004_V1_Catering_BEO_Event_Planning_Tracker_CLEAN_START.xlsx", 83888]
] as const);

const PROTECTED = Object.freeze([
  [4579068925, "active", "Recipe Cost Calculator | Restaurant Food Cost & Menu Pricing Excel Template"],
  [4578945050, "active", "Invoice Payment Tracker Excel | Accounts Receivable Aging & Follow-Up Spreadsheet for Small Business"],
  [4579470012, "draft", "Bar Inventory Spreadsheet | Liquor Stock & Pour Cost Tracker"]
] as const);

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textField(value: Rec, key: string) {
  return typeof value[key] === "string" ? value[key].normalize("NFC").trim() : "";
}

function intField(value: Rec, key: string) {
  const n = Number(value[key]);
  return Number.isSafeInteger(n) ? n : null;
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function nonceOk(value: string) {
  return secureEqual(
    createHash("sha256").update(value, "utf8").digest("hex"),
    NONCE_SHA256
  );
}

function runtimeCommit() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? "";
}

function comparable(value: string) {
  let out = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  for (let i = 0; i < 2; i += 1) {
    out = out
      .replace(/&quot;|&#34;|&#x22;/gi, '"')
      .replace(/&apos;|&#39;|&#x27;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&");
  }
  return out;
}

function sameStrings(value: unknown, expected: readonly string[]) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every(
      (item, index) =>
        typeof item === "string" &&
        item.normalize("NFC").trim() === expected[index]
    )
  );
}

function exactPrice(value: unknown) {
  if (!isRec(value)) return false;
  return (
    Number(value.amount) === 999 &&
    Number(value.divisor) === 100 &&
    textField(value, "currency_code").toUpperCase() === "USD"
  );
}

async function parseJson(response: Response) {
  const body = await response.text();
  if (!body) return {};
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return {};
  }
}

async function getRecord(token: string, url: string, code: string) {
  const response = await fetchEtsyReadWithRetry(fetch, url, {
    method: "GET",
    headers: etsyApiHeaders(token),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(code + "_HTTP_" + response.status);
  const value = await parseJson(response);
  if (!isRec(value)) throw new Error(code + "_INVALID");
  return value;
}

function records(value: unknown, code: string) {
  if (!isRec(value) || !Array.isArray(value.results)) {
    throw new Error(code);
  }
  return value.results.filter(isRec);
}

function protectedStateFingerprint(input: {
  targetState: "draft" | "active";
  sellerCounts: { active: number; inactive: number; sold_out: number; draft: number; expired: number };
  total: number;
  imageIds: number[];
  fileIds: number[];
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        productId: "PDT-CBEO-004",
        listingId: TARGET_LISTING_ID,
        candidateFingerprint: CANDIDATE_FINGERPRINT,
        listingFingerprint: LISTING_FINGERPRINT,
        ...input
      }),
      "utf8"
    )
    .digest("hex");
}

async function verify(targetState: "draft" | "active") {
  const token = await getValidEtsyAccessToken();
  const base = "https://api.etsy.com/v3/application";
  const [listing, imagesPayload, filesPayload, seller] = await Promise.all([
    getRecord(token, base + "/listings/" + TARGET_LISTING_ID, "CBEO_PUBLISH_LISTING"),
    getRecord(token, base + "/listings/" + TARGET_LISTING_ID + "/images", "CBEO_PUBLISH_IMAGES"),
    getRecord(token, base + "/shops/" + SHOP_ID + "/listings/" + TARGET_LISTING_ID + "/files", "CBEO_PUBLISH_FILES"),
    getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token })
  ]);

  const images = records(imagesPayload, "CBEO_PUBLISH_IMAGES_INVALID").sort(
    (a, b) => (intField(a, "rank") ?? 0) - (intField(b, "rank") ?? 0)
  );
  const files = records(filesPayload, "CBEO_PUBLISH_FILES_INVALID").sort(
    (a, b) => (intField(a, "rank") ?? 0) - (intField(b, "rank") ?? 0)
  );

  const listingMatches =
    textField(listing, "state") === targetState &&
    textField(listing, "title") === TITLE &&
    comparable(textField(listing, "description")) === comparable(DESCRIPTION) &&
    exactPrice(listing.price) &&
    Number(listing.quantity) === 999 &&
    Number(listing.taxonomy_id) === 12476 &&
    textField(listing, "who_made") === "i_did" &&
    textField(listing, "when_made") === "2020_2026" &&
    textField(listing, "listing_type") === "download" &&
    sameStrings(listing.tags, TAGS);

  const galleryMatches =
    images.length === GALLERY.length &&
    images.every((row, index) => {
      const [rank, imageId, altText] = GALLERY[index];
      return (
        intField(row, "rank") === rank &&
        intField(row, "listing_image_id") === imageId &&
        textField(row, "alt_text") === altText &&
        Number(row.full_width) === 4000 &&
        Number(row.full_height) === 2250
      );
    });

  const buyerFilesMatch =
    files.length === BUYER_FILES.length &&
    files.every((row, index) => {
      const [rank, fileId, fileName, size] = BUYER_FILES[index];
      return (
        intField(row, "rank") === rank &&
        intField(row, "listing_file_id") === fileId &&
        textField(row, "filename") === fileName &&
        Number(row.size_bytes) === size
      );
    });

  const expectedActive = targetState === "draft" ? 2 : 3;
  const expectedDraft = targetState === "draft" ? 2 : 1;
  const protectedListingsMatch =
    seller.total === 4 &&
    seller.counts.active === expectedActive &&
    seller.counts.draft === expectedDraft &&
    seller.counts.inactive === 0 &&
    seller.counts.sold_out === 0 &&
    seller.counts.expired === 0 &&
    PROTECTED.every(([listingId, state, title]) =>
      seller.listings.some(
        (item) =>
          item.listingId === listingId &&
          item.state === state &&
          item.title === title
      )
    ) &&
    seller.listings.some(
      (item) =>
        item.listingId === TARGET_LISTING_ID &&
        item.state === targetState &&
        item.title === TITLE
    );

  const protectedStateFingerprintValue = protectedStateFingerprint({
    targetState,
    sellerCounts: seller.counts,
    total: seller.total,
    imageIds: images.map((row) => intField(row, "listing_image_id") ?? 0),
    fileIds: files.map((row) => intField(row, "listing_file_id") ?? 0)
  });

  return {
    listingMatches,
    galleryMatches,
    buyerFilesMatch,
    protectedListingsMatch,
    protectedStateFingerprint: protectedStateFingerprintValue,
    sellerCounts: seller.counts,
    total: seller.total,
    imageCount: images.length,
    buyerFileCount: files.length,
    state: textField(listing, "state")
  };
}

async function publishOnce(token: string) {
  const response = await fetch(
    "https://api.etsy.com/v3/application/shops/" +
      SHOP_ID +
      "/listings/" +
      TARGET_LISTING_ID,
    {
      method: "PATCH",
      headers: {
        ...etsyApiHeaders(token),
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ state: "active" }),
      cache: "no-store"
    }
  );
  if (response.status >= 500) {
    throw new Error("CBEO_PUBLISH_AMBIGUOUS_HTTP_" + response.status);
  }
  if (!response.ok) {
    throw new Error("CBEO_PUBLISH_REJECTED_HTTP_" + response.status);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.get("action") === "execute") {
    let writes = 0;
    try {
      if (process.env.VERCEL_ENV !== "production") {
        throw new Error("CBEO_PUBLISH_PRODUCTION_RUNTIME_REQUIRED");
      }

      const authorization =
        url.searchParams.get("authorizationText")?.normalize("NFC").trim() ?? "";
      if (!secureEqual(authorization, AUTHORIZATION_TEXT)) {
        throw new Error("CBEO_PUBLISH_AUTHORIZATION_INVALID");
      }

      const nonce = url.searchParams.get("nonce")?.trim() ?? "";
      if (!nonce || !nonceOk(nonce)) {
        throw new Error("CBEO_PUBLISH_NONCE_INVALID");
      }

      const commit = url.searchParams.get("commit")?.trim().toLowerCase() ?? "";
      const deploymentCommit = runtimeCommit();
      if (
        !/^[a-f0-9]{40}$/.test(commit) ||
        !/^[a-f0-9]{40}$/.test(deploymentCommit) ||
        !secureEqual(commit, deploymentCommit)
      ) {
        throw new Error("CBEO_PUBLISH_GIT_VERCEL_COMMIT_MISMATCH");
      }

      const suppliedProtected =
        url.searchParams.get("protectedStateFingerprint")?.trim().toLowerCase() ?? "";
      if (!/^[a-f0-9]{64}$/.test(suppliedProtected)) {
        throw new Error("CBEO_PUBLISH_PROTECTED_STATE_INVALID");
      }

      const before = await verify("draft");
      if (
        !before.listingMatches ||
        !before.galleryMatches ||
        !before.buyerFilesMatch ||
        !before.protectedListingsMatch ||
        !secureEqual(before.protectedStateFingerprint, suppliedProtected)
      ) {
        return NextResponse.json(
          {
            status: "BLOCKED_FAIL_CLOSED",
            error: "CBEO_PUBLISH_FRESH_PROTECTED_STATE_MISMATCH",
            ...before,
            ETSY_WRITE_COUNT: 0
          },
          { status: 409, headers: { "cache-control": "no-store" } }
        );
      }

      const token = await getValidEtsyAccessToken();
      await publishOnce(token);
      writes = 1;

      try {
        const after = await verify("active");
        const pass =
          after.listingMatches &&
          after.galleryMatches &&
          after.buyerFilesMatch &&
          after.protectedListingsMatch;

        if (!pass) {
          return NextResponse.json(
            {
              status: "RECONCILIATION_REQUIRED",
              error: "CBEO_PUBLISH_FINAL_VERIFY_MISMATCH",
              ...after,
              authorizationConsumed: true,
              ETSY_WRITE_COUNT: 1
            },
            { status: 202, headers: { "cache-control": "no-store" } }
          );
        }

        return NextResponse.json(
          {
            status: "PDT_CBEO_004_PUBLISH_R01_PASS",
            targetListingId: TARGET_LISTING_ID,
            productId: "PDT-CBEO-004",
            version: "V1",
            state: "active",
            listingFingerprint: LISTING_FINGERPRINT,
            candidateFingerprint: CANDIDATE_FINGERPRINT,
            authorizationConsumed: true,
            protectedListingsUnchanged: true,
            ...after,
            ETSY_WRITE_COUNT: 1
          },
          { headers: { "cache-control": "no-store" } }
        );
      } catch (error) {
        return NextResponse.json(
          {
            status: "RECONCILIATION_REQUIRED",
            error: error instanceof Error ? error.message : "UNKNOWN",
            targetListingId: TARGET_LISTING_ID,
            authorizationConsumed: true,
            ETSY_WRITE_COUNT: 1
          },
          { status: 202, headers: { "cache-control": "no-store" } }
        );
      }
    } catch (error) {
      return NextResponse.json(
        {
          status: writes > 0 ? "RECONCILIATION_REQUIRED" : "BLOCKED_FAIL_CLOSED",
          error: error instanceof Error ? error.message : "UNKNOWN",
          targetListingId: TARGET_LISTING_ID,
          ETSY_WRITE_COUNT: writes
        },
        {
          status: writes > 0 ? 202 : 400,
          headers: { "cache-control": "no-store" }
        }
      );
    }
  }

  if (url.searchParams.get("action") === "reconcile_readonly") {
    try {
      const state = await verify("active");
      const pass =
        state.listingMatches &&
        state.galleryMatches &&
        state.buyerFilesMatch &&
        state.protectedListingsMatch;
      return NextResponse.json(
        {
          status: pass
            ? "PDT_CBEO_004_PUBLISH_R01_RECONCILED"
            : "PDT_CBEO_004_PUBLISH_R01_RECONCILE_BLOCKED",
          mode: "READ_ONLY",
          targetListingId: TARGET_LISTING_ID,
          listingFingerprint: LISTING_FINGERPRINT,
          candidateFingerprint: CANDIDATE_FINGERPRINT,
          ...state,
          publishAuthorized: false,
          mutationEnabled: false,
          ETSY_WRITE_COUNT: 0
        },
        { status: pass ? 200 : 409, headers: { "cache-control": "no-store" } }
      );
    } catch (error) {
      return NextResponse.json(
        {
          status: "PDT_CBEO_004_PUBLISH_R01_RECONCILE_BLOCKED",
          error: error instanceof Error ? error.message : "UNKNOWN",
          ETSY_WRITE_COUNT: 0
        },
        { status: 409, headers: { "cache-control": "no-store" } }
      );
    }
  }

  try {
    const state = await verify("draft");
    const ready =
      state.listingMatches &&
      state.galleryMatches &&
      state.buyerFilesMatch &&
      state.protectedListingsMatch;

    return NextResponse.json(
      {
        status: ready
          ? "PDT_CBEO_004_PUBLISH_R01_READY"
          : "PDT_CBEO_004_PUBLISH_R01_BLOCKED",
        mode: "PLAN_ONLY",
        targetListingId: TARGET_LISTING_ID,
        listingFingerprint: LISTING_FINGERPRINT,
        candidateFingerprint: CANDIDATE_FINGERPRINT,
        ...state,
        authorizationRequired: AUTHORIZATION_TEXT,
        publishAuthorized: true,
        mutationEnabled: true,
        deploymentCommit: runtimeCommit(),
        ETSY_WRITE_COUNT: 0
      },
      { status: ready ? 200 : 409, headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "PDT_CBEO_004_PUBLISH_R01_BLOCKED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        publishAuthorized: false,
        mutationEnabled: false,
        ETSY_WRITE_COUNT: 0
      },
      { status: 409, headers: { "cache-control": "no-store" } }
    );
  }
}
