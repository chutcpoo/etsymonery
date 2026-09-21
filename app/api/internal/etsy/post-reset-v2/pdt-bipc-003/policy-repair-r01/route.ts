import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../../../lib/etsy-seller-state-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID=23582741;
const TARGET_LISTING_ID=4579470012;
const AUTHORIZATION_TEXT="AUTHORIZE PDT-BIPC-003-V1-ETSY-POLICY-REPAIR-R01-20260921 EXACT SCOPE ONLY" as const;
const GATE="[GATE_BIPC_POLICY_REPAIR_R01_EXECUTE]";
const NONCE_SHA256="80a5c454b9bb1f86f765d3df1518a64c983f432574078fe535bf9704b6664253";

const EXPECTED_TITLE="Bar Inventory Spreadsheet | Liquor Stock & Pour Cost Tracker" as const;
const EXPECTED_TAGS=Object.freeze([
  "liquor inventory","bar inventory","pour cost tracker","bar par sheet","liquor stock sheet",
  "beverage inventory","bar reorder tracker","inventory sheet","bar inventory excel","liquor spreadsheet",
  "pour cost sheet","bar cost tracker","restaurant bar tool"
] as const);
const EXPECTED_ALT=Object.freeze([
  "Bar Inventory & Pour Cost Tracker Excel workbook with actual sample dashboard preview, showing stock, reorder, usage and variance-review workflow.",
  "Actual SAMPLE dashboard from Bar Inventory & Pour Cost Tracker showing fictional on-hand value, reorder cost, usage cost and review lists.",
  "Infographic showing Opening Count plus Purchases minus Closing Count equals Actual Usage, with blank and zero handling.",
  "Par and reorder workflow showing current on-hand, buyer-entered par level, reorder quantity and estimated reorder cost.",
  "Pour cost workflow showing package cost to unit cost, cost per mL, cost per serving and pour cost percentage.",
  "Variance review infographic comparing actual usage and theoretical usage, stating variance is a review signal and not a cause.",
  "Partial bottle count illustration showing decimal container counts such as 0.25, 0.50, 0.75 and 1.00.",
  "Eight-tab Excel workflow: Start Here, Settings, Beverage Items, Purchases, Count & Usage, Par & Reorder, Pour Cost & Variance, Dashboard.",
  "Two Excel files included: SAMPLE workbook with fictional data and CLEAN START workbook for buyer data.",
  "Included and not included summary for Bar Inventory & Pour Cost Tracker, including no POS integration, supplier sync or Google Sheets V1."
] as const);
const EXPECTED_FILES=Object.freeze([
  {rank:1,name:"PDT-BIPC-003_V1_Bar_Inventory_Pour_Cost_Tracker_SAMPLE.xlsx",size:126257},
  {rank:2,name:"PDT-BIPC-003_V1_Bar_Inventory_Pour_Cost_Tracker_CLEAN_START.xlsx",size:123515}
] as const);

const BASE_DESCRIPTION=[
  "Bar Inventory Spreadsheet for Excel — track beverage counts, purchases, actual usage, buyer-set par levels, reorder quantities, pour cost, and actual-vs-theoretical variance in one 8-tab workflow.",
  "",
  "WHAT YOU GET",
  "• SAMPLE Excel workbook (.xlsx) with fictional demonstration data",
  "• CLEAN START Excel workbook (.xlsx) for your own entries",
  "• 8 tabs: START HERE, SETTINGS, BEVERAGE ITEMS, PURCHASES, COUNT & USAGE, PAR & REORDER, POUR COST & VARIANCE, DASHBOARD",
  "",
  "WHAT IT DOES",
  "• Tracks liquor, beer, wine, and other beverage items",
  "• Records purchases and calculates purchase totals",
  "• Calculates actual usage: opening count + purchases − closing count",
  "• Supports decimal counts for partial bottles or containers",
  "• Uses your own par levels to calculate reorder quantity",
  "• Estimates reorder cost from workbook inputs",
  "• Calculates cost per mL, cost per standard serving, and pour cost %",
  "• Compares pour cost % with a user-set target",
  "• Calculates actual-vs-theoretical usage variance in mL, units, and cost",
  "• Shows operational KPIs, reorder items, and variance-review signals on a dashboard",
  "",
  "HOW TO USE",
  "1. Review SETTINGS.",
  "2. Add beverages in BEVERAGE ITEMS.",
  "3. Record purchases.",
  "4. Enter opening and closing counts for a consistent period.",
  "5. Review usage and reorder.",
  "6. Enter servings sold if you want variance analysis.",
  "7. Review POUR COST & VARIANCE.",
  "8. Review DASHBOARD.",
  "",
  "IMPORTANT",
  "• Microsoft Excel .xlsx only in V1",
  "• Manual data entry — no POS import or automatic sales import",
  "• No supplier price sync or automatic ordering",
  "• No bottle scanning or automatic bottle measurement",
  "• Variance is a review signal. It does not prove theft, overpour, waste, spillage, breakage, comps, or any specific cause.",
  "• Google Sheets compatibility is not included or claimed for V1.",
  "• Digital download only. No physical item will be shipped.",
  "",
  "The SAMPLE workbook uses fictional data only to demonstrate how the workflow and formulas work."
].join("\n");

const AI_DISCLOSURE=[
  "AI DISCLOSURE",
  "",
  "AI tools were used to assist with planning, visual presentation, and workflow refinement. The final workbook files were reviewed, edited, and prepared by PoonthaiDigital."
].join("\n");
const FINAL_DESCRIPTION=BASE_DESCRIPTION+"\n\n"+AI_DISCLOSURE;

type Rec=Record<string,unknown>;
function isRec(v:unknown):v is Rec{return typeof v==="object"&&v!==null&&!Array.isArray(v);}
function textField(r:Rec,k:string){const v=r[k];return typeof v==="string"?v.normalize("NFC").trim():"";}
function intField(r:Rec,k:string){const v=r[k];return typeof v==="number"&&Number.isSafeInteger(v)?v:null;}
function comparable(v:string){let o=v.normalize("NFC").replace(/\r\n?/g,"\n").trim();for(let i=0;i<2;i++)o=o.replace(/&quot;|&#34;|&#x22;/gi,'"').replace(/&apos;|&#39;|&#x27;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&amp;/gi,"&");return o;}
function sameStrings(v:unknown,e:readonly string[]){return Array.isArray(v)&&v.length===e.length&&v.every((x,i)=>typeof x==="string"&&x.normalize("NFC").trim()===e[i]);}
function secureEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function nonceOk(v:string){return secureEqual(createHash("sha256").update(v,"utf8").digest("hex"),NONCE_SHA256);}
function gateEnabled(){return process.env.VERCEL_ENV==="production"&&(process.env.VERCEL_GIT_COMMIT_MESSAGE??"").includes(GATE);}
function exactPrice(v:unknown){if(!isRec(v))return false;const a=Number(v.amount),d=Number(v.divisor);return Number.isFinite(a)&&Number.isFinite(d)&&d>0&&Number((a/d).toFixed(2))===11.99&&textField(v,"currency_code").toUpperCase()==="USD";}
async function parseJson(r:Response){const t=await r.text();if(!t)return{};try{return JSON.parse(t) as unknown;}catch{return{};}}
async function getRecord(token:string,url:string,code:string){const r=await fetch(url,{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"});if(!r.ok)throw new Error(code+"_HTTP_"+r.status);const v=await parseJson(r);if(!isRec(v))throw new Error(code+"_INVALID");return v;}
function records(v:unknown,code:string){if(!isRec(v)||!Array.isArray(v.results))throw new Error(code);return v.results.filter(isRec);}

async function patchDescription(token:string){
  const r=await fetch("https://api.etsy.com/v3/application/shops/"+SHOP_ID+"/listings/"+TARGET_LISTING_ID,{method:"PATCH",headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({description:FINAL_DESCRIPTION}),cache:"no-store"});
  if(!r.ok)throw new Error("DESCRIPTION_PATCH_HTTP_"+r.status);
}

async function diagnose(){
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
  const description=textField(listing,"description");
  const immutableMatches=
    textField(listing,"state")==="draft" &&
    textField(listing,"title")===EXPECTED_TITLE &&
    exactPrice(listing.price) &&
    Number(listing.quantity)===999 &&
    Number(listing.taxonomy_id)===12476 &&
    sameStrings(listing.tags,EXPECTED_TAGS) &&
    images.length===10 &&
    images.every((r,i)=>intField(r,"rank")===i+1&&textField(r,"alt_text")===EXPECTED_ALT[i]) &&
    files.length===2 &&
    files.every((r,i)=>intField(r,"rank")===EXPECTED_FILES[i].rank&&textField(r,"filename")===EXPECTED_FILES[i].name&&Number(r.size_bytes)===EXPECTED_FILES[i].size) &&
    seller.total===3 && seller.counts.active===2 && seller.counts.draft===1 &&
    seller.counts.inactive===0 && seller.counts.sold_out===0 && seller.counts.expired===0 &&
    seller.listings.some(x=>x.listingId===4578945050&&x.state==="active") &&
    seller.listings.some(x=>x.listingId===4579068925&&x.state==="active") &&
    seller.listings.some(x=>x.listingId===TARGET_LISTING_ID&&x.state==="draft");
  return {
    immutableMatches,
    currentDescriptionMatchesBase:comparable(description)===comparable(BASE_DESCRIPTION),
    aiDisclosurePresent:comparable(description).includes(comparable(AI_DISCLOSURE)),
    finalDescriptionMatches:comparable(description)===comparable(FINAL_DESCRIPTION),
    sellerCounts:seller.counts,
    total:seller.total,
    imageCount:images.length,
    buyerFileCount:files.length
  };
}

export async function GET(request:Request){
  const url=new URL(request.url);
  if(url.searchParams.get("action")==="execute"){
    let writes=0;
    try{
      if(!gateEnabled()) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"BIPC_POLICY_REPAIR_GATE_DISABLED",ETSY_WRITE_COUNT:0},{status:403});
      const auth=url.searchParams.get("authorizationText")?.normalize("NFC").trim()??"";
      if(!secureEqual(auth,AUTHORIZATION_TEXT)) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"AUTHORIZATION_INVALID",ETSY_WRITE_COUNT:0},{status:401});
      const nonce=url.searchParams.get("nonce")?.trim()??"";
      if(!nonce||!nonceOk(nonce)) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"NONCE_INVALID",ETSY_WRITE_COUNT:0},{status:401});

      const before=await diagnose();
      if(!before.immutableMatches||!before.currentDescriptionMatchesBase||before.aiDisclosurePresent||before.finalDescriptionMatches){
        return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"FRESH_BASELINE_MISMATCH",...before,ETSY_WRITE_COUNT:0},{status:409,headers:{"cache-control":"no-store"}});
      }

      const token=await getValidEtsyAccessToken();
      await patchDescription(token);
      writes=1;

      const after=await diagnose();
      if(!after.immutableMatches||!after.aiDisclosurePresent||!after.finalDescriptionMatches){
        return NextResponse.json({status:"RECONCILIATION_REQUIRED",error:"FINAL_VERIFY_FAILED",...after,ETSY_WRITE_COUNT:1},{status:202,headers:{"cache-control":"no-store"}});
      }

      return NextResponse.json({
        status:"PDT_BIPC_003_POLICY_REPAIR_R01_PASS",
        targetListingId:TARGET_LISTING_ID,
        state:"draft",
        titleUnchanged:true,
        tagsUnchanged:true,
        priceUnchanged:true,
        galleryUnchanged:true,
        buyerFilesUnchanged:true,
        protectedListingsUnchanged:true,
        authorizationConsumed:true,
        ...after,
        ETSY_WRITE_COUNT:1
      },{headers:{"cache-control":"no-store"}});
    }catch(e){
      return NextResponse.json({status:writes>0?"RECONCILIATION_REQUIRED":"BLOCKED_FAIL_CLOSED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:writes},{status:writes>0?202:400,headers:{"cache-control":"no-store"}});
    }
  }
  if(url.searchParams.get("action")==="diagnose"){
    try{
      const d=await diagnose();
      return NextResponse.json({status:"DIAGNOSTIC_READ_ONLY",mode:"PDT_BIPC_003_POLICY_REPAIR_R01",targetListingId:TARGET_LISTING_ID,...d,ETSY_WRITE_COUNT:0},{headers:{"cache-control":"no-store"}});
    }catch(e){
      return NextResponse.json({status:"DIAGNOSTIC_BLOCKED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:0},{status:409,headers:{"cache-control":"no-store"}});
    }
  }
  return NextResponse.json({
    status:"PLAN_ONLY",
    mode:"PDT_BIPC_003_POLICY_REPAIR_R01",
    targetListingId:TARGET_LISTING_ID,
    exactScope:{description:"APPEND_AI_DISCLOSURE_ONLY",title:"VERIFY_ONLY",tags:"VERIFY_ONLY",price:"VERIFY_ONLY",gallery:"VERIFY_ONLY",buyerFiles:"VERIFY_ONLY",state:"KEEP_DRAFT"},
    authorizationRequired:AUTHORIZATION_TEXT,
    featureGateDefault:"OFF",
    gateEnabled:gateEnabled(),
    mutationEnabled:gateEnabled(),
    publishAuthorized:false,
    ETSY_WRITE_COUNT:0
  },{headers:{"cache-control":"no-store"}});
}
