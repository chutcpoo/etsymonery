import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { fetchEtsyReadWithRetry } from "../../../../../../../lib/etsy-http";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../../../lib/etsy-seller-state-reconciliation";
import {
  PDT_BIPC_003_V1_BUYER_FILES,
  PDT_BIPC_003_V1_DESCRIPTION,
  PDT_BIPC_003_V1_GALLERY,
  PDT_BIPC_003_V1_LISTING_IDENTITY,
  assertPdtBipc003V1RepairedManifestFrozen
} from "../../../../../../../lib/pdt-bipc-003-v1-repaired-manifest";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

const SHOP_ID=23582741;
const TARGET_LISTING_ID=4579470012;
const AUTHORIZATION_TEXT="AUTHORIZE PDT-BIPC-003-V1-ETSY-VIDEO-R01-20260921 EXACT SCOPE ONLY" as const;
const GATE="[GATE_BIPC_VIDEO_R01_EXECUTE]";
const NONCE_SHA256="f73959fd8772f3ed96dec41422245b9aa39524496cae538029de8d46d03bcfe5";
const VIDEO={
  param:"video01",
  fileName:"PDT-BIPC-003_ETSY_VIDEO_01_10S.mp4",
  driveId:"1vdI34fS8OCzgdHcjaHdPVwGp7JkleZu9",
  size:442108,
  sha256:"7d043ca4d426166081cbc22391cd78e187cef0517329c56d70787ce522c3d67e",
  mimeType:"video/mp4"
} as const;

type Rec=Record<string,unknown>;
function isRec(v:unknown):v is Rec{return typeof v==="object"&&v!==null&&!Array.isArray(v);}
function textField(r:Rec,k:string){const v=r[k];return typeof v==="string"?v.normalize("NFC").trim():"";}
function intField(r:Rec,k:string){const v=r[k];return typeof v==="number"&&Number.isSafeInteger(v)?v:null;}
function comparable(v:string){let o=v.normalize("NFC").replace(/\r\n?/g,"\n").trim();for(let i=0;i<2;i++)o=o.replace(/&quot;|&#34;|&#x22;/gi,'"').replace(/&apos;|&#39;|&#x27;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&amp;/gi,"&");return o;}
function sameStrings(v:unknown,e:readonly string[]){return Array.isArray(v)&&v.length===e.length&&v.every((x,i)=>typeof x==="string"&&x.normalize("NFC").trim()===e[i]);}
function exactPrice(v:unknown){if(!isRec(v))return false;const a=Number(v.amount),d=Number(v.divisor);return Number.isFinite(a)&&Number.isFinite(d)&&d>0&&Number((a/d).toFixed(2))===11.99&&textField(v,"currency_code").toUpperCase()==="USD";}
function secureEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function nonceOk(v:string){return secureEqual(createHash("sha256").update(v,"utf8").digest("hex"),NONCE_SHA256);}
function gateEnabled(){return process.env.VERCEL_ENV==="production"&&(process.env.VERCEL_GIT_COMMIT_MESSAGE??"").includes(GATE);}
function multipartHeaders(token:string){const h=etsyApiHeaders(token);delete h["content-type"];return h;}
function allowedAssetUrl(raw:string){const u=new URL(raw);if(u.protocol!=="https:")throw new Error("ASSET_URL_PROTOCOL");if(!/^sdmntpr[a-z0-9-]*\.oaiusercontent\.com$/i.test(u.hostname))throw new Error("ASSET_URL_HOST");return u.toString();}
async function parseJson(r:Response){const t=await r.text();if(!t)return{};try{return JSON.parse(t) as unknown;}catch{return{};}}
async function getRecord(token:string,url:string,code:string){const r=await fetchEtsyReadWithRetry(fetch,url,{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"});if(!r.ok)throw new Error(code+"_HTTP_"+r.status);const v=await parseJson(r);if(!isRec(v))throw new Error(code+"_INVALID");return v;}
function records(v:unknown,code:string){if(!isRec(v)||!Array.isArray(v.results))throw new Error(code);return v.results.filter(isRec);}
async function fetchAsset(url:string){const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw new Error("VIDEO_FETCH_HTTP_"+r.status);const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length!==VIDEO.size)throw new Error("VIDEO_SIZE_MISMATCH");const h=createHash("sha256").update(bytes).digest("hex");if(!secureEqual(h,VIDEO.sha256))throw new Error("VIDEO_SHA256_MISMATCH");return bytes;}

async function readAll(token:string){
  const base="https://api.etsy.com/v3/application";
  const [listing,imagesP,filesP,videosP,seller]=await Promise.all([
    getRecord(token,base+"/listings/"+TARGET_LISTING_ID,"LISTING"),
    getRecord(token,base+"/listings/"+TARGET_LISTING_ID+"/images","IMAGES"),
    getRecord(token,base+"/shops/"+SHOP_ID+"/listings/"+TARGET_LISTING_ID+"/files","FILES"),
    getRecord(token,base+"/listings/"+TARGET_LISTING_ID+"/videos","VIDEOS"),
    getEtsySellerStateSnapshot({shopId:SHOP_ID,accessToken:token})
  ]);
  return {listing,images:records(imagesP,"IMAGES_INVALID"),files:records(filesP,"FILES_INVALID"),videos:records(videosP,"VIDEOS_INVALID"),seller};
}

function protectedMatches(s:Awaited<ReturnType<typeof readAll>>,expectedVideos:number){
  const images=[...s.images].sort((a,b)=>(intField(a,"rank")??0)-(intField(b,"rank")??0));
  const files=[...s.files].sort((a,b)=>(intField(a,"rank")??0)-(intField(b,"rank")??0));
  const listing=s.listing;
  return (
    textField(listing,"state")==="draft" &&
    textField(listing,"title")===PDT_BIPC_003_V1_LISTING_IDENTITY.title &&
    comparable(textField(listing,"description"))===comparable(PDT_BIPC_003_V1_DESCRIPTION) &&
    exactPrice(listing.price) &&
    Number(listing.quantity)===999 &&
    Number(listing.taxonomy_id)===12476 &&
    sameStrings(listing.tags,PDT_BIPC_003_V1_LISTING_IDENTITY.tags) &&
    images.length===10 &&
    images.every((r,i)=>intField(r,"rank")===PDT_BIPC_003_V1_GALLERY[i].rank&&textField(r,"alt_text")===PDT_BIPC_003_V1_GALLERY[i].altText) &&
    files.length===2 &&
    files.every((r,i)=>intField(r,"rank")===PDT_BIPC_003_V1_BUYER_FILES[i].rank&&textField(r,"filename")===PDT_BIPC_003_V1_BUYER_FILES[i].fileName&&Number(r.size_bytes)===PDT_BIPC_003_V1_BUYER_FILES[i].sizeBytes) &&
    s.videos.length===expectedVideos &&
    s.seller.total===3 &&
    s.seller.counts.active===2 &&
    s.seller.counts.draft===1 &&
    s.seller.counts.inactive===0 &&
    s.seller.counts.sold_out===0 &&
    s.seller.counts.expired===0 &&
    s.seller.listings.some(x=>x.listingId===4578945050&&x.state==="active") &&
    s.seller.listings.some(x=>x.listingId===4579068925&&x.state==="active") &&
    s.seller.listings.some(x=>x.listingId===TARGET_LISTING_ID&&x.state==="draft")
  );
}

async function uploadVideo(token:string,bytes:Buffer){
  const body=new FormData();
  body.append("video",new File([new Uint8Array(bytes)],VIDEO.fileName,{type:VIDEO.mimeType}),VIDEO.fileName);
  const r=await fetch("https://api.etsy.com/v3/application/shops/"+SHOP_ID+"/listings/"+TARGET_LISTING_ID+"/videos",{method:"POST",headers:multipartHeaders(token),body,cache:"no-store"});
  if(r.status>=500)throw new Error("VIDEO_UPLOAD_AMBIGUOUS_HTTP_"+r.status);
  if(!r.ok)throw new Error("VIDEO_UPLOAD_REJECTED_HTTP_"+r.status);
  const v=await parseJson(r);
  if(!isRec(v)||!intField(v,"video_id"))throw new Error("VIDEO_UPLOAD_RECEIPT_INVALID");
  return {videoId:intField(v,"video_id"),videoState:textField(v,"video_state")};
}
async function sleep(ms:number){await new Promise(r=>setTimeout(r,ms));}

export async function GET(request:Request){
  const url=new URL(request.url);
  const action=url.searchParams.get("action")??"plan";

  if(action==="diagnose"){
    try{
      assertPdtBipc003V1RepairedManifestFrozen();
      const token=await getValidEtsyAccessToken();
      const s=await readAll(token);
      return NextResponse.json({
        status:"DIAGNOSTIC_READ_ONLY",
        targetListingId:TARGET_LISTING_ID,
        baselineMatches:protectedMatches(s,0),
        videoCount:s.videos.length,
        videoRows:s.videos.map(v=>({videoId:intField(v,"video_id"),videoState:textField(v,"video_state"),width:Number(v.width),height:Number(v.height)})),
        sellerCounts:s.seller.counts,
        total:s.seller.total,
        mutationEnabled:false,
        ETSY_WRITE_COUNT:0
      },{headers:{"cache-control":"no-store"}});
    }catch(e){
      return NextResponse.json({status:"DIAGNOSTIC_BLOCKED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:0},{status:409});
    }
  }

  if(action!=="execute"){
    return NextResponse.json({
      status:"PLAN_ONLY",
      mode:"PDT_BIPC_003_VIDEO_R01",
      targetListingId:TARGET_LISTING_ID,
      video:{fileName:VIDEO.fileName,driveId:VIDEO.driveId,size:VIDEO.size,sha256:VIDEO.sha256},
      exactScope:{videoAction:"UPLOAD_ONE_VIDEO_ONLY",listingState:"KEEP_DRAFT",title:"VERIFY_ONLY",description:"VERIFY_ONLY",tags:"VERIFY_ONLY",price:"VERIFY_ONLY",gallery:"VERIFY_ONLY",buyerFiles:"VERIFY_ONLY",protectedListings:"VERIFY_ONLY"},
      authorizationRequired:AUTHORIZATION_TEXT,
      gateEnabled:gateEnabled(),
      mutationEnabled:gateEnabled(),
      ETSY_WRITE_COUNT:0
    },{headers:{"cache-control":"no-store"}});
  }

  let writes=0;
  try{
    if(!gateEnabled())return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"BIPC_VIDEO_R01_GATE_DISABLED",ETSY_WRITE_COUNT:0},{status:403});
    const auth=url.searchParams.get("authorizationText")?.normalize("NFC").trim()??"";
    if(!secureEqual(auth,AUTHORIZATION_TEXT))return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"AUTHORIZATION_INVALID",ETSY_WRITE_COUNT:0},{status:401});
    const nonce=url.searchParams.get("nonce")?.trim()??"";
    if(!nonce||!nonceOk(nonce))return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"NONCE_INVALID",ETSY_WRITE_COUNT:0},{status:401});

    const token=await getValidEtsyAccessToken();
    const before=await readAll(token);
    if(!protectedMatches(before,0))return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"VIDEO_BASELINE_MISMATCH",videoCount:before.videos.length,sellerCounts:before.seller.counts,ETSY_WRITE_COUNT:0},{status:409});

    const bytes=await fetchAsset(allowedAssetUrl(url.searchParams.get(VIDEO.param)??""));

    const immediatelyBefore=await readAll(token);
    if(!protectedMatches(immediatelyBefore,0))return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"VIDEO_FRESH_BASELINE_MISMATCH",videoCount:immediatelyBefore.videos.length,sellerCounts:immediatelyBefore.seller.counts,ETSY_WRITE_COUNT:0},{status:409});

    const receipt=await uploadVideo(token,bytes);
    writes=1;

    let after=await readAll(token);
    for(let i=0;i<8;i++){
      if(protectedMatches(after,1)&&after.videos.length===1&&textField(after.videos[0],"video_state")==="active")break;
      await sleep(1200);
      after=await readAll(token);
    }

    const pass=protectedMatches(after,1)&&after.videos.length===1&&textField(after.videos[0],"video_state")==="active";
    if(!pass)return NextResponse.json({status:"RECONCILIATION_REQUIRED",error:"VIDEO_FINAL_VERIFY_FAILED",receipt,videoCount:after.videos.length,videoRows:after.videos.map(v=>({videoId:intField(v,"video_id"),videoState:textField(v,"video_state"),width:Number(v.width),height:Number(v.height)})),sellerCounts:after.seller.counts,ETSY_WRITE_COUNT:1},{status:202,headers:{"cache-control":"no-store"}});

    return NextResponse.json({
      status:"PDT_BIPC_003_VIDEO_R01_PASS",
      targetListingId:TARGET_LISTING_ID,
      state:"draft",
      receipt,
      videoCount:after.videos.length,
      videoRows:after.videos.map(v=>({videoId:intField(v,"video_id"),videoState:textField(v,"video_state"),width:Number(v.width),height:Number(v.height)})),
      protectedFieldsUnchanged:true,
      protectedListingsUnchanged:true,
      authorizationConsumed:true,
      ETSY_WRITE_COUNT:1
    },{headers:{"cache-control":"no-store"}});
  }catch(e){
    return NextResponse.json({status:writes>0?"RECONCILIATION_REQUIRED":"BLOCKED_FAIL_CLOSED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:writes},{status:writes>0?202:400,headers:{"cache-control":"no-store"}});
  }
}
