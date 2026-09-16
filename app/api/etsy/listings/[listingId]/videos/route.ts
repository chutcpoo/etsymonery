import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../lib/etsy-auth";
import { getStoredEtsyShopId } from "../../../../../../lib/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Rec = Record<string, unknown>;
const isRec = (value: unknown): value is Rec => typeof value === "object" && value !== null && !Array.isArray(value);

export async function GET(_request: Request, context: { params: Promise<{ listingId: string }> }) {
  try {
    const { listingId } = await context.params;
    if (!/^\d+$/.test(listingId)) {
      return NextResponse.json({ status: "BLOCKED", mode: "READ_ONLY", error: "INVALID_LISTING_ID", ETSY_WRITE_COUNT: 0 }, { status: 400 });
    }

    const shopId = await getStoredEtsyShopId();
    if (!shopId) {
      return NextResponse.json({ status: "BLOCKED", mode: "READ_ONLY", error: "SHOP_IDENTITY_REQUIRED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
    }

    const accessToken = await getValidEtsyAccessToken();
    const base = "https://api.etsy.com/v3/application";
    const [listingResponse, videosResponse] = await Promise.all([
      fetch(`${base}/listings/${listingId}`, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" }),
      fetch(`${base}/listings/${listingId}/videos`, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" })
    ]);
    const listing = await listingResponse.json() as unknown;
    const videosPayload = await videosResponse.json() as unknown;

    if (!listingResponse.ok || !isRec(listing) || String(listing.shop_id ?? "") !== String(shopId)) {
      return NextResponse.json({ status: "FAIL", mode: "READ_ONLY", error: "LISTING_IDENTITY_MISMATCH", providerStatus: { listing: listingResponse.status, videos: videosResponse.status }, ETSY_WRITE_COUNT: 0 }, { status: 409 });
    }
    const videos = isRec(videosPayload) && Array.isArray(videosPayload.results) ? videosPayload.results.filter(isRec) : null;
    if (!videosResponse.ok || !videos) {
      return NextResponse.json({ status: "FAIL", mode: "READ_ONLY", error: "VIDEO_READBACK_FAILED", providerStatus: { listing: listingResponse.status, videos: videosResponse.status }, ETSY_WRITE_COUNT: 0 }, { status: 502 });
    }

    return NextResponse.json({
      status: "PASS",
      mode: "READ_ONLY",
      generatedAt: new Date().toISOString(),
      listingId: Number(listingId),
      authenticatedShopId: shopId,
      identityVerified: true,
      providerStatus: { listing: listingResponse.status, videos: videosResponse.status },
      videoCount: videos.length,
      videos: videos.map((video) => ({
        videoId: Number(video.video_id),
        width: Number(video.width),
        height: Number(video.height),
        videoState: String(video.video_state ?? ""),
        videoUrl: typeof video.video_url === "string" ? video.video_url : null
      })),
      ETSY_WRITE_COUNT: 0
    });
  } catch (error) {
    return NextResponse.json({ status: "BLOCKED", mode: "READ_ONLY", error: error instanceof Error ? error.message : "UNKNOWN", ETSY_WRITE_COUNT: 0 }, { status: 503 });
  }
}
