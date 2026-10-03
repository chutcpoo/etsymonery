import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHOP_ID = 23582741;
const LISTING_ID = 4587646332;
const AUTHORIZATION_ID = "PDT-CSCH-001-V1-ETSY-COMPLETE-R01-20261003";
const GATE = "[GATE_CSCH_COMPLETE_R01]";
const TITLE = "Cleaning Schedule Template for Cleaning Business, Daily Weekly Monthly Cleaner Schedule, Editable Excel Cleaning Planner";
const DESCRIPTION = "Run recurring cleaning work with a clearer system. This editable Cleaning Schedule Template is designed for solo cleaners, small cleaning teams, residential cleaning businesses and commercial cleaning businesses. Plan one task per row, choose frequency and due date, assign a cleaner or team, set priority and status, enter estimated minutes, and add notes. The built-in Dashboard and Reports summarize workload, completion, status, priority, estimated time and follow-up needs. The download includes a blank Template workbook, a completed 6-task Example workbook and a 10-page User Guide. Microsoft Excel Desktop is the primary intended environment. Excel Online and Google Sheets should be verified after opening or import. Digital download only; no physical item is shipped.";
const TAGS = ["cleaning schedule", "cleaning business", "cleaning checklist", "cleaning planner", "cleaner schedule", "maid schedule", "weekly cleaning", "monthly cleaning", "cleaning template", "cleaning spreadsheet", "cleaning tracker", "service schedule", "business template"];

type Spec = { name: string; size: number; sha: string; mime: string };
const FILES: Spec[] = [
  { name: "Cleaning Schedule Template.xlsx", size: 28808, sha: "b88fda146c21e7cb4bdcb6d319124a4ed13a396f8a570a0112d25c8c2c7e0832", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { name: "Cleaning Schedule Example.xlsx", size: 37887, sha: "5bcde173b334c4c2d947e505d06a4be91320ac27d838f96be99bbe80c3e4b64a", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { name: "Cleaning Schedule User Guide.pdf", size: 148361, sha: "5f015dda7253af807e6497e3b89491d75d2287208539c4f6d040e813780efc88", mime: "application/pdf" }
];
const IMAGES: Spec[] = [
  ["01_Hero.jpg", 633369, "263aa46a8cd85dd28a8ee138b93f83963033f4c2970ce783ebd77060624c392a"],
  ["02_What_You_Get.jpg", 530694, "f5643284b6759b8df1b8b76cb5cba2851eb134de8eb28946b11d6bf9803fb5ff"],
  ["03_Before_After_Schedule.jpg", 571178, "fb458be25e1045f84c8c8aa1069f2335159b396f0673dab6b99b141d12b40908"],
  ["04_Before_After_Dashboard.jpg", 509896, "1a3af3860586a766ca66e4a6848abdc8fce30a79db834383e1c5eaf85597e4af"],
  ["05_Before_After_Reports.jpg", 673593, "c8a3c2dcc3cdb0d2ddb435ffe52cd8d62f8638cac4d79a0cf8f5d46629f8e426"],
  ["06_Setup.jpg", 549611, "74f44d5e3cf9dba64ff7bd46379d0b927c83bcbe1592ecc53c0b9939217487ff"],
  ["07_How_It_Works.jpg", 718896, "79b6bc2de23714848b84369c3fdb7de3969d5fc97db35d539afe980ce696796b"],
  ["08_Who_Its_For.jpg", 619306, "6f13bee09888f29e39d53bcdbde728e5fa05599d650783a8ad6ab9f7eaed2359"],
  ["09_Compatibility_Notes.jpg", 512825, "ee3af8a1b6ac5b30ca4de59803679808d7dbb9e149a3e0e9484a30f514ec8db3"],
  ["10_Collection_Cross_Sell.jpg", 702533, "98fd21ec9a0f04206e46a6cb4b21a2a06914785a16ea7c8ad6e4b5d5c4426698"]
].map(([name, size, sha]) => ({ name: String(name), size: Number(size), sha: String(sha), mime: "image/jpeg" }));
const VIDEO: Spec = { name: "Cleaning_Schedule_Listing_Video.mp4", size: 1159059, sha: "daae7a7590f7e9a4c74eca40803e5f2a0ef25b259306f42789da3a394037c9e6", mime: "video/mp4" };

function hash(v: Buffer) { return createHash("sha256").update(v).digest("hex"); }
function secure(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
function gate() { return process.env.VERCEL_ENV === "production" && (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").includes(GATE); }
function multipartHeaders(token: string) { const h = etsyApiHeaders(token); delete h["content-type"]; return h; }
async function json(r: Response) { const t = await r.text(); try { return t ? JSON.parse(t) : {}; } catch { return {}; } }
async function get(token: string, path: string) { const r = await fetch("https://api.etsy.com/v3/application" + path, { headers: etsyApiHeaders(token), cache: "no-store" }); if (!r.ok) throw new Error(`GET_${path}_${r.status}`); return json(r); }
function rows(v: any) { return Array.isArray(v?.results) ? v.results : []; }
function priceOk(v: any) { return Number(v?.amount) / Number(v?.divisor) === 5.9 && v?.currency_code === "USD"; }
function tagsOk(v: any) { return Array.isArray(v) && v.length === TAGS.length && v.every((x: string, i: number) => x === TAGS[i]); }

async function snapshot(token: string) {
  const [listing, imagesP, filesP, videosP, sectionsP] = await Promise.all([
    get(token, `/listings/${LISTING_ID}`),
    get(token, `/listings/${LISTING_ID}/images`),
    get(token, `/shops/${SHOP_ID}/listings/${LISTING_ID}/files`),
    get(token, `/listings/${LISTING_ID}/videos`),
    get(token, `/shops/${SHOP_ID}/sections`)
  ]);
  return { listing, images: rows(imagesP), files: rows(filesP), videos: rows(videosP), sections: rows(sectionsP) };
}
function coreOk(s: any, allowActive = false) {
  const l = s.listing; const state = String(l?.state ?? "");
  return Number(l?.listing_id) === LISTING_ID && Number(l?.shop_id) === SHOP_ID &&
    (state === "draft" || (allowActive && state === "active")) && String(l?.title ?? "") === TITLE &&
    String(l?.description ?? "").trim() === DESCRIPTION && priceOk(l?.price) && Number(l?.quantity) === 999 &&
    Number(l?.taxonomy_id) === 12476 && tagsOk(l?.tags);
}
function fileRowsOk(a: any[]) {
  if (a.length !== FILES.length) return false;
  const x = [...a].sort((p, q) => Number(p.rank) - Number(q.rank));
  return x.every((r, i) => Number(r.rank) === i + 1 && String(r.filename) === FILES[i].name && Number(r.size_bytes) === FILES[i].size);
}
function imageRowsOk(a: any[]) {
  if (a.length !== IMAGES.length) return false;
  const x = [...a].sort((p, q) => Number(p.rank) - Number(q.rank));
  return x.every((r, i) => Number(r.rank) === i + 1);
}
function videoRowsOk(a: any[]) { return a.length === 1 && String(a[0]?.video_state ?? "") === "active"; }
function summarize(s: any) { return { state: s.listing?.state, images: s.images.length, files: s.files.length, videos: s.videos.map((v: any) => ({ id: v.video_id, state: v.video_state })), sectionTitles: s.sections.map((x: any) => x.title) }; }
function authError(request: Request) {
  if (!gate()) return "GATE_DISABLED";
  if ((request.headers.get("x-operation-id") ?? "") !== AUTHORIZATION_ID) return "OPERATION_ID_INVALID";
  return "";
}
async function assetBytes(file: File, spec: Spec) {
  if (file.name !== spec.name) throw new Error("ASSET_NAME_MISMATCH");
  const b = Buffer.from(await file.arrayBuffer());
  if (b.length !== spec.size) throw new Error("ASSET_SIZE_MISMATCH");
  if (!secure(hash(b), spec.sha)) throw new Error("ASSET_SHA256_MISMATCH");
  return b;
}
async function uploadBuyerFile(token: string, spec: Spec, rank: number, b: Buffer) {
  const f = new FormData();
  f.append("file", new File([new Uint8Array(b)], spec.name, { type: spec.mime }), spec.name);
  f.append("name", spec.name); f.append("rank", String(rank));
  const r = await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${LISTING_ID}/files`, { method: "POST", headers: multipartHeaders(token), body: f, cache: "no-store" });
  if (!r.ok) throw new Error(`BUYER_FILE_UPLOAD_HTTP_${r.status}`);
  return json(r);
}
async function uploadImage(token: string, spec: Spec, rank: number, b: Buffer) {
  const f = new FormData(); f.append("image", new File([new Uint8Array(b)], spec.name, { type: spec.mime }), spec.name); f.append("rank", String(rank));
  const r = await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${LISTING_ID}/images`, { method: "POST", headers: multipartHeaders(token), body: f, cache: "no-store" });
  if (!r.ok) throw new Error(`IMAGE_UPLOAD_HTTP_${r.status}`);
  return json(r);
}
async function uploadVideo(token: string, spec: Spec, b: Buffer) {
  const f = new FormData(); f.append("video", new File([new Uint8Array(b)], spec.name, { type: spec.mime }), spec.name);
  const r = await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${LISTING_ID}/videos`, { method: "POST", headers: multipartHeaders(token), body: f, cache: "no-store" });
  if (!r.ok) throw new Error(`VIDEO_UPLOAD_HTTP_${r.status}`);
  return json(r);
}
async function patchListing(token: string, params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const r = await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${LISTING_ID}`, { method: "PATCH", headers: { ...etsyApiHeaders(token), "content-type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  if (!r.ok) throw new Error(`LISTING_PATCH_HTTP_${r.status}`);
  return json(r);
}
async function sleep(ms: number) { await new Promise(r => setTimeout(r, ms)); }

export async function GET() {
  try {
    const token = await getValidEtsyAccessToken(); const s = await snapshot(token);
    return NextResponse.json({ status: "READ_ONLY", coreOk: coreOk(s, true), assets: { images: imageRowsOk(s.images), files: fileRowsOk(s.files), video: videoRowsOk(s.videos) }, summary: summarize(s), ETSY_WRITE_COUNT: 0 }, { headers: { "cache-control": "no-store" } });
  } catch (e) { return NextResponse.json({ status: "READ_ONLY_FAILED", error: e instanceof Error ? e.message : "UNKNOWN", ETSY_WRITE_COUNT: 0 }, { status: 409 }); }
}

export async function POST(request: Request) {
  const ae = authError(request); if (ae) return NextResponse.json({ status: "BLOCKED_FAIL_CLOSED", error: ae, ETSY_WRITE_COUNT: 0 }, { status: 403 });
  let writes = 0;
  try {
    const form = await request.formData(); const action = String(form.get("action") ?? ""); const token = await getValidEtsyAccessToken();
    const before = await snapshot(token);
    if (action !== "publish" && !coreOk(before, false)) throw new Error("DRAFT_CORE_MISMATCH");
    if (action === "publish" && !coreOk(before, false)) throw new Error("PUBLISH_BASELINE_MISMATCH");
    if (action === "file") {
      const rank = Number(form.get("rank")); if (!Number.isInteger(rank) || rank < 1 || rank > FILES.length) throw new Error("FILE_RANK_INVALID");
      const spec = FILES[rank - 1], existing = before.files.find((r: any) => Number(r.rank) === rank);
      if (existing) { if (String(existing.filename) === spec.name && Number(existing.size_bytes) === spec.size) return NextResponse.json({ status: "ALREADY_PRESENT", action, rank, ETSY_WRITE_COUNT: 0 }); throw new Error("FILE_RANK_CONFLICT"); }
      const asset = form.get("asset"); if (!(asset instanceof File)) throw new Error("FILE_ASSET_REQUIRED");
      const b = await assetBytes(asset, spec); await uploadBuyerFile(token, spec, rank, b); writes = 1;
      const after = await snapshot(token), row = after.files.find((r: any) => Number(r.rank) === rank);
      if (!row || String(row.filename) !== spec.name || Number(row.size_bytes) !== spec.size) throw new Error("FILE_FINAL_VERIFY_FAILED");
      return NextResponse.json({ status: "PASS", action, rank, fileName: spec.name, summary: summarize(after), ETSY_WRITE_COUNT: writes });
    }
    if (action === "image") {
      const rank = Number(form.get("rank")); if (!Number.isInteger(rank) || rank < 1 || rank > IMAGES.length) throw new Error("IMAGE_RANK_INVALID");
      const spec = IMAGES[rank - 1], existing = before.images.find((r: any) => Number(r.rank) === rank);
      if (existing) return NextResponse.json({ status: "ALREADY_PRESENT", action, rank, ETSY_WRITE_COUNT: 0 });
      const asset = form.get("asset"); if (!(asset instanceof File)) throw new Error("IMAGE_ASSET_REQUIRED");
      const b = await assetBytes(asset, spec); await uploadImage(token, spec, rank, b); writes = 1;
      const after = await snapshot(token); if (!after.images.some((r: any) => Number(r.rank) === rank)) throw new Error("IMAGE_FINAL_VERIFY_FAILED");
      return NextResponse.json({ status: "PASS", action, rank, fileName: spec.name, summary: summarize(after), ETSY_WRITE_COUNT: writes });
    }
    if (action === "video") {
      if (before.videos.length) { if (videoRowsOk(before.videos)) return NextResponse.json({ status: "ALREADY_PRESENT", action, ETSY_WRITE_COUNT: 0 }); throw new Error("VIDEO_CONFLICT"); }
      const asset = form.get("asset"); if (!(asset instanceof File)) throw new Error("VIDEO_ASSET_REQUIRED");
      const b = await assetBytes(asset, VIDEO); await uploadVideo(token, VIDEO, b); writes = 1;
      let after = await snapshot(token);
      for (let i = 0; i < 8 && !videoRowsOk(after.videos); i++) { await sleep(1200); after = await snapshot(token); }
      if (!videoRowsOk(after.videos)) throw new Error("VIDEO_FINAL_VERIFY_FAILED");
      return NextResponse.json({ status: "PASS", action, summary: summarize(after), ETSY_WRITE_COUNT: writes });
    }
    if (action === "section") {
      const section = before.sections.find((r: any) => String(r.title ?? "").trim() === "Schedules & Checklists");
      if (!section || !Number(section.shop_section_id)) throw new Error("SECTION_NOT_FOUND");
      await patchListing(token, { shop_section_id: String(section.shop_section_id) }); writes = 1;
      const after = await snapshot(token);
      return NextResponse.json({ status: "PASS", action, shopSectionId: Number(section.shop_section_id), shopSectionTitle: "Schedules & Checklists", summary: summarize(after), ETSY_WRITE_COUNT: writes });
    }
    if (action === "publish") {
      if (!imageRowsOk(before.images) || !fileRowsOk(before.files) || !videoRowsOk(before.videos)) throw new Error("PUBLISH_ASSET_GATE_FAILED");
      await patchListing(token, { state: "active" }); writes = 1;
      let after = await snapshot(token);
      for (let i = 0; i < 8 && String(after.listing?.state) !== "active"; i++) { await sleep(1000); after = await snapshot(token); }
      if (!coreOk(after, true) || String(after.listing?.state) !== "active" || !imageRowsOk(after.images) || !fileRowsOk(after.files) || !videoRowsOk(after.videos)) throw new Error("PUBLISH_FINAL_VERIFY_FAILED");
      return NextResponse.json({ status: "PUBLISHED_PASS", action, listingId: LISTING_ID, url: `https://www.etsy.com/listing/${LISTING_ID}/cleaning-schedule-template-for-cleaning`, summary: summarize(after), ETSY_WRITE_COUNT: writes });
    }
    throw new Error("ACTION_INVALID");
  } catch (e) {
    return NextResponse.json({ status: writes > 0 ? "RECONCILIATION_REQUIRED" : "BLOCKED_FAIL_CLOSED", error: e instanceof Error ? e.message : "UNKNOWN", ETSY_WRITE_COUNT: writes }, { status: writes > 0 ? 202 : 409, headers: { "cache-control": "no-store" } });
  }
}
