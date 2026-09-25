import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ETSY_SELLER_READ_SCOPES, ETSY_SELLER_WRITE_SCOPES, etsyApiHeaders } from "../../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import { getStoredEtsyShopId } from "../../../../../../../lib/token-store";
import { PDT_HBOP_001_V2_ALT_TEXT_R01 as R01 } from "../../../../../../../lib/pdt-hbop-001-v2-alt-text-r01";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTHORIZATION_TEXT = "AUTHORIZE PDT-HBOP-001-V2-ETSY-ALT-TEXT-RECOVERY-R02-20260925 LISTING-4581821318 IMAGES-03-10 EXACT SCOPE ONLY" as const;
const GATE = "[GATE_HBOP_ALT_TEXT_R01_CLOSED]";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const txt = (v: unknown) => typeof v === "string" ? v.normalize("NFC").trim() : "";
const num = (v: unknown) => Number(v);
const secureEqual = (a: string, b: string) => { const x=Buffer.from(a), y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); };
const gateEnabled = () => process.env.VERCEL_ENV === "production" && (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").includes(GATE);
const multipartHeaders = (token: string) => { const h=etsyApiHeaders(token); delete h["content-type"]; return h; };
const decodeEntities = (v: string) => v
  .replaceAll("&#39;", "'")
  .replaceAll("&quot;", '"')
  .replaceAll("&amp;", "&")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "plan";
  let providerWrites = 0;
  try {
    const shopId = await getStoredEtsyShopId();
    if (shopId !== R01.shopId) throw new Error("SHOP_ID_MISMATCH");

    const requiredScopes = action === "execute" ? ETSY_SELLER_WRITE_SCOPES : ETSY_SELLER_READ_SCOPES;
    const token = await getValidEtsyAccessToken(requiredScopes);
    const listingBase = "https://api.etsy.com/v3/application/listings/" + R01.listingId;
    const shopBase = "https://api.etsy.com/v3/application/shops/" + R01.shopId + "/listings/" + R01.listingId;

    const readState = async () => {
      const [listing, imagesRaw, filesRaw, videosRaw] = await Promise.all([
        readJson(listingBase, token),
        collection(listingBase + "/images", token),
        collection(shopBase + "/files", token),
        collection(listingBase + "/videos", token)
      ]);
      const images = [...imagesRaw].sort((a,b) => num(a.rank) - num(b.rank));
      const files = [...filesRaw].sort((a,b) => num(a.rank) - num(b.rank));
      const videos = [...videosRaw];
      return { listing, images, files, videos };
    };

    const validateProtected = (state: Awaited<ReturnType<typeof readState>>) => {
      const { listing, images, files, videos } = state;
      const tags = Array.isArray(listing.tags) ? listing.tags.map(txt) : [];
      const metadataChecks = {
        listingId: num(listing.listing_id) === R01.listingId,
        shopId: num(listing.shop_id) === R01.shopId,
        state: txt(listing.state) === "draft",
        title: decodeEntities(txt(listing.title)) === R01.title,
        price: moneyExact(listing.price),
        quantity: num(listing.quantity) === R01.quantity,
        taxonomyId: num(listing.taxonomy_id) === R01.taxonomyId,
        tags: tags.length === R01.tags.length && R01.tags.every(tag => tags.includes(tag))
      };
      const metadataOk = Object.values(metadataChecks).every(Boolean);
      const imagesOk = images.length === 10 && images.every((x, i) =>
        num(x.rank) === i + 1 && Number.isSafeInteger(num(x.listing_image_id)) && num(x.listing_image_id) > 0 &&
        num(x.full_width) === 2000 && num(x.full_height) === 2000 && txt(x.url_fullxfull).length > 0
      );
      const filesOk = files.length === R01.buyerFiles.length && files.every((x, i) => txt(x.filename) === R01.buyerFiles[i]);
      const videosOk = videos.length === R01.expectedVideo.count && txt(videos[0]?.video_state).toLowerCase() === "active" &&
        num(videos[0]?.width) === R01.expectedVideo.width && num(videos[0]?.height) === R01.expectedVideo.height;
      return { metadataChecks, metadataOk, imagesOk, filesOk, videosOk, ok: metadataOk && imagesOk && filesOk && videosOk };
    };

    const state = await readState();
    const checks = validateProtected(state);
    const currentAlt = state.images.map(x => { const value = txt(x.alt_text); return value === "NOT_AVAILABLE" ? "" : value; });
    const plannedRanks = currentAlt.map((alt, i) => alt === R01.altTexts[i] ? null : i + 1).filter((x): x is number => x !== null);
    const protectedStateSha256 = protectedFingerprint(state.listing, state.images, state.files, state.videos);
    const expectedCurrentAltState = currentAlt[0] === R01.altTexts[0] && currentAlt[1] === R01.altTexts[1] && currentAlt.slice(2, 9).every(x => x === "") && currentAlt[9] === R01.altTexts[0];

    if (action !== "execute") {
      const pass = checks.ok && expectedCurrentAltState && plannedRanks.join(",") === "3,4,5,6,7,8,9,10";
      return NextResponse.json({
        status: pass ? "DRY_RUN_PASS" : "DRY_RUN_BLOCKED",
        mode: "AUTHENTICATED_ETSY_READ_ONLY",
        taskId: R01.taskId,
        authorizationRequired: AUTHORIZATION_TEXT,
        gateEnabled: gateEnabled(),
        listingId: R01.listingId,
        state: txt(state.listing.state),
        checks,
        plannedRanks,
        plannedWriteCount: plannedRanks.length,
        protectedStateSha256,
        publishAuthorized: false,
        publishPerformed: false,
        ETSY_WRITE_COUNT: 0
      }, { status: pass ? 200 : 409, headers: { "cache-control": "no-store" } });
    }

    if (!gateEnabled()) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"HBOP_ALT_TEXT_GATE_DISABLED",ETSY_WRITE_COUNT:0},{status:403});
    const authorizationText = url.searchParams.get("authorizationText")?.normalize("NFC").trim() ?? "";
    if (!secureEqual(authorizationText, AUTHORIZATION_TEXT)) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"AUTHORIZATION_INVALID",ETSY_WRITE_COUNT:0},{status:401});
    const expectedSha = url.searchParams.get("baselineSha256")?.trim().toLowerCase() ?? "";
    if (!/^[a-f0-9]{64}$/.test(expectedSha) || !secureEqual(expectedSha, protectedStateSha256)) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"BASELINE_SHA_MISMATCH",protectedStateSha256,ETSY_WRITE_COUNT:0},{status:409});
    if (!checks.ok || !expectedCurrentAltState || plannedRanks.join(",") !== "3,4,5,6,7,8,9,10") return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"PROTECTED_STATE_MISMATCH",checks,plannedRanks,ETSY_WRITE_COUNT:0},{status:409});

    // The state above is the fresh pre-write snapshot for this request. Re-reading the
    // same four Etsy resources here can trip Etsy's rate limit before any mutation.
    // Keep the exact SHA/protected-state/alt-baseline gates, but do not duplicate them.
    const fresh = state;
    const freshSha = protectedStateSha256;

    for (let rank = 3; rank <= 10; rank += 1) {
      const image = fresh.images[rank - 1];
      const imageId = num(image.listing_image_id);
      const body = new FormData();
      body.append("listing_image_id", String(imageId));
      body.append("rank", String(rank));
      body.append("alt_text", R01.altTexts[rank - 1]);
      const response = await fetch(shopBase + "/images", { method: "POST", headers: multipartHeaders(token), body, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("ALT_TEXT_WRITE_HTTP_" + response.status + ":RANK_" + rank + ":" + JSON.stringify(payload).slice(0,180));
      providerWrites += 1;
      if (rank < 10) await new Promise(resolve => setTimeout(resolve, 1200));
    }

    const finalState = await readState();
    const finalChecks = validateProtected(finalState);
    const finalAlt = finalState.images.map(x => txt(x.alt_text));
    const allAltExact = finalAlt.length === 10 && finalAlt.every((alt, i) => alt === R01.altTexts[i]);
    const finalSha = protectedFingerprint(finalState.listing, finalState.images, finalState.files, finalState.videos);
    const protectedUnchanged = secureEqual(finalSha, expectedSha);
    const finalPass = finalChecks.ok && allAltExact && protectedUnchanged && txt(finalState.listing.state) === "draft";

    return NextResponse.json({
      status: finalPass ? "HBOP_ALT_TEXT_R01_PASS" : "HBOP_ALT_TEXT_R01_INCOMPLETE_RECOVERY_REQUIRED",
      taskId: R01.taskId,
      listingId: R01.listingId,
      state: txt(finalState.listing.state),
      altTextExact01To10: allAltExact,
      galleryCount: finalState.images.length,
      buyerFileCount: finalState.files.length,
      videoCount: finalState.videos.length,
      protectedStateSha256Before: expectedSha,
      protectedStateSha256After: finalSha,
      galleryFilesVideoUnchanged: protectedUnchanged,
      publishAuthorized: false,
      publishPerformed: false,
      authorizationConsumed: true,
      ETSY_WRITE_COUNT: providerWrites
    }, { status: finalPass ? 200 : 202, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      status: providerWrites > 0 ? "HBOP_ALT_TEXT_R01_INCOMPLETE_RECOVERY_REQUIRED" : "BLOCKED_FAIL_CLOSED",
      taskId: R01.taskId,
      listingId: R01.listingId,
      error: error instanceof Error ? error.message : "UNKNOWN",
      publishPerformed: false,
      ETSY_WRITE_COUNT: providerWrites
    }, { status: providerWrites > 0 ? 202 : 503, headers: { "cache-control": "no-store" } });
  }
}
