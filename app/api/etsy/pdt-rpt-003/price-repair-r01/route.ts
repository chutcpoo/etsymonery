import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../lib/etsy-seller-state-reconciliation";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const SHOP_ID=23582741;
const LISTING_ID=4580303015;
const AUTH="AUTHORIZE PDT-RPT-003-V1-ETSY-PRICE-REPAIR-R01-20260922 EXACT SCOPE ONLY";
const NONCE="PDT-RPT-003-PRICE-R01-NONCE-64C8E1A2";

const TITLE="Rental Property Tracker Excel | Landlord Income Expense | Airbnb Spreadsheet Dashboard";
const TAGS=["rental property","landlord tracker","rental spreadsheet","airbnb spreadsheet","property tracker","rental income","expense tracker","landlord excel","airbnb tracker","rental dashboard","property expenses","rent roll tracker","real estate excel"] as const;
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

const ALT=[
"Excel rental property tracker dashboard showing gross income, cash expenses, net cash flow, cash-on-cash return, outstanding rent, STR occupancy, monthly review, and property table.",
"Rental property Excel dashboard preview with KPI cards for income, expenses, net cash flow, outstanding rent, cash-on-cash return, and short-term rental occupancy.",
"Rent Roll spreadsheet showing monthly expected rent, rent received, balance, and Paid or Partial status for fictional long-term rental examples.",
"Short-term rental occupancy spreadsheet showing available nights, booked nights, occupancy percentage, booking revenue, ADR, and revenue per available night.",
"Side-by-side Excel previews of the Income and Expenses tabs used to record rental cash transactions by property, category, date, amount, and notes.",
"Annual Summary spreadsheet preview showing per-property income, cash expenses, net cash flow, cash invested, cash-on-cash return, rent balance, and STR occupancy.",
"Properties tab preview with fictional long-term and short-term rental records, property IDs, labels, rental type, units, cash invested, and notes.",
"Graphic listing the eight workbook tabs: Start Here, Properties, Income, Expenses, Rent Roll, STR Occupancy, Annual Summary, and Dashboard.",
"Two digital Excel files shown as cards: a populated SAMPLE workbook and a CLEAN START workbook with formulas, validations, dashboard, and instructions.",
"Product boundaries graphic showing included rental tracking features and excluded functions such as bank feeds, rent collection, tax preparation, and Airbnb integration."
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
const runtimeCommit=()=>process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase()??"";
const gate=()=>true;

async function parseJson(r:Response){const t=await r.text();if(!t)return{};try{return JSON.parse(t) as unknown;}catch{return{};}}
async function getRec(token:string,url:string,code:string){const r=await fetch(url,{headers:etsyApiHeaders(token),cache:"no-store"});if(!r.ok)throw new Error(code+"_HTTP_"+r.status);const v=await parseJson(r);if(!isRec(v))throw new Error(code+"_INVALID");return v;}
async function listing(token:string){return getRec(token,"https://api.etsy.com/v3/application/listings/"+LISTING_ID,"LISTING");}
async function collection(token:string,kind:"images"|"files"){const url=kind==="images"?"https://api.etsy.com/v3/application/listings/"+LISTING_ID+"/images":"https://api.etsy.com/v3/application/shops/"+SHOP_ID+"/listings/"+LISTING_ID+"/files";const v=await getRec(token,url,kind.toUpperCase());if(!Array.isArray(v.results))throw new Error(kind.toUpperCase()+"_INVALID");return v.results.filter(isRec);}

function priceUsd(l:Rec){const p=l.price;if(!isRec(p))return NaN;return Number(p.amount)/Number(p.divisor);}
function tagsMatch(v:unknown){return Array.isArray(v)&&v.length===TAGS.length&&v.every((x,i)=>typeof x==="string"&&x.normalize("NFC").trim()===TAGS[i]);}
function coreMatch(l:Rec,price:number){
 return txt(l,"state")==="draft"&&txt(l,"title")===TITLE&&txt(l,"description")===DESCRIPTION&&
 Number(priceUsd(l).toFixed(2))===price&&Number(l.quantity)===999&&Number(l.taxonomy_id)===12476&&
 txt(l,"who_made")==="i_did"&&txt(l,"when_made")==="2020_2026"&&
 (txt(l,"listing_type")||txt(l,"type")||"download")==="download"&&tagsMatch(l.tags);
}
function imagesMatch(rows:Rec[]){const a=[...rows].sort((x,y)=>(int(x,"rank")??0)-(int(y,"rank")??0));return a.length===10&&a.every((r,i)=>int(r,"rank")===i+1&&txt(r,"alt_text")===ALT[i]);}
function filesMatch(rows:Rec[]){const a=[...rows].sort((x,y)=>(int(x,"rank")??0)-(int(y,"rank")??0));return a.length===2&&a.every((r,i)=>int(r,"rank")===FILES[i].rank&&txt(r,"filename")===FILES[i].name&&Number(r.size_bytes)===FILES[i].size);}

async function snapshot(token:string){
 const [l,images,files,seller]=await Promise.all([listing(token),collection(token,"images"),collection(token,"files"),getEtsySellerStateSnapshot({shopId:SHOP_ID,accessToken:token})]);
 return {l,images,files,seller};
}
function protectedOk(s:Awaited<ReturnType<typeof snapshot>>,price:number){
 return coreMatch(s.l,price)&&imagesMatch(s.images)&&filesMatch(s.files)&&
 s.seller.total===5&&s.seller.counts.active===3&&s.seller.counts.draft===2&&
 s.seller.counts.inactive===0&&s.seller.counts.sold_out===0&&s.seller.counts.expired===0&&
 s.seller.listings.some(x=>x.listingId===LISTING_ID&&x.state==="draft"&&x.title===TITLE);
}
function protectedFp(s:Awaited<ReturnType<typeof snapshot>>){
 const payload=JSON.stringify({
  listing:{id:LISTING_ID,state:txt(s.l,"state"),title:txt(s.l,"title"),price:Number(priceUsd(s.l).toFixed(2)),description:txt(s.l,"description"),tags:s.l.tags},
  images:[...s.images].sort((a,b)=>(int(a,"rank")??0)-(int(b,"rank")??0)).map(r=>({id:int(r,"listing_image_id"),rank:int(r,"rank"),alt:txt(r,"alt_text")})),
  files:[...s.files].sort((a,b)=>(int(a,"rank")??0)-(int(b,"rank")??0)).map(r=>({id:int(r,"listing_file_id"),rank:int(r,"rank"),name:txt(r,"filename"),size:Number(r.size_bytes??0)})),
  seller:{counts:s.seller.counts,total:s.seller.total,listings:s.seller.listings.map(x=>({id:x.listingId,state:x.state,title:x.title})).sort((a,b)=>a.id-b.id)}
 });
 const {createHash}=require("node:crypto");
 return createHash("sha256").update(payload,"utf8").digest("hex");
}

async function plan(){
 const token=await getValidEtsyAccessToken();const s=await snapshot(token);
 return {status:"PLAN_ONLY",mode:"PDT_RPT_003_PRICE_REPAIR_R01",listingId:LISTING_ID,baselineMatches:protectedOk(s,9.99),currentPriceUsd:Number(priceUsd(s.l).toFixed(2)),targetPriceUsd:12.99,galleryCount:s.images.length,buyerFileCount:s.files.length,protectedStateFingerprint:protectedFp(s),deploymentCommit:runtimeCommit(),authorizationRequired:AUTH,publishAuthorized:false,ETSY_WRITE_COUNT:0};
}

export async function GET(request:Request){
 const u=new URL(request.url);
 if(u.searchParams.get("action")!=="execute"){
  try{return NextResponse.json(await plan(),{headers:{"cache-control":"no-store"}});}
  catch(e){return NextResponse.json({status:"PLAN_BLOCKED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:0},{status:409,headers:{"cache-control":"no-store"}});}
 }
 let writes=0;
 try{
  if(!gate())throw new Error("RPT_PRICE_GATE_DISABLED");
  if(process.env.VERCEL_ENV!=="production")throw new Error("PRODUCTION_REQUIRED");
  if(!eq(u.searchParams.get("authorizationText")?.normalize("NFC").trim()??"",AUTH))throw new Error("AUTH_INVALID");
  if(!eq(u.searchParams.get("nonce")?.trim()??"",NONCE))throw new Error("NONCE_INVALID");
  const c=u.searchParams.get("commit")?.trim().toLowerCase()??"";if(!/^[a-f0-9]{40}$/.test(c)||!eq(c,runtimeCommit()))throw new Error("COMMIT_MISMATCH");
  const supplied=u.searchParams.get("protectedStateFingerprint")?.trim().toLowerCase()??"";if(!/^[a-f0-9]{64}$/.test(supplied))throw new Error("PROTECTED_FP_INVALID");

  const token=await getValidEtsyAccessToken();
  const before=await snapshot(token);
  if(!protectedOk(before,9.99))throw new Error("FRESH_BASELINE_MISMATCH");
  if(!eq(protectedFp(before),supplied))throw new Error("PROTECTED_STATE_DRIFT");

  const body=new URLSearchParams({
   title:TITLE,description:DESCRIPTION,price:"12.99",quantity:"999",taxonomy_id:"12476",
   who_made:"i_did",when_made:"2020_2026",type:"download",tags:TAGS.join(",")
  });
  const r=await fetch("https://api.etsy.com/v3/application/shops/"+SHOP_ID+"/listings/"+LISTING_ID,{
   method:"PATCH",headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded"},body,cache:"no-store"
  });
  writes=1;
  await parseJson(r);
  if(!r.ok)throw new Error("PRICE_PATCH_HTTP_"+r.status);

  const after=await snapshot(token);
  if(!protectedOk(after,12.99))throw new Error("FINAL_VERIFY_MISMATCH");

  return NextResponse.json({status:"PRICE_REPAIR_PASS",listingId:LISTING_ID,priceUsd:12.99,galleryCount:10,buyerFileCount:2,state:"draft",publishPerformed:false,ETSY_WRITE_COUNT:1},{headers:{"cache-control":"no-store"}});
 }catch(e){
  return NextResponse.json({status:writes>0?"RECONCILIATION_REQUIRED":"BLOCKED_FAIL_CLOSED",error:e instanceof Error?e.message:"UNKNOWN",listingId:LISTING_ID,publishPerformed:false,ETSY_WRITE_COUNT:writes},{status:writes>0?202:409,headers:{"cache-control":"no-store"}});
 }
}
