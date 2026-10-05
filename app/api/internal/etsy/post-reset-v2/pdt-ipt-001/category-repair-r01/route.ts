import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ETSY_SELLER_READ_SCOPES, ETSY_SELLER_WRITE_SCOPES, etsyApiHeaders } from "../../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import { getStoredEtsyShopId } from "../../../../../../../lib/token-store";

import { enforceBuildGateForRoute } from "../../../../../../../lib/product-creation-plan";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = 23582741;
const LISTING_ID = 4578945050;
const CURRENT_TAXONOMY_ID = 12476;
const TARGET_NAME = "Bookkeeping Templates";
const AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-IPT-001-ETSY-CATEGORY-REPAIR-R01-20260928 LISTING-4578945050 CATEGORY-ONLY EXACT SCOPE ONLY";
const GATE = "[GATE_IPT_CATEGORY_REPAIR_R01_EXECUTE]";
const EXPECTED_TITLE =
  "Invoice Payment Tracker Excel | Accounts Receivable Aging & Follow-Up Spreadsheet for Small Business";
const EXPECTED_TAGS = Object.freeze([
  "invoice tracker","payment tracker","accounts receivable","invoice spreadsheet","overdue invoices",
  "partial payments","client payment log","small business excel","ar aging report","follow up tracker",
  "invoice dashboard","outstanding balance","receivable tracker"
]);

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const txt = (v: unknown) => typeof v === "string" ? v.normalize("NFC").trim() : "";
const num = (v: unknown) => Number(v);
const secureEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v), "utf8").digest("hex");
const gateEnabled = () => false;

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}
async function getRecord(token: string, url: string, code: string) {
  const r = await fetch(url, { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" });
  const v = await parseJson(r);
  if (!r.ok || !isRec(v)) throw new Error(code + "_HTTP_" + r.status);
  return v;
}
function results(v: unknown) {
  return isRec(v) && Array.isArray(v.results) ? v.results.filter(isRec) : [];
}
function findByName(nodes: Rec[], name: string, ancestors: string[] = []):
  Array<{ id: number; name: string; path: string[] }> {
  const out: Array<{ id: number; name: string; path: string[] }> = [];
  for (const node of nodes) {
    const nodeName = txt(node.name);
    const path = nodeName ? [...ancestors, nodeName] : ancestors;
    if (nodeName.toLowerCase() === name.toLowerCase() && Number.isSafeInteger(num(node.id))) {
      out.push({ id: num(node.id), name: nodeName, path });
    }
    const children = Array.isArray(node.children) ? node.children.filter(isRec) : [];
    out.push(...findByName(children, name, path));
  }
  return out;
}
function moneyIs799(v: unknown) {
  return isRec(v) && num(v.amount) === 799 && num(v.divisor) === 100 && txt(v.currency_code) === "USD";
}
function sameTags(v: unknown) {
  return Array.isArray(v) && v.length === EXPECTED_TAGS.length &&
    v.every((x, i) => txt(x) === EXPECTED_TAGS[i]);
}
function normalizeState(listing: Rec, images: Rec[], files: Rec[], videos: Rec[]) {
  return {
    listing: {
      listingId: num(listing.listing_id), shopId: num(listing.shop_id), state: txt(listing.state),
      title: txt(listing.title), description: txt(listing.description), price: listing.price,
      taxonomyId: num(listing.taxonomy_id), quantity: num(listing.quantity), tags: listing.tags,
      whoMade: txt(listing.who_made), whenMade: txt(listing.when_made),
      listingType: txt(listing.listing_type)
    },
    images: images.map(x => ({
      id: num(x.listing_image_id), rank: num(x.rank), width: num(x.full_width), height: num(x.full_height),
      altText: txt(x.alt_text), url: txt(x.url_fullxfull)
    })),
    files: files.map(x => ({
      id: num(x.listing_file_id), rank: num(x.rank), filename: txt(x.filename), size: num(x.size_bytes)
    })),
    videos: videos.map(x => ({
      id: num(x.video_id), state: txt(x.video_state), width: num(x.width), height: num(x.height)
    }))
  };
}
function withoutTaxonomy(state: ReturnType<typeof normalizeState>) {
  return { ...state, listing: { ...state.listing, taxonomyId: 0 } };
}
async function readState(token: string) {
  const base = "https://api.etsy.com/v3/application";
  const [listing, imagesPayload, filesPayload, videosPayload, taxonomyPayload] = await Promise.all([
    getRecord(token, base + "/listings/" + LISTING_ID, "LISTING"),
    getRecord(token, base + "/listings/" + LISTING_ID + "/images", "IMAGES"),
    getRecord(token, base + "/shops/" + SHOP_ID + "/listings/" + LISTING_ID + "/files", "FILES"),
    getRecord(token, base + "/listings/" + LISTING_ID + "/videos", "VIDEOS"),
    getRecord(token, base + "/seller-taxonomy/nodes", "TAXONOMY")
  ]);
  const images = results(imagesPayload).sort((a,b) => num(a.rank) - num(b.rank));
  const files = results(filesPayload).sort((a,b) => num(a.rank) - num(b.rank));
  const videos = results(videosPayload);
  const targetMatches = findByName(results(taxonomyPayload), TARGET_NAME);
  const normalized = normalizeState(listing, images, files, videos);
  const checks = {
    listingId: normalized.listing.listingId === LISTING_ID,
    shopId: normalized.listing.shopId === SHOP_ID,
    active: normalized.listing.state === "active",
    title: normalized.listing.title === EXPECTED_TITLE,
    price: moneyIs799(listing.price),
    currentTaxonomy: normalized.listing.taxonomyId === CURRENT_TAXONOMY_ID,
    quantity: normalized.listing.quantity === 999,
    tags: sameTags(listing.tags),
    maker: normalized.listing.whoMade === "i_did",
    whenMade: normalized.listing.whenMade === "2020_2026",
    type: normalized.listing.listingType === "download",
    aiDisclosure: normalized.listing.description.includes("AI DISCLOSURE"),
    gallery: normalized.images.length === 10 && normalized.images.every((x,i) =>
      x.rank === i + 1 && x.width === 2000 && x.height === 2000 && !!x.altText && x.id > 0 && !!x.url),
    buyerFiles: normalized.files.length === 2 && normalized.files.every(x => x.id > 0 && !!x.filename && x.size > 0),
    video: normalized.videos.length === 1 && normalized.videos.every(x => x.id > 0 && x.state.toLowerCase() === "active"),
    targetTaxonomyUnique: targetMatches.length === 1
  };
  return {
    listing, normalized, checks, targetMatches,
    baselineSha256: sha(normalized),
    protectedWithoutTaxonomySha256: sha(withoutTaxonomy(normalized)),
    ready: Object.values(checks).every(Boolean)
  };
}
async function patchTaxonomy(token: string, taxonomyId: number) {
  const url = "https://api.etsy.com/v3/application/shops/" + SHOP_ID + "/listings/" + LISTING_ID;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { ...etsyApiHeaders(token), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ taxonomy_id: String(taxonomyId) }),
    cache: "no-store"
  });
  const payload = await parseJson(r);
  if (!r.ok) throw new Error("CATEGORY_PATCH_HTTP_" + r.status + ":" + JSON.stringify(payload).slice(0,160));
}

async function executeCategoryRepair(body: Rec) {
  let writes = 0;
  try {
    if (!gateEnabled()) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"CATEGORY_REPAIR_GATE_DISABLED",ETSY_WRITE_COUNT:0},{status:403});
    const auth = txt(body.authorizationText);
    const expectedBaseline = txt(body.baselineSha256).toLowerCase();
    if (!secureEqual(auth, AUTHORIZATION_TEXT)) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"AUTHORIZATION_INVALID",ETSY_WRITE_COUNT:0},{status:401});
    if (!/^[a-f0-9]{64}$/.test(expectedBaseline)) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"BASELINE_INVALID",ETSY_WRITE_COUNT:0},{status:409});

    const shopId = await getStoredEtsyShopId();
    if (shopId !== SHOP_ID) throw new Error("SHOP_ID_MISMATCH");
    const token = await getValidEtsyAccessToken(ETSY_SELLER_WRITE_SCOPES);
    const before = await readState(token);
    if (!before.ready || !secureEqual(expectedBaseline, before.baselineSha256)) {
      return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"FRESH_BASELINE_MISMATCH",actualBaselineSha256:before.baselineSha256,checks:before.checks,ETSY_WRITE_COUNT:0},{status:409});
    }
    const target = before.targetMatches[0];
    if (!target || target.id === CURRENT_TAXONOMY_ID) {
      return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"TARGET_TAXONOMY_INVALID",ETSY_WRITE_COUNT:0},{status:409});
    }

    await patchTaxonomy(token, target.id);
    writes = 1;
    const after = await readState(token);
    const protectedUnchanged = secureEqual(before.protectedWithoutTaxonomySha256, after.protectedWithoutTaxonomySha256);
    const categoryChangedOnly =
      after.normalized.listing.taxonomyId === target.id &&
      protectedUnchanged &&
      after.normalized.listing.state === "active";

    return NextResponse.json({
      status: categoryChangedOnly ? "PDT_IPT_001_CATEGORY_REPAIR_R01_PASS" : "RECONCILIATION_REQUIRED",
      productId:"PDT-IPT-001", listingId:LISTING_ID,
      taxonomyBefore: CURRENT_TAXONOMY_ID, taxonomyAfter: after.normalized.listing.taxonomyId,
      targetTaxonomy: target, protectedFieldsUnchanged: protectedUnchanged,
      authorizationConsumed: true, ETSY_WRITE_COUNT: 1
    }, { status: categoryChangedOnly ? 200 : 202, headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({
      status: writes > 0 ? "RECONCILIATION_REQUIRED" : "BLOCKED_FAIL_CLOSED",
      error: e instanceof Error ? e.message : "UNKNOWN",
      ETSY_WRITE_COUNT: writes
    }, { status: writes > 0 ? 202 : 409, headers: { "cache-control": "no-store" } });
  }
}

export async function GET(request: Request) {
  // BLOCKER 1 — CENTRAL BUILD GATE (verifies plan approval; LEGACY_EXEMPT passes through)
  const _buildGateBlock = await enforceBuildGateForRoute("PDT-IPT-001", "IPT_001_CATEGORY_REPAIR_R01");
  if (_buildGateBlock) return _buildGateBlock;

  const url = new URL(request.url);
  if (url.searchParams.get("action") === "execute") {
    return executeCategoryRepair({
      authorizationText: url.searchParams.get("authorizationText") ?? "",
      baselineSha256: url.searchParams.get("baselineSha256") ?? ""
    });
  }
  try {
    const shopId = await getStoredEtsyShopId();
    if (shopId !== SHOP_ID) throw new Error("SHOP_ID_MISMATCH");
    const token = await getValidEtsyAccessToken(ETSY_SELLER_READ_SCOPES);
    const s = await readState(token);
    const target = s.targetMatches[0] ?? null;
    return NextResponse.json({
      status: s.ready ? "CATEGORY_REPAIR_PREVIEW_PASS" : "CATEGORY_REPAIR_PREVIEW_BLOCKED",
      mode: "READ_ONLY",
      productId: "PDT-IPT-001", listingId: LISTING_ID,
      currentTaxonomyId: s.normalized.listing.taxonomyId,
      targetTaxonomy: target,
      checks: s.checks,
      baselineSha256: s.baselineSha256,
      protectedWithoutTaxonomySha256: s.protectedWithoutTaxonomySha256,
      exactScope: "CATEGORY_ONLY",
      authorizationRequired: AUTHORIZATION_TEXT,
      gateEnabled: gateEnabled(),
      ETSY_WRITE_COUNT: 0
    }, { status: s.ready ? 200 : 409, headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({
      status: "CATEGORY_REPAIR_PREVIEW_BLOCKED",
      error: e instanceof Error ? e.message : "UNKNOWN",
      ETSY_WRITE_COUNT: 0
    }, { status: 409, headers: { "cache-control": "no-store" } });
  }
}

export async function POST(request: Request) {
  // BLOCKER 1 — CENTRAL BUILD GATE (verifies plan approval; LEGACY_EXEMPT passes through)
  const _buildGateBlock = await enforceBuildGateForRoute("PDT-IPT-001", "IPT_001_CATEGORY_REPAIR_R01_POST");
  if (_buildGateBlock) return _buildGateBlock;

  const body = await request.json().catch(() => ({}));
  if (!isRec(body)) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"INVALID_BODY",ETSY_WRITE_COUNT:0},{status:400});
  return executeCategoryRepair(body);
}
