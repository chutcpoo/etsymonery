import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../lib/etsy-auth";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "../../../../../lib/etsy-readback-normalizer";
import { beginOperation, NeonOperationLedgerRepository, recordOperationResult } from "../../../../../lib/operation-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = 23582741;
const LISTING_ID = 4560696421;
const BUILD_ID = "ETSY-RESET-V1-PDT-BOBA-001-BUILD-20260906-B01";
const CANDIDATE_FINGERPRINT = "e478bf31dc1a4c92ed0be9318d076db047c17afbd38b58cad0e7f2557eb40041";
const EXPECTED_CURRENT_LISTING_FINGERPRINT = "579082255da2638298fcc919c8c89830f039ae708c1d69ba2a28c3efd6ba4dba";
const OPERATION_ID = "B01-PRICE-001";
const FROM_PRICE = 9.9;
const TO_PRICE = 12.9;
const WRITE_HEADER = "x-autodigitalpublisher-b01-token";

type Rec = Record<string, unknown>;
function isRecord(v: unknown): v is Rec { return typeof v === "object" && v !== null && !Array.isArray(v); }
function secureEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
async function parseJson(r:Response){const t=await r.text();if(!t)return {};try{return JSON.parse(t) as unknown;}catch{return {raw:t.slice(0,1000)};}}
function authError(req:Request){const expected=process.env.ETSY_B01_WRITE_TOKEN?.trim()??"";const supplied=req.headers.get(WRITE_HEADER)?.trim()??"";if(!expected)return NextResponse.json({error:"ETSY_B01_WRITE_AUTH_NOT_CONFIGURED"},{status:503});if(!supplied||!secureEqual(supplied,expected))return NextResponse.json({error:"ETSY_B01_WRITE_UNAUTHORIZED"},{status:401});return null;}
function observation(v:Rec):EtsyReadBackObservation{return{title:v.title,description:v.description,price:v.price as EtsyReadBackObservation["price"],tags:v.tags,quantity:v.quantity,who_made:v.who_made,when_made:v.when_made,taxonomy_id:v.taxonomy_id,type:v.listing_type??v.type??"download",state:"draft"};}
function money(v:unknown){if(typeof v==="number")return Number(v.toFixed(2));if(typeof v==="string"){const n=Number(v);return Number.isFinite(n)?Number(n.toFixed(2)):NaN;}if(isRecord(v)&&typeof v.amount==="number"&&typeof v.divisor==="number"&&v.divisor>0)return Number((v.amount/v.divisor).toFixed(2));return NaN;}
async function fetchListing(token:string){const r=await fetch(`https://api.etsy.com/v3/application/listings/${LISTING_ID}?includes=BuyerPrice`,{headers:etsyApiHeaders(token),cache:"no-store"});const v=await parseJson(r);if(!r.ok||!isRecord(v))throw new Error(`ETSY_B01_READ_FAILED:${r.status}`);return v;}
async function fetchInventory(token:string){const r=await fetch(`https://api.etsy.com/v3/application/listings/${LISTING_ID}/inventory`,{headers:etsyApiHeaders(token),cache:"no-store"});const v=await parseJson(r);if(!r.ok||!isRecord(v))throw new Error(`ETSY_B01_INVENTORY_READ_FAILED:${r.status}`);return v;}
function singleOffering(inv:Rec){if(!Array.isArray(inv.products)||inv.products.length!==1||!isRecord(inv.products[0]))return null;const product=inv.products[0];if(!Array.isArray(product.property_values)||product.property_values.length!==0)return null;if(!Array.isArray(product.offerings)||product.offerings.length!==1||!isRecord(product.offerings[0]))return null;return {product,offering:product.offerings[0]};}
function inventorySummary(inv:Rec){const one=singleOffering(inv);return {productCount:Array.isArray(inv.products)?inv.products.length:null,singleProductSingleOffering:!!one,offeringPrice:one?money(one.offering.price):null,offeringQuantity:one?.offering.quantity??null,isEnabled:one?.offering.is_enabled??null,priceOnProperty:inv.price_on_property??null,quantityOnProperty:inv.quantity_on_property??null,skuOnProperty:inv.sku_on_property??null};}

export async function GET(){
 try{const token=await getValidEtsyAccessToken();const [listing,inventory]=await Promise.all([fetchListing(token),fetchInventory(token)]);const identity=verifyEtsyReadBackIdentity(EXPECTED_CURRENT_LISTING_FINGERPRINT,observation(listing));return NextResponse.json({status:"PASS",mode:"READ_ONLY",generatedAt:new Date().toISOString(),listingId:LISTING_ID,listingPrice:money(listing.price),buyerPrice:listing.buyer_price??null,listingIdentity:identity.status,actualListingFingerprint:identity.actualFingerprint,inventory:inventorySummary(inventory)});}
 catch(e){return NextResponse.json({status:"BLOCKED",mode:"READ_ONLY",error:e instanceof Error?e.message:"UNKNOWN"},{status:502});}
}

export async function POST(req:Request){
 if(process.env.PUBLISH_WRITES_ENABLED!=="true")return NextResponse.json({error:"ETSY_B01_WRITES_DISABLED"},{status:403});const ae=authError(req);if(ae)return ae;
 let body:unknown;try{body=await req.json();}catch{return NextResponse.json({error:"INVALID_JSON"},{status:400});}if(!isRecord(body)||body.operationId!==OPERATION_ID||body.buildId!==BUILD_ID||body.candidateFingerprint!==CANDIDATE_FINGERPRINT||body.fromPrice!==FROM_PRICE||body.toPrice!==TO_PRICE)return NextResponse.json({error:"B01_PRICE_AUTHORIZATION_MISMATCH"},{status:409});
 const token=await getValidEtsyAccessToken();const listing=await fetchListing(token);if(String(listing.state??"").toLowerCase()!=="active")return NextResponse.json({error:"ETSY_TARGET_NOT_ACTIVE"},{status:409});const identity=verifyEtsyReadBackIdentity(EXPECTED_CURRENT_LISTING_FINGERPRINT,observation(listing));if(identity.status!=="MATCH")return NextResponse.json({error:"B01_PRICE_LISTING_IDENTITY_MISMATCH",actualFingerprint:identity.actualFingerprint},{status:409});
 const before=await fetchInventory(token);const one=singleOffering(before);if(!one)return NextResponse.json({error:"B01_PRICE_INVENTORY_SHAPE_MISMATCH",inventory:inventorySummary(before)},{status:409});const current=money(one.offering.price);if(current!==FROM_PRICE)return NextResponse.json({error:"B01_PRICE_PRECONDITION_MISMATCH",expected:FROM_PRICE,actual:current},{status:409});
 const payload={operation:"UPDATE_LISTING_INVENTORY_PRICE",operationId:OPERATION_ID,buildId:BUILD_ID,candidateFingerprint:CANDIDATE_FINGERPRINT,shopId:String(SHOP_ID),listingId:String(LISTING_ID),fromPrice:FROM_PRICE,toPrice:TO_PRICE};const repo=new NeonOperationLedgerRepository();const begun=await beginOperation(repo,OPERATION_ID,payload,new Date().toISOString());if(begun.status==="REPLAY"){if(begun.record.status==="SUCCEEDED")return NextResponse.json({status:"REPLAY",operationId:OPERATION_ID,requestHash:begun.record.requestHash,receipt:begun.record.receipt});return NextResponse.json({error:"B01_PRICE_ALREADY_CLAIMED",ledgerStatus:begun.record.status,requestHash:begun.record.requestHash},{status:409});}
 const offering:any={quantity:one.offering.quantity,is_enabled:one.offering.is_enabled,price:TO_PRICE};if(typeof one.offering.readiness_state_id==="number"&&one.offering.readiness_state_id>0)offering.readiness_state_id=one.offering.readiness_state_id;
 const product:any={sku:typeof one.product.sku==="string"?one.product.sku:"",offerings:[offering],property_values:[]};const updateBody={products:[product],price_on_property:Array.isArray(before.price_on_property)?before.price_on_property:[],quantity_on_property:Array.isArray(before.quantity_on_property)?before.quantity_on_property:[],sku_on_property:Array.isArray(before.sku_on_property)?before.sku_on_property:[]};
 let r:Response;try{r=await fetch(`https://api.etsy.com/v3/application/listings/${LISTING_ID}/inventory`,{method:"PUT",headers:{...etsyApiHeaders(token),"content-type":"application/json"},body:JSON.stringify(updateBody),cache:"no-store"});}catch{const pending=await recordOperationResult(repo,OPERATION_ID,begun.record.requestHash,"RECONCILIATION_REQUIRED",new Date().toISOString(),{recoveryPoint:"INVENTORY_PRICE_READBACK"});return NextResponse.json({error:"B01_PRICE_UPDATE_AMBIGUOUS",requestHash:pending.requestHash},{status:202});}
 const provider=await parseJson(r);if(!r.ok){const failed=await recordOperationResult(repo,OPERATION_ID,begun.record.requestHash,"FAILED",new Date().toISOString(),{recoveryPoint:"INVENTORY_PRICE_REJECTED",receipt:{providerStatusCode:r.status,providerError:provider}});return NextResponse.json({error:"B01_PRICE_UPDATE_REJECTED",statusCode:r.status,providerError:provider,requestHash:failed.requestHash},{status:502});}
 const [afterInventory,afterListing]=await Promise.all([fetchInventory(token),fetchListing(token)]);const afterOne=singleOffering(afterInventory);const inventoryPrice=afterOne?money(afterOne.offering.price):NaN;const listingPrice=money(afterListing.price);if(inventoryPrice!==TO_PRICE||listingPrice!==TO_PRICE){const pending=await recordOperationResult(repo,OPERATION_ID,begun.record.requestHash,"RECONCILIATION_REQUIRED",new Date().toISOString(),{recoveryPoint:"INVENTORY_PRICE_POSTREAD_MISMATCH",receipt:{inventoryPrice,listingPrice,providerStatusCode:r.status}});return NextResponse.json({error:"B01_PRICE_POSTREAD_MISMATCH",inventoryPrice,listingPrice,requestHash:pending.requestHash},{status:202});}
 const done=await recordOperationResult(repo,OPERATION_ID,begun.record.requestHash,"SUCCEEDED",new Date().toISOString(),{receipt:{providerStatusCode:r.status,inventoryPrice,listingPrice,readBack:true}});return NextResponse.json({status:"UPDATED_AND_VERIFIED",operationId:OPERATION_ID,requestHash:done.requestHash,receipt:done.receipt});
}
