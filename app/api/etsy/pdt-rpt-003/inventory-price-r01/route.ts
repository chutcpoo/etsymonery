import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../lib/etsy-auth";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const LISTING_ID=4580303015;
const SHOP_ID=23582741;
const CURRENT=9.99;
const TARGET=12.99;
const TITLE="Rental Property Tracker Excel | Landlord Income Expense | Airbnb Spreadsheet Dashboard";
const TAGS=["rental property","landlord tracker","rental spreadsheet","airbnb spreadsheet","property tracker","rental income","expense tracker","landlord excel","airbnb tracker","rental dashboard","property expenses","rent roll tracker","real estate excel"] as const;
const AUTH="AUTHORIZE PDT-RPT-003-V1-ETSY-INVENTORY-PRICE-R01-20260922 EXACT SCOPE ONLY";
const NONCE="PDT-RPT-003-INVENTORY-PRICE-R01-NONCE-A73D5E29";

type Rec=Record<string,unknown>;
const isRec=(v:unknown):v is Rec=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const txt=(v:unknown)=>typeof v==="string"?v.normalize("NFC").trim():"";
const eq=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const commit=()=>process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase()??"";
const gate=()=>false;

async function asJson(r:Response):Promise<unknown>{const t=await r.text();if(!t)return{};try{return JSON.parse(t) as unknown;}catch{return{};}}
async function getRec(token:string,url:string,code:string){const r=await fetch(url,{headers:etsyApiHeaders(token),cache:"no-store"});if(!r.ok)throw new Error(code+"_HTTP_"+r.status);const v=await asJson(r);if(!isRec(v))throw new Error(code+"_INVALID");return v;}
async function getListing(token:string){return getRec(token,"https://api.etsy.com/v3/application/listings/"+LISTING_ID,"LISTING");}
async function getInventory(token:string){return getRec(token,"https://api.etsy.com/v3/application/listings/"+LISTING_ID+"/inventory","INVENTORY");}

function money(v:unknown){
 if(typeof v==="number")return v;
 if(typeof v==="string")return Number(v);
 if(isRec(v)){
  const amount=Number(v.amount),divisor=Number(v.divisor);
  if(Number.isFinite(amount)&&Number.isFinite(divisor)&&divisor>0)return amount/divisor;
 }
 return NaN;
}
function listingPrice(l:Rec){return money(l.price);}
function tagsMatch(v:unknown){return Array.isArray(v)&&v.length===TAGS.length&&v.every((x,i)=>txt(x)===TAGS[i]);}
function listingBaseline(l:Rec,price:number){
 return Number(l.listing_id)===LISTING_ID&&Number(l.shop_id)===SHOP_ID&&txt(l.state)==="draft"&&txt(l.title)===TITLE&&
 tagsMatch(l.tags)&&Number(l.quantity)===999&&txt(l.who_made)==="i_did"&&txt(l.when_made)==="2020_2026"&&
 Number(l.taxonomy_id)===12476&&txt(l.listing_type)==="download"&&Number(listingPrice(l).toFixed(2))===price;
}
function products(inv:Rec){return Array.isArray(inv.products)?inv.products.filter(isRec):[];}
function offerings(p:Rec){return Array.isArray(p.offerings)?p.offerings.filter(isRec):[];}
function currentInventoryPrice(inv:Rec){
 const ps=products(inv);if(ps.length!==1)return NaN;
 const os=offerings(ps[0]);if(os.length!==1)return NaN;
 return money(os[0].price);
}
function inventoryBaseline(inv:Rec,price:number){
 const ps=products(inv);if(ps.length!==1)return false;
 const os=offerings(ps[0]);if(os.length!==1)return false;
 return Number(currentInventoryPrice(inv).toFixed(2))===price&&Number(os[0].quantity)===999&&os[0].is_enabled===true;
}
function fingerprint(l:Rec,inv:Rec){
 const payload={
  listing:{id:Number(l.listing_id),shop:Number(l.shop_id),state:txt(l.state),title:txt(l.title),price:Number(listingPrice(l).toFixed(2)),quantity:Number(l.quantity),tags:l.tags},
  inventory:inv
 };
 return createHash("sha256").update(JSON.stringify(payload),"utf8").digest("hex");
}
function sanitizePropertyValue(v:Rec){
 const out:Rec={property_id:Number(v.property_id),property_name:txt(v.property_name),scale_id:v.scale_id??null,value_ids:Array.isArray(v.value_ids)?v.value_ids:[],values:Array.isArray(v.values)?v.values:[]};
 return out;
}
function updatePayload(inv:Rec){
 const ps=products(inv);
 return {
  products:ps.map(p=>({
   sku:txt(p.sku),
   offerings:offerings(p).map(o=>{
    const x:Rec={quantity:Number(o.quantity),is_enabled:o.is_enabled===true,price:TARGET};
    if(o.readiness_state_id!==undefined&&o.readiness_state_id!==null)x.readiness_state_id=Number(o.readiness_state_id);
    return x;
   }),
   property_values:Array.isArray(p.property_values)?p.property_values.filter(isRec).map(sanitizePropertyValue):[]
  })),
  price_on_property:Array.isArray(inv.price_on_property)?inv.price_on_property:[],
  quantity_on_property:Array.isArray(inv.quantity_on_property)?inv.quantity_on_property:[],
  sku_on_property:Array.isArray(inv.sku_on_property)?inv.sku_on_property:[],
  ...(Array.isArray(inv.readiness_state_on_property)?{readiness_state_on_property:inv.readiness_state_on_property}:{})
 };
}
async function snapshot(token:string){const [l,inv]=await Promise.all([getListing(token),getInventory(token)]);return{l,inv};}

async function plan(){
 const token=await getValidEtsyAccessToken();const s=await snapshot(token);
 return {status:"PLAN_ONLY",mode:"PDT_RPT_003_INVENTORY_PRICE_R01",listingId:LISTING_ID,baselineMatches:listingBaseline(s.l,CURRENT)&&inventoryBaseline(s.inv,CURRENT),currentListingPriceUsd:Number(listingPrice(s.l).toFixed(2)),currentOfferingPriceUsd:Number(currentInventoryPrice(s.inv).toFixed(2)),targetPriceUsd:TARGET,productCount:products(s.inv).length,offeringCount:products(s.inv).length===1?offerings(products(s.inv)[0]).length:null,protectedStateFingerprint:fingerprint(s.l,s.inv),deploymentCommit:commit(),authorizationRequired:AUTH,publishAuthorized:false,ETSY_WRITE_COUNT:0};
}

export async function GET(request:Request){
 const u=new URL(request.url);
 if(u.searchParams.get("action")!=="execute"){
  try{return NextResponse.json(await plan(),{headers:{"cache-control":"no-store"}});}
  catch(e){return NextResponse.json({status:"PLAN_BLOCKED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:0},{status:409,headers:{"cache-control":"no-store"}});}
 }
 let writes=0;
 try{
  if(process.env.VERCEL_ENV!=="production")throw new Error("PRODUCTION_REQUIRED");
  if(!eq(u.searchParams.get("authorizationText")?.normalize("NFC").trim()??"",AUTH))throw new Error("AUTH_INVALID");
  if(!eq(u.searchParams.get("nonce")?.trim()??"",NONCE))throw new Error("NONCE_INVALID");
  const c=u.searchParams.get("commit")?.trim().toLowerCase()??"";if(!/^[a-f0-9]{40}$/.test(c)||!eq(c,commit()))throw new Error("COMMIT_MISMATCH");
  const supplied=u.searchParams.get("protectedStateFingerprint")?.trim().toLowerCase()??"";if(!/^[a-f0-9]{64}$/.test(supplied))throw new Error("PROTECTED_FP_INVALID");

  const token=await getValidEtsyAccessToken();const before=await snapshot(token);
  if(listingBaseline(before.l,TARGET)&&inventoryBaseline(before.inv,TARGET))return NextResponse.json({status:"ALREADY_PASS",listingId:LISTING_ID,priceUsd:TARGET,state:"draft",publishPerformed:false,ETSY_WRITE_COUNT:0},{headers:{"cache-control":"no-store"}});
  if(!listingBaseline(before.l,CURRENT)||!inventoryBaseline(before.inv,CURRENT))throw new Error("BASELINE_MISMATCH");
  if(!eq(fingerprint(before.l,before.inv),supplied))throw new Error("PROTECTED_STATE_DRIFT");

  const body=updatePayload(before.inv);
  const response=await fetch("https://api.etsy.com/v3/application/listings/"+LISTING_ID+"/inventory",{
   method:"PUT",headers:{...etsyApiHeaders(token),"content-type":"application/json"},body:JSON.stringify(body),cache:"no-store"
  });
  const provider=await asJson(response);
  if(!response.ok)throw new Error("INVENTORY_PRICE_PUT_HTTP_"+response.status+":"+JSON.stringify(provider).slice(0,500));
  writes=1;

  const after=await snapshot(token);
  if(!listingBaseline(after.l,TARGET))throw new Error("FINAL_LISTING_PRICE_MISMATCH");
  if(!inventoryBaseline(after.inv,TARGET))throw new Error("FINAL_INVENTORY_PRICE_MISMATCH");
  if(txt(after.l.state)!=="draft")throw new Error("STATE_DRIFT");

  return NextResponse.json({status:"INVENTORY_PRICE_PASS",listingId:LISTING_ID,previousPriceUsd:CURRENT,priceUsd:TARGET,productCount:1,offeringCount:1,state:"draft",publishPerformed:false,ETSY_WRITE_COUNT:writes},{headers:{"cache-control":"no-store"}});
 }catch(e){
  return NextResponse.json({status:writes>0?"RECONCILIATION_REQUIRED":"BLOCKED_FAIL_CLOSED",error:e instanceof Error?e.message:"UNKNOWN",listingId:LISTING_ID,publishPerformed:false,ETSY_WRITE_COUNT:writes},{status:writes>0?202:409,headers:{"cache-control":"no-store"}});
 }
}
