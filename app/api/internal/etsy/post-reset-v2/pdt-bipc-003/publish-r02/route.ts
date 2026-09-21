import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
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

const SHOP_ID=23582741;
const TARGET_LISTING_ID=4579470012;

type Rec=Record<string,unknown>;
function isRec(v:unknown):v is Rec{return typeof v==="object"&&v!==null&&!Array.isArray(v);}
function textField(r:Rec,k:string){const v=r[k];return typeof v==="string"?v.normalize("NFC").trim():"";}
function intField(r:Rec,k:string){const v=r[k];return typeof v==="number"&&Number.isSafeInteger(v)?v:null;}
function comparable(v:string){let o=v.normalize("NFC").replace(/\r\n?/g,"\n").trim();for(let i=0;i<2;i++)o=o.replace(/&quot;|&#34;|&#x22;/gi,'"').replace(/&apos;|&#39;|&#x27;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&amp;/gi,"&");return o;}
function sameStrings(v:unknown,e:readonly string[]){return Array.isArray(v)&&v.length===e.length&&v.every((x,i)=>typeof x==="string"&&x.normalize("NFC").trim()===e[i]);}
function exactPrice(v:unknown){if(!isRec(v))return false;const a=Number(v.amount),d=Number(v.divisor);return Number.isFinite(a)&&Number.isFinite(d)&&d>0&&Number((a/d).toFixed(2))===PDT_BIPC_003_V1_LISTING_IDENTITY.priceUsd&&textField(v,"currency_code").toUpperCase()==="USD";}
async function parseJson(r:Response){const t=await r.text();if(!t)return{};try{return JSON.parse(t) as unknown;}catch{return{};}}
async function getRecord(token:string,url:string,code:string){const r=await fetch(url,{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"});if(!r.ok)throw new Error(code+"_HTTP_"+r.status);const v=await parseJson(r);if(!isRec(v))throw new Error(code+"_INVALID");return v;}
function records(v:unknown,code:string){if(!isRec(v)||!Array.isArray(v.results))throw new Error(code);return v.results.filter(isRec);}

async function verify(){
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
    textField(listing,"state")==="draft" &&
    textField(listing,"title")===PDT_BIPC_003_V1_LISTING_IDENTITY.title &&
    comparable(textField(listing,"description"))===comparable(PDT_BIPC_003_V1_DESCRIPTION) &&
    exactPrice(listing.price) &&
    Number(listing.quantity)===PDT_BIPC_003_V1_LISTING_IDENTITY.quantity &&
    Number(listing.taxonomy_id)===PDT_BIPC_003_V1_LISTING_IDENTITY.taxonomy_id &&
    sameStrings(listing.tags,PDT_BIPC_003_V1_LISTING_IDENTITY.tags);
  const galleryMatches=images.length===10&&images.every((r,i)=>intField(r,"rank")===PDT_BIPC_003_V1_GALLERY[i].rank&&textField(r,"alt_text")===PDT_BIPC_003_V1_GALLERY[i].altText);
  const buyerFilesMatch=files.length===2&&files.every((r,i)=>intField(r,"rank")===PDT_BIPC_003_V1_BUYER_FILES[i].rank&&textField(r,"filename")===PDT_BIPC_003_V1_BUYER_FILES[i].fileName&&Number(r.size_bytes)===PDT_BIPC_003_V1_BUYER_FILES[i].sizeBytes);
  const protectedStateMatches=
    seller.total===3&&seller.counts.active===2&&seller.counts.draft===1&&seller.counts.inactive===0&&seller.counts.sold_out===0&&seller.counts.expired===0&&
    seller.listings.some(x=>x.listingId===4578945050&&x.state==="active")&&
    seller.listings.some(x=>x.listingId===4579068925&&x.state==="active")&&
    seller.listings.some(x=>x.listingId===TARGET_LISTING_ID&&x.state==="draft");
  return {listingMatches,galleryMatches,buyerFilesMatch,protectedStateMatches,sellerCounts:seller.counts,total:seller.total,imageCount:images.length,buyerFileCount:files.length};
}

export async function GET(){
  try{
    const v=await verify();
    const ready=v.listingMatches&&v.galleryMatches&&v.buyerFilesMatch&&v.protectedStateMatches;
    return NextResponse.json({
      status:ready?"PUBLISH_R02_READY":"PUBLISH_R02_BLOCKED",
      mode:"PLAN_ONLY",
      targetListingId:TARGET_LISTING_ID,
      listingFingerprint:PDT_BIPC_003_V1_LISTING_FINGERPRINT,
      candidateFingerprint:PDT_BIPC_003_V1_CANDIDATE_FINGERPRINT,
      ...v,
      mutationEnabled:false,
      publishAuthorized:false,
      authorizationRequired:PDT_BIPC_003_V1_AUTHORIZATION_TEXT,
      ETSY_WRITE_COUNT:0
    },{status:ready?200:409,headers:{"cache-control":"no-store"}});
  }catch(e){
    return NextResponse.json({status:"PUBLISH_R02_BLOCKED",error:e instanceof Error?e.message:"UNKNOWN",mutationEnabled:false,publishAuthorized:false,ETSY_WRITE_COUNT:0},{status:409,headers:{"cache-control":"no-store"}});
  }
}
