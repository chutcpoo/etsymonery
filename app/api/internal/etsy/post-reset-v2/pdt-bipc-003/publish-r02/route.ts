import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { fetchEtsyReadWithRetry } from "../../../../../../../lib/etsy-http";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../../../lib/etsy-seller-state-reconciliation";
import {
  PDT_BIPC_003_V1_AUTHORIZATION_TEXT,
  PDT_BIPC_003_V1_BUYER_FILES,
  PDT_BIPC_003_V1_CANDIDATE_FINGERPRINT,
  PDT_BIPC_003_V1_DESCRIPTION,
  PDT_BIPC_003_V1_GALLERY,
  PDT_BIPC_003_V1_LISTING_FINGERPRINT,
  PDT_BIPC_003_V1_LISTING_IDENTITY,
  assertPdtBipc003V1RepairedManifestFrozen
} from "../../../../../../../lib/pdt-bipc-003-v1-repaired-manifest";

export const runtime="nodejs";
export const dynamic="force-dynamic";
// Production retry marker R02-01; no behavior change.

const SHOP_ID=23582741;
const TARGET_LISTING_ID=4579470012;
const GATE="[GATE_BIPC_PUBLISH_R02_EXECUTE]";
const NONCE_SHA256="368e75fc7c95672a55ff06652ecfb65748960dbc9ad686d8c0f7583d88f00adc";

type Rec=Record<string,unknown>;
function isRec(v:unknown):v is Rec{return typeof v==="object"&&v!==null&&!Array.isArray(v);}
function textField(r:Rec,k:string){const v=r[k];return typeof v==="string"?v.normalize("NFC").trim():"";}
function intField(r:Rec,k:string){const v=r[k];return typeof v==="number"&&Number.isSafeInteger(v)?v:null;}
function comparable(v:string){let o=v.normalize("NFC").replace(/\r\n?/g,"\n").trim();for(let i=0;i<2;i++)o=o.replace(/&quot;|&#34;|&#x22;/gi,'"').replace(/&apos;|&#39;|&#x27;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&amp;/gi,"&");return o;}
function sameStrings(v:unknown,e:readonly string[]){return Array.isArray(v)&&v.length===e.length&&v.every((x,i)=>typeof x==="string"&&x.normalize("NFC").trim()===e[i]);}
function secureEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function nonceOk(v:string){return secureEqual(createHash("sha256").update(v,"utf8").digest("hex"),NONCE_SHA256);}
function gateEnabled(){return process.env.VERCEL_ENV==="production"&&(process.env.VERCEL_GIT_COMMIT_MESSAGE??"").includes(GATE);}
function exactPrice(v:unknown){if(!isRec(v))return false;const a=Number(v.amount),d=Number(v.divisor);return Number.isFinite(a)&&Number.isFinite(d)&&d>0&&Number((a/d).toFixed(2))===PDT_BIPC_003_V1_LISTING_IDENTITY.priceUsd&&textField(v,"currency_code").toUpperCase()==="USD";}
async function parseJson(r:Response){const t=await r.text();if(!t)return{};try{return JSON.parse(t) as unknown;}catch{return{};}}
async function getRecord(token:string,url:string,code:string){
  const r=await fetchEtsyReadWithRetry(fetch,url,{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"});
  if(!r.ok)throw new Error(code+"_HTTP_"+r.status);
  const v=await parseJson(r);
  if(!isRec(v))throw new Error(code+"_INVALID");
  return v;
}
function records(v:unknown,code:string){if(!isRec(v)||!Array.isArray(v.results))throw new Error(code);return v.results.filter(isRec);}

async function verify(targetState:"draft"|"active"){
  assertPdtBipc003V1RepairedManifestFrozen();
  const token=await getValidEtsyAccessToken();
  const base="https://api.etsy.com/v3/application";
  const [listing,imagesP,filesP,seller]=await Promise.all([
    getRecord(token,base+"/listings/"+TARGET_LISTING_ID,"LISTING"),
    getRecord(token,base+"/listings/"+TARGET_LISTING_ID+"/images","IMAGES"),
    getRecord(token,base+"/shops/"+SHOP_ID+"/listings/"+TARGET_LISTING_ID+"/files","FILES"),
    getEtsySellerStateSnapshot({shopId:SHOP_ID,accessToken:token})
  ]);
  const images=records(imagesP,"IMAGES_INVALID").sort((a,b)=>(intField(a,"rank")??0)-(intField(b,"rank")??0));
  const files=records(filesP,"FILES_INVALID").sort((a,b)=>(intField(a,"rank")??0)-(intField(b,"rank")??0));
  const listingMatches=
    textField(listing,"state")===targetState &&
    textField(listing,"title")===PDT_BIPC_003_V1_LISTING_IDENTITY.title &&
    comparable(textField(listing,"description"))===comparable(PDT_BIPC_003_V1_DESCRIPTION) &&
    exactPrice(listing.price) &&
    Number(listing.quantity)===PDT_BIPC_003_V1_LISTING_IDENTITY.quantity &&
    Number(listing.taxonomy_id)===PDT_BIPC_003_V1_LISTING_IDENTITY.taxonomy_id &&
    sameStrings(listing.tags,PDT_BIPC_003_V1_LISTING_IDENTITY.tags);
  const galleryMatches=images.length===10&&images.every((r,i)=>intField(r,"rank")===PDT_BIPC_003_V1_GALLERY[i].rank&&textField(r,"alt_text")===PDT_BIPC_003_V1_GALLERY[i].altText);
  const buyerFilesMatch=files.length===2&&files.every((r,i)=>intField(r,"rank")===PDT_BIPC_003_V1_BUYER_FILES[i].rank&&textField(r,"filename")===PDT_BIPC_003_V1_BUYER_FILES[i].fileName&&Number(r.size_bytes)===PDT_BIPC_003_V1_BUYER_FILES[i].sizeBytes);
  const protectedStateMatches=
    seller.total===3&&
    seller.counts.active===(targetState==="draft"?2:3)&&
    seller.counts.draft===(targetState==="draft"?1:0)&&
    seller.counts.inactive===0&&seller.counts.sold_out===0&&seller.counts.expired===0&&
    seller.listings.some(x=>x.listingId===4578945050&&x.state==="active")&&
    seller.listings.some(x=>x.listingId===4579068925&&x.state==="active")&&
    seller.listings.some(x=>x.listingId===TARGET_LISTING_ID&&x.state===targetState);
  return {listingMatches,galleryMatches,buyerFilesMatch,protectedStateMatches,sellerCounts:seller.counts,total:seller.total,imageCount:images.length,buyerFileCount:files.length};
}

async function publishOnce(token:string){
  const r=await fetch("https://api.etsy.com/v3/application/shops/"+SHOP_ID+"/listings/"+TARGET_LISTING_ID,{
    method:"PATCH",
    headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({state:"active"}),
    cache:"no-store"
  });
  if(r.status>=500)throw new Error("PUBLISH_AMBIGUOUS_HTTP_"+r.status);
  if(!r.ok)throw new Error("PUBLISH_REJECTED_HTTP_"+r.status);
}

export async function GET(request:Request){
  const url=new URL(request.url);

  if(url.searchParams.get("action")==="reconcile_readonly"){
    try{
      const v=await verify("active");
      const pass=v.listingMatches&&v.galleryMatches&&v.buyerFilesMatch&&v.protectedStateMatches;
      return NextResponse.json({
        status:pass?"PUBLISH_R02_RECONCILED":"PUBLISH_R02_RECONCILE_BLOCKED",
        mode:"READ_ONLY",
        targetListingId:TARGET_LISTING_ID,
        listingFingerprint:PDT_BIPC_003_V1_LISTING_FINGERPRINT,
        candidateFingerprint:PDT_BIPC_003_V1_CANDIDATE_FINGERPRINT,
        ...v,
        mutationEnabled:false,
        publishAuthorized:false,
        ETSY_WRITE_COUNT:0
      },{status:pass?200:409,headers:{"cache-control":"no-store"}});
    }catch(e){
      return NextResponse.json({status:"PUBLISH_R02_RECONCILE_BLOCKED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:0},{status:409,headers:{"cache-control":"no-store"}});
    }
  }

  if(url.searchParams.get("action")==="execute"){
    let writes=0;
    try{
      if(!gateEnabled()) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"BIPC_PUBLISH_R02_GATE_DISABLED",ETSY_WRITE_COUNT:0},{status:403});
      const auth=url.searchParams.get("authorizationText")?.normalize("NFC").trim()??"";
      if(!secureEqual(auth,PDT_BIPC_003_V1_AUTHORIZATION_TEXT)) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"AUTHORIZATION_INVALID",ETSY_WRITE_COUNT:0},{status:401});
      const nonce=url.searchParams.get("nonce")?.trim()??"";
      if(!nonce||!nonceOk(nonce)) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"NONCE_INVALID",ETSY_WRITE_COUNT:0},{status:401});

      const before=await verify("draft");
      if(!before.listingMatches||!before.galleryMatches||!before.buyerFilesMatch||!before.protectedStateMatches){
        return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"FRESH_PROTECTED_STATE_MISMATCH",...before,ETSY_WRITE_COUNT:0},{status:409,headers:{"cache-control":"no-store"}});
      }

      const token=await getValidEtsyAccessToken();
      await publishOnce(token);
      writes=1;

      try{
        const after=await verify("active");
        const pass=after.listingMatches&&after.galleryMatches&&after.buyerFilesMatch&&after.protectedStateMatches;
        if(!pass){
          return NextResponse.json({status:"RECONCILIATION_REQUIRED",error:"FINAL_VERIFY_MISMATCH",...after,ETSY_WRITE_COUNT:1},{status:202,headers:{"cache-control":"no-store"}});
        }
        return NextResponse.json({
          status:"PDT_BIPC_003_PUBLISH_R02_PASS",
          targetListingId:TARGET_LISTING_ID,
          state:"active",
          listingFingerprint:PDT_BIPC_003_V1_LISTING_FINGERPRINT,
          candidateFingerprint:PDT_BIPC_003_V1_CANDIDATE_FINGERPRINT,
          protectedListingsUnchanged:true,
          authorizationConsumed:true,
          ...after,
          ETSY_WRITE_COUNT:1
        },{headers:{"cache-control":"no-store"}});
      }catch(e){
        return NextResponse.json({status:"RECONCILIATION_REQUIRED",error:e instanceof Error?e.message:"UNKNOWN",targetListingId:TARGET_LISTING_ID,ETSY_WRITE_COUNT:1},{status:202,headers:{"cache-control":"no-store"}});
      }
    }catch(e){
      return NextResponse.json({status:writes>0?"RECONCILIATION_REQUIRED":"BLOCKED_FAIL_CLOSED",error:e instanceof Error?e.message:"UNKNOWN",targetListingId:TARGET_LISTING_ID,ETSY_WRITE_COUNT:writes},{status:writes>0?202:400,headers:{"cache-control":"no-store"}});
    }
  }

  try{
    const v=await verify("draft");
    const ready=v.listingMatches&&v.galleryMatches&&v.buyerFilesMatch&&v.protectedStateMatches;
    return NextResponse.json({
      status:ready?"PUBLISH_R02_READY":"PUBLISH_R02_BLOCKED",
      mode:"PLAN_ONLY",
      targetListingId:TARGET_LISTING_ID,
      listingFingerprint:PDT_BIPC_003_V1_LISTING_FINGERPRINT,
      candidateFingerprint:PDT_BIPC_003_V1_CANDIDATE_FINGERPRINT,
      ...v,
      mutationEnabled:gateEnabled(),
      publishAuthorized:false,
      authorizationRequired:PDT_BIPC_003_V1_AUTHORIZATION_TEXT,
      ETSY_WRITE_COUNT:0
    },{status:ready?200:409,headers:{"cache-control":"no-store"}});
  }catch(e){
    return NextResponse.json({status:"PUBLISH_R02_BLOCKED",error:e instanceof Error?e.message:"UNKNOWN",mutationEnabled:false,publishAuthorized:false,ETSY_WRITE_COUNT:0},{status:409,headers:{"cache-control":"no-store"}});
  }
}
