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
async function sleep(ms: number) { await new Promise(r => setTimeout(r, ms)); }
async function json(r: Response) { const t = await r.text(); try { return t ? JSON.parse(t) : {}; } catch { return {}; } }
async function get(token: string, path: string) { const r = await fetch("https://api.etsy.com/v3/application" + path, { headers: etsyApiHeaders(token), cache: "no-store" }); if (!r.ok) throw new Error(`GET_${path}_${r.status}`); return json(r); }
function rows(v: any) { return Array.isArray(v?.results) ? v.results : []; }
function priceOk(v: any) { return Number(v?.amount) / Number(v?.divisor) === 5.9 && v?.currency_code === "USD"; }
function tagsOk(v: any) { return Array.isArray(v) && v.length === TAGS.length && v.every((x: string, i: number) => x === TAGS[i]); }
function coreOk(l: any, allowActive = false) { const state = String(l?.state ?? ""); return Number(l?.listing_id) === LISTING_ID && Number(l?.shop_id) === SHOP_ID && (state === "draft" || (allowActive && state === "active")) && String(l?.title ?? "") === TITLE && String(l?.description ?? "").trim() === DESCRIPTION && priceOk(l?.price) && Number(l?.quantity) === 999 && Number(l?.taxonomy_id) === 12476 && tagsOk(l?.tags); }
function sameEtsyFilename(actual: unknown, expected: string) { return String(actual ?? "").replace(/\s+/g, "") === expected.replace(/\s+/g, ""); }
function fileRowsOk(a: any[]) { if (a.length !== FILES.length) return false; const x = [...a].sort((p, q) => Number(p.rank) - Number(q.rank)); return x.every((r, i) => Number(r.rank) === i + 1 && sameEtsyFilename(r.filename, FILES[i].name) && Number(r.size_bytes) === FILES[i].size); }
function imageRowsOk(a: any[]) { if (a.length !== IMAGES.length) return false; const x = [...a].sort((p, q) => Number(p.rank) - Number(q.rank)); return x.every((r, i) => Number(r.rank) === i + 1); }
function videoRowsOk(a: any[]) { return a.length === 1 && String(a[0]?.video_state ?? "") === "active"; }
function authError(request: Request) { if (!gate()) return "GATE_DISABLED"; if ((request.headers.get("x-operation-id") ?? "") !== AUTHORIZATION_ID) return "OPERATION_ID_INVALID"; return ""; }
async function assetBytes(file: File, spec: Spec) { if (file.name !== spec.name) throw new Error("ASSET_NAME_MISMATCH"); const b = Buffer.from(await file.arrayBuffer()); if (b.length !== spec.size) throw new Error("ASSET_SIZE_MISMATCH"); if (!secure(hash(b), spec.sha)) throw new Error("ASSET_SHA256_MISMATCH"); return b; }
async function listing(token: string) { return get(token, `/listings/${LISTING_ID}`); }
async function images(token: string) { return rows(await get(token, `/listings/${LISTING_ID}/images`)); }
async function files(token: string) { return rows(await get(token, `/shops/${SHOP_ID}/listings/${LISTING_ID}/files`)); }
async function videos(token: string) { return rows(await get(token, `/listings/${LISTING_ID}/videos`)); }
async function sections(token: string) { return rows(await get(token, `/shops/${SHOP_ID}/sections`)); }

async function uploadBuyerFile(token: string, spec: Spec, rank: number, b: Buffer) { const f = new FormData(); f.append("file", new File([new Uint8Array(b)], spec.name, { type: spec.mime }), spec.name); f.append("name", spec.name); f.append("rank", String(rank)); const r = await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${LISTING_ID}/files`, { method: "POST", headers: multipartHeaders(token), body: f, cache: "no-store" }); if (!r.ok) throw new Error(`BUYER_FILE_UPLOAD_HTTP_${r.status}`); return json(r); }
async function uploadImage(token: string, spec: Spec, rank: number, b: Buffer) { const f = new FormData(); f.append("image", new File([new Uint8Array(b)], spec.name, { type: spec.mime }), spec.name); f.append("rank", String(rank)); const r = await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${LISTING_ID}/images`, { method: "POST", headers: multipartHeaders(token), body: f, cache: "no-store" }); if (!r.ok) throw new Error(`IMAGE_UPLOAD_HTTP_${r.status}`); return json(r); }
async function uploadVideo(token: string, spec: Spec, b: Buffer) { const f = new FormData(); f.append("video", new File([new Uint8Array(b)], spec.name, { type: spec.mime }), spec.name); const r = await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${LISTING_ID}/videos`, { method: "POST", headers: multipartHeaders(token), body: f, cache: "no-store" }); if (!r.ok) { const detail=(await r.text()).replace(/\s+/g," ").slice(0,500); throw new Error(`VIDEO_UPLOAD_HTTP_${r.status}_${detail}`); } return json(r); }
async function patchListing(token: string, params: Record<string, string>) { const body = new URLSearchParams(params); const r = await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${LISTING_ID}`, { method: "PATCH", headers: { ...etsyApiHeaders(token), "content-type": "application/x-www-form-urlencoded" }, body, cache: "no-store" }); if (!r.ok) throw new Error(`LISTING_PATCH_HTTP_${r.status}`); return json(r); }

export async function GET() {
  try {
    const token = await getValidEtsyAccessToken();
    const l = await listing(token); await sleep(650);
    const im = await images(token); await sleep(650);
    const fi = await files(token); await sleep(650);
    const vi = await videos(token);
    return NextResponse.json({ status: "READ_ONLY", coreOk: coreOk(l, true), state: l?.state, assets: { images: imageRowsOk(im), imageCount: im.length, files: fileRowsOk(fi), fileCount: fi.length, video: videoRowsOk(vi), videoCount: vi.length }, fileRows: fi.map((r:any)=>({rank:Number(r.rank),filename:String(r.filename??""),sizeBytes:Number(r.size_bytes)})), imageRows: im.map((r:any)=>({rank:Number(r.rank),imageId:Number(r.listing_image_id)})), videoRows: vi.map((r:any)=>({videoId:Number(r.video_id),state:String(r.video_state??"")})), ETSY_WRITE_COUNT: 0 }, { headers: { "cache-control": "no-store" } });
  } catch (e) { return NextResponse.json({ status: "READ_ONLY_FAILED", error: e instanceof Error ? e.message : "UNKNOWN", ETSY_WRITE_COUNT: 0 }, { status: 409 }); }
}

export async function POST(request: Request) {
  const ae = authError(request); if (ae) return NextResponse.json({ status: "BLOCKED_FAIL_CLOSED", error: ae, ETSY_WRITE_COUNT: 0 }, { status: 403 });
  let writes = 0;
  try {
    const form = await request.formData(); const action = String(form.get("action") ?? ""); const token = await getValidEtsyAccessToken();
    const l = await listing(token);
    if (!coreOk(l, false)) throw new Error(action === "publish" ? "PUBLISH_BASELINE_MISMATCH" : "DRAFT_CORE_MISMATCH");

    if (action === "file") {
      await sleep(700); const current = await files(token);
      const rank = Number(form.get("rank")); if (!Number.isInteger(rank) || rank < 1 || rank > FILES.length) throw new Error("FILE_RANK_INVALID");
      const spec = FILES[rank - 1], existing = current.find((r: any) => Number(r.rank) === rank);
      if (existing) { if (sameEtsyFilename(existing.filename, spec.name) && Number(existing.size_bytes) === spec.size) return NextResponse.json({ status: "ALREADY_PRESENT", action, rank, ETSY_WRITE_COUNT: 0 }); throw new Error("FILE_RANK_CONFLICT"); }
      const asset = form.get("asset"); if (!(asset instanceof File)) throw new Error("FILE_ASSET_REQUIRED"); const b = await assetBytes(asset, spec);
      await sleep(700); await uploadBuyerFile(token, spec, rank, b); writes = 1; await sleep(1200);
      const after = await files(token), row = after.find((r: any) => Number(r.rank) === rank);
      if (!row || !sameEtsyFilename(row.filename, spec.name) || Number(row.size_bytes) !== spec.size) throw new Error("FILE_FINAL_VERIFY_FAILED");
      return NextResponse.json({ status: "PASS", action, rank, fileName: spec.name, fileCount: after.length, ETSY_WRITE_COUNT: writes });
    }

    if (action === "image") {
      await sleep(700); const current = await images(token);
      const rank = Number(form.get("rank")); if (!Number.isInteger(rank) || rank < 1 || rank > IMAGES.length) throw new Error("IMAGE_RANK_INVALID");
      const spec = IMAGES[rank - 1], existing = current.find((r: any) => Number(r.rank) === rank);
      if (existing) return NextResponse.json({ status: "ALREADY_PRESENT", action, rank, ETSY_WRITE_COUNT: 0 });
      const asset = form.get("asset"); if (!(asset instanceof File)) throw new Error("IMAGE_ASSET_REQUIRED"); const b = await assetBytes(asset, spec);
      await sleep(700); await uploadImage(token, spec, rank, b); writes = 1; await sleep(1200);
      const after = await images(token); if (!after.some((r: any) => Number(r.rank) === rank)) throw new Error("IMAGE_FINAL_VERIFY_FAILED");
      return NextResponse.json({ status: "PASS", action, rank, fileName: spec.name, imageCount: after.length, ETSY_WRITE_COUNT: writes });
    }

    if (action === "video") {
      await sleep(700); const current = await videos(token);
      if (current.length) { if (videoRowsOk(current)) return NextResponse.json({ status: "ALREADY_PRESENT", action, ETSY_WRITE_COUNT: 0 }); throw new Error("VIDEO_CONFLICT"); }
      const asset = form.get("asset"); if (!(asset instanceof File)) throw new Error("VIDEO_ASSET_REQUIRED"); const b = await assetBytes(asset, VIDEO);
      await sleep(700); await uploadVideo(token, VIDEO, b); writes = 1;
      let after: any[] = [];
      for (let i = 0; i < 8; i++) { await sleep(2000); after = await videos(token); if (videoRowsOk(after)) break; }
      if (!videoRowsOk(after)) throw new Error("VIDEO_FINAL_VERIFY_FAILED");
      return NextResponse.json({ status: "PASS", action, videoCount: after.length, videoState: after[0]?.video_state, ETSY_WRITE_COUNT: writes });
    }

    if (action === "section") {
      await sleep(700); const current = await sections(token); const section = current.find((r: any) => String(r.title ?? "").trim() === "Schedules & Checklists");
      if (!section || !Number(section.shop_section_id)) throw new Error("SECTION_NOT_FOUND");
      if (Number(l?.shop_section_id) === Number(section.shop_section_id)) return NextResponse.json({ status: "ALREADY_PRESENT", action, shopSectionId: Number(section.shop_section_id), shopSectionTitle: "Schedules & Checklists", ETSY_WRITE_COUNT: 0 });
      await sleep(700); await patchListing(token, { shop_section_id: String(section.shop_section_id) }); writes = 1; await sleep(1200);
      const after = await listing(token); if (after?.shop_section_id != null && Number(after.shop_section_id) !== Number(section.shop_section_id)) throw new Error("SECTION_FINAL_VERIFY_FAILED");
      return NextResponse.json({ status: "PASS", action, shopSectionId: Number(section.shop_section_id), shopSectionTitle: "Schedules & Checklists", ETSY_WRITE_COUNT: writes });
    }

    if (action === "publish") {
      await sleep(700); const im = await images(token); await sleep(700); const fi = await files(token); await sleep(700); const vi = await videos(token);
      if (!imageRowsOk(im) || !fileRowsOk(fi) || !videoRowsOk(vi)) throw new Error("PUBLISH_ASSET_GATE_FAILED");
      await sleep(900); await patchListing(token, { state: "active" }); writes = 1;
      let after = l;
      for (let i = 0; i < 8; i++) { await sleep(1500); after = await listing(token); if (String(after?.state) === "active") break; }
      if (!coreOk(after, true) || String(after?.state) !== "active") throw new Error("PUBLISH_FINAL_VERIFY_FAILED");
      return NextResponse.json({ status: "PUBLISHED_PASS", listingId: LISTING_ID, url: `https://www.etsy.com/listing/${LISTING_ID}/cleaning-schedule-template-for-cleaning`, imageCount: im.length, fileCount: fi.length, videoCount: vi.length, ETSY_WRITE_COUNT: writes });
    }

    throw new Error("ACTION_INVALID");
  } catch (e) {
    return NextResponse.json({ status: writes > 0 ? "RECONCILIATION_REQUIRED" : "BLOCKED_FAIL_CLOSED", error: e instanceof Error ? e.message : "UNKNOWN", ETSY_WRITE_COUNT: writes }, { status: writes > 0 ? 202 : 409, headers: { "cache-control": "no-store" } });
  }
}
