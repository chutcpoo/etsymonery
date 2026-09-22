import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createListingFingerprint } from "../../../../../lib/candidate-fingerprint";
import { executeReconciledWrite } from "../../../../../lib/draft-upload-reconciliation";
import { EtsyDraftAssetProvider } from "../../../../../lib/etsy-draft-asset-provider";
import { etsyApiHeaders } from "../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../lib/etsy-auth";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "../../../../../lib/etsy-readback-normalizer";
import { getEtsySellerStateSnapshot } from "../../../../../lib/etsy-seller-state-reconciliation";
import { NeonOperationLedgerRepository } from "../../../../../lib/operation-ledger";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const SHOP_ID=23582741;
const LISTING_ID=4580303015;
const AUTH="AUTHORIZE PDT-RPT-003-V1-ETSY-MEDIA-PRICE-R01-20260922 EXACT SCOPE ONLY";
const NONCE="PDT-RPT-003-MEDIA-PRICE-R01-NONCE-9A31C2EF";

const DESCRIPTION=[
"Rental Property Tracker Excel workbook for small landlords and short-term rental hosts.","",
"Track rental income, cash expenses, long-term rent status, Airbnb/STR occupancy, and per-property performance in one formula-driven Excel workflow.","",
"WHAT'S INCLUDED","• 1 SAMPLE Excel workbook with fictional populated data","• 1 CLEAN START Excel workbook for your own records","• 8 tabs in each file: START HERE, PROPERTIES, INCOME, EXPENSES, RENT ROLL, STR OCCUPANCY, ANNUAL SUMMARY, DASHBOARD","",
"WHAT YOU CAN TRACK","• Up to 20 property records","• Rental income and other cash income","• Cash expenses by category and cash-flow class","• Expected rent vs. actual rent received","• Paid / Partial / Unpaid rent status","• STR available nights and booked nights","• Occupancy %","• Gross booking revenue","• ADR","• Revenue per available night","• Gross income, total cash expenses, and net cash flow","• Simple cash-on-cash return using your own Cash Invested amount","• Annual per-property summary","• Portfolio dashboard with monthly review","",
"HOW IT WORKS","Register each property once. Enter actual income in the INCOME tab and cash expenses in EXPENSES. RENT ROLL pulls long-term rent received from the income log, while STR OCCUPANCY pulls booking revenue from the same log. Annual Summary and Dashboard calculate review metrics from your entries.","",
"FORMAT","• Microsoft Excel .xlsx","• No macros","• No VBA","• No external data connections","• Currency: USD","• SAMPLE data is fictional","",
"IMPORTANT","This workbook is a manual operations and cash-flow tracker. It is not accounting software, tax preparation software, legal advice, accounting advice, tax advice, or investment advice. It does not determine deductibility, calculate depreciation, collect rent, screen tenants, connect to bank feeds, or connect automatically to Airbnb, Vrbo, or property-management systems.","",
"Google Sheets compatibility has not been verified for the exact final workbook, so this listing does not claim Google Sheets compatibility.","",
"Digital product. No physical item is shipped.","",
"AI DISCLOSURE","This digital workbook and listing assets were created with AI-assisted tools under seller direction and were reviewed and tested before release."
].join("\n");

const TAGS=["rental property","landlord tracker","rental spreadsheet","airbnb spreadsheet","property tracker","rental income","expense tracker","landlord excel","airbnb tracker","rental dashboard","property expenses","rent roll tracker","real estate excel"] as const;
const COMMON={title:"Rental Property Tracker Excel | Landlord Income Expense | Airbnb Spreadsheet Dashboard",description:DESCRIPTION,tags:[...TAGS],quantity:999,who_made:"i_did",when_made:"2020_2026",taxonomy_id:12476,type:"download",state:"draft"};
const CURRENT={...COMMON,priceUsd:9.99};
const FINAL={...COMMON,priceUsd:12.99};
const CURRENT_FP=createListingFingerprint(CURRENT);
const FINAL_FP=createListingFingerprint(FINAL);
const CANDIDATE_FP=createHash("sha256").update("PDT-RPT-003|V1|MEDIA-PRICE-R01","utf8").digest("hex");

const IMAGES=[
{rank:1,key:"image01Url",name:"01_hero_dashboard.png",size:88532,sha:"a63a7e36ca2015b988f5347f41d24cc06976a8779370f29de4de71828a68fb00",alt:"Excel rental property tracker dashboard showing gross income, cash expenses, net cash flow, cash-on-cash return, outstanding rent, STR occupancy, monthly review, and property table."},
{rank:2,key:"image02Url",name:"02_dashboard_overview.png",size:147581,sha:"00f65ea10030980171a9c0e3808c872ce3414615e6893eaf5591c95a01095ad5",alt:"Rental property Excel dashboard preview with KPI cards for income, expenses, net cash flow, outstanding rent, cash-on-cash return, and short-term rental occupancy."},
{rank:3,key:"image03Url",name:"03_rent_roll.png",size:121267,sha:"9c256f67494884a0566384d1dc8e7b4fe55bae7529ab73d9d98dbe6f419979a5",alt:"Rent Roll spreadsheet showing monthly expected rent, rent received, balance, and Paid or Partial status for fictional long-term rental examples."},
{rank:4,key:"image04Url",name:"04_str_tracking.png",size:138699,sha:"92c14c278ca001565747e46e45319e27ab1e3fa1c4e789b05a5f4e669e9ed3f2",alt:"Short-term rental occupancy spreadsheet showing available nights, booked nights, occupancy percentage, booking revenue, ADR, and revenue per available night."},
{rank:5,key:"image05Url",name:"05_income_expenses.png",size:130895,sha:"868aebdf2cc3b8a6cbd91d1f7f5e909bacb632fe5adbf7e87c182fe1a63357d2",alt:"Side-by-side Excel previews of the Income and Expenses tabs used to record rental cash transactions by property, category, date, amount, and notes."},
{rank:6,key:"image06Url",name:"06_annual_summary.png",size:141509,sha:"51ee38b0069ba5a99914fcf9497ee8b69f74ebe697368bd6cc94c29936dab0c7",alt:"Annual Summary spreadsheet preview showing per-property income, cash expenses, net cash flow, cash invested, cash-on-cash return, rent balance, and STR occupancy."},
{rank:7,key:"image07Url",name:"07_property_register.png",size:122467,sha:"f5ee66e47e4e6077ce82a74babf1664ddd1d1220ac3c5d7232a2aa2f90260742",alt:"Properties tab preview with fictional long-term and short-term rental records, property IDs, labels, rental type, units, cash invested, and notes."},
{rank:8,key:"image08Url",name:"08_eight_tabs.png",size:100817,sha:"0d13dee7d8bd5a94a16f7758e2f0048ad5214c7abd5aa9bdedb7c3620718bbc5",alt:"Graphic listing the eight workbook tabs: Start Here, Properties, Income, Expenses, Rent Roll, STR Occupancy, Annual Summary, and Dashboard."},
{rank:9,key:"image09Url",name:"09_two_files.png",size:84392,sha:"299a1ed342db79a50e461a858a20ac553e5c48eb886716e4479709b780678e30",alt:"Two digital Excel files shown as cards: a populated SAMPLE workbook and a CLEAN START workbook with formulas, validations, dashboard, and instructions."},
{rank:10,key:"image10Url",name:"10_product_boundaries.png",size:110093,sha:"8748fc96891615b64c4b316290e9a0eb57e6bf4c97f8ddc45b10b946e77cc411",alt:"Product boundaries graphic showing included rental tracking features and excluded functions such as bank feeds, rent collection, tax preparation, and Airbnb integration."}
] as const;

const FILES=[
{rank:1,name:"PDT-RPT-003_V1_Rental_Property_Tracker_SAMPLE_FINAL.xlsx",size:88570},
{rank:2,name:"PDT-RPT-003_V1_Rental_Property_Tracker_CLEAN_START_FINAL.xlsx",size:86643}
] as const;

type Rec=Record<string,unknown>;
const isRec=(v:unknown):v is Rec=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const txt=(r:Rec,k:string)=>typeof r[k]==="string"?(r[k] as string).normalize("NFC").trim():"";
const int=(r:Rec,k:string)=>{const n=Number(r[k]);return Number.isSafeInteger(n)?n:null;};
const eq=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const commit=()=>process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase()??"";
const gate=()=>true;
function obs(r:Rec):EtsyReadBackObservation{return{title:r.title,description:r.description,price:r.price as EtsyReadBackObservation["price"],tags:r.tags,quantity:r.quantity,who_made:r.who_made,when_made:r.when_made,taxonomy_id:r.taxonomy_id,type:r.listing_type??r.type??"download",state:r.state};}
async function json(r:Response){const t=await r.text();if(!t)return{};try{return JSON.parse(t) as unknown;}catch{return{};}}
async function rec(token:string,url:string,code:string){const r=await fetch(url,{headers:etsyApiHeaders(token),cache:"no-store"});if(!r.ok)throw new Error(code+"_HTTP_"+r.status);const v=await json(r);if(!isRec(v))throw new Error(code+"_INVALID");return v;}
async function listing(token:string){return rec(token,"https://api.etsy.com/v3/application/listings/"+LISTING_ID,"LISTING");}
async function assets(token:string,kind:"files"|"images"){const url=kind==="files"?"https://api.etsy.com/v3/application/shops/"+SHOP_ID+"/listings/"+LISTING_ID+"/files":"https://api.etsy.com/v3/application/listings/"+LISTING_ID+"/images";const v=await rec(token,url,kind.toUpperCase());if(!Array.isArray(v.results))throw new Error(kind.toUpperCase()+"_INVALID");return v.results.filter(isRec);}
async function verifyFp(token:string,expected:string){const l=await listing(token);const id=verifyEtsyReadBackIdentity(expected,obs(l));if(id.status!=="MATCH"||txt(l,"state")!=="draft")throw new Error("LISTING_IDENTITY_MISMATCH");return l;}
function filesMatch(rows:Rec[]){const a=[...rows].sort((x,y)=>(int(x,"rank")??0)-(int(y,"rank")??0));return a.length===2&&a.every((r,i)=>int(r,"rank")===FILES[i].rank&&txt(r,"filename")===FILES[i].name&&Number(r.size_bytes)===FILES[i].size);}
function fp(state:Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>,files:Rec[],images:Rec[]){return createHash("sha256").update(JSON.stringify({listingId:LISTING_ID,counts:state.counts,listings:state.listings.map(x=>({id:x.listingId,state:x.state,title:x.title})).sort((a,b)=>a.id-b.id),files:files.map(x=>({id:int(x,"listing_file_id"),rank:int(x,"rank"),name:txt(x,"filename"),size:Number(x.size_bytes??0)})).sort((a,b)=>(a.rank??0)-(b.rank??0)),images:images.map(x=>({id:int(x,"listing_image_id"),rank:int(x,"rank"),alt:txt(x,"alt_text")})).sort((a,b)=>(a.rank??0)-(b.rank??0))}),"utf8").digest("hex");}
function urlOk(raw:string){const u=new URL(raw);if(u.protocol!=="https:"||!u.hostname.endsWith(".oaiusercontent.com")||!u.pathname.includes("/files/")||!u.pathname.endsWith("/raw"))throw new Error("ASSET_URL_NOT_ALLOWED");return u.toString();}
async function stage(raw:string,size:number,sha:string){const r=await fetch(urlOk(raw),{cache:"no-store"});if(!r.ok)throw new Error("ASSET_FETCH_HTTP_"+r.status);const b=Buffer.from(await r.arrayBuffer());if(b.length!==size)throw new Error("ASSET_SIZE_MISMATCH");const actual=createHash("sha256").update(b).digest("hex");if(!eq(actual,sha))throw new Error("ASSET_SHA_MISMATCH");return b;}
async function patchPrice(token:string){
 const r=await fetch("https://api.etsy.com/v3/application/shops/"+SHOP_ID+"/listings/"+LISTING_ID,{method:"PATCH",headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({price:"12.99"}),cache:"no-store"});
 if(!r.ok)throw new Error("PRICE_PATCH_HTTP_"+r.status);
 await verifyFp(token,FINAL_FP);
}

async function plan(){
 const token=await getValidEtsyAccessToken(); await verifyFp(token,CURRENT_FP);
 const [files,images,state]=await Promise.all([assets(token,"files"),assets(token,"images"),getEtsySellerStateSnapshot({shopId:SHOP_ID,accessToken:token})]);
 return {status:"PLAN_ONLY",mode:"PDT_RPT_003_MEDIA_PRICE_R01",listingId:LISTING_ID,baselineMatches:filesMatch(files)&&images.length===0&&state.total===5&&state.counts.active===3&&state.counts.draft===2,protectedStateFingerprint:fp(state,files,images),currentBuyerFileCount:files.length,currentGalleryCount:images.length,currentPriceUsd:9.99,targetPriceUsd:12.99,authorizationRequired:AUTH,deploymentCommit:commit(),publishAuthorized:false,ETSY_WRITE_COUNT:0};
}

export async function GET(request:Request){
 const u=new URL(request.url);
 if(u.searchParams.get("action")!=="execute"){
   try{return NextResponse.json(await plan(),{headers:{"cache-control":"no-store"}});}catch(e){return NextResponse.json({status:"PLAN_BLOCKED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:0},{status:409,headers:{"cache-control":"no-store"}});}
 }
 let writes=0;
 try{
   if(!gate())throw new Error("RPT_MEDIA_PRICE_GATE_DISABLED");
   if(process.env.VERCEL_ENV!=="production")throw new Error("PRODUCTION_REQUIRED");
   if(!eq(u.searchParams.get("authorizationText")?.normalize("NFC").trim()??"",AUTH))throw new Error("AUTH_INVALID");
   if(!eq(u.searchParams.get("nonce")?.trim()??"",NONCE))throw new Error("NONCE_INVALID");
   const c=u.searchParams.get("commit")?.trim().toLowerCase()??"";if(!/^[a-f0-9]{40}$/.test(c)||!eq(c,commit()))throw new Error("COMMIT_MISMATCH");
   const supplied=u.searchParams.get("protectedStateFingerprint")?.trim().toLowerCase()??"";if(!/^[a-f0-9]{64}$/.test(supplied))throw new Error("PROTECTED_FP_INVALID");
   const token=await getValidEtsyAccessToken();await verifyFp(token,CURRENT_FP);
   const [beforeFiles,beforeImages,beforeState]=await Promise.all([assets(token,"files"),assets(token,"images"),getEtsySellerStateSnapshot({shopId:SHOP_ID,accessToken:token})]);
   if(!filesMatch(beforeFiles)||beforeImages.length!==0||beforeState.total!==5||beforeState.counts.active!==3||beforeState.counts.draft!==2)throw new Error("BASELINE_MISMATCH");
   if(!eq(fp(beforeState,beforeFiles,beforeImages),supplied))throw new Error("PROTECTED_STATE_DRIFT");
   const staged=new Map<number,Buffer>();
   for(const s of IMAGES)staged.set(s.rank,await stage(u.searchParams.get(s.key)??"",s.size,s.sha));
   const ledger=new NeonOperationLedgerRepository();
   for(const s of IMAGES){
     const b=staged.get(s.rank);if(!b)throw new Error("STAGED_MISSING_"+s.rank);
     const file=new File([new Uint8Array(b)],s.name,{type:"image/png"});
     const payload={operationKind:"UPLOAD_IMAGE" as const,candidateId:"PDT-RPT-003-V1",candidateFingerprint:CANDIDATE_FP,expectedListingFingerprint:CURRENT_FP,shopId:SHOP_ID,draftListingId:LISTING_ID,assetSha256:s.sha,assetName:s.name,rank:s.rank,altText:s.alt};
     const provider=new EtsyDraftAssetProvider(token,payload,file);
     const result=await executeReconciledWrite(ledger,provider,{operationId:"PDT-RPT-003-V1-ETSY-MEDIA-PRICE-R01-IMAGE-"+String(s.rank).padStart(2,"0"),kind:"UPLOAD_IMAGE",payload:{...payload},now:new Date().toISOString()});
     if(result.status==="RECONCILIATION_REQUIRED")return NextResponse.json({status:"RECONCILIATION_REQUIRED",rank:s.rank,ETSY_WRITE_COUNT:writes+1},{status:202});
     if(result.status!=="REPLAY")writes+=1;
   }
   await patchPrice(token);writes+=1;
   const [afterFiles,afterImages,afterState]=await Promise.all([assets(token,"files"),assets(token,"images"),getEtsySellerStateSnapshot({shopId:SHOP_ID,accessToken:token})]);
   await verifyFp(token,FINAL_FP);
   if(!filesMatch(afterFiles))throw new Error("FINAL_FILES_DRIFT");
   const ordered=[...afterImages].sort((a,b)=>(int(a,"rank")??0)-(int(b,"rank")??0));
   if(ordered.length!==10)throw new Error("FINAL_GALLERY_COUNT_MISMATCH");
   for(let i=0;i<IMAGES.length;i++){const e=IMAGES[i],a=ordered[i];if(int(a,"rank")!==e.rank||txt(a,"alt_text")!==e.alt)throw new Error("FINAL_IMAGE_MISMATCH_"+(i+1));}
   if(afterState.total!==beforeState.total||JSON.stringify(afterState.counts)!==JSON.stringify(beforeState.counts))throw new Error("SELLER_COUNT_DRIFT");
   return NextResponse.json({status:"MEDIA_PRICE_PASS",listingId:LISTING_ID,buyerFileCount:2,galleryCount:10,priceUsd:12.99,state:"draft",publishPerformed:false,ETSY_WRITE_COUNT:writes},{headers:{"cache-control":"no-store"}});
 }catch(e){return NextResponse.json({status:writes>0?"RECONCILIATION_REQUIRED":"BLOCKED_FAIL_CLOSED",error:e instanceof Error?e.message:"UNKNOWN",listingId:LISTING_ID,publishPerformed:false,ETSY_WRITE_COUNT:writes},{status:writes>0?202:409,headers:{"cache-control":"no-store"}});}
}
