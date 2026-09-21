import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHOP_ID = 23582741;
const TARGET_LISTING_ID = 4578945050;
const PROTECTED_LISTING_ID = 4579068925;
const GATE = "[GATE_IPT_MEDIA_POLICY_R01_EXECUTE]";
const AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-IPT-001-ETSY-MEDIA-POLICY-R01-20260921 EXACT SCOPE ONLY" as const;
const NONCE_SHA256 =
  "57281c99ab3f3a0b3b0fffbdf247abe8e9ca41f539ca1c10c4e8190682da56df";

const EXPECTED_TITLE =
  "Invoice Payment Tracker Excel | Accounts Receivable Aging & Follow-Up Spreadsheet for Small Business" as const;
const EXPECTED_TAGS = Object.freeze([
  "invoice tracker","payment tracker","accounts receivable","invoice spreadsheet",
  "overdue invoices","partial payments","client payment log","small business excel",
  "ar aging report","follow up tracker","invoice dashboard","outstanding balance",
  "receivable tracker"
] as const);
const EXPECTED_IMAGE_IDS = Object.freeze([
  8598604965,8598605049,8550732710,8550732788,8550732860,
  8598605345,8598605415,8550733072,8598605617,8550733260
] as const);
const EXPECTED_FILES = Object.freeze([
  { id:1517609000937, rank:1, name:"PDT-IPT-001_V2_Invoice_Payment_FollowUp_Tracker_CLEAN_START.xlsx", size:80573 },
  { id:1516372746174, rank:2, name:"PDT-IPT-001_V2_Invoice_Payment_FollowUp_Tracker_SAMPLE.xlsx", size:81123 }
] as const);

const BASE_DESCRIPTION = `Keep invoices, payments, overdue balances, and follow-up actions in one practical Excel workflow.

This Invoice Payment Tracker is an Excel spreadsheet for freelancers, consultants, independent service providers, and small service businesses that need a clearer way to monitor accounts receivable, partial payments, overdue invoices, aging, and the next follow-up action.

WHAT YOU RECEIVE

You receive 2 Microsoft Excel .xlsx files:

• SAMPLE — fictional example data so you can see how the workflow works

• CLEAN START — blank working file for your own invoice and payment records

Both files contain the same 7 tabs:

1. START HERE
2. SETTINGS
3. INVOICES
4. PAYMENTS
5. AGING & FOLLOW-UP
6. MONTHLY SUMMARY
7. DASHBOARD

WHAT THIS EXCEL TRACKER HELPS YOU DO

• Record invoice IDs, clients, invoice dates, due dates, and invoice amounts
• Log payments separately by Invoice ID
• Track partial and full payments
• Calculate remaining balances
• See Open, Paid, Partially Paid, and Overdue status
• See Due Soon, Due Today, and Overdue alerts
• Calculate days overdue and aging buckets
• Flag duplicate Invoice IDs
• Track last follow-up date and follow-up count
• Record contact status
• Record a promise-to-pay date
• Calculate the next follow-up date based on workbook logic
• Show next-action guidance
• Review monthly invoiced amounts and payments received
• Review dashboard KPIs for outstanding and overdue balances

FOLLOW-UP WORKFLOW

The workbook is designed to help you move from:

Invoice
→ Payment record
→ Remaining balance
→ Aging
→ Follow-up status
→ Promise-to-pay where applicable
→ Next follow-up date
→ Next action
→ Dashboard review

PARTIAL AND MULTIPLE PAYMENTS

Payments are recorded in a separate PAYMENTS tab and linked to the invoice by Invoice ID.

This lets the workbook total multiple payment records against the same invoice and calculate the remaining balance.

WHO THIS IS FOR

Designed for:

• Freelancers
• Consultants
• Independent service providers
• Small service businesses
• Solopreneurs
• Client-based businesses that invoice customers and manually track payments

MICROSOFT EXCEL COMPATIBILITY

Primary buyer format:
Microsoft Excel .xlsx

This V2 buyer package includes Excel files only.

Google Sheets files are not included in this release.

IMPORTANT PRODUCT BOUNDARIES

This is an operational tracking workbook.

It does not:

• Send invoices
• Send payment reminders automatically
• Process payments
• Connect to bank feeds
• Replace accounting or bookkeeping software
• Provide tax, legal, accounting, or collections advice
• Provide CRM automation
• Guarantee faster payment or collections results

Manual invoice and payment entry is required.

For best results, keep Invoice IDs consistent so payments link to the correct invoice.

DIGITAL PRODUCT

This is a digital product.
No physical item will be shipped.

Use the SAMPLE file first to understand the workflow, then keep the CLEAN START file as your working copy.`;

const AI_DISCLOSURE = `AI DISCLOSURE

AI tools were used to assist with planning, visual presentation, and workflow refinement. The final workbook files were reviewed, edited, and prepared by PoonthaiDigital.`;

const FINAL_DESCRIPTION = BASE_DESCRIPTION + "\n\n" + AI_DISCLOSURE;

const VIDEO = Object.freeze({
  param:"video",
  fileName:"PDT-IPT-001_ETSY_VIDEO_01_PRODUCT_WALKTHROUGH_R01.mp4",
  size:328864,
  sha256:"c6af205703eadbf92e2432fb3653de0f130b8f2c4b1fa372b468c132f45c7981",
  mimeType:"video/mp4"
});

type Rec = Record<string, unknown>;
function isRec(v:unknown):v is Rec { return typeof v==="object" && v!==null && !Array.isArray(v); }
function intField(r:Rec,k:string){ const v=r[k]; return typeof v==="number" && Number.isSafeInteger(v)?v:null; }
function textField(r:Rec,k:string){ const v=r[k]; return typeof v==="string"?v.normalize("NFC").trim():""; }
function comparableText(v:string){ let o=v.normalize("NFC").replace(/\r\n?/g,"\n").trim(); for(let i=0;i<2;i++) o=o.replace(/&quot;|&#34;|&#x22;/gi,'"').replace(/&apos;|&#39;|&#x27;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&amp;/gi,"&"); return o; }
function secureEqual(a:string,b:string){ const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
function nonceOk(v:string){ return secureEqual(createHash("sha256").update(v,"utf8").digest("hex"),NONCE_SHA256); }
function gateEnabled(){ return process.env.VERCEL_ENV==="production" && (process.env.VERCEL_GIT_COMMIT_MESSAGE??"").includes(GATE); }
function multipartHeaders(token:string){ const h=etsyApiHeaders(token); delete h["content-type"]; return h; }
function allowedUrl(raw:string){ const u=new URL(raw); if(u.protocol!=="https:") throw new Error("ASSET_URL_PROTOCOL"); if(!/^sdmntpr[a-z0-9-]*\.oaiusercontent\.com$/i.test(u.hostname)) throw new Error("ASSET_URL_HOST"); return u.toString(); }
async function parseJson(r:Response){ const t=await r.text(); if(!t) return {}; try{return JSON.parse(t) as unknown;}catch{return{};} }
async function getRecord(token:string,url:string,code:string){
  const waits=[0,1500,3000,5000,8000];
  let lastStatus=0;
  for(const ms of waits){
    if(ms>0) await new Promise(r=>setTimeout(r,ms));
    const r=await fetch(url,{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"});
    lastStatus=r.status;
    if(r.status===429) continue;
    if(!r.ok) throw new Error(code+"_HTTP_"+r.status);
    const v=await parseJson(r);
    if(!isRec(v)) throw new Error(code+"_INVALID");
    return v;
  }
  throw new Error(code+"_HTTP_"+lastStatus);
}
function records(v:unknown,code:string){ if(!isRec(v)||!Array.isArray(v.results)) throw new Error(code); return v.results.filter(isRec); }
function sameStrings(v:unknown,e:readonly string[]){ return Array.isArray(v)&&v.length===e.length&&v.every((x,i)=>typeof x==="string"&&x.normalize("NFC").trim()===e[i]); }
function exactPrice(price:unknown){ if(!isRec(price)) return false; const a=Number(price.amount),d=Number(price.divisor); return Number.isFinite(a)&&Number.isFinite(d)&&d>0&&Number((a/d).toFixed(2))===7.99&&textField(price,"currency_code").toUpperCase()==="USD"; }

async function fetchAsset(url:string,size:number,sha:string){
  const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error("VIDEO_FETCH_HTTP_"+r.status);
  const b=Buffer.from(await r.arrayBuffer()); if(b.length!==size) throw new Error("VIDEO_SIZE_MISMATCH");
  const actual=createHash("sha256").update(b).digest("hex"); if(!secureEqual(actual,sha)) throw new Error("VIDEO_SHA256_MISMATCH"); return b;
}

async function readAll(token:string){
  const base="https://api.etsy.com/v3/application";
  const [listing,imagesP,filesP,videosP,protectedListing]=await Promise.all([
    getRecord(token,base+"/listings/"+TARGET_LISTING_ID,"LISTING"),
    getRecord(token,base+"/listings/"+TARGET_LISTING_ID+"/images","IMAGES"),
    getRecord(token,base+"/shops/"+SHOP_ID+"/listings/"+TARGET_LISTING_ID+"/files","FILES"),
    getRecord(token,base+"/listings/"+TARGET_LISTING_ID+"/videos","VIDEOS"),
    getRecord(token,base+"/listings/"+PROTECTED_LISTING_ID,"PROTECTED")
  ]);
  return { listing, images:records(imagesP,"IMAGES_INVALID"), files:records(filesP,"FILES_INVALID"), videos:records(videosP,"VIDEOS_INVALID"), protectedListing };
}

function ordered(rows:Rec[],key:string){ return [...rows].sort((a,b)=>(intField(a,key)??0)-(intField(b,key)??0)); }

function immutableMatches(s:Awaited<ReturnType<typeof readAll>>){
  const imgs=ordered(s.images,"rank"), files=ordered(s.files,"rank");
  return textField(s.listing,"state")==="active" &&
    textField(s.listing,"title")===EXPECTED_TITLE &&
    exactPrice(s.listing.price) &&
    Number(s.listing.quantity)===999 &&
    textField(s.listing,"who_made")==="i_did" &&
    textField(s.listing,"listing_type")==="download" &&
    sameStrings(s.listing.tags,EXPECTED_TAGS) &&
    imgs.length===10 &&
    imgs.every((r,i)=>intField(r,"rank")===i+1 && intField(r,"listing_image_id")===EXPECTED_IMAGE_IDS[i] && Number(r.full_width)===2000 && Number(r.full_height)===2000) &&
    files.length===2 &&
    files.every((r,i)=>intField(r,"listing_file_id")===EXPECTED_FILES[i].id && intField(r,"rank")===EXPECTED_FILES[i].rank && textField(r,"filename")===EXPECTED_FILES[i].name && Number(r.size_bytes)===EXPECTED_FILES[i].size) &&
    textField(s.protectedListing,"state")==="active" &&
    textField(s.protectedListing,"title")==="Restaurant Food Cost Calculator | Recipe & Menu Pricing Excel Template";
}
function baselineMatches(s:Awaited<ReturnType<typeof readAll>>){ return immutableMatches(s)&&comparableText(textField(s.listing,"description"))===comparableText(BASE_DESCRIPTION)&&s.videos.length===0; }
function finalMatches(s:Awaited<ReturnType<typeof readAll>>){ return immutableMatches(s)&&comparableText(textField(s.listing,"description"))===comparableText(FINAL_DESCRIPTION)&&s.videos.length===1&&textField(s.videos[0],"video_state")==="active"; }

async function patchDescription(token:string){
  const r=await fetch("https://api.etsy.com/v3/application/shops/"+SHOP_ID+"/listings/"+TARGET_LISTING_ID,{method:"PATCH",headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({description:FINAL_DESCRIPTION}),cache:"no-store"});
  if(!r.ok) throw new Error("DESCRIPTION_PATCH_HTTP_"+r.status);
}
async function uploadVideo(token:string,bytes:Buffer){
  const body=new FormData(); body.append("video",new File([new Uint8Array(bytes)],VIDEO.fileName,{type:VIDEO.mimeType}),VIDEO.fileName); body.append("name",VIDEO.fileName);
  const r=await fetch("https://api.etsy.com/v3/application/shops/"+SHOP_ID+"/listings/"+TARGET_LISTING_ID+"/videos",{method:"POST",headers:multipartHeaders(token),body,cache:"no-store"});
  if(!r.ok) throw new Error("VIDEO_UPLOAD_HTTP_"+r.status); const v=await parseJson(r); if(!isRec(v)||!intField(v,"video_id")) throw new Error("VIDEO_UPLOAD_RECEIPT_INVALID"); return intField(v,"video_id");
}
async function sleep(ms:number){ await new Promise(r=>setTimeout(r,ms)); }

function snapshot(s:Awaited<ReturnType<typeof readAll>>){
  return {
    listing:{state:textField(s.listing,"state"),title:textField(s.listing,"title"),priceMatches:exactPrice(s.listing.price),descriptionHasAiDisclosure:comparableText(textField(s.listing,"description")).endsWith(comparableText(AI_DISCLOSURE)),tags:Array.isArray(s.listing.tags)?s.listing.tags:[]},
    gallery:{count:s.images.length,imageIds:ordered(s.images,"rank").map(r=>intField(r,"listing_image_id")),all2000:s.images.every(r=>Number(r.full_width)===2000&&Number(r.full_height)===2000)},
    buyerFiles:{count:s.files.length,ids:ordered(s.files,"rank").map(r=>intField(r,"listing_file_id")),names:ordered(s.files,"rank").map(r=>textField(r,"filename"))},
    video:{count:s.videos.length,rows:s.videos.map(v=>({videoId:intField(v,"video_id"),state:textField(v,"video_state"),width:Number(v.width),height:Number(v.height)}))},
    protectedRestaurant:{listingId:PROTECTED_LISTING_ID,state:textField(s.protectedListing,"state"),title:textField(s.protectedListing,"title")}
  };
}

export async function GET(request:Request){
  const url=new URL(request.url); const action=url.searchParams.get("action")??"plan";
  if(action==="diagnose"){
    try{ const token=await getValidEtsyAccessToken(); const s=await readAll(token); return NextResponse.json({status:"DIAGNOSTIC_READ_ONLY",mode:"PDT_IPT_001_MEDIA_POLICY_R01",...snapshot(s),baselineMatches:baselineMatches(s),finalMatches:finalMatches(s),ETSY_WRITE_COUNT:0},{headers:{"cache-control":"no-store"}}); }
    catch(e){ return NextResponse.json({status:"DIAGNOSTIC_BLOCKED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:0},{status:409}); }
  }
  if(action!=="execute"){
    return NextResponse.json({status:"PLAN_ONLY",mode:"PDT_IPT_001_MEDIA_POLICY_R01",targetListingId:TARGET_LISTING_ID,protectedListingId:PROTECTED_LISTING_ID,exactScope:{description:"APPEND_AI_DISCLOSURE_ONLY",video:"UPLOAD_ONE_CANONICAL_MP4",images:"VERIFY_ONLY_DO_NOT_TOUCH",buyerFiles:"VERIFY_ONLY_DO_NOT_TOUCH",title:"VERIFY_ONLY_DO_NOT_TOUCH",tags:"VERIFY_ONLY_DO_NOT_TOUCH",price:"VERIFY_ONLY_DO_NOT_TOUCH",aiGeneratorSetting:"NOT_EXPOSED_BY_CURRENT_OPEN_API"},authorizationRequired:AUTHORIZATION_TEXT,gateEnabled:gateEnabled(),productionMutationExecuted:false,ETSY_WRITE_COUNT:0});
  }

  let writes=0;
  try{
    if(!gateEnabled()) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"IPT_MEDIA_POLICY_GATE_DISABLED",ETSY_WRITE_COUNT:0},{status:403});
    const auth=url.searchParams.get("authorizationText")?.normalize("NFC").trim()??"";
    if(!secureEqual(auth,AUTHORIZATION_TEXT)) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"AUTHORIZATION_INVALID",ETSY_WRITE_COUNT:0},{status:401});
    const nonce=url.searchParams.get("nonce")?.trim()??"";
    if(!nonce||!nonceOk(nonce)) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"NONCE_INVALID",ETSY_WRITE_COUNT:0},{status:401});

    const token=await getValidEtsyAccessToken();
    const before=await readAll(token);
    if(!baselineMatches(before)) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"BASELINE_MISMATCH",...snapshot(before),ETSY_WRITE_COUNT:0},{status:409});

    const videoBytes=await fetchAsset(allowedUrl(url.searchParams.get(VIDEO.param)??""),VIDEO.size,VIDEO.sha256);
    const fresh=await readAll(token);
    if(!baselineMatches(fresh)) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"FRESH_BASELINE_MISMATCH",...snapshot(fresh),ETSY_WRITE_COUNT:0},{status:409});

    await patchDescription(token); writes++;
    const videoId=await uploadVideo(token,videoBytes); writes++;

    let finalState=await readAll(token);
    const waits=[1500,2500,4000,6000,8000];
    for(const ms of waits){
      if(finalMatches(finalState)) break;
      await sleep(ms);
      try{ finalState=await readAll(token); } catch(e){ if(e instanceof Error && e.message.includes("HTTP_429")) continue; throw e; }
    }

    if(!finalMatches(finalState)) return NextResponse.json({status:"IPT_MEDIA_POLICY_R01_INCOMPLETE_RECOVERY_REQUIRED",error:"FINAL_VERIFY_FAILED",videoId,...snapshot(finalState),ETSY_WRITE_COUNT:1,etsyProviderWriteCalls:writes},{status:202,headers:{"cache-control":"no-store"}});

    return NextResponse.json({status:"IPT_MEDIA_POLICY_R01_PASS",targetListingId:TARGET_LISTING_ID,videoId,...snapshot(finalState),titleUnchanged:true,tagsUnchanged:true,priceUnchanged:true,buyerFilesUnchanged:true,imagesUnchanged:true,protectedRestaurantUnchanged:true,aiDisclosureTextPresent:true,aiGeneratorSetting:"NOT_EXPOSED_BY_CURRENT_OPEN_API",authorizationTokenConsumed:true,ETSY_WRITE_COUNT:1,etsyProviderWriteCalls:writes},{headers:{"cache-control":"no-store"}});
  }catch(e){
    return NextResponse.json({status:writes>0?"IPT_MEDIA_POLICY_R01_INCOMPLETE_RECOVERY_REQUIRED":"BLOCKED_FAIL_CLOSED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:writes>0?1:0,etsyProviderWriteCalls:writes},{status:writes>0?202:400,headers:{"cache-control":"no-store"}});
  }
}
