import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../lib/etsy-seller-state-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = 23582741;
const LISTING_ID = 4580303015;
const SCOPE = "PDT-RPT-003-HERO-V2-IMAGE1-REPLACE-ONLY";
const NONCE = "PDT-RPT-003-HERO-V2-EXACT-R01-NONCE-7F19C4A2";
const ASSET_NAME = "PDT-RPT-003_01_hero_dashboard_V2_FINAL_2000x2000.png";
const ASSET_SIZE = 2084536;
const ASSET_SHA256 = "494736987a916b99ea3586b5c352c37fdd81a3236d39fa46d79094a171b87ba7";

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
  try { return JSON.parse(t) as unknown; } catch { return {}; }
}

async function getRec(token: string, url: string, code: string) {
  const r = await fetch(url, { headers: etsyApiHeaders(token), cache: "no-store" });
  if (!r.ok) throw new Error(code + "_HTTP_" + r.status);
  const v = await parseJson(r);
  if (!isRec(v)) throw new Error(code + "_INVALID");
  return v;
}

async function listing(token: string) {
  return getRec(token, "https://api.etsy.com/v3/application/listings/" + LISTING_ID, "LISTING");
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
    "https://api.etsy.com/v3/application/shops/" + SHOP_ID + "/listings/" + LISTING_ID + "/files",
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

const orderedImages = (rows: Rec[]) =>
  [...rows].sort((a,b)=>(int(a,"rank")??0)-(int(b,"rank")??0));
const orderedFiles = (rows: Rec[]) =>
  [...rows].sort((a,b)=>(int(a,"rank")??0)-(int(b,"rank")??0));

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
  return createHash("sha256").update(JSON.stringify({
    listing: core(s.l),
    images: s.imgs.map(r=>({
      id:int(r,"listing_image_id"),
      rank:int(r,"rank"),
      alt:txt(r,"alt_text"),
      url:txt(r,"url_fullxfull"),
      width:Number(r.full_width??0),
      height:Number(r.full_height??0)
    })),
    files: s.fs.map(r=>({
      id:int(r,"listing_file_id"),
      rank:int(r,"rank"),
      name:txt(r,"filename"),
      size:Number(r.size_bytes??0)
    })),
    seller:{
      total:s.seller.total,
      counts:s.seller.counts,
      listings:s.seller.listings.map(x=>({id:x.listingId,state:x.state,title:x.title})).sort((a,b)=>a.id-b.id)
    }
  }),"utf8").digest("hex");
}

function baselineOk(s: Awaited<ReturnType<typeof snapshot>>) {
  const c=core(s.l);
  return c.listingId===LISTING_ID &&
    c.shopId===SHOP_ID &&
    c.state==="draft" &&
    s.imgs.length===10 &&
    s.fs.length===2 &&
    s.imgs.every((r,i)=>int(r,"rank")===i+1) &&
    int(s.imgs[0],"listing_image_id")!==null;
}

function allowedAssetUrl(raw: string) {
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new Error("ASSET_URL_PROTOCOL");
  if (!u.hostname.endsWith(".oaiusercontent.com")) throw new Error("ASSET_URL_HOST");
  if (!u.pathname.includes("/files/") || !u.pathname.endsWith("/raw")) {
    throw new Error("ASSET_URL_PATH");
  }
  return u.toString();
}

async function stageAsset(rawUrl: string) {
  const url=allowedAssetUrl(rawUrl);
  const r=await fetch(url,{cache:"no-store"});
  if(!r.ok) throw new Error("ASSET_FETCH_HTTP_"+r.status);
  const b=Buffer.from(await r.arrayBuffer());
  if(b.length!==ASSET_SIZE) throw new Error("ASSET_SIZE_MISMATCH");
  const sha=createHash("sha256").update(b).digest("hex");
  if(!eq(sha,ASSET_SHA256)) throw new Error("ASSET_SHA_MISMATCH");
  return {buffer:b,sha};
}

async function plan() {
  const token=await getValidEtsyAccessToken();
  const s=await snapshot(token);
  if(!baselineOk(s)) throw new Error("BASELINE_MISMATCH");
  return {
    status:"PLAN_ONLY",
    mode:"PDT_RPT_003_HERO_V2_EXACT_R01",
    listingId:LISTING_ID,
    state:core(s.l).state,
    currentHeroImageId:int(s.imgs[0],"listing_image_id"),
    currentHeroAlt:txt(s.imgs[0],"alt_text"),
    galleryCount:s.imgs.length,
    buyerFileCount:s.fs.length,
    protectedStateFingerprint:fingerprint(s),
    scope:SCOPE,
    nonce:NONCE,
    deploymentCommit:commit(),
    expectedAsset:{name:ASSET_NAME,size:ASSET_SIZE,sha256:ASSET_SHA256,width:2000,height:2000},
    publishAuthorized:false,
    touches:["IMAGE_01_PIXELS_ONLY"],
    protected:["IMAGE_01_ALT_TEXT","IMAGES_02_10","SEO","LISTING_METADATA","BUYER_FILES","PUBLISH_STATE"],
    ETSY_WRITE_COUNT:0
  };
}

export async function GET(request: Request) {
  const u=new URL(request.url);
  const action=u.searchParams.get("action");

  if(action==="asset_check"){
    try{
      const staged=await stageAsset(u.searchParams.get("assetUrl")??"");
      return NextResponse.json({
        status:"ASSET_CHECK_PASS",
        bytes:staged.buffer.length,
        sha256:staged.sha,
        width:2000,
        height:2000,
        ETSY_WRITE_COUNT:0
      },{headers:{"cache-control":"no-store"}});
    }catch(e){
      return NextResponse.json({
        status:"ASSET_CHECK_BLOCKED",
        error:e instanceof Error?e.message:"UNKNOWN",
        ETSY_WRITE_COUNT:0
      },{status:409,headers:{"cache-control":"no-store"}});
    }
  }

  if(action!=="execute"){
    try{
      return NextResponse.json(await plan(),{headers:{"cache-control":"no-store"}});
    }catch(e){
      return NextResponse.json({
        status:"PLAN_BLOCKED",
        error:e instanceof Error?e.message:"UNKNOWN",
        listingId:LISTING_ID,
        ETSY_WRITE_COUNT:0
      },{status:409,headers:{"cache-control":"no-store"}});
    }
  }

  let writes=0;
  let newImageId:number|null=null;
  try{
    if(process.env.VERCEL_ENV!=="production") throw new Error("PRODUCTION_REQUIRED");
    if(!eq(u.searchParams.get("scope")?.trim()??"",SCOPE)) throw new Error("SCOPE_MISMATCH");
    if(!eq(u.searchParams.get("nonce")?.trim()??"",NONCE)) throw new Error("NONCE_MISMATCH");

    const requestedCommit=u.searchParams.get("commit")?.trim().toLowerCase()??"";
    if(!/^[a-f0-9]{40}$/.test(requestedCommit)||!eq(requestedCommit,commit())){
      throw new Error("COMMIT_MISMATCH");
    }

    const suppliedFp=u.searchParams.get("protectedStateFingerprint")?.trim().toLowerCase()??"";
    if(!/^[a-f0-9]{64}$/.test(suppliedFp)) throw new Error("PROTECTED_FP_INVALID");

    const assetUrl=u.searchParams.get("assetUrl")??"";
    const staged=await stageAsset(assetUrl);

    const token=await getValidEtsyAccessToken();
    const before=await snapshot(token);
    if(!baselineOk(before)) throw new Error("FRESH_BASELINE_MISMATCH");
    if(!eq(fingerprint(before),suppliedFp)) throw new Error("PROTECTED_STATE_DRIFT");

    const beforeCore=JSON.stringify(core(before.l));
    const beforeFiles=JSON.stringify(before.fs.map(r=>({
      id:int(r,"listing_file_id"),rank:int(r,"rank"),name:txt(r,"filename"),size:Number(r.size_bytes??0)
    })));
    const protectedImages02to10=before.imgs.slice(1).map(r=>({
      id:int(r,"listing_image_id"),
      rank:int(r,"rank"),
      alt:txt(r,"alt_text"),
      url:txt(r,"url_fullxfull")
    }));
    const oldHeroId=int(before.imgs[0],"listing_image_id");
    const oldHeroAlt=txt(before.imgs[0],"alt_text");
    if(!oldHeroId) throw new Error("OLD_HERO_ID_MISSING");

    const file=new File([new Uint8Array(staged.buffer)],ASSET_NAME,{type:"image/png"});
    const body=new FormData();
    body.append("image",file,ASSET_NAME);
    body.append("rank","1");
    body.append("alt_text",oldHeroAlt);

    const upload=await fetch(
      "https://api.etsy.com/v3/application/shops/"+SHOP_ID+"/listings/"+LISTING_ID+"/images",
      {method:"POST",headers:multipartHeaders(token),body,cache:"no-store"}
    );
    if(upload.status>=500) throw new Error("UPLOAD_AMBIGUOUS_HTTP_"+upload.status);
    const uploadValue=await parseJson(upload);
    if(!upload.ok||!isRec(uploadValue)) throw new Error("UPLOAD_REJECTED_HTTP_"+upload.status);
    newImageId=int(uploadValue,"listing_image_id");
    if(!newImageId) throw new Error("UPLOAD_RECEIPT_INVALID");
    writes=1;

    const afterUpload=orderedImages(await images(token));
    if(afterUpload.length!==11||!afterUpload.some(r=>int(r,"listing_image_id")===newImageId)){
      throw new Error("POST_UPLOAD_RECONCILIATION_REQUIRED");
    }

    const del=await fetch(
      "https://api.etsy.com/v3/application/shops/"+SHOP_ID+"/listings/"+LISTING_ID+"/images/"+oldHeroId,
      {method:"DELETE",headers:etsyApiHeaders(token),cache:"no-store"}
    );
    if(del.status>=500) throw new Error("DELETE_AMBIGUOUS_HTTP_"+del.status);
    if(!del.ok&&del.status!==204) throw new Error("DELETE_REJECTED_HTTP_"+del.status);
    writes=2;

    const after=await snapshot(token);
    if(JSON.stringify(core(after.l))!==beforeCore) throw new Error("LISTING_METADATA_DRIFT");

    const afterFiles=JSON.stringify(after.fs.map(r=>({
      id:int(r,"listing_file_id"),rank:int(r,"rank"),name:txt(r,"filename"),size:Number(r.size_bytes??0)
    })));
    if(afterFiles!==beforeFiles) throw new Error("BUYER_FILES_DRIFT");

    if(after.seller.total!==before.seller.total||JSON.stringify(after.seller.counts)!==JSON.stringify(before.seller.counts)){
      throw new Error("SELLER_STATE_DRIFT");
    }

    if(after.imgs.length!==10) throw new Error("FINAL_GALLERY_COUNT_MISMATCH");
    if(int(after.imgs[0],"listing_image_id")!==newImageId) throw new Error("FINAL_HERO_NOT_RANK_1");
    if(txt(after.imgs[0],"alt_text")!==oldHeroAlt) throw new Error("HERO_ALT_TEXT_DRIFT");

    const afterProtected=after.imgs.slice(1).map(r=>({
      id:int(r,"listing_image_id"),
      rank:int(r,"rank"),
      alt:txt(r,"alt_text"),
      url:txt(r,"url_fullxfull")
    }));
    if(JSON.stringify(afterProtected)!==JSON.stringify(protectedImages02to10)){
      throw new Error("IMAGES_02_10_DRIFT");
    }
    if(!after.imgs.every((r,i)=>int(r,"rank")===i+1)) throw new Error("FINAL_IMAGE_ORDER_MISMATCH");

    return NextResponse.json({
      status:"HERO_V2_EXACT_REPLACE_PASS",
      listingId:LISTING_ID,
      oldHeroImageId:oldHeroId,
      newHeroImageId,
      galleryCount:10,
      buyerFileCount:2,
      state:"draft",
      publishPerformed:false,
      heroAltPreserved:true,
      protectedImages02to10:true,
      metadataChanged:false,
      buyerFilesChanged:false,
      assetSha256:staged.sha,
      ETSY_WRITE_COUNT:writes
    },{headers:{"cache-control":"no-store"}});
  }catch(e){
    return NextResponse.json({
      status:writes>0?"RECONCILIATION_REQUIRED":"BLOCKED_FAIL_CLOSED",
      error:e instanceof Error?e.message:"UNKNOWN",
      listingId:LISTING_ID,
      newImageId,
      publishPerformed:false,
      ETSY_WRITE_COUNT:writes
    },{status:writes>0?202:409,headers:{"cache-control":"no-store"}});
  }
}
