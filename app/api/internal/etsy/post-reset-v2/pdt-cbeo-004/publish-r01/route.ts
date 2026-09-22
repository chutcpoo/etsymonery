import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { fetchEtsyReadWithRetry } from "../../../../../../../lib/etsy-http";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../../../lib/etsy-seller-state-reconciliation";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const SHOP_ID=23582741;
const TARGET_LISTING_ID=4580126260;
const AUTHORIZATION_TEXT="AUTHORIZE PDT-CBEO-004-V1-ETSY-PUBLISH-R01-20260922 EXACT SCOPE ONLY";
const NONCE_SHA256="3ce109bd0893bf1c80430e2be673e7a7d8285fd3dfb9b01288a1f90753a887ef";
const CANDIDATE_FINGERPRINT="758335490c54ba8a293045867a1344eed4e27aec2a4bef5c8919d026d8edd067";
const LISTING_FINGERPRINT="2c19e1f00b8786f264e6091d9286723f3116dc9810a189ac82557cb38387eafb";
const TITLE="Banquet Event Order Template | Catering BEO & Event Tracker | Excel Spreadsheet";
const DESCRIPTION=`This Excel-based Banquet Event Order template helps independent caterers organize event details, menu and service items, staffing and equipment requirements, payments, and a BEO-style operational summary in one connected workbook.

WHAT YOU GET
• 1 SAMPLE workbook with fictional demonstration data
• 1 CLEAN START workbook for your own events
• Microsoft Excel .xlsx files
• 8 connected tabs:
  01 START HERE
  02 EVENTS
  03 EVENT DETAILS
  04 MENU & SERVICES
  05 STAFF & EQUIPMENT
  06 PAYMENTS
  07 BEO OUTPUT
  08 DASHBOARD

WHAT IT HELPS YOU TRACK
• Client and event details
• Event date, venue, guest count, service times, and status
• Menu and service line items
• Staff, equipment, rental, and AV requirements
• User-entered tax, service fee, and deposit settings
• Deposits, payments, refunds, net paid, and balance due
• A selectable BEO-style operational event summary
• Upcoming events and practical dashboard rollups

HOW IT WORKS
Create a unique Event ID, enter the event facts, add menu/service items, record operational requirements and payment activity, then select the Event ID in the BEO OUTPUT tab. The workbook pulls the connected records into one readable event-order summary and rolls current records into the dashboard.

GOOD FIT FOR
• Independent caterers and small catering companies
• Restaurant operators with catering or private-event service
• Small banquet/event teams managing food-service-led events
• Private chefs managing multi-detail catered events

IMPORTANT PRODUCT BOUNDARIES
• Built and tested for Microsoft Excel desktop
• Google Sheets compatibility is not claimed in V1
• Manual data entry; no CRM, POS, calendar, email, accounting, or payment integrations
• Does not process or transmit payments
• Staff/equipment sections track requirements only; they are not scheduling or inventory systems
• Tax and service-fee calculations use rates entered by the user and do not provide tax advice
• BEO OUTPUT is an operational summary, not a legal contract, invoice, e-signature document, or payment-processing system

Digital product. No physical item is shipped.

AI DISCLOSURE
This digital workbook was created with AI-assisted tools under seller direction and was reviewed and tested before release.`;

const TAGS=[
"banquet event order","catering event form","catering planner","BEO template",
"catering spreadsheet","event order template","banquet order form","catering workflow",
"event detail tracker","deposit tracker","event service sheet","private chef planner","catering excel"
] as const;

const ALT_TEXTS=[
"Banquet Event Order template hero image showing the real Excel BEO operational event summary workbook.",
"Real Excel catering dashboard showing upcoming events, guest counts, balances, deposits, and event status.",
"BEO output worksheet showing one selected catering event with operational notes, menu items, requirements, payments, and totals.",
"Excel master event register showing client, venue, guest count, timing, rates, and event status fields.",
"Menu and Services worksheet showing billable food, beverage, service, and rental line items by Event ID.",
"Staff and Equipment worksheet showing catering staff, equipment, rental, AV, quantity, and needed-by requirements.",
"Payments worksheet showing manual deposits, payments, refunds, methods, references, and signed amounts by Event ID.",
"Start Here worksheet and overview of the eight connected Excel tabs in the catering BEO workflow.",
"Digital product contents showing SAMPLE and CLEAN START Microsoft Excel XLSX workbook files.",
"Buyer fit and product boundaries for the catering BEO Excel tracker, including supported and unsupported use cases."
] as const;

const IMAGE_IDS=[8559552838,8607411247,8559553094,8607411449,8559553326,8607411699,8607411775,8559553570,8559553692,8559553838] as const;
const FILE_IDS=[1518077137293,1516837916828] as const;
const FILE_NAMES=[
"PDT-CBEO-004_V1_Catering_BEO_Event_Planning_Tracker_SAMPLE.xlsx",
"PDT-CBEO-004_V1_Catering_BEO_Event_Planning_Tracker_CLEAN_START.xlsx"
] as const;
const FILE_SIZES=[88292,83888] as const;

type Rec=Record<string,unknown>;
function isRec(v:unknown):v is Rec{return typeof v==="object"&&v!==null&&!Array.isArray(v);}
function textField(r:Rec,k:string){const v=r[k];return typeof v==="string"?v.normalize("NFC").trim():"";}
function intField(r:Rec,k:string){const v=Number(r[k]);return Number.isSafeInteger(v)?v:null;}
function comparable(v:string){let o=v.normalize("NFC").replace(/\r\n?/g,"\n").trim();for(let i=0;i<2;i++)o=o.replace(/&quot;|&#34;|&#x22;/gi,'"').replace(/&apos;|&#39;|&#x27;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&amp;/gi,"&");return o;}
function sameStrings(v:unknown,e:readonly string[]){return Array.isArray(v)&&v.length===e.length&&v.every((x,i)=>typeof x==="string"&&x.normalize("NFC").trim()===e[i]);}
function secureEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function nonceOk(v:string){return secureEqual(createHash("sha256").update(v,"utf8").digest("hex"),NONCE_SHA256);}
function runtimeCommit(){return process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase()??"";}
function gateEnabled(){return false;}
function exactPrice(v:unknown){if(!isRec(v))return false;return Number(v.amount)===999&&Number(v.divisor)===100&&textField(v,"currency_code").toUpperCase()==="USD";}
async function parseJson(r:Response){const t=await r.text();if(!t)return{};try{return JSON.parse(t) as unknown;}catch{return{};}}
async function getRecord(token:string,url:string,code:string){
 const r=await fetchEtsyReadWithRetry(fetch,url,{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"});
 if(!r.ok)throw new Error(code+"_HTTP_"+r.status);
 const v=await parseJson(r); if(!isRec(v))throw new Error(code+"_INVALID"); return v;
}
function records(v:unknown,code:string){if(!isRec(v)||!Array.isArray(v.results))throw new Error(code);return v.results.filter(isRec);}

async function verify(targetState:"draft"|"active"){
 const token=await getValidEtsyAccessToken();
 const base="https://api.etsy.com/v3/application";
 const [listing,imagesP,filesP,seller]=await Promise.all([
   getRecord(token,base+"/listings/"+TARGET_LISTING_ID,"CBEO_LISTING"),
   getRecord(token,base+"/listings/"+TARGET_LISTING_ID+"/images","CBEO_IMAGES"),
   getRecord(token,base+"/shops/"+SHOP_ID+"/listings/"+TARGET_LISTING_ID+"/files","CBEO_FILES"),
   getEtsySellerStateSnapshot({shopId:SHOP_ID,accessToken:token})
 ]);
 const images=records(imagesP,"CBEO_IMAGES_INVALID").sort((a,b)=>(intField(a,"rank")??0)-(intField(b,"rank")??0));
 const files=records(filesP,"CBEO_FILES_INVALID").sort((a,b)=>(intField(a,"rank")??0)-(intField(b,"rank")??0));
 const listingMatches=
   textField(listing,"state")===targetState&&
   textField(listing,"title")===TITLE&&
   comparable(textField(listing,"description"))===comparable(DESCRIPTION)&&
   exactPrice(listing.price)&&
   Number(listing.quantity)===999&&
   Number(listing.taxonomy_id)===12476&&
   sameStrings(listing.tags,TAGS);
 const galleryMatches=images.length===10&&images.every((r,i)=>
   intField(r,"rank")===i+1&&
   intField(r,"listing_image_id")===IMAGE_IDS[i]&&
   textField(r,"alt_text")===ALT_TEXTS[i]&&
   Number(r.full_width)===4000&&Number(r.full_height)===2250
 );
 const buyerFilesMatch=files.length===2&&files.every((r,i)=>
   intField(r,"rank")===i+1&&
   intField(r,"listing_file_id")===FILE_IDS[i]&&
   textField(r,"filename")===FILE_NAMES[i]&&
   Number(r.size_bytes)===FILE_SIZES[i]
 );
 const protectedListingsMatch=
   seller.total===4&&
   seller.counts.active===(targetState==="draft"?2:3)&&
   seller.counts.draft===(targetState==="draft"?2:1)&&
   seller.counts.inactive===0&&seller.counts.sold_out===0&&seller.counts.expired===0&&
   seller.listings.some(x=>x.listingId===4579068925&&x.state==="active"&&x.title==="Recipe Cost Calculator | Restaurant Food Cost & Menu Pricing Excel Template")&&
   seller.listings.some(x=>x.listingId===4578945050&&x.state==="active"&&x.title==="Invoice Payment Tracker Excel | Accounts Receivable Aging & Follow-Up Spreadsheet for Small Business")&&
   seller.listings.some(x=>x.listingId===4579470012&&x.state==="draft"&&x.title==="Bar Inventory Spreadsheet | Liquor Stock & Pour Cost Tracker")&&
   seller.listings.some(x=>x.listingId===TARGET_LISTING_ID&&x.state===targetState&&x.title===TITLE);
 return {listingMatches,galleryMatches,buyerFilesMatch,protectedListingsMatch,sellerCounts:seller.counts,total:seller.total,imageCount:images.length,buyerFileCount:files.length};
}

async function publishOnce(token:string){
 const r=await fetch("https://api.etsy.com/v3/application/shops/"+SHOP_ID+"/listings/"+TARGET_LISTING_ID,{
   method:"PATCH",
   headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded"},
   body:new URLSearchParams({state:"active"}),
   cache:"no-store"
 });
 if(r.status>=500)throw new Error("CBEO_PUBLISH_AMBIGUOUS_HTTP_"+r.status);
 if(!r.ok)throw new Error("CBEO_PUBLISH_REJECTED_HTTP_"+r.status);
}

export async function GET(request:Request){
 const url=new URL(request.url);

 if(url.searchParams.get("action")==="reconcile_readonly"){
   try{
     const v=await verify("active");
     const pass=v.listingMatches&&v.galleryMatches&&v.buyerFilesMatch&&v.protectedListingsMatch;
     return NextResponse.json({
       status:pass?"PDT_CBEO_004_PUBLISH_R01_RECONCILED":"PDT_CBEO_004_PUBLISH_R01_RECONCILE_BLOCKED",
       mode:"READ_ONLY",targetListingId:TARGET_LISTING_ID,listingFingerprint:LISTING_FINGERPRINT,
       candidateFingerprint:CANDIDATE_FINGERPRINT,...v,mutationEnabled:false,publishAuthorized:false,ETSY_WRITE_COUNT:0
     },{status:pass?200:409,headers:{"cache-control":"no-store"}});
   }catch(e){
     return NextResponse.json({status:"PDT_CBEO_004_PUBLISH_R01_RECONCILE_BLOCKED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:0},{status:409,headers:{"cache-control":"no-store"}});
   }
 }

 if(url.searchParams.get("action")==="execute"){
   let writes=0;
   try{
     if(!gateEnabled())return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"CBEO_PUBLISH_R01_GATE_DISABLED",ETSY_WRITE_COUNT:0},{status:403});
     if(process.env.VERCEL_ENV!=="production")throw new Error("CBEO_PUBLISH_PRODUCTION_RUNTIME_REQUIRED");
     const auth=url.searchParams.get("authorizationText")?.normalize("NFC").trim()??"";
     if(!secureEqual(auth,AUTHORIZATION_TEXT))throw new Error("CBEO_PUBLISH_AUTHORIZATION_INVALID");
     const nonce=url.searchParams.get("nonce")?.trim()??"";
     if(!nonce||!nonceOk(nonce))throw new Error("CBEO_PUBLISH_NONCE_INVALID");
     const commit=url.searchParams.get("commit")?.trim().toLowerCase()??"";
     const deploymentCommit=runtimeCommit();
     if(!/^[a-f0-9]{40}$/.test(commit)||!secureEqual(commit,deploymentCommit))throw new Error("CBEO_PUBLISH_GIT_VERCEL_COMMIT_MISMATCH");

     const before=await verify("draft");
     if(!before.listingMatches||!before.galleryMatches||!before.buyerFilesMatch||!before.protectedListingsMatch){
       return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"CBEO_PUBLISH_FRESH_PROTECTED_STATE_MISMATCH",...before,ETSY_WRITE_COUNT:0},{status:409,headers:{"cache-control":"no-store"}});
     }

     const token=await getValidEtsyAccessToken();
     await publishOnce(token); writes=1;

     try{
       const after=await verify("active");
       const pass=after.listingMatches&&after.galleryMatches&&after.buyerFilesMatch&&after.protectedListingsMatch;
       if(!pass)return NextResponse.json({status:"RECONCILIATION_REQUIRED",error:"CBEO_PUBLISH_FINAL_VERIFY_MISMATCH",...after,authorizationConsumed:true,ETSY_WRITE_COUNT:1},{status:202,headers:{"cache-control":"no-store"}});
       return NextResponse.json({
         status:"PDT_CBEO_004_PUBLISH_R01_PASS",targetListingId:TARGET_LISTING_ID,state:"active",
         listingFingerprint:LISTING_FINGERPRINT,candidateFingerprint:CANDIDATE_FINGERPRINT,
         protectedListingsUnchanged:true,authorizationConsumed:true,...after,ETSY_WRITE_COUNT:1
       },{headers:{"cache-control":"no-store"}});
     }catch(e){
       return NextResponse.json({status:"RECONCILIATION_REQUIRED",error:e instanceof Error?e.message:"UNKNOWN",targetListingId:TARGET_LISTING_ID,authorizationConsumed:true,ETSY_WRITE_COUNT:1},{status:202,headers:{"cache-control":"no-store"}});
     }
   }catch(e){
     return NextResponse.json({status:writes>0?"RECONCILIATION_REQUIRED":"BLOCKED_FAIL_CLOSED",error:e instanceof Error?e.message:"UNKNOWN",targetListingId:TARGET_LISTING_ID,ETSY_WRITE_COUNT:writes},{status:writes>0?202:400,headers:{"cache-control":"no-store"}});
   }
 }

 try{
   const v=await verify("draft");
   const ready=v.listingMatches&&v.galleryMatches&&v.buyerFilesMatch&&v.protectedListingsMatch;
   return NextResponse.json({
     status:ready?"PDT_CBEO_004_PUBLISH_R01_READY":"PDT_CBEO_004_PUBLISH_R01_BLOCKED",
     mode:"PLAN_ONLY",targetListingId:TARGET_LISTING_ID,listingFingerprint:LISTING_FINGERPRINT,
     candidateFingerprint:CANDIDATE_FINGERPRINT,...v,mutationEnabled:gateEnabled(),publishAuthorized:true,
     authorizationRequired:AUTHORIZATION_TEXT,deploymentCommit:runtimeCommit(),ETSY_WRITE_COUNT:0
   },{status:ready?200:409,headers:{"cache-control":"no-store"}});
 }catch(e){
   return NextResponse.json({status:"PDT_CBEO_004_PUBLISH_R01_BLOCKED",error:e instanceof Error?e.message:"UNKNOWN",mutationEnabled:false,publishAuthorized:false,ETSY_WRITE_COUNT:0},{status:409,headers:{"cache-control":"no-store"}});
 }
}
