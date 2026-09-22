import { createHash, timingSafeEqual } from "node:crypto";
import React from "react";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../lib/etsy-seller-state-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = 23582741;
const LISTING_ID = 4580303015;
const SCOPE = "PDT-RPT-003-HERO-V2-IMAGE1-REPLACE-ONLY";
const NONCE = "PDT-RPT-003-HERO-V2-R01-NONCE-6E42A91C";
const FALLBACK_SOURCE =
  "https://i.etsystatic.com/23582741/r/il/c4516d/8609532607/il_fullxfull.8609532607_elrz.jpg";

const HERO_ALT =
  "Rental Property Tracker Excel dashboard showing income, expenses, rent roll, STR occupancy, cash flow KPIs, and monthly review for landlords and short-term rental hosts.";

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const txt = (r: Rec, k: string) =>
  typeof r[k] === "string" ? (r[k] as string).normalize("NFC").trim() : "";

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

function multipartHeaders(token: string) {
  const h = etsyApiHeaders(token);
  delete h["content-type"];
  return h;
}

async function parseJson(response: Response): Promise<unknown> {
  const t = await response.text();
  if (!t) return {};
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return {};
  }
}

async function getRec(token: string, url: string, code: string) {
  const r = await fetch(url, {
    headers: etsyApiHeaders(token),
    cache: "no-store"
  });
  if (!r.ok) throw new Error(code + "_HTTP_" + r.status);
  const v = await parseJson(r);
  if (!isRec(v)) throw new Error(code + "_INVALID");
  return v;
}

async function listing(token: string) {
  return getRec(
    token,
    "https://api.etsy.com/v3/application/listings/" + LISTING_ID,
    "LISTING"
  );
}

async function images(token: string) {
  const v = await getRec(
    token,
    "https://api.etsy.com/v3/application/listings/" + LISTING_ID + "/images",
    "IMAGES"
  );
  if (!Array.isArray(v.results)) throw new Error("IMAGES_INVALID");
  return v.results.filter(isRec);
}

async function files(token: string) {
  const v = await getRec(
    token,
    "https://api.etsy.com/v3/application/shops/" +
      SHOP_ID +
      "/listings/" +
      LISTING_ID +
      "/files",
    "FILES"
  );
  if (!Array.isArray(v.results)) throw new Error("FILES_INVALID");
  return v.results.filter(isRec);
}

function priceUsd(row: Rec) {
  const p = row.price;
  if (!isRec(p)) return null;
  const amount = Number(p.amount);
  const divisor = Number(p.divisor);
  if (!Number.isFinite(amount) || !Number.isFinite(divisor) || divisor <= 0) return null;
  return Number((amount / divisor).toFixed(2));
}

function core(row: Rec) {
  return {
    listingId: int(row, "listing_id"),
    shopId: int(row, "shop_id"),
    state: txt(row, "state"),
    title: txt(row, "title"),
    description: txt(row, "description"),
    priceUsd: priceUsd(row),
    quantity: Number(row.quantity),
    taxonomyId: Number(row.taxonomy_id),
    whoMade: txt(row, "who_made"),
    whenMade: txt(row, "when_made"),
    listingType: txt(row, "listing_type") || txt(row, "type") || "download",
    tags: Array.isArray(row.tags) ? row.tags : []
  };
}

function orderedImages(rows: Rec[]) {
  return [...rows].sort((a, b) => (int(a, "rank") ?? 0) - (int(b, "rank") ?? 0));
}

function orderedFiles(rows: Rec[]) {
  return [...rows].sort((a, b) => (int(a, "rank") ?? 0) - (int(b, "rank") ?? 0));
}

async function snapshot(token: string) {
  const [l, imgs, fs, seller] = await Promise.all([
    listing(token),
    images(token),
    files(token),
    getEtsySellerStateSnapshot({ shopId: SHOP_ID, accessToken: token })
  ]);
  return { l, imgs: orderedImages(imgs), fs: orderedFiles(fs), seller };
}

function fingerprint(s: Awaited<ReturnType<typeof snapshot>>) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        listing: core(s.l),
        images: s.imgs.map((r) => ({
          id: int(r, "listing_image_id"),
          rank: int(r, "rank"),
          alt: txt(r, "alt_text"),
          url: txt(r, "url_fullxfull")
        })),
        files: s.fs.map((r) => ({
          id: int(r, "listing_file_id"),
          rank: int(r, "rank"),
          name: txt(r, "filename"),
          size: Number(r.size_bytes ?? 0)
        })),
        seller: {
          total: s.seller.total,
          counts: s.seller.counts,
          listings: s.seller.listings
            .map((x) => ({ id: x.listingId, state: x.state, title: x.title }))
            .sort((a, b) => a.id - b.id)
        }
      }),
      "utf8"
    )
    .digest("hex");
}

function baselineOk(s: Awaited<ReturnType<typeof snapshot>>) {
  return (
    core(s.l).listingId === LISTING_ID &&
    core(s.l).shopId === SHOP_ID &&
    core(s.l).state === "draft" &&
    s.imgs.length === 10 &&
    s.fs.length === 2 &&
    s.imgs.every((r, i) => int(r, "rank") === i + 1) &&
    int(s.imgs[0], "listing_image_id") !== null
  );
}

function h(
  type: string,
  props: Record<string, unknown> | null,
  ...children: React.ReactNode[]
) {
  return React.createElement(type, props, ...children);
}

async function renderHero(sourceUrl: string) {
  const root = h(
    "div",
    {
      style: {
        width: "2000px",
        height: "2000px",
        position: "relative",
        display: "flex",
        background: "#F6F1E8",
        fontFamily: "Arial, Helvetica, sans-serif",
        overflow: "hidden"
      }
    },
    h("div", {
      style: {
        position: "absolute",
        left: "0px",
        top: "0px",
        width: "2000px",
        height: "2000px",
        background:
          "radial-gradient(circle at 2% 55%, rgba(43,111,112,.10), transparent 22%), radial-gradient(circle at 95% 78%, rgba(216,155,60,.10), transparent 20%)"
      }
    }),
    h(
      "div",
      {
        style: {
          position: "absolute",
          left: "115px",
          top: "80px",
          width: "1510px",
          display: "flex",
          flexDirection: "column",
          lineHeight: 0.9,
          letterSpacing: "-4px"
        }
      },
      h(
        "div",
        {
          style: {
            fontSize: "164px",
            fontWeight: 800,
            color: "#16324F"
          }
        },
        "RENTAL PROPERTY"
      ),
      h(
        "div",
        {
          style: {
            fontSize: "164px",
            fontWeight: 800,
            color: "#2B6F70",
            marginLeft: "420px"
          }
        },
        "TRACKER"
      )
    ),
    h(
      "div",
      {
        style: {
          position: "absolute",
          right: "110px",
          top: "125px",
          width: "150px",
          height: "150px",
          display: "flex"
        }
      },
      h("div", {
        style: {
          position: "absolute",
          width: "80px",
          height: "15px",
          right: "16px",
          top: "8px",
          borderRadius: "20px",
          background: "#D89B3C",
          transform: "rotate(-48deg)"
        }
      }),
      h("div", {
        style: {
          position: "absolute",
          width: "82px",
          height: "15px",
          right: "0px",
          top: "65px",
          borderRadius: "20px",
          background: "#D89B3C",
          transform: "rotate(-8deg)"
        }
      }),
      h("div", {
        style: {
          position: "absolute",
          width: "80px",
          height: "15px",
          right: "4px",
          top: "122px",
          borderRadius: "20px",
          background: "#D89B3C",
          transform: "rotate(32deg)"
        }
      })
    ),
    h(
      "div",
      {
        style: {
          position: "absolute",
          left: "120px",
          top: "455px",
          fontSize: "72px",
          fontWeight: 750,
          color: "#16324F",
          letterSpacing: "-1px",
          display: "flex",
          alignItems: "center"
        }
      },
      "Income ",
      h("span", { style: { color: "#D89B3C" } }, "•"),
      " Expenses ",
      h("span", { style: { color: "#D89B3C" } }, "•"),
      " Rent Roll ",
      h("span", { style: { color: "#D89B3C" } }, "•"),
      " STR"
    ),
    h(
      "div",
      {
        style: {
          position: "absolute",
          left: "120px",
          top: "555px",
          fontSize: "55px",
          color: "#586777",
          letterSpacing: "-1px"
        }
      },
      "Track rental cash flow in one Excel workbook"
    ),
    h(
      "div",
      {
        style: {
          position: "absolute",
          right: "125px",
          top: "535px",
          width: "330px",
          height: "108px",
          borderRadius: "40px",
          border: "3px solid #2B6F70",
          background: "#E3EEEA",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "54px",
          fontWeight: 800,
          color: "#16324F"
        }
      },
      "Excel .xlsx"
    ),
    h("div", {
      style: {
        position: "absolute",
        left: "125px",
        top: "735px",
        width: "1750px",
        height: "1055px",
        borderRadius: "72px",
        background: "#11151B",
        boxShadow: "0 28px 55px rgba(22,50,79,.22)"
      }
    }),
    h("div", {
      style: {
        position: "absolute",
        left: "182px",
        top: "795px",
        width: "1636px",
        height: "890px",
        borderRadius: "24px",
        background: "#FFFFFF",
        overflow: "hidden",
        display: "flex"
      }
    },
    h("img", {
      src: sourceUrl,
      width: 1636,
      height: 890,
      style: {
        width: "1636px",
        height: "890px",
        objectFit: "cover",
        objectPosition: "center 46%"
      }
    })),
    h("div", {
      style: {
        position: "absolute",
        left: "72px",
        top: "1780px",
        width: "1856px",
        height: "78px",
        borderRadius: "0 0 90px 90px",
        background:
          "linear-gradient(180deg, #D9DDE0 0%, #AEB5BA 48%, #E2E5E7 100%)",
        boxShadow: "0 18px 24px rgba(22,50,79,.12)"
      }
    }),
    h("div", {
      style: {
        position: "absolute",
        left: "780px",
        top: "1780px",
        width: "440px",
        height: "28px",
        borderRadius: "0 0 28px 28px",
        background: "#858D93"
      }
    }),
    h(
      "div",
      {
        style: {
          position: "absolute",
          left: "70px",
          bottom: "55px",
          color: "#2B6F70",
          fontSize: "33px",
          fontWeight: 800
        }
      },
      "POONTHAIDIGITAL"
    ),
    h(
      "div",
      {
        style: {
          position: "absolute",
          right: "70px",
          bottom: "55px",
          color: "#D89B3C",
          fontSize: "33px",
          fontWeight: 800
        }
      },
      "EXCEL"
    )
  );

  const response = new ImageResponse(root, {
    width: 2000,
    height: 2000
  });
  return Buffer.from(await response.arrayBuffer());
}

async function plan() {
  const token = await getValidEtsyAccessToken();
  const s = await snapshot(token);
  if (!baselineOk(s)) throw new Error("BASELINE_MISMATCH");
  return {
    status: "PLAN_ONLY",
    mode: "PDT_RPT_003_HERO_V2_R01",
    listingId: LISTING_ID,
    state: core(s.l).state,
    currentHeroImageId: int(s.imgs[0], "listing_image_id"),
    galleryCount: s.imgs.length,
    buyerFileCount: s.fs.length,
    protectedStateFingerprint: fingerprint(s),
    scope: SCOPE,
    nonce: NONCE,
    deploymentCommit: commit(),
    publishAuthorized: false,
    touches: ["IMAGE_01_ONLY"],
    protected: ["IMAGES_02_10", "SEO", "LISTING_METADATA", "BUYER_FILES", "PUBLISH_STATE"],
    ETSY_WRITE_COUNT: 0
  };
}

export async function GET(request: Request) {
  const u = new URL(request.url);
  const action = u.searchParams.get("action");

  if (action === "preview") {
    try {
      const png = await renderHero(FALLBACK_SOURCE);
      return NextResponse.json(
        {
          status: "PREVIEW_PASS",
          width: 2000,
          height: 2000,
          bytes: png.length,
          sha256: createHash("sha256").update(png).digest("hex"),
          imageBase64: png.toString("base64"),
          ETSY_WRITE_COUNT: 0
        },
        { headers: { "cache-control": "no-store" } }
      );
    } catch (e) {
      return NextResponse.json(
        {
          status: "PREVIEW_BLOCKED",
          error: e instanceof Error ? e.message : "UNKNOWN",
          ETSY_WRITE_COUNT: 0
        },
        { status: 409, headers: { "cache-control": "no-store" } }
      );
    }
  }

  if (action !== "execute") {
    try {
      return NextResponse.json(await plan(), {
        headers: { "cache-control": "no-store" }
      });
    } catch (e) {
      return NextResponse.json(
        {
          status: "PLAN_BLOCKED",
          error: e instanceof Error ? e.message : "UNKNOWN",
          listingId: LISTING_ID,
          ETSY_WRITE_COUNT: 0
        },
        { status: 409, headers: { "cache-control": "no-store" } }
      );
    }
  }

  let writes = 0;
  let newImageId: number | null = null;

  try {
    if (process.env.VERCEL_ENV !== "production") throw new Error("PRODUCTION_REQUIRED");

    if (!eq(u.searchParams.get("scope")?.trim() ?? "", SCOPE)) {
      throw new Error("SCOPE_MISMATCH");
    }
    if (!eq(u.searchParams.get("nonce")?.trim() ?? "", NONCE)) {
      throw new Error("NONCE_MISMATCH");
    }

    const requestedCommit = u.searchParams.get("commit")?.trim().toLowerCase() ?? "";
    if (!/^[a-f0-9]{40}$/.test(requestedCommit) || !eq(requestedCommit, commit())) {
      throw new Error("COMMIT_MISMATCH");
    }

    const suppliedFp =
      u.searchParams.get("protectedStateFingerprint")?.trim().toLowerCase() ?? "";
    if (!/^[a-f0-9]{64}$/.test(suppliedFp)) {
      throw new Error("PROTECTED_FP_INVALID");
    }

    const token = await getValidEtsyAccessToken();
    const before = await snapshot(token);
    if (!baselineOk(before)) throw new Error("FRESH_BASELINE_MISMATCH");
    if (!eq(fingerprint(before), suppliedFp)) throw new Error("PROTECTED_STATE_DRIFT");

    const beforeCore = JSON.stringify(core(before.l));
    const beforeFiles = JSON.stringify(
      before.fs.map((r) => ({
        id: int(r, "listing_file_id"),
        rank: int(r, "rank"),
        name: txt(r, "filename"),
        size: Number(r.size_bytes ?? 0)
      }))
    );
    const protectedImageIds = before.imgs.slice(1).map((r) => int(r, "listing_image_id"));
    const oldHeroId = int(before.imgs[0], "listing_image_id");
    const sourceUrl = txt(before.imgs[0], "url_fullxfull") || FALLBACK_SOURCE;

    if (!oldHeroId) throw new Error("OLD_HERO_ID_MISSING");

    const png = await renderHero(sourceUrl);
    const file = new File(
      [new Uint8Array(png)],
      "PDT-RPT-003_01_hero_dashboard_V2_FINAL.png",
      { type: "image/png" }
    );

    const body = new FormData();
    body.append("image", file, file.name);
    body.append("rank", "1");
    body.append("alt_text", HERO_ALT);

    const upload = await fetch(
      "https://api.etsy.com/v3/application/shops/" +
        SHOP_ID +
        "/listings/" +
        LISTING_ID +
        "/images",
      {
        method: "POST",
        headers: multipartHeaders(token),
        body,
        cache: "no-store"
      }
    );

    if (upload.status >= 500) throw new Error("UPLOAD_AMBIGUOUS_HTTP_" + upload.status);
    const uploadValue = await parseJson(upload);
    if (!upload.ok || !isRec(uploadValue)) {
      throw new Error("UPLOAD_REJECTED_HTTP_" + upload.status);
    }

    newImageId = int(uploadValue, "listing_image_id");
    if (!newImageId) throw new Error("UPLOAD_RECEIPT_INVALID");
    writes = 1;

    const afterUpload = orderedImages(await images(token));
    if (
      afterUpload.length !== 11 ||
      !afterUpload.some((r) => int(r, "listing_image_id") === newImageId)
    ) {
      throw new Error("POST_UPLOAD_RECONCILIATION_REQUIRED");
    }

    const del = await fetch(
      "https://api.etsy.com/v3/application/shops/" +
        SHOP_ID +
        "/listings/" +
        LISTING_ID +
        "/images/" +
        oldHeroId,
      {
        method: "DELETE",
        headers: etsyApiHeaders(token),
        cache: "no-store"
      }
    );

    if (del.status >= 500) throw new Error("DELETE_AMBIGUOUS_HTTP_" + del.status);
    if (!del.ok && del.status !== 204) {
      throw new Error("DELETE_REJECTED_HTTP_" + del.status);
    }
    writes = 2;

    const after = await snapshot(token);
    if (JSON.stringify(core(after.l)) !== beforeCore) throw new Error("LISTING_METADATA_DRIFT");

    const afterFiles = JSON.stringify(
      after.fs.map((r) => ({
        id: int(r, "listing_file_id"),
        rank: int(r, "rank"),
        name: txt(r, "filename"),
        size: Number(r.size_bytes ?? 0)
      }))
    );
    if (afterFiles !== beforeFiles) throw new Error("BUYER_FILES_DRIFT");

    if (
      after.seller.total !== before.seller.total ||
      JSON.stringify(after.seller.counts) !== JSON.stringify(before.seller.counts)
    ) {
      throw new Error("SELLER_STATE_DRIFT");
    }

    if (after.imgs.length !== 10) throw new Error("FINAL_GALLERY_COUNT_MISMATCH");
    if (int(after.imgs[0], "listing_image_id") !== newImageId) {
      throw new Error("FINAL_HERO_NOT_RANK_1");
    }
    if (txt(after.imgs[0], "alt_text") !== HERO_ALT) {
      throw new Error("FINAL_HERO_ALT_MISMATCH");
    }

    const finalProtected = after.imgs.slice(1).map((r) => int(r, "listing_image_id"));
    if (JSON.stringify(finalProtected) !== JSON.stringify(protectedImageIds)) {
      throw new Error("IMAGES_02_10_DRIFT");
    }
    if (!after.imgs.every((r, i) => int(r, "rank") === i + 1)) {
      throw new Error("FINAL_IMAGE_ORDER_MISMATCH");
    }

    return NextResponse.json(
      {
        status: "HERO_V2_REPLACE_PASS",
        listingId: LISTING_ID,
        oldHeroImageId: oldHeroId,
        newHeroImageId: newImageId,
        galleryCount: 10,
        buyerFileCount: 2,
        state: "draft",
        publishPerformed: false,
        protectedImages02to10: true,
        metadataChanged: false,
        buyerFilesChanged: false,
        ETSY_WRITE_COUNT: writes
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      {
        status: writes > 0 ? "RECONCILIATION_REQUIRED" : "BLOCKED_FAIL_CLOSED",
        error: e instanceof Error ? e.message : "UNKNOWN",
        listingId: LISTING_ID,
        newImageId,
        publishPerformed: false,
        ETSY_WRITE_COUNT: writes
      },
      {
        status: writes > 0 ? 202 : 409,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
