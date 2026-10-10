import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../../../lib/etsy-seller-state-reconciliation";
import { PDT_CQE_008_FRESH_V2 as FRESH } from "../../../../../../../lib/pdt-cqe-008-fresh-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHOP_ID = FRESH.shopId;
const OPERATION_ID = "PDT-CQE-008-FRESH-V2-ETSY-ASSETS-R01-20261010";
const AUTH_ACTION = "AUTHORIZE_PDT_CQE_008_FRESH_V2_ASSETS_ONLY_NO_PUBLISH";
const WRITE_TOKEN_HEADER = "x-autodigitalpublisher-write-token";
const OWNER_AUTH_HEADER = "x-owner-authorization";
const COMMIT_HEADER = "x-deployment-commit";

type Rec = Record<string, unknown>;
type Seller = Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>;
type AssetSpec = {name:string;size:number;sha256:string;mime:string;altText?:string};

const ZIP:AssetSpec = {name:FRESH.buyerZip.filename,size:FRESH.buyerZip.bytes,sha256:FRESH.buyerZip.sha256,mime:FRESH.buyerZip.mimeType};
const IMAGES:AssetSpec[] = FRESH.images.map(x=>({name:x.filename,size:x.bytes,sha256:x.sha256,mime:x.mimeType,altText:x.altText}));
const VIDEO:AssetSpec = {name:FRESH.video.filename,size:FRESH.video.bytes,sha256:FRESH.video.sha256,mime:FRESH.video.mimeType};

function isRec(v:unknown):v is Rec { return typeof v === "object" && v !== null && !Array.isArray(v); }
function text(v:unknown){ return typeof v === "string" ? v.normalize("NFC").trim() : ""; }
function secure(a:string,b:string){ const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
function shaBytes(b:Buffer){ return createHash("sha256").update(b).digest("hex"); }
function shaText(v:string){ return createHash("sha256").update(v.normalize("NFC").trim(),"utf8").digest("hex"); }
function runtimeCommit(){ return process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? ""; }
function exactGateEnabled(){ return process.env[FRESH.exactWriteGateEnv]?.trim() === "true"; }
function rows(v:unknown):Rec[]{ return isRec(v)&&Array.isArray(v.results)?v.results.filter(isRec):[]; }
async function json(r:Response){ const t=await r.text(); try{return t?JSON.parse(t):{}}catch{return{}} }
function multipartHeaders(token:string){ const h=etsyApiHeaders(token); delete h["content-type"]; return h; }
async function sleep(ms:number){ await new Promise(r=>setTimeout(r,ms)); }
async function get(token:string,path:string){
  for(let attempt=1;attempt<=5;attempt++){
    const r=await fetch("https://api.etsy.com/v3/application"+path,{headers:etsyApiHeaders(token),cache:"no-store"});
    if(r.ok)return json(r);
    if((r.status===429||r.status>=500)&&attempt<5){ await sleep(Math.min(8000,600*2**(attempt-1))); continue; }
    throw new Error(`GET_${path}_HTTP_${r.status}`);
  }
  throw new Error(`GET_${path}_RETRY_EXHAUSTED`);
}
async function listing(t:string,id:number){ return get(t,`/listings/${id}`); }
async function files(t:string,id:number){ return rows(await get(t,`/shops/${SHOP_ID}/listings/${id}/files`)); }
async function images(t:string,id:number){ return rows(await get(t,`/listings/${id}/images`)); }
async function videos(t:string,id:number){ return rows(await get(t,`/listings/${id}/videos`)); }
function price(v:unknown){ if(isRec(v)){const a=Number(v.amount),d=Number(v.divisor);if(Number.isFinite(a)&&Number.isFinite(d)&&d>0)return a/d;} return Number(v); }
function comparableText(value:string){
  let out=value.normalize("NFC").replace(/\r\n?/g,"\n").trim();
  for(let i=0;i<2;i+=1){out=out.replace(/&quot;|&#34;|&#x22;/gi,'\"').replace(/&apos;|&#39;|&#x27;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&amp;/gi,"&");}
  return out;
}
function coreMatches(l:Rec){
  const tags=Array.isArray(l.tags)?l.tags.map(x=>text(x)):[];
  return text(l.state)==="draft" && Number(l.shop_id)===SHOP_ID && text(l.title)===FRESH.listing.title &&
    comparableText(text(l.description))===comparableText(FRESH.listing.description) && Math.abs(price(l.price)-FRESH.listing.priceUsd)<.001 &&
    Number(l.quantity)===FRESH.listing.quantity && [text(l.listing_type),text(l.type)].includes(FRESH.listing.listingType) && text(l.who_made)===FRESH.listing.whoMade &&
    text(l.when_made)===FRESH.listing.whenMade && Number(l.taxonomy_id)===FRESH.listing.taxonomyId &&
    JSON.stringify(tags)===JSON.stringify(FRESH.listing.tags);
}
function protectedOk(s:Seller){
  if(s.counts.active!==3||s.counts.inactive!==0||s.counts.sold_out!==0||s.counts.expired!==0)return false;
  return FRESH.protectedListings.every(e=>{const r=s.listings.find(x=>x.listingId===e.listingId);return !!r&&r.state===e.state&&r.title===e.title;});
}
async function findTarget(token:string){
  const s=await getEtsySellerStateSnapshot({shopId:SHOP_ID,accessToken:token});
  if(!protectedOk(s)||s.counts.draft!==1||s.total!==4)throw new Error("SELLER_BASELINE_MISMATCH");
  const matches=s.listings.filter(x=>x.state==="draft"&&x.title===FRESH.listing.title);
  if(matches.length!==1)throw new Error("TARGET_DRAFT_IDENTITY_NOT_UNIQUE");
  const id=matches[0].listingId;
  const l=await listing(token,id);
  if(!isRec(l)||!coreMatches(l))throw new Error("TARGET_DRAFT_METADATA_MISMATCH");
  return {id,s};
}
function authError(req:NextRequest){
  if(process.env.VERCEL_ENV!=="production")return "PRODUCTION_RUNTIME_REQUIRED";
  if(!exactGateEnabled())return "PDT_CQE_008_EXACT_WRITE_GATE_DISABLED";
  if(process.env.PUBLISH_WRITES_ENABLED==="true")return "PUBLISH_GATE_MUST_REMAIN_LOCKED";
  const expected=process.env.ETSY_DRAFT_WRITE_TOKEN?.trim()??"";
  const supplied=req.headers.get(WRITE_TOKEN_HEADER)?.trim()??"";
  if(!expected||!supplied||!secure(expected,supplied))return "ETSY_DRAFT_WRITE_UNAUTHORIZED";
  if((req.headers.get("x-operation-id")?.trim()??"")!==OPERATION_ID)return "INVALID_OPERATION_ID";
  if((req.headers.get("x-auth-action")?.trim()??"")!==AUTH_ACTION)return "INVALID_AUTH_ACTION";
  const owner=req.headers.get(OWNER_AUTH_HEADER)?.trim()??"";
  if(!owner||!secure(shaText(owner),FRESH.ownerAuthorizationSha256))return "OWNER_AUTHORIZATION_SCOPE_INVALID";
  const commit=req.headers.get(COMMIT_HEADER)?.trim().toLowerCase()??"";
  if(!/^[a-f0-9]{40}$/.test(commit)||commit!==runtimeCommit())return "GIT_VERCEL_COMMIT_MISMATCH";
  return "";
}

async function patchMetadata(token:string,id:number){
  const before=await listing(token,id);
  if(!isRec(before)||text(before.state)!=="draft")throw new Error("PRE_METADATA_NOT_DRAFT");
  if(coreMatches(before))return {changed:false};
  const body=new URLSearchParams({title:FRESH.listing.title,description:FRESH.listing.description,price:FRESH.listing.priceUsd.toFixed(2),quantity:String(FRESH.listing.quantity),who_made:FRESH.listing.whoMade,when_made:FRESH.listing.whenMade,taxonomy_id:String(FRESH.listing.taxonomyId),type:FRESH.listing.listingType,tags:FRESH.listing.tags.join(",")});
  const r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${id}`,{method:"PATCH",headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded"},body,cache:"no-store"});
  if(!r.ok)throw new Error(`METADATA_PATCH_HTTP_${r.status}`);
  const after=await listing(token,id);
  if(!isRec(after)||!coreMatches(after))throw new Error("METADATA_READBACK_MISMATCH");
  return {changed:true};
}
function specFor(kind:string,rank:number){
  if(kind==="zip")return ZIP;
  if(kind==="video")return VIDEO;
  if(kind==="image"){if(rank<1||rank>IMAGES.length)throw new Error("IMAGE_RANK_INVALID");return IMAGES[rank-1];}
  throw new Error("ASSET_KIND_INVALID");
}
async function upload(token:string,id:number,kind:string,rank:number,file:File){
  const spec=specFor(kind,rank);
  if(file.name!==spec.name||file.size!==spec.size)throw new Error("ASSET_NAME_OR_SIZE_MISMATCH");
  const b=Buffer.from(await file.arrayBuffer());
  if(!secure(shaBytes(b),spec.sha256))throw new Error("ASSET_SHA256_MISMATCH");
  if(kind==="zip"){
    const ex=await files(token,id);
    if(ex.length){if(ex.length===1&&text(ex[0].filename).replace(/\s+/g,"")===spec.name.replace(/\s+/g,"")&&Number(ex[0].size_bytes)===spec.size)return {changed:false};throw new Error("BUYER_FILES_RECONCILIATION_REQUIRED");}
    const f=new FormData(); f.append("file",new File([new Uint8Array(b)],spec.name,{type:spec.mime}),spec.name); f.append("name",spec.name); f.append("rank","1");
    const r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${id}/files`,{method:"POST",headers:multipartHeaders(token),body:f,cache:"no-store"});
    if(!r.ok)throw new Error(`ZIP_UPLOAD_HTTP_${r.status}`);
    const rb=await files(token,id); if(rb.length!==1||Number(rb[0].size_bytes)!==spec.size||text(rb[0].filename).replace(/\s+/g,"")!==spec.name.replace(/\s+/g,""))throw new Error("ZIP_READBACK_MISMATCH");
    return {changed:true};
  }
  if(kind==="image"){
    const ex=await images(token,id); const hit=ex.find(x=>Number(x.rank)===rank);
    if(hit){if(text(hit.alt_text)===(spec.altText??""))return {changed:false};throw new Error("IMAGE_RANK_PRESENT_ALT_TEXT_MISMATCH");}
    if(ex.length!==rank-1)throw new Error("IMAGE_SEQUENCE_RECONCILIATION_REQUIRED");
    const f=new FormData(); f.append("image",new File([new Uint8Array(b)],spec.name,{type:spec.mime}),spec.name); f.append("rank",String(rank)); f.append("alt_text",spec.altText??"");
    const r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${id}/images`,{method:"POST",headers:multipartHeaders(token),body:f,cache:"no-store"});
    if(!r.ok)throw new Error(`IMAGE_UPLOAD_HTTP_${rank}_${r.status}`);
    const rb=await images(token,id); const saved=rb.find(x=>Number(x.rank)===rank); if(!saved||text(saved.alt_text)!==(spec.altText??""))throw new Error(`IMAGE_READBACK_MISMATCH_${rank}`);
    return {changed:true};
  }
  const ex=await videos(token,id); if(ex.some(x=>["active","processing"].includes(text(x.video_state))))return {changed:false};
  if(ex.length)throw new Error("VIDEO_RECONCILIATION_REQUIRED");
  const f=new FormData(); f.append("video",new File([new Uint8Array(b)],spec.name,{type:spec.mime}),spec.name); f.append("name",spec.name);
  const r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${id}/videos`,{method:"POST",headers:multipartHeaders(token),body:f,cache:"no-store"});
  if(!r.ok)throw new Error(`VIDEO_UPLOAD_HTTP_${r.status}`);
  for(let i=0;i<5;i++){const rb=await videos(token,id);if(rb.some(x=>["active","processing"].includes(text(x.video_state))))return {changed:true};await sleep(700);}
  throw new Error("VIDEO_READBACK_MISSING");
}
async function snapshot(token:string){
  const {id,s}=await findTarget(token); const l=await listing(token,id),fi=await files(token,id),im=await images(token,id),vi=await videos(token,id);
  const ordered=[...im].sort((a,b)=>Number(a.rank)-Number(b.rank));
  const imageAltTextOk=ordered.length===IMAGES.length&&ordered.every((x,i)=>Number(x.rank)===i+1&&text(x.alt_text)===(IMAGES[i].altText??""));
  return {productId:FRESH.productId,listingId:id,state:isRec(l)?text(l.state):"INVALID",metadataOk:isRec(l)&&coreMatches(l),buyerZipOk:fi.length===1&&text(fi[0].filename).replace(/\s+/g,"")===ZIP.name.replace(/\s+/g,"")&&Number(fi[0].size_bytes)===ZIP.size,fileCount:fi.length,imageCount:im.length,imageRanks:ordered.map(x=>Number(x.rank)),imageAltTextOk,videoCount:vi.length,videoStates:vi.map(x=>text(x.video_state)),protectedProductsUnchanged:protectedOk(s),publishPerformed:false,activatePerformed:false};
}
export async function GET(){
  try{const token=await getValidEtsyAccessToken(["listings_r"]);return NextResponse.json({status:"READ_ONLY",ETSY_WRITE_COUNT:0,...await snapshot(token)},{headers:{"cache-control":"no-store"}});}
  catch(e){return NextResponse.json({status:"BLOCKED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:0},{status:409});}
}
export async function POST(req:NextRequest){
  let writes=0;
  try{
    const auth=authError(req);if(auth)throw new Error(auth);
    const token=await getValidEtsyAccessToken(["listings_r","listings_w"]); const target=await findTarget(token);
    const ct=req.headers.get("content-type")??"";
    if(ct.includes("application/json")){
      const b=await req.json() as {action?:string;productId?:string};
      if(b.action!=="metadata"||b.productId!==FRESH.productId)throw new Error("METADATA_REQUEST_INVALID");
      const r=await patchMetadata(token,target.id);if(r.changed)writes++;
      return NextResponse.json({status:"DRAFT_METADATA_RECONCILED",productId:FRESH.productId,listingId:target.id,state:"draft",ETSY_WRITE_COUNT:writes,noPublishEnforced:true});
    }
    const fd=await req.formData(),pid=String(fd.get("productId")??""),kind=String(fd.get("kind")??""),rank=Number(fd.get("rank")??0),file=fd.get("file");
    if(pid!==FRESH.productId)throw new Error("PRODUCT_NOT_AUTHORIZED");if(!(file instanceof File))throw new Error("FILE_REQUIRED");
    const r=await upload(token,target.id,kind,rank,file);if(r.changed)writes++;
    return NextResponse.json({status:"DRAFT_ASSET_RECONCILED",productId:FRESH.productId,listingId:target.id,kind,rank,state:"draft",ETSY_WRITE_COUNT:writes,noPublishEnforced:true});
  }catch(e){return NextResponse.json({status:writes?"PARTIAL_WRITE_RECONCILIATION_REQUIRED":"BLOCKED_FAIL_CLOSED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:writes,noPublishEnforced:true},{status:writes?202:409});}
}
