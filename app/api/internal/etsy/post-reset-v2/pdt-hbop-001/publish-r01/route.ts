import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { fetchEtsyReadWithRetry } from "../../../../../../../lib/etsy-http";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../../../lib/etsy-seller-state-reconciliation";
import { PDT_HBOP_001_V2_ALT_TEXT_R01 as R01 } from "../../../../../../../lib/pdt-hbop-001-v2-alt-text-r01";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const AUTHORIZATION_TEXT="AUTHORIZE PDT-HBOP-001-V2-ETSY-PUBLISH-R01-20260925 LISTING-4581821318 EXACT SCOPE ONLY";
const EXPECTED_SHA="a8627a4823c058d17dd28704c106ea7344000cd5b00299be6c973873845e8aad";
const GATE="[GATE_HBOP_PUBLISH_R01]";
const TARGET=R01.listingId;
const SHOP=R01.shopId;

type Rec=Record<string,unknown>;
const isRec=(v:unknown):v is Rec=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const txt=(v:unknown)=>typeof v==="string"?v.normalize("NFC").trim():"";
const num=(v:unknown)=>Number(v);
const eq=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};

async function readJson(url:string,token:string){
 const r=await fetchEtsyReadWithRetry(fetch,url,{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"});
 const t=await r.text(); let body:unknown={}; try{body=t?JSON.parse(t):{};}catch{}
 if(!r.ok||!isRec(body)) throw new Error("ETSY_READ_HTTP_"+r.status);
 return body;
}
async function coll(url:string,token:string){
 const v=await readJson(url,token);
 if(!Array.isArray(v.results)) throw new Error("ETSY_COLLECTION_INVALID");
 return v.results.filter(isRec);
}
function moneyExact(v:unknown){
 return isRec(v)&&num(v.amount)===R01.priceAmount&&num(v.divisor)===R01.priceDivisor&&txt(v.currency_code)===R01.currency;
}
async function verify(expectedState:"draft"|"active"){
 const token=await getValidEtsyAccessToken();
 const lb="https://api.etsy.com/v3/application/listings/"+TARGET;
 const sb="https://api.etsy.com/v3/application/shops/"+SHOP+"/listings/"+TARGET;
 const [listing,images0,files0,videos0,seller]=await Promise.all([
   readJson(lb,token),coll(lb+"/images",token),coll(sb+"/files",token),coll(lb+"/videos",token),
   getEtsySellerStateSnapshot({shopId:SHOP,accessToken:token})
 ]);
 const images=[...images0].sort((a,b)=>num(a.rank)-num(b.rank));
 const files=[...files0].sort((a,b)=>num(a.rank)-num(b.rank));
 const tags=Array.isArray(listing.tags)?listing.tags.map(txt):[];
 const metadata=
   num(listing.listing_id)===TARGET&&num(listing.shop_id)===SHOP&&txt(listing.state)===expectedState&&
   txt(listing.title)===R01.title&&moneyExact(listing.price)&&num(listing.quantity)===R01.quantity&&
   num(listing.taxonomy_id)===R01.taxonomyId&&tags.length===R01.tags.length&&R01.tags.every(t=>tags.includes(t));
 const gallery=images.length===10&&images.every((x,i)=>num(x.rank)===i+1&&num(x.full_width)===2000&&num(x.full_height)===2000&&txt(x.alt_text)===R01.altTexts[i]);
 const buyerFiles=files.length===R01.buyerFiles.length&&files.every((x,i)=>txt(x.filename)===R01.buyerFiles[i]);
 const videos=videos0.length===1&&txt(videos0[0]?.video_state).toLowerCase()==="active"&&num(videos0[0]?.width)===1080&&num(videos0[0]?.height)===1920;
 const target=seller.listings.find(x=>x.listingId===TARGET);
 const sellerOk=target?.state===expectedState&&target?.title===R01.title;
 return {token,metadata,gallery,buyerFiles,videos,sellerOk,sellerCounts:seller.counts,total:seller.total};
}
function gateEnabled(){
 return process.env.VERCEL_ENV==="production"&&(process.env.VERCEL_GIT_COMMIT_MESSAGE??"").includes(GATE);
}

export async function GET(request:Request){
 const url=new URL(request.url);
 const action=url.searchParams.get("action")??"plan";
 let writes=0;
 try{
   if(action==="reconcile_readonly"){
     const v=await verify("active");
     const pass=v.metadata&&v.gallery&&v.buyerFiles&&v.videos&&v.sellerOk;
     return NextResponse.json({status:pass?"PDT_HBOP_001_V2_PUBLISH_R01_RECONCILED":"PDT_HBOP_001_V2_PUBLISH_R01_RECONCILE_BLOCKED",mode:"READ_ONLY",listingId:TARGET,...v,token:undefined,ETSY_WRITE_COUNT:0},{status:pass?200:409,headers:{"cache-control":"no-store"}});
   }

   const before=await verify("draft");
   const ready=before.metadata&&before.gallery&&before.buyerFiles&&before.videos&&before.sellerOk;
   if(action!=="execute"){
     return NextResponse.json({status:ready?"PDT_HBOP_001_V2_PUBLISH_R01_READY":"PDT_HBOP_001_V2_PUBLISH_R01_BLOCKED",mode:"PLAN_ONLY",listingId:TARGET,authorizationRequired:AUTHORIZATION_TEXT,expectedProtectedSha256:EXPECTED_SHA,mutationEnabled:gateEnabled(),...before,token:undefined,ETSY_WRITE_COUNT:0},{status:ready?200:409,headers:{"cache-control":"no-store"}});
   }

   if(!gateEnabled()) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"HBOP_PUBLISH_R01_GATE_DISABLED",ETSY_WRITE_COUNT:0},{status:403});
   const auth=url.searchParams.get("authorizationText")?.normalize("NFC").trim()??"";
   if(!eq(auth,AUTHORIZATION_TEXT)) throw new Error("HBOP_PUBLISH_AUTHORIZATION_INVALID");
   const baseline=url.searchParams.get("baselineSha256")?.trim().toLowerCase()??"";
   if(!eq(baseline,EXPECTED_SHA)) throw new Error("HBOP_PUBLISH_BASELINE_SHA_MISMATCH");
   if(!ready) return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"HBOP_PUBLISH_FRESH_PROTECTED_STATE_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});

   const r=await fetch("https://api.etsy.com/v3/application/shops/"+SHOP+"/listings/"+TARGET,{
     method:"PATCH",
     headers:{...etsyApiHeaders(before.token),"content-type":"application/x-www-form-urlencoded"},
     body:new URLSearchParams({state:"active"}),cache:"no-store"
   });
   writes=1;
   if(r.status>=500) return NextResponse.json({status:"RECONCILIATION_REQUIRED",error:"HBOP_PUBLISH_AMBIGUOUS_HTTP_"+r.status,authorizationConsumed:true,ETSY_WRITE_COUNT:1},{status:202});
   if(!r.ok) throw new Error("HBOP_PUBLISH_REJECTED_HTTP_"+r.status);

   const after=await verify("active");
   const pass=after.metadata&&after.gallery&&after.buyerFiles&&after.videos&&after.sellerOk;
   return NextResponse.json({status:pass?"PDT_HBOP_001_V2_PUBLISH_R01_PASS":"RECONCILIATION_REQUIRED",listingId:TARGET,state:pass?"active":"unknown",authorizationConsumed:true,...after,token:undefined,ETSY_WRITE_COUNT:1},{status:pass?200:202,headers:{"cache-control":"no-store"}});
 }catch(e){
   return NextResponse.json({status:writes>0?"RECONCILIATION_REQUIRED":"BLOCKED_FAIL_CLOSED",error:e instanceof Error?e.message:"UNKNOWN",listingId:TARGET,ETSY_WRITE_COUNT:writes},{status:writes>0?202:400,headers:{"cache-control":"no-store"}});
 }
}
