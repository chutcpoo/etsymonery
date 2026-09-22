import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../lib/etsy-seller-state-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = 23582741;
const LISTING_ID = 4580303015;
const CURRENT_PRICE_USD = 9.99;
const TARGET_PRICE_USD = 12.99;
const AUTH = "AUTHORIZE PDT-RPT-003-V1-ETSY-PRICE-RECOVERY-R01-20260922 EXACT SCOPE ONLY";
const NONCE = "PDT-RPT-003-PRICE-RECOVERY-R01-NONCE-1F6A9D72";
const TITLE = "Rental Property Tracker Excel | Landlord Income Expense | Airbnb Spreadsheet Dashboard";
const TAGS = [
  "rental property",
  "landlord tracker",
  "rental spreadsheet",
  "airbnb spreadsheet",
  "property tracker",
  "rental income",
  "expense tracker",
  "landlord excel",
  "airbnb tracker",
  "rental dashboard",
  "property expenses",
  "rent roll tracker",
  "real estate excel"
] as const;

const FILES = [
  { rank: 1, name: "PDT-RPT-003_V1_Rental_Property_Tracker_SAMPLE_FINAL.xlsx", size: 88570 },
  { rank: 2, name: "PDT-RPT-003_V1_Rental_Property_Tracker_CLEAN_START_FINAL.xlsx", size: 86643 }
] as const;

const ALTS = [
  "Excel rental property tracker dashboard showing gross income, cash expenses, net cash flow, cash-on-cash return, outstanding rent, STR occupancy, monthly review, and property table.",
  "Rental property Excel dashboard preview with KPI cards for income, expenses, net cash flow, outstanding rent, cash-on-cash return, and short-term rental occupancy.",
  "Rent Roll spreadsheet showing monthly expected rent, rent received, balance, and Paid or Partial status for fictional long-term rental examples.",
  "Short-term rental occupancy spreadsheet showing available nights, booked nights, occupancy percentage, booking revenue, ADR, and revenue per available night.",
  "Side-by-side Excel previews of the Income and Expenses tabs used to record rental cash transactions by property, category, date, amount, and notes.",
  "Annual Summary spreadsheet preview showing per-property income, cash expenses, net cash flow, cash invested, cash-on-cash return, rent balance, and STR occupancy.",
  "Properties tab preview with fictional long-term and short-term rental records, property IDs, labels, rental type, units, cash invested, and notes.",
  "Graphic listing the eight workbook tabs: Start Here, Properties, Income, Expenses, Rent Roll, STR Occupancy, Annual Summary, and Dashboard.",
  "Two digital Excel files shown as cards: a populated SAMPLE workbook and a CLEAN START workbook with formulas, validations, dashboard, and instructions.",
  "Product boundaries graphic showing included rental tracking features and excluded functions such as bank feeds, rent collection, tax preparation, and Airbnb integration."
] as const;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const txt = (r: Rec, k: string) => typeof r[k] === "string" ? (r[k] as string).normalize("NFC").trim() : "";
const int = (r: Rec, k: string) => {
  const n = Number(r[k]);
  return Number.isSafeInteger(n) ? n : null;
};
const eq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const commit = () => process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? "";

async function asJson(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!body) return {};
  try { return JSON.parse(body) as unknown; } catch { return {}; }
}

async function readRecord(token: string, url: string, code: string): Promise<Rec> {
  const response = await fetch(url, { headers: etsyApiHeaders(token), cache: "no-store" });
  if (!response.ok) throw new Error(code + "_HTTP_" + response.status);
  const value = await asJson(response);
  if (!isRec(value)) throw new Error(code + "_INVALID");
  return value;
}

async function listing(token: string) {
  return readRecord(token, "https://api.etsy.com/v3/application/listings/" + LISTING_ID, "LISTING");
}

async function assets(token: string, kind: "files" | "images") {
  const url = kind === "files"
    ? "https://api.etsy.com/v3/application/shops/" + SHOP_ID + "/listings/" + LISTING_ID + "/files"
    : "https://api.etsy.com/v3/application/listings/" + LISTING_ID + "/images";
  const value = await readRecord(token, url, kind.toUpperCase());
  if (!Array.isArray(value.results)) throw new Error(kind.toUpperCase() + "_INVALID");
  return value.results.filter(isRec);
}

function priceUsd(row: Rec) {
  const p = row.price;
  if (!isRec(p)) return null;
  const amount = Number(p.amount);
  const divisor = Number(p.divisor);
  if (!Number.isFinite(amount) || !Number.isFinite(divisor) || divisor <= 0) return null;
  return amount / divisor;
}

function tagsMatch(row: Rec) {
  if (!Array.isArray(row.tags)) return false;
  const tags = row.tags.map(v => typeof v === "string" ? v.normalize("NFC").trim() : "");
  return JSON.stringify(tags) === JSON.stringify(TAGS);
}

function filesMatch(rows: Rec[]) {
  const ordered = [...rows].sort((a, b) => (int(a, "rank") ?? 0) - (int(b, "rank") ?? 0));
  return ordered.length === FILES.length && ordered.every((row, i) =>
    int(row, "rank") === FILES[i].rank &&
    txt(row, "filename") === FILES[i].name &&
    Number(row.size_bytes) === FILES[i].size
  );
}

function imagesMatch(rows: Rec[]) {
  const ordered = [...rows].sort((a, b) => (int(a, "rank") ?? 0) - (int(b, "rank") ?? 0));
  return ordered.length === ALTS.length && ordered.every((row, i) =>
    int(row, "rank") === i + 1 &&
    txt(row, "alt_text") === ALTS[i] &&
    Number(row.full_width) === 2000 &&
    Number(row.full_height) === 2000
  );
}

function coreIdentity(row: Rec) {
  return {
    listingId: int(row, "listing_id"),
    shopId: int(row, "shop_id"),
    state: txt(row, "state"),
    title: txt(row, "title"),
    description: txt(row, "description"),
    tags: Array.isArray(row.tags) ? row.tags : [],
    quantity: Number(row.quantity),
    whoMade: txt(row, "who_made"),
    whenMade: txt(row, "when_made"),
    taxonomyId: Number(row.taxonomy_id),
    listingType: txt(row, "listing_type")
  };
}

function baselineIdentityMatches(row: Rec, expectedPrice: number) {
  return int(row, "listing_id") === LISTING_ID &&
    int(row, "shop_id") === SHOP_ID &&
    txt(row, "state") === "draft" &&
    txt(row, "title") === TITLE &&
    tagsMatch(row) &&
    Number(row.quantity) === 999 &&
    txt(row, "who_made") === "i_did" &&
    txt(row, "when_made") === "2020_2026" &&
    Number(row.taxonomy_id) === 12476 &&
    txt(row, "listing_type") === "download" &&
    priceUsd(row) === expectedPrice;
}

function protectedFingerprint(
  row: Rec,
  files: Rec[],
  images: Rec[],
  seller: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
) {
  const payload = {
    listing: { ...coreIdentity(row), priceUsd: priceUsd(row) },
    files: [...files].map(x => ({
      id: int(x, "listing_file_id"),
      rank: int(x, "rank"),
      name: txt(x, "filename"),
      size: Number(x.size_bytes ?? 0)
    })).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
    images: [...images].map(x => ({
      id: int(x, "listing_image_id"),
      rank: int(x, "rank"),
      alt: txt(x, "alt_text"),
      width: Number(x.full_width ?? 0),
      height: Number(x.full_height ?? 0)
    })).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
    sellerCounts: seller.counts,
    sellerListings: seller.listings.map(x => ({
      id: x.listingId,
      state: x.state,
      title: x.title
    })).sort((a, b) => a.id - b.id)
  };
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

async function stateSnapshot(token: string) {
  const [row, files, images, seller] = await Promise.all([
    listing(token),
    assets(token, "files"),
    assets(token, "images"),
    getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token })
  ]);
  return { row, files, images, seller };
}

async function plan() {
  const token = await getValidEtsyAccessToken();
  const s = await stateSnapshot(token);
  const finalAlreadyApplied =
    baselineIdentityMatches(s.row, TARGET_PRICE_USD) &&
    filesMatch(s.files) &&
    imagesMatch(s.images);
  const baselineMatches =
    baselineIdentityMatches(s.row, CURRENT_PRICE_USD) &&
    filesMatch(s.files) &&
    imagesMatch(s.images);

  return {
    status: finalAlreadyApplied ? "ALREADY_PASS" : "PLAN_ONLY",
    mode: "PDT_RPT_003_PRICE_RECOVERY_R01",
    listingId: LISTING_ID,
    state: txt(s.row, "state"),
    currentPriceUsd: priceUsd(s.row),
    targetPriceUsd: TARGET_PRICE_USD,
    galleryCount: s.images.length,
    buyerFileCount: s.files.length,
    baselineMatches,
    finalAlreadyApplied,
    protectedStateFingerprint: protectedFingerprint(s.row, s.files, s.images, s.seller),
    authorizationRequired: AUTH,
    deploymentCommit: commit(),
    publishAuthorized: false,
    ETSY_WRITE_COUNT: 0
  };
}

export async function GET(request: Request) {
  const u = new URL(request.url);
  if (u.searchParams.get("action") !== "execute") {
    try {
      return NextResponse.json(await plan(), { headers: { "cache-control": "no-store" } });
    } catch (error) {
      return NextResponse.json({
        status: "PLAN_BLOCKED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        listingId: LISTING_ID,
        publishPerformed: false,
        ETSY_WRITE_COUNT: 0
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }
  }

  let writes = 0;
  try {
    if (process.env.VERCEL_ENV !== "production") throw new Error("PRODUCTION_REQUIRED");
    if (!eq(u.searchParams.get("authorizationText")?.normalize("NFC").trim() ?? "", AUTH)) {
      throw new Error("AUTH_INVALID");
    }
    if (!eq(u.searchParams.get("nonce")?.trim() ?? "", NONCE)) throw new Error("NONCE_INVALID");

    const requestedCommit = u.searchParams.get("commit")?.trim().toLowerCase() ?? "";
    if (!/^[a-f0-9]{40}$/.test(requestedCommit) || !eq(requestedCommit, commit())) {
      throw new Error("COMMIT_MISMATCH");
    }

    const suppliedFingerprint = u.searchParams.get("protectedStateFingerprint")?.trim().toLowerCase() ?? "";
    if (!/^[a-f0-9]{64}$/.test(suppliedFingerprint)) throw new Error("PROTECTED_FP_INVALID");

    const token = await getValidEtsyAccessToken();
    const before = await stateSnapshot(token);

    if (baselineIdentityMatches(before.row, TARGET_PRICE_USD) && filesMatch(before.files) && imagesMatch(before.images)) {
      return NextResponse.json({
        status: "ALREADY_PASS",
        listingId: LISTING_ID,
        priceUsd: TARGET_PRICE_USD,
        galleryCount: 10,
        buyerFileCount: 2,
        state: "draft",
        publishPerformed: false,
        ETSY_WRITE_COUNT: 0
      }, { headers: { "cache-control": "no-store" } });
    }

    if (!baselineIdentityMatches(before.row, CURRENT_PRICE_USD)) throw new Error("LISTING_BASELINE_MISMATCH");
    if (!filesMatch(before.files)) throw new Error("BUYER_FILES_MISMATCH");
    if (!imagesMatch(before.images)) throw new Error("GALLERY_MISMATCH");
    if (!eq(protectedFingerprint(before.row, before.files, before.images, before.seller), suppliedFingerprint)) {
      throw new Error("PROTECTED_STATE_DRIFT");
    }

    const beforeCore = JSON.stringify(coreIdentity(before.row));
    const beforeFiles = JSON.stringify(before.files.map(x => ({
      id: int(x, "listing_file_id"),
      rank: int(x, "rank"),
      name: txt(x, "filename"),
      size: Number(x.size_bytes ?? 0)
    })).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)));
    const beforeImages = JSON.stringify(before.images.map(x => ({
      id: int(x, "listing_image_id"),
      rank: int(x, "rank"),
      alt: txt(x, "alt_text"),
      width: Number(x.full_width ?? 0),
      height: Number(x.full_height ?? 0)
    })).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)));

    const response = await fetch(
      "https://api.etsy.com/v3/application/shops/" + SHOP_ID + "/listings/" + LISTING_ID,
      {
        method: "PATCH",
        headers: {
          ...etsyApiHeaders(token),
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ price: TARGET_PRICE_USD.toFixed(2) }),
        cache: "no-store"
      }
    );
    if (!response.ok) throw new Error("PRICE_PATCH_HTTP_" + response.status);
    writes = 1;

    const after = await stateSnapshot(token);
    if (!baselineIdentityMatches(after.row, TARGET_PRICE_USD)) throw new Error("FINAL_LISTING_MISMATCH");
    if (!filesMatch(after.files)) throw new Error("FINAL_BUYER_FILES_MISMATCH");
    if (!imagesMatch(after.images)) throw new Error("FINAL_GALLERY_MISMATCH");
    if (JSON.stringify(coreIdentity(after.row)) !== beforeCore) throw new Error("CORE_METADATA_DRIFT");

    const afterFiles = JSON.stringify(after.files.map(x => ({
      id: int(x, "listing_file_id"),
      rank: int(x, "rank"),
      name: txt(x, "filename"),
      size: Number(x.size_bytes ?? 0)
    })).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)));
    const afterImages = JSON.stringify(after.images.map(x => ({
      id: int(x, "listing_image_id"),
      rank: int(x, "rank"),
      alt: txt(x, "alt_text"),
      width: Number(x.full_width ?? 0),
      height: Number(x.full_height ?? 0)
    })).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)));

    if (afterFiles !== beforeFiles) throw new Error("BUYER_FILES_DRIFT");
    if (afterImages !== beforeImages) throw new Error("GALLERY_DRIFT");
    if (after.seller.total !== before.seller.total || JSON.stringify(after.seller.counts) !== JSON.stringify(before.seller.counts)) {
      throw new Error("SELLER_STATE_DRIFT");
    }

    return NextResponse.json({
      status: "PRICE_RECOVERY_PASS",
      listingId: LISTING_ID,
      previousPriceUsd: CURRENT_PRICE_USD,
      priceUsd: TARGET_PRICE_USD,
      galleryCount: 10,
      buyerFileCount: 2,
      state: "draft",
      publishPerformed: false,
      ETSY_WRITE_COUNT: writes
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      status: writes > 0 ? "RECONCILIATION_REQUIRED" : "BLOCKED_FAIL_CLOSED",
      error: error instanceof Error ? error.message : "UNKNOWN",
      listingId: LISTING_ID,
      publishPerformed: false,
      ETSY_WRITE_COUNT: writes
    }, {
      status: writes > 0 ? 202 : 409,
      headers: { "cache-control": "no-store" }
    });
  }
}
