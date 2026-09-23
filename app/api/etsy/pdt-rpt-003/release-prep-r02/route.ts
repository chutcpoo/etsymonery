import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { executeReconciledWrite } from "../../../../../lib/draft-upload-reconciliation";
import { EtsyDraftAssetProvider } from "../../../../../lib/etsy-draft-asset-provider";
import {
  ETSY_SELLER_WRITE_SCOPES,
  etsyApiHeaders
} from "../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../lib/etsy-seller-state-reconciliation";
import { NeonOperationLedgerRepository } from "../../../../../lib/operation-ledger";
import {
  PDT_RPT_003_R02 as R02,
  createPdtRpt003R02MetadataPatch,
  pdtRpt003R02GalleryRecoverySequence
} from "../../../../../lib/pdt-rpt-003-r02";

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
function int(v: unknown) {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
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
function coreFinal(l: Rec) {
  return Number(l.listing_id) === R02.listingId &&
    Number(l.shop_id) === R02.shopId &&
    text(l.state) === "draft" &&
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
function initialCore(l: Rec) {
  return Number(l.listing_id) === R02.listingId &&
    Number(l.shop_id) === R02.shopId &&
    text(l.state) === "draft" &&
    text(l.title) === R02.oldTitle &&
    Number(money(l.price).toFixed(2)) === R02.priceUsd &&
    Number(l.quantity) === R02.quantity &&
    Number(l.taxonomy_id) === R02.taxonomyId &&
    text(l.who_made) === R02.whoMade &&
    text(l.when_made) === R02.whenMade &&
    (text(l.listing_type) || text(l.type) || "download") === R02.type;
}
function oldBuyerFilesMatch(rows: Rec[]) {
  const a = [...rows].sort((x, y) => Number(x.rank ?? 0) - Number(y.rank ?? 0));
  return a.length === 2 && a.every((r, i) =>
    text(r.filename) === R02.oldBuyerFiles[i].name &&
    Number(r.size_bytes) === R02.oldBuyerFiles[i].size
  );
}
function filesFinal(rows: Rec[]) {
  if (rows.length !== 1) return false;
  const r = rows[0];
  return text(r.filename) === R02.zip.name &&
    Number(r.size_bytes) === R02.zip.size &&
    Number(r.rank) === 1;
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
function gallerySetExact(rows: Rec[]) {
  if (rows.length !== R02.images.length) return false;
  const expected = new Set<string>(R02.images.map(x => x.alt));
  const actual = rows.map(r => decodeEntities(text(r.alt_text)));
  return new Set(actual).size === R02.images.length &&
    actual.every(alt => expected.has(alt)) &&
    rows.every(r =>
      int(r.listing_image_id) !== null &&
      Number(r.full_width) === 2000 &&
      Number(r.full_height) === 2000
    );
}
function videoPresent(rows: Rec[]) {
  return rows.length === 1 &&
    Number(rows[0].width) === R02.video.width &&
    Number(rows[0].height) === R02.video.height;
}
function videoActive(rows: Rec[]) {
  return videoPresent(rows) && text(rows[0].video_state).toLowerCase() === "active";
}
function sellerDraftSafe(s: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>) {
  const row = s.listings.find(x => x.listingId === R02.listingId);
  return s.total === 5 &&
    s.counts.active === 3 &&
    s.counts.draft === 2 &&
    s.counts.inactive === 0 &&
    s.counts.sold_out === 0 &&
    s.counts.expired === 0 &&
    Boolean(row && row.state === "draft");
}
function initialBaseline(s: Awaited<ReturnType<typeof snapshot>>) {
  return initialCore(s.l) &&
    s.images.length === 10 &&
    oldBuyerFilesMatch(s.files) &&
    s.videos.length === 0 &&
    sellerDraftSafe(s.seller);
}
function finalReady(s: Awaited<ReturnType<typeof snapshot>>) {
  return coreFinal(s.l) &&
    imagesFinal(s.images) &&
    filesFinal(s.files) &&
    videoPresent(s.videos) &&
    sellerDraftSafe(s.seller);
}
function galleryRecoveryReady(s: Awaited<ReturnType<typeof snapshot>>) {
  return coreFinal(s.l) &&
    gallerySetExact(s.images) &&
    !imagesFinal(s.images) &&
    filesFinal(s.files) &&
    videoActive(s.videos) &&
    sellerDraftSafe(s.seller);
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
      .map(r => ({ id: int(r.listing_image_id), rank: Number(r.rank), alt: decodeEntities(text(r.alt_text)), w: Number(r.full_width), h: Number(r.full_height) })),
    files: [...s.files]
      .sort((a, b) => Number(a.rank ?? 0) - Number(b.rank ?? 0))
      .map(r => ({ id: int(r.listing_file_id), rank: Number(r.rank), name: text(r.filename), size: Number(r.size_bytes) })),
    videos: s.videos.map(r => ({ id: int(r.video_id), state: text(r.video_state), w: Number(r.width), h: Number(r.height) })),
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
function assetUrl(raw: string) {
  const u = new URL(raw);
  if (u.protocol !== "https:" || !u.hostname.endsWith(".oaiusercontent.com") || !u.pathname.includes("/files/") || !u.pathname.endsWith("/raw")) {
    throw new Error("ASSET_URL_NOT_ALLOWED");
  }
  return u.toString();
}
async function stage(raw: string, expectedSize: number, expectedSha: string) {
  const r = await fetch(assetUrl(raw), { cache: "no-store" });
  if (!r.ok) throw new Error("ASSET_FETCH_HTTP_" + r.status);
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length !== expectedSize) throw new Error("ASSET_SIZE_MISMATCH");
  const actual = createHash("sha256").update(b).digest("hex");
  if (!eq(actual, expectedSha)) throw new Error("ASSET_SHA_MISMATCH");
  return b;
}
function multipartHeaders(token: string) {
  const h = etsyApiHeaders(token);
  delete h["content-type"];
  return h;
}
async function patchCore(token: string) {
  // R02 baseline already proves price, quantity, taxonomy, maker/date and digital
  // type are exact. PATCH only fields that actually change so Etsy does not
  // re-validate unrelated coupled fields such as who_made/when_made/is_supply.
  const body = createPdtRpt003R02MetadataPatch();
  const r = await fetch(
    "https://api.etsy.com/v3/application/shops/" + R02.shopId + "/listings/" + R02.listingId,
    { method: "PATCH", headers: { ...etsyApiHeaders(token), "content-type": "application/x-www-form-urlencoded" }, body, cache: "no-store" }
  );
  await json(r);
  if (!r.ok) throw new Error("METADATA_PATCH_HTTP_" + r.status);
}
async function deleteAsset(token: string, kind: "images" | "files", id: number) {
  const url = "https://api.etsy.com/v3/application/shops/" + R02.shopId + "/listings/" + R02.listingId + "/" + kind + "/" + id;
  let r: Response;
  try {
    r = await fetch(url, { method: "DELETE", headers: etsyApiHeaders(token), cache: "no-store" });
  } catch {
    const rows = await collection(token, kind);
    const key = kind === "images" ? "listing_image_id" : "listing_file_id";
    if (!rows.some(x => Number(x[key]) === id)) return;
    throw new Error("DELETE_AMBIGUOUS");
  }
  if (r.status >= 500) {
    const rows = await collection(token, kind);
    const key = kind === "images" ? "listing_image_id" : "listing_file_id";
    if (!rows.some(x => Number(x[key]) === id)) return;
    throw new Error("DELETE_AMBIGUOUS_HTTP_" + r.status);
  }
  if (!r.ok && r.status !== 204) throw new Error("DELETE_REJECTED_HTTP_" + r.status);
}
async function reattachImageAtFront(token: string, imageId: number, alt: string) {
  const body = new FormData();
  body.append("listing_image_id", String(imageId));
  body.append("rank", "1");
  body.append("alt_text", alt);
  const r = await fetch(
    "https://api.etsy.com/v3/application/shops/" + R02.shopId +
      "/listings/" + R02.listingId + "/images",
    { method: "POST", headers: multipartHeaders(token), body, cache: "no-store" }
  );
  const payload = await json(r);
  if (!r.ok) {
    throw new Error(
      "IMAGE_REATTACH_HTTP_" + r.status + ":" +
      JSON.stringify(payload).slice(0, 200)
    );
  }
}
async function waitForGalleryFinal(token: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const rows = await collection(token, "images");
    if (imagesFinal(rows)) return rows;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return collection(token, "images");
}
async function uploadVideo(token: string, bytes: Buffer) {
  const body = new FormData();
  body.append("video", new File([new Uint8Array(bytes)], R02.video.name, { type: "video/mp4" }), R02.video.name);
  body.append("name", R02.video.name);
  let r: Response;
  try {
    r = await fetch(
      "https://api.etsy.com/v3/application/shops/" + R02.shopId + "/listings/" + R02.listingId + "/videos",
      { method: "POST", headers: multipartHeaders(token), body, cache: "no-store" }
    );
  } catch {
    const rows = await collection(token, "videos");
    if (videoPresent(rows)) return;
    throw new Error("VIDEO_UPLOAD_AMBIGUOUS");
  }
  const payload = await json(r);
  if (r.status >= 500) {
    const rows = await collection(token, "videos");
    if (videoPresent(rows)) return;
    throw new Error("VIDEO_UPLOAD_AMBIGUOUS_HTTP_" + r.status);
  }
  if (!r.ok) throw new Error("VIDEO_UPLOAD_REJECTED_" + r.status + ":" + JSON.stringify(payload).slice(0, 400));
}
async function plan() {
  const token = await getValidEtsyAccessToken();
  const s = await snapshot(token);
  return {
    status: "PLAN_ONLY",
    mode: "PDT_RPT_003_RELEASE_PREP_R02",
    listingId: R02.listingId,
    state: text(s.l.state),
    baselineMatches: initialBaseline(s),
    alreadyPrepared: finalReady(s),
    galleryRecoveryReady: galleryRecoveryReady(s),
    currentGallery: [...s.images]
      .sort((a, b) => Number(a.rank ?? 0) - Number(b.rank ?? 0))
      .map(r => ({
        listingImageId: int(r.listing_image_id),
        rank: Number(r.rank),
        alt: decodeEntities(text(r.alt_text))
      })),
    galleryRecoveryAuthorizationRequired: R02.galleryRecoveryAuthorization,
    galleryRecoveryNonce: R02.galleryRecoveryNonce,
    currentTitle: text(s.l.title),
    currentPriceUsd: Number(money(s.l.price).toFixed(2)),
    galleryCount: s.images.length,
    buyerFileCount: s.files.length,
    videoCount: s.videos.length,
    videoStates: s.videos.map(v => text(v.video_state)),
    sellerCounts: s.seller.counts,
    protectedStateFingerprint: fingerprint(s),
    authorizationRequired: R02.prepAuthorization,
    executionNonce: R02.prepNonce,
    deploymentCommit: runtimeCommit(),
    publishAuthorized: false,
    ETSY_WRITE_COUNT: 0
  };
}

export async function GET(request: Request) {
  const u = new URL(request.url);
  const action = u.searchParams.get("action");

  if (action === "recover-gallery") {
    let recoveryWrites = 0;
    try {
      if (process.env.VERCEL_ENV !== "production") {
        throw new Error("PRODUCTION_REQUIRED");
      }
      if (!eq(
        u.searchParams.get("authorizationText")?.normalize("NFC").trim() ?? "",
        R02.galleryRecoveryAuthorization
      )) {
        throw new Error("AUTH_INVALID");
      }
      if (!eq(
        u.searchParams.get("nonce")?.trim() ?? "",
        R02.galleryRecoveryNonce
      )) {
        throw new Error("NONCE_INVALID");
      }

      const commit = u.searchParams.get("commit")?.trim().toLowerCase() ?? "";
      const deployed = runtimeCommit();
      if (
        !/^[a-f0-9]{40}$/.test(commit) ||
        !/^[a-f0-9]{40}$/.test(deployed) ||
        !eq(commit, deployed)
      ) {
        throw new Error("GIT_VERCEL_COMMIT_MISMATCH");
      }

      const suppliedFp =
        u.searchParams.get("protectedStateFingerprint")?.trim().toLowerCase() ?? "";
      if (!/^[a-f0-9]{64}$/.test(suppliedFp)) {
        throw new Error("PROTECTED_FP_INVALID");
      }

      const token = await getValidEtsyAccessToken(ETSY_SELLER_WRITE_SCOPES);
      const before = await snapshot(token);

      if (finalReady(before) && videoActive(before.videos)) {
        return NextResponse.json({
          status: "ALREADY_RECOVERED_PASS",
          listingId: R02.listingId,
          state: "draft",
          publishPerformed: false,
          protectedStateFingerprint: fingerprint(before),
          ETSY_WRITE_COUNT: 0
        }, { headers: { "cache-control": "no-store" } });
      }

      if (!galleryRecoveryReady(before)) {
        throw new Error("RECOVERY_BASELINE_MISMATCH");
      }
      if (!eq(fingerprint(before), suppliedFp)) {
        throw new Error("PROTECTED_STATE_DRIFT");
      }

      const idByAlt = new Map<string, number>();
      for (const row of before.images) {
        const id = int(row.listing_image_id);
        const alt = decodeEntities(text(row.alt_text));
        if (!id || !alt || idByAlt.has(alt)) {
          throw new Error("RECOVERY_IMAGE_IDENTITY_INVALID");
        }
        idByAlt.set(alt, id);
      }

      for (const row of [...before.images].sort(
        (a, b) => Number(b.rank ?? 0) - Number(a.rank ?? 0)
      )) {
        const id = int(row.listing_image_id);
        if (!id) throw new Error("RECOVERY_IMAGE_ID_INVALID");
        await deleteAsset(token, "images", id);
        recoveryWrites += 1;
      }

      const afterDelete = await collection(token, "images");
      if (afterDelete.length !== 0) {
        throw new Error("RECOVERY_DELETE_READBACK_MISMATCH");
      }

      for (const item of pdtRpt003R02GalleryRecoverySequence()) {
        const id = idByAlt.get(item.alt);
        if (!id) throw new Error("RECOVERY_SOURCE_IMAGE_MISSING");
        await reattachImageAtFront(token, id, item.alt);
        recoveryWrites += 1;
      }

      const gallery = await waitForGalleryFinal(token);
      if (!imagesFinal(gallery)) {
        throw new Error("RECOVERY_FINAL_GALLERY_MISMATCH");
      }

      const after = await snapshot(token);
      if (!finalReady(after) || !videoActive(after.videos)) {
        throw new Error("RECOVERY_FINAL_STATE_MISMATCH");
      }

      return NextResponse.json({
        status: "R02_GALLERY_RECOVERY_R01_PASS",
        listingId: R02.listingId,
        state: "draft",
        galleryCount: after.images.length,
        buyerFileCount: after.files.length,
        buyerFileName: text(after.files[0]?.filename),
        videoState: after.videos.map(v => text(v.video_state)),
        protectedStateFingerprint: fingerprint(after),
        publishPerformed: false,
        activationAuthorizationRequired: R02.activateAuthorization,
        ETSY_WRITE_COUNT: recoveryWrites
      }, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      return NextResponse.json({
        status: recoveryWrites > 0
          ? "RECONCILIATION_REQUIRED"
          : "BLOCKED_FAIL_CLOSED",
        error: e instanceof Error ? e.message : "UNKNOWN",
        listingId: R02.listingId,
        state: "draft",
        publishPerformed: false,
        ETSY_WRITE_COUNT: recoveryWrites
      }, {
        status: recoveryWrites > 0 ? 202 : 409,
        headers: { "cache-control": "no-store" }
      });
    }
  }

  if (action !== "execute") {
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
    if (!eq(u.searchParams.get("authorizationText")?.normalize("NFC").trim() ?? "", R02.prepAuthorization)) throw new Error("AUTH_INVALID");
    if (!eq(u.searchParams.get("nonce")?.trim() ?? "", R02.prepNonce)) throw new Error("NONCE_INVALID");

    const commit = u.searchParams.get("commit")?.trim().toLowerCase() ?? "";
    const deployed = runtimeCommit();
    if (!/^[a-f0-9]{40}$/.test(commit) || !/^[a-f0-9]{40}$/.test(deployed) || !eq(commit, deployed)) throw new Error("GIT_VERCEL_COMMIT_MISMATCH");

    const suppliedFp = u.searchParams.get("protectedStateFingerprint")?.trim().toLowerCase() ?? "";
    if (!/^[a-f0-9]{64}$/.test(suppliedFp)) throw new Error("PROTECTED_FP_INVALID");

    const token = await getValidEtsyAccessToken(ETSY_SELLER_WRITE_SCOPES);
    const before = await snapshot(token);

    if (finalReady(before)) {
      return NextResponse.json({
        status: videoActive(before.videos) ? "ALREADY_PASS" : "ALREADY_PREPARED_VIDEO_PROCESSING",
        listingId: R02.listingId,
        state: "draft",
        videoState: before.videos.map(v => text(v.video_state)),
        publishPerformed: false,
        ETSY_WRITE_COUNT: 0
      }, { headers: { "cache-control": "no-store" } });
    }

    if (!initialBaseline(before)) throw new Error("FRESH_BASELINE_MISMATCH");
    if (!eq(fingerprint(before), suppliedFp)) throw new Error("PROTECTED_STATE_DRIFT");

    const stagedImages = new Map<number, Buffer>();
    for (let i = 0; i < R02.images.length; i++) {
      const spec = R02.images[i];
      stagedImages.set(i + 1, await stage(u.searchParams.get(spec.key) ?? "", spec.size, spec.sha256));
    }
    const zip = await stage(u.searchParams.get("zipUrl") ?? "", R02.zip.size, R02.zip.sha256);
    const video = await stage(u.searchParams.get("videoUrl") ?? "", R02.video.size, R02.video.sha256);

    const oldImageIds = before.images.map(r => int(r.listing_image_id)).filter((x): x is number => x !== null);
    const oldFileIds = before.files.map(r => int(r.listing_file_id)).filter((x): x is number => x !== null);
    if (oldImageIds.length !== 10 || oldFileIds.length !== 2) throw new Error("BASELINE_ASSET_IDS_INVALID");

    await patchCore(token);
    writes += 1;
    if (!coreFinal(await listing(token))) throw new Error("METADATA_READBACK_MISMATCH");

    const ledger = new NeonOperationLedgerRepository();
    const candidateFp = createHash("sha256").update("PDT-RPT-003|V1|R02|RELEASE-PREP", "utf8").digest("hex");
    const coreFp = createHash("sha256").update(JSON.stringify({ title: R02.title, description: R02.description, tags: R02.tags, price: R02.priceUsd }), "utf8").digest("hex");

    for (let i = 0; i < R02.images.length; i++) {
      const spec = R02.images[i];
      const bytes = stagedImages.get(i + 1);
      if (!bytes) throw new Error("STAGED_IMAGE_MISSING_" + (i + 1));
      const file = new File([new Uint8Array(bytes)], spec.name, { type: "image/png" });
      const payload = {
        operationKind: "UPLOAD_IMAGE" as const,
        candidateId: "PDT-RPT-003-V1-R02",
        candidateFingerprint: candidateFp,
        expectedListingFingerprint: coreFp,
        shopId: R02.shopId,
        draftListingId: R02.listingId,
        assetSha256: spec.sha256,
        assetName: spec.name,
        rank: i + 1,
        altText: spec.alt
      };
      const provider = new EtsyDraftAssetProvider(token, payload, file);
      const result = await executeReconciledWrite(ledger, provider, {
        operationId: "PDT-RPT-003-V1-ETSY-R02-IMAGE-" + String(i + 1).padStart(2, "0"),
        kind: "UPLOAD_IMAGE",
        payload: { ...payload },
        now: new Date().toISOString()
      });
      if (result.status === "RECONCILIATION_REQUIRED") {
        return NextResponse.json({ status: "RECONCILIATION_REQUIRED", step: "IMAGE_" + (i + 1), state: "draft", publishPerformed: false, ETSY_WRITE_COUNT: writes + 1 }, { status: 202 });
      }
      if (result.status !== "REPLAY") writes += 1;
    }

    const afterUploads = await collection(token, "images");
    if (afterUploads.length !== 20) throw new Error("IMAGE_STAGING_COUNT_MISMATCH");

    for (const id of oldImageIds) {
      await deleteAsset(token, "images", id);
      writes += 1;
    }

    const zipFile = new File([new Uint8Array(zip)], R02.zip.name, { type: "application/zip" });
    const zipPayload = {
      operationKind: "UPLOAD_FILE" as const,
      candidateId: "PDT-RPT-003-V1-R02",
      candidateFingerprint: candidateFp,
      expectedListingFingerprint: coreFp,
      shopId: R02.shopId,
      draftListingId: R02.listingId,
      assetSha256: R02.zip.sha256,
      assetName: R02.zip.name,
      rank: 1
    };
    const zipProvider = new EtsyDraftAssetProvider(token, zipPayload, zipFile);
    const zipResult = await executeReconciledWrite(ledger, zipProvider, {
      operationId: "PDT-RPT-003-V1-ETSY-R02-ZIP-01",
      kind: "UPLOAD_FILE",
      payload: { ...zipPayload },
      now: new Date().toISOString()
    });
    if (zipResult.status === "RECONCILIATION_REQUIRED") {
      return NextResponse.json({ status: "RECONCILIATION_REQUIRED", step: "ZIP", state: "draft", publishPerformed: false, ETSY_WRITE_COUNT: writes + 1 }, { status: 202 });
    }
    if (zipResult.status !== "REPLAY") writes += 1;

    for (const id of oldFileIds) {
      await deleteAsset(token, "files", id);
      writes += 1;
    }

    await uploadVideo(token, video);
    writes += 1;

    const after = await snapshot(token);
    if (!coreFinal(after.l)) throw new Error("FINAL_CORE_MISMATCH");
    if (!imagesFinal(after.images)) throw new Error("FINAL_GALLERY_MISMATCH");
    if (!filesFinal(after.files)) throw new Error("FINAL_BUYER_FILE_MISMATCH");
    if (!videoPresent(after.videos)) throw new Error("FINAL_VIDEO_MISMATCH");
    if (!sellerDraftSafe(after.seller)) throw new Error("FINAL_SELLER_STATE_DRIFT");

    return NextResponse.json({
      status: videoActive(after.videos) ? "RELEASE_PREP_R02_PASS" : "RELEASE_PREP_R02_VIDEO_PROCESSING",
      listingId: R02.listingId,
      title: R02.title,
      priceUsd: R02.priceUsd,
      galleryCount: after.images.length,
      buyerFileCount: after.files.length,
      buyerFileName: text(after.files[0]?.filename),
      videoCount: after.videos.length,
      videoState: after.videos.map(v => text(v.video_state)),
      state: "draft",
      protectedStateFingerprint: fingerprint(after),
      publishPerformed: false,
      activationAuthorizationRequired: R02.activateAuthorization,
      ETSY_WRITE_COUNT: writes
    }, { status: videoActive(after.videos) ? 200 : 202, headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({
      status: writes > 0 ? "RECONCILIATION_REQUIRED" : "BLOCKED_FAIL_CLOSED",
      error: e instanceof Error ? e.message : "UNKNOWN",
      listingId: R02.listingId,
      state: "draft",
      publishPerformed: false,
      ETSY_WRITE_COUNT: writes
    }, { status: writes > 0 ? 202 : 409, headers: { "cache-control": "no-store" } });
  }
}
