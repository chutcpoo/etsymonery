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
const AUTH="AUTHORIZE PDT-RPT-003-V1-ETSY-BUYERFILES-R01-20260922 EXACT SCOPE ONLY";
const NONCE="PDT-RPT-003-BUYERFILES-R01-NONCE-82D44C1E";

const DESCRIPTION=[
"Rental Property Tracker Excel workbook for small landlords and short-term rental hosts.","",
"Track rental income, cash expenses, long-term rent status, Airbnb/STR occupancy, and per-property performance in one formula-driven Excel workflow.","",
"WHAT'S INCLUDED",
"• 1 SAMPLE Excel workbook with fictional populated data",
"• 1 CLEAN START Excel workbook for your own records",
"• 8 tabs in each file: START HERE, PROPERTIES, INCOME, EXPENSES, RENT ROLL, STR OCCUPANCY, ANNUAL SUMMARY, DASHBOARD","",
"WHAT YOU CAN TRACK",
"• Up to 20 property records","• Rental income and other cash income","• Cash expenses by category and cash-flow class",
"• Expected rent vs. actual rent received","• Paid / Partial / Unpaid rent status","• STR available nights and booked nights",
"• Occupancy %","• Gross booking revenue","• ADR","• Revenue per available night",
"• Gross income, total cash expenses, and net cash flow",
"• Simple cash-on-cash return using your own Cash Invested amount",
"• Annual per-property summary","• Portfolio dashboard with monthly review","",
"HOW IT WORKS",
"Register each property once. Enter actual income in the INCOME tab and cash expenses in EXPENSES. RENT ROLL pulls long-term rent received from the income log, while STR OCCUPANCY pulls booking revenue from the same log. Annual Summary and Dashboard calculate review metrics from your entries.","",
"FORMAT","• Microsoft Excel .xlsx","• No macros","• No VBA","• No external data connections","• Currency: USD","• SAMPLE data is fictional","",
"IMPORTANT",
"This workbook is a manual operations and cash-flow tracker. It is not accounting software, tax preparation software, legal advice, accounting advice, tax advice, or investment advice. It does not determine deductibility, calculate depreciation, collect rent, screen tenants, connect to bank feeds, or connect automatically to Airbnb, Vrbo, or property-management systems.","",
"Google Sheets compatibility has not been verified for the exact final workbook, so this listing does not claim Google Sheets compatibility.","",
"Digital product. No physical item is shipped.","",
"AI DISCLOSURE",
"This digital workbook and listing assets were created with AI-assisted tools under seller direction and were reviewed and tested before release."
].join("\n");

const TAGS=["rental property","landlord tracker","rental spreadsheet","airbnb spreadsheet","property tracker","rental income","expense tracker","landlord excel","airbnb tracker","rental dashboard","property expenses","rent roll tracker","real estate excel"] as const;

const CURRENT={
 title:"Rental Property Tracker Excel | Landlord Income Expense | Airbnb Spreadsheet Dashboard",
 description:DESCRIPTION,priceUsd:9.99,tags:[...TAGS],quantity:999,who_made:"i_did",when_made:"2020_2026",taxonomy_id:12476,type:"download",state:"draft"
};
const LISTING_FP=createListingFingerprint(CURRENT);
const CANDIDATE_FP=createHash("sha256").update("PDT-RPT-003|V1|BUYERFILES-R01","utf8").digest("hex");

const FILES=[
 {rank:1,key:"sampleUrl",name:"PDT-RPT-003_V1_Rental_Property_Tracker_SAMPLE_FINAL.xlsx",size:88570,sha:"c16e071eb6dafc9f45a4aa615d101d61af87a7273c4d2a309e36825c99d36a39"},
 {rank:2,key:"cleanUrl",name:"PDT-RPT-003_V1_Rental_Property_Tracker_CLEAN_START_FINAL.xlsx",size:86643,sha:"924bbef5d6222993f97473c652569226f2d545dd773dfc3fb77b813c2b4b0040"}
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
async function verifyIdentity(token:string){const l=await listing(token);const id=verifyEtsyReadBackIdentity(LISTING_FP,obs(l));if(id.status!=="MATCH"||txt(l,"state")!=="draft")throw new Error("LISTING_IDENTITY_MISMATCH");}
function fp(state:Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>,files:Rec[],images:Rec[]){return createHash("sha256").update(JSON.stringify({listingId:LISTING_ID,listingFingerprint:LISTING_FP,counts:state.counts,listings:state.listings.map(x=>({id:x.listingId,state:x.state,title:x.title})).sort((a,b)=>a.id-b.id),files:files.map(x=>({id:int(x,"listing_file_id"),rank:int(x,"rank"),name:txt(x,"filename"),size:Number(x.size_bytes??0)})).sort((a,b)=>(a.rank??0)-(b.rank??0)),images:images.map(x=>({id:int(x,"listing_image_id"),rank:int(x,"rank")})).sort((a,b)=>(a.rank??0)-(b.rank??0))}),"utf8").digest("hex");}
function urlOk(raw:string){const u=new URL(raw);if(u.protocol!=="https:"||!u.hostname.endsWith(".oaiusercontent.com")||!u.pathname.includes("/files/")||!u.pathname.endsWith("/raw"))throw new Error("ASSET_URL_NOT_ALLOWED");return u.toString();}
async function stage(raw:string,size:number,sha:string){const r=await fetch(urlOk(raw),{cache:"no-store"});if(!r.ok)throw new Error("ASSET_FETCH_HTTP_"+r.status);const b=Buffer.from(await r.arrayBuffer());if(b.length!==size)throw new Error("ASSET_SIZE_MISMATCH");const actual=createHash("sha256").update(b).digest("hex");if(!eq(actual,sha))throw new Error("ASSET_SHA_MISMATCH");return b;}

async function plan(){
 const token=await getValidEtsyAccessToken(); await verifyIdentity(token);
 const [files,images,state]=await Promise.all([assets(token,"files"),assets(token,"images"),getEtsySellerStateSnapshot({shopId:SHOP_ID,accessToken:token})]);
 return {status:"PLAN_ONLY",mode:"PDT_RPT_003_BUYERFILES_R01",listingId:LISTING_ID,baselineMatches:files.length===0&&images.length===0&&state.total===5&&state.counts.active===3&&state.counts.draft===2,protectedStateFingerprint:fp(state,files,images),currentBuyerFileCount:files.length,currentGalleryCount:images.length,sellerCounts:state.counts,total:state.total,listingFingerprint:LISTING_FP,authorizationRequired:AUTH,deploymentCommit:commit(),publishAuthorized:false,ETSY_WRITE_COUNT:0};
}

export async function GET(request:Request){
 const u=new URL(request.url);
 if(u.searchParams.get("action")!=="execute"){
   try{return NextResponse.json(await plan(),{headers:{"cache-control":"no-store"}});}catch(e){return NextResponse.json({status:"PLAN_BLOCKED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:0},{status:409,headers:{"cache-control":"no-store"}});}
 }
 let writes=0;
 try{
   if(!gate())throw new Error("RPT_BUYERFILES_GATE_DISABLED");
   if(process.env.VERCEL_ENV!=="production")throw new Error("PRODUCTION_REQUIRED");
   if(!eq(u.searchParams.get("authorizationText")?.normalize("NFC").trim()??"",AUTH))throw new Error("AUTH_INVALID");
   if(!eq(u.searchParams.get("nonce")?.trim()??"",NONCE))throw new Error("NONCE_INVALID");
   const c=u.searchParams.get("commit")?.trim().toLowerCase()??""; if(!/^[a-f0-9]{40}$/.test(c)||!eq(c,commit()))throw new Error("COMMIT_MISMATCH");
   const supplied=u.searchParams.get("protectedStateFingerprint")?.trim().toLowerCase()??""; if(!/^[a-f0-9]{64}$/.test(supplied))throw new Error("PROTECTED_FP_INVALID");
   const token=await getValidEtsyAccessToken(); await verifyIdentity(token);
   const [beforeFiles,beforeImages,beforeState]=await Promise.all([assets(token,"files"),assets(token,"images"),getEtsySellerStateSnapshot({shopId:SHOP_ID,accessToken:token})]);
   if(beforeFiles.length!==0||beforeImages.length!==0||beforeState.total!==5||beforeState.counts.active!==3||beforeState.counts.draft!==2)throw new Error("BASELINE_MISMATCH");
   if(!eq(fp(beforeState,beforeFiles,beforeImages),supplied))throw new Error("PROTECTED_STATE_DRIFT");
   const staged=new Map<number,Buffer>();
   for(const s of FILES)staged.set(s.rank,await stage(u.searchParams.get(s.key)??"",s.size,s.sha));
   const ledger=new NeonOperationLedgerRepository();
   for(const s of FILES){
     const b=staged.get(s.rank); if(!b)throw new Error("STAGED_MISSING_"+s.rank);
     const file=new File([new Uint8Array(b)],s.name,{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
     const payload={operationKind:"UPLOAD_FILE" as const,candidateId:"PDT-RPT-003-V1",candidateFingerprint:CANDIDATE_FP,expectedListingFingerprint:LISTING_FP,shopId:SHOP_ID,draftListingId:LISTING_ID,assetSha256:s.sha,assetName:s.name,rank:s.rank};
     const provider=new EtsyDraftAssetProvider(token,payload,file);
     const result=await executeReconciledWrite(ledger,provider,{operationId:"PDT-RPT-003-V1-ETSY-BUYERFILES-R01-FILE-"+String(s.rank).padStart(2,"0"),kind:"UPLOAD_FILE",payload:{...payload},now:new Date().toISOString()});
     if(result.status==="RECONCILIATION_REQUIRED")return NextResponse.json({status:"RECONCILIATION_REQUIRED",rank:s.rank,ETSY_WRITE_COUNT:writes+1},{status:202});
     if(result.status!=="REPLAY")writes+=1;
   }
   await verifyIdentity(token);
   const [afterFiles,afterImages,afterState]=await Promise.all([assets(token,"files"),assets(token,"images"),getEtsySellerStateSnapshot({shopId:SHOP_ID,accessToken:token})]);
   const ordered=[...afterFiles].sort((a,b)=>(int(a,"rank")??0)-(int(b,"rank")??0));
   if(ordered.length!==2||afterImages.length!==0)throw new Error("FINAL_ASSET_COUNT_MISMATCH");
   for(let i=0;i<FILES.length;i++){const e=FILES[i],a=ordered[i];if(int(a,"rank")!==e.rank||txt(a,"filename")!==e.name||Number(a.size_bytes)!==e.size)throw new Error("FINAL_FILE_MISMATCH_"+(i+1));}
   if(afterState.total!==beforeState.total||JSON.stringify(afterState.counts)!==JSON.stringify(beforeState.counts))throw new Error("SELLER_COUNT_DRIFT");
   return NextResponse.json({status:"BUYER_FILES_PASS",listingId:LISTING_ID,buyerFileCount:2,galleryCount:0,state:"draft",publishPerformed:false,ETSY_WRITE_COUNT:writes},{headers:{"cache-control":"no-store"}});
 }catch(e){return NextResponse.json({status:writes>0?"RECONCILIATION_REQUIRED":"BLOCKED_FAIL_CLOSED",error:e instanceof Error?e.message:"UNKNOWN",listingId:LISTING_ID,publishPerformed:false,ETSY_WRITE_COUNT:writes},{status:writes>0?202:409,headers:{"cache-control":"no-store"}});}
}
