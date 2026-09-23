import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  ETSY_SELLER_WRITE_SCOPES,
  etsyApiHeaders
} from "../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../lib/etsy-seller-state-reconciliation";
import { PDT_RPT_003_R02 as R02 } from "../../../../../lib/pdt-rpt-003-r02";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

function eq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function text(v: unknown) {
  return typeof v === "string" ? v.normalize("NFC").trim() : "";
}
function decodeEntities(v: string) {
  return v
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
function money(v: unknown) {
  if (!isRec(v)) return NaN;
  const amount = Number(v.amount);
  const divisor = Number(v.divisor);
  return Number.isFinite(amount) && Number.isFinite(divisor) && divisor !== 0 ? amount / divisor : NaN;
}
async function json(r: Response) {
  const t = await r.text();
  if (!t) return {};
  try { return JSON.parse(t) as unknown; } catch { return {}; }
}
async function rec(token: string, url: string, code: string) {
  const r = await fetch(url, { headers: etsyApiHeaders(token), cache: "no-store" });
  const payload = await json(r);
  if (!r.ok || !isRec(payload)) throw new Error(code + "_HTTP_" + r.status);
  return payload;
}
async function listing(token: string) {
  return rec(token, "https://api.etsy.com/v3/application/listings/" + R02.listingId, "LISTING");
}
async function collection(token: string, kind: "images" | "files" | "videos") {
  const url =
    kind === "images"
      ? "https://api.etsy.com/v3/application/listings/" + R02.listingId + "/images"
      : kind === "files"
        ? "https://api.etsy.com/v3/application/shops/" + R02.shopId + "/listings/" + R02.listingId + "/files"
        : "https://api.etsy.com/v3/application/listings/" + R02.listingId + "/videos";
  const v = await rec(token, url, kind.toUpperCase());
  if (!Array.isArray(v.results)) throw new Error(kind.toUpperCase() + "_INVALID");
  return v.results.filter(isRec);
}
async function snapshot(token: string) {
  const [l, images, files, videos, seller] = await Promise.all([
    listing(token),
    collection(token, "images"),
    collection(token, "files"),
    collection(token, "videos"),
    getEtsySellerStateSnapshot({ shopId: R02.shopId, accessToken: token })
  ]);
  return { l, images, files, videos, seller };
}
function tagsExact(v: unknown) {
  return Array.isArray(v) && v.length === R02.tags.length && v.every((x, i) => text(x) === R02.tags[i]);
}
function coreExact(l: Rec, state: "draft" | "active") {
  return Number(l.listing_id) === R02.listingId &&
    Number(l.shop_id) === R02.shopId &&
    text(l.state) === state &&
    text(l.title) === R02.title &&
    decodeEntities(text(l.description)) === R02.description &&
    Number(money(l.price).toFixed(2)) === R02.priceUsd &&
    Number(l.quantity) === R02.quantity &&
    Number(l.taxonomy_id) === R02.taxonomyId &&
    text(l.who_made) === R02.whoMade &&
    text(l.when_made) === R02.whenMade &&
    (text(l.listing_type) || text(l.type) || "download") === R02.type &&
    tagsExact(l.tags);
}
function filesFinal(rows: Rec[]) {
  return rows.length === 1 &&
    text(rows[0].filename) === R02.zip.name &&
    Number(rows[0].size_bytes) === R02.zip.size &&
    Number(rows[0].rank) === 1;
}
function imagesFinal(rows: Rec[]) {
  const a = [...rows].sort((x, y) => Number(x.rank ?? 0) - Number(y.rank ?? 0));
  return a.length === 10 && a.every((r, i) =>
    Number(r.rank) === i + 1 &&
    Number(r.full_width) === 2000 &&
    Number(r.full_height) === 2000 &&
    decodeEntities(text(r.alt_text)) === R02.images[i].alt
  );
}
function videoActive(rows: Rec[]) {
  return rows.length === 1 &&
    Number(rows[0].width) === R02.video.width &&
    Number(rows[0].height) === R02.video.height &&
    text(rows[0].video_state).toLowerCase() === "active";
}
function sellerDraftSafe(s: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>) {
  const row = s.listings.find(x => x.listingId === R02.listingId);
  return s.total === 5 && s.counts.active === 3 && s.counts.draft === 2 &&
    s.counts.inactive === 0 && s.counts.sold_out === 0 && s.counts.expired === 0 &&
    Boolean(row && row.state === "draft");
}
function sellerActiveSafe(s: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>) {
  const row = s.listings.find(x => x.listingId === R02.listingId);
  return s.total === 5 && s.counts.active === 4 && s.counts.draft === 1 &&
    s.counts.inactive === 0 && s.counts.sold_out === 0 && s.counts.expired === 0 &&
    Boolean(row && row.state === "active");
}
function prepReady(s: Awaited<ReturnType<typeof snapshot>>) {
  return coreExact(s.l, "draft") &&
    imagesFinal(s.images) &&
    filesFinal(s.files) &&
    videoActive(s.videos) &&
    sellerDraftSafe(s.seller);
}
function liveReady(s: Awaited<ReturnType<typeof snapshot>>) {
  return coreExact(s.l, "active") &&
    imagesFinal(s.images) &&
    filesFinal(s.files) &&
    videoActive(s.videos) &&
    sellerActiveSafe(s.seller);
}
function fingerprint(s: Awaited<ReturnType<typeof snapshot>>) {
  const payload = {
    listing: {
      id: Number(s.l.listing_id),
      shopId: Number(s.l.shop_id),
      state: text(s.l.state),
      title: text(s.l.title),
      description: decodeEntities(text(s.l.description)),
      price: Number(money(s.l.price).toFixed(2)),
      quantity: Number(s.l.quantity),
      taxonomyId: Number(s.l.taxonomy_id),
      tags: Array.isArray(s.l.tags) ? s.l.tags.map(text) : []
    },
    images: [...s.images]
      .sort((a, b) => Number(a.rank ?? 0) - Number(b.rank ?? 0))
      .map(r => ({ id: Number(r.listing_image_id), rank: Number(r.rank), alt: decodeEntities(text(r.alt_text)), w: Number(r.full_width), h: Number(r.full_height) })),
    files: [...s.files]
      .sort((a, b) => Number(a.rank ?? 0) - Number(b.rank ?? 0))
      .map(r => ({ id: Number(r.listing_file_id), rank: Number(r.rank), name: text(r.filename), size: Number(r.size_bytes) })),
    videos: s.videos.map(r => ({ id: Number(r.video_id), state: text(r.video_state), w: Number(r.width), h: Number(r.height) })),
    seller: {
      counts: s.seller.counts,
      total: s.seller.total,
      listings: s.seller.listings.map(x => ({ id: x.listingId, state: x.state, title: x.title })).sort((a, b) => a.id - b.id)
    }
  };
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}
function runtimeCommit() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? "";
}
async function activate(token: string) {
  const body = new URLSearchParams({ state: "active" });
  const r = await fetch(
    "https://api.etsy.com/v3/application/shops/" + R02.shopId + "/listings/" + R02.listingId,
    { method: "PATCH", headers: { ...etsyApiHeaders(token), "content-type": "application/x-www-form-urlencoded" }, body, cache: "no-store" }
  );
  const payload = await json(r);
  if (!r.ok) throw new Error("ACTIVATE_HTTP_" + r.status + ":" + JSON.stringify(payload).slice(0, 400));
}
async function plan() {
  const token = await getValidEtsyAccessToken();
  const s = await snapshot(token);
  return {
    status: "PLAN_ONLY",
    mode: "PDT_RPT_003_ACTIVATE_R02",
    listingId: R02.listingId,
    state: text(s.l.state),
    prepReady: prepReady(s),
    alreadyLive: liveReady(s),
    galleryCount: s.images.length,
    buyerFileCount: s.files.length,
    videoCount: s.videos.length,
    videoStates: s.videos.map(v => text(v.video_state)),
    sellerCounts: s.seller.counts,
    protectedStateFingerprint: fingerprint(s),
    authorizationRequired: R02.activateAuthorization,
    executionNonce: R02.activateNonce,
    deploymentCommit: runtimeCommit(),
    ETSY_WRITE_COUNT: 0
  };
}

export async function GET(request: Request) {
  const u = new URL(request.url);
  if (u.searchParams.get("action") !== "execute") {
    try {
      return NextResponse.json(await plan(), { headers: { "cache-control": "no-store" } });
    } catch (e) {
      return NextResponse.json(
        { status: "PLAN_BLOCKED", error: e instanceof Error ? e.message : "UNKNOWN", ETSY_WRITE_COUNT: 0 },
        { status: 409, headers: { "cache-control": "no-store" } }
      );
    }
  }

  let writes = 0;
  try {
    if (process.env.VERCEL_ENV !== "production") throw new Error("PRODUCTION_REQUIRED");
    if (!eq(u.searchParams.get("authorizationText")?.normalize("NFC").trim() ?? "", R02.activateAuthorization)) throw new Error("AUTH_INVALID");
    if (!eq(u.searchParams.get("nonce")?.trim() ?? "", R02.activateNonce)) throw new Error("NONCE_INVALID");

    const commit = u.searchParams.get("commit")?.trim().toLowerCase() ?? "";
    const deployed = runtimeCommit();
    if (!/^[a-f0-9]{40}$/.test(commit) || !/^[a-f0-9]{40}$/.test(deployed) || !eq(commit, deployed)) throw new Error("GIT_VERCEL_COMMIT_MISMATCH");

    const suppliedFp = u.searchParams.get("protectedStateFingerprint")?.trim().toLowerCase() ?? "";
    if (!/^[a-f0-9]{64}$/.test(suppliedFp)) throw new Error("PROTECTED_FP_INVALID");

    const token = await getValidEtsyAccessToken(ETSY_SELLER_WRITE_SCOPES);
    const before = await snapshot(token);

    if (liveReady(before)) {
      return NextResponse.json({
        status: "ALREADY_LIVE_PASS",
        listingId: R02.listingId,
        state: "active",
        url: "https://www.etsy.com/listing/" + R02.listingId,
        ETSY_WRITE_COUNT: 0
      }, { headers: { "cache-control": "no-store" } });
    }

    if (!prepReady(before)) throw new Error("RELEASE_PREP_NOT_READY");
    if (!eq(fingerprint(before), suppliedFp)) throw new Error("PROTECTED_STATE_DRIFT");

    const protectedBefore = before.seller.listings
      .filter(x => x.listingId !== R02.listingId)
      .map(x => ({ id: x.listingId, state: x.state, title: x.title }))
      .sort((a, b) => a.id - b.id);

    await activate(token);
    writes = 1;

    const after = await snapshot(token);
    if (!liveReady(after)) throw new Error("FINAL_LIVE_READBACK_MISMATCH");

    const protectedAfter = after.seller.listings
      .filter(x => x.listingId !== R02.listingId)
      .map(x => ({ id: x.listingId, state: x.state, title: x.title }))
      .sort((a, b) => a.id - b.id);
    if (JSON.stringify(protectedAfter) !== JSON.stringify(protectedBefore)) throw new Error("OTHER_LISTING_DRIFT");

    return NextResponse.json({
      status: "PDT_RPT_003_LIVE_PASS",
      listingId: R02.listingId,
      state: "active",
      url: "https://www.etsy.com/listing/" + R02.listingId,
      title: R02.title,
      priceUsd: R02.priceUsd,
      galleryCount: after.images.length,
      buyerFileCount: after.files.length,
      videoCount: after.videos.length,
      sellerCounts: after.seller.counts,
      ETSY_WRITE_COUNT: writes
    }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({
      status: writes > 0 ? "RECONCILIATION_REQUIRED" : "BLOCKED_FAIL_CLOSED",
      error: e instanceof Error ? e.message : "UNKNOWN",
      listingId: R02.listingId,
      ETSY_WRITE_COUNT: writes
    }, { status: writes > 0 ? 202 : 409, headers: { "cache-control": "no-store" } });
  }
}
