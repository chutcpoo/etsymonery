import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ETSY_SELLER_READ_SCOPES, etsyApiHeaders } from "../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../lib/etsy-auth";
import { getStoredEtsyShopId } from "../../../../../lib/token-store";
import { PDT_HBOP_001_V2_ALT_TEXT_R01 as R01 } from "../../../../../lib/pdt-hbop-001-v2-alt-text-r01";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const txt = (v: unknown) => typeof v === "string" ? v.normalize("NFC").trim() : "";
const num = (v: unknown) => Number(v);

async function readJson(url: string, token: string) {
  const r = await fetch(url, { headers: etsyApiHeaders(token), cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !isRec(body)) throw new Error("ETSY_READ_HTTP_" + r.status);
  return body;
}

async function collection(url: string, token: string) {
  const body = await readJson(url, token);
  if (!Array.isArray(body.results)) throw new Error("ETSY_COLLECTION_INVALID");
  return body.results.filter(isRec);
}

function moneyExact(v: unknown) {
  if (!isRec(v)) return false;
  return num(v.amount) === R01.priceAmount &&
    num(v.divisor) === R01.priceDivisor &&
    txt(v.currency_code) === R01.currency;
}

function protectedFingerprint(listing: Rec, images: Rec[], files: Rec[], videos: Rec[]) {
  const payload = {
    listing: {
      listingId: num(listing.listing_id),
      shopId: num(listing.shop_id),
      state: txt(listing.state),
      title: txt(listing.title),
      price: isRec(listing.price) ? {
        amount: num(listing.price.amount),
        divisor: num(listing.price.divisor),
        currency: txt(listing.price.currency_code)
      } : null,
      quantity: num(listing.quantity),
      taxonomyId: num(listing.taxonomy_id),
      tags: Array.isArray(listing.tags) ? listing.tags.map(txt) : []
    },
    images: images.map(x => ({
      id: num(x.listing_image_id),
      rank: num(x.rank),
      width: num(x.full_width),
      height: num(x.full_height),
      url: txt(x.url_fullxfull)
    })),
    files: files.map(x => ({
      id: num(x.listing_file_id),
      rank: num(x.rank),
      filename: txt(x.filename),
      size: num(x.size_bytes)
    })),
    videos: videos.map(x => ({
      id: num(x.video_id),
      state: txt(x.video_state),
      width: num(x.width),
      height: num(x.height)
    }))
  };
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

export async function GET() {
  try {
    const shopId = await getStoredEtsyShopId();
    if (shopId !== R01.shopId) throw new Error("SHOP_ID_MISMATCH");

    const token = await getValidEtsyAccessToken(ETSY_SELLER_READ_SCOPES);
    const listingBase = "https://api.etsy.com/v3/application/listings/" + R01.listingId;
    const shopBase = "https://api.etsy.com/v3/application/shops/" + R01.shopId + "/listings/" + R01.listingId;

    const [listing, imagesRaw, filesRaw, videosRaw] = await Promise.all([
      readJson(listingBase, token),
      collection(listingBase + "/images", token),
      collection(shopBase + "/files", token),
      collection(listingBase + "/videos", token)
    ]);

    const images = [...imagesRaw].sort((a,b) => num(a.rank) - num(b.rank));
    const files = [...filesRaw].sort((a,b) => num(a.rank) - num(b.rank));
    const videos = [...videosRaw];

    const tags = Array.isArray(listing.tags) ? listing.tags.map(txt) : [];
    const metadataOk =
      num(listing.listing_id) === R01.listingId &&
      num(listing.shop_id) === R01.shopId &&
      txt(listing.state) === "draft" &&
      txt(listing.title) === R01.title &&
      moneyExact(listing.price) &&
      num(listing.quantity) === R01.quantity &&
      num(listing.taxonomy_id) === R01.taxonomyId &&
      JSON.stringify(tags) === JSON.stringify(R01.tags);

    const imagesOk =
      images.length === 10 &&
      images.every((x, i) =>
        num(x.rank) === i + 1 &&
        Number.isSafeInteger(num(x.listing_image_id)) &&
        num(x.listing_image_id) > 0 &&
        num(x.full_width) === 2000 &&
        num(x.full_height) === 2000 &&
        txt(x.url_fullxfull).length > 0
      );

    const filesOk =
      files.length === R01.buyerFiles.length &&
      files.every((x, i) => txt(x.filename) === R01.buyerFiles[i]);

    const videosOk =
      videos.length === R01.expectedVideo.count &&
      txt(videos[0]?.video_state).toLowerCase() === "active" &&
      num(videos[0]?.width) === R01.expectedVideo.width &&
      num(videos[0]?.height) === R01.expectedVideo.height;

    if (!metadataOk || !imagesOk || !filesOk || !videosOk) {
      return NextResponse.json({
        status: "DRY_RUN_BLOCKED",
        taskId: R01.taskId,
        listingId: R01.listingId,
        checks: { metadataOk, imagesOk, filesOk, videosOk },
        publishPerformed: false,
        ETSY_WRITE_COUNT: 0
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }

    const currentAlt = images.map(x => txt(x.alt_text));
    const plannedRanks = currentAlt
      .map((alt, i) => alt === R01.altTexts[i] ? null : i + 1)
      .filter((x): x is number => x !== null);

    const expectedCurrentAltState =
      currentAlt[0] === R01.altTexts[0] &&
      currentAlt.slice(1, 9).every(x => x === "") &&
      currentAlt[9] === R01.altTexts[0];

    if (!expectedCurrentAltState) {
      return NextResponse.json({
        status: "DRY_RUN_BLOCKED",
        taskId: R01.taskId,
        listingId: R01.listingId,
        error: "ALT_TEXT_BASELINE_DRIFT",
        currentAltPresent: currentAlt.map(Boolean),
        plannedRanks,
        protectedStateSha256: protectedFingerprint(listing, images, files, videos),
        publishPerformed: false,
        ETSY_WRITE_COUNT: 0
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }

    return NextResponse.json({
      status: "DRY_RUN_PASS",
      mode: "AUTHENTICATED_ETSY_READ_ONLY",
      taskId: R01.taskId,
      listingId: R01.listingId,
      state: "draft",
      galleryCount: images.length,
      buyerFileCount: files.length,
      videoCount: videos.length,
      plannedRanks,
      plannedWriteCount: plannedRanks.length,
      protectedStateSha256: protectedFingerprint(listing, images, files, videos),
      publishAuthorized: false,
      publishPerformed: false,
      ETSY_WRITE_COUNT: 0
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      status: "DRY_RUN_BLOCKED",
      taskId: R01.taskId,
      listingId: R01.listingId,
      error: error instanceof Error ? error.message : "UNKNOWN",
      publishPerformed: false,
      ETSY_WRITE_COUNT: 0
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
