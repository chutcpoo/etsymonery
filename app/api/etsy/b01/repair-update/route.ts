import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../lib/etsy-auth";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "../../../../../lib/etsy-readback-normalizer";
import { beginOperation, hashOperationRequest, NeonOperationLedgerRepository, recordOperationResult } from "../../../../../lib/operation-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = "23582741";
const LISTING_ID = "4560696421";
const OPERATION_ID = "B01-UPDATE-002";
const BUILD_ID = "ETSY-RESET-V1-PDT-BOBA-001-BUILD-20260906-B01";
const BUILD_FREEZE_SHA256 = "9b9b0b070d01cb272bad5463dc91592cbd6304794c6ad125f0b9ddfce22d5038";
const ACCEPTANCE_CRITERIA_SHA256 = "2933a096363420086b941cd24dcf3d04285deaa0ffd40beffabcf4598233b66e";
const CANDIDATE_FINGERPRINT = "e478bf31dc1a4c92ed0be9318d076db047c17afbd38b58cad0e7f2557eb40041";
const WRITE_HEADER = "x-autodigitalpublisher-b01-token";
const SHA256 = /^[a-f0-9]{64}$/;

function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function secureEqual(a: string, b: string) { const x=Buffer.from(a), y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
async function parseJson(r: Response) { const t=await r.text(); if(!t) return {}; try{return JSON.parse(t) as unknown;}catch{return { raw: t.slice(0,1000) };} }
function observation(v: Record<string, unknown>): EtsyReadBackObservation { return { title:v.title, description:v.description, price:v.price as EtsyReadBackObservation["price"], tags:v.tags, quantity:v.quantity, who_made:v.who_made, when_made:v.when_made, taxonomy_id:v.taxonomy_id, type:v.listing_type??v.type??"download", state:"draft" }; }
async function readListing(token:string){ const r=await fetch(`https://api.etsy.com/v3/application/listings/${LISTING_ID}`,{headers:etsyApiHeaders(token),cache:"no-store"}); const v=await parseJson(r); if(!r.ok||!isRecord(v)) throw new Error(`ETSY_B01_READ_FAILED:${r.status}`); return v; }
function authError(req:Request){ const expected=process.env.ETSY_B01_WRITE_TOKEN?.trim()??""; const supplied=req.headers.get(WRITE_HEADER)?.trim()??""; if(!expected)return NextResponse.json({error:"ETSY_B01_WRITE_AUTH_NOT_CONFIGURED"},{status:503}); if(!supplied||!secureEqual(supplied,expected))return NextResponse.json({error:"ETSY_B01_WRITE_UNAUTHORIZED"},{status:401}); return null; }

export async function GET(){
  try{ const token=await getValidEtsyAccessToken(); const l=await readListing(token); return NextResponse.json({status:"PASS",mode:"READ_ONLY",generatedAt:new Date().toISOString(),listingId:l.listing_id,state:l.state,isSupply:l.is_supply,whoMade:l.who_made,whenMade:l.when_made,taxonomyId:l.taxonomy_id}); }
  catch(e){return NextResponse.json({status:"BLOCKED",mode:"READ_ONLY",error:e instanceof Error?e.message:"UNKNOWN"},{status:502});}
}

export async function POST(req:Request){
  if(process.env.PUBLISH_WRITES_ENABLED!=="true")return NextResponse.json({error:"ETSY_B01_WRITES_DISABLED"},{status:403});
  const ae=authError(req); if(ae)return ae;
  let body:unknown; try{body=await req.json();}catch{return NextResponse.json({error:"INVALID_JSON"},{status:400});}
  if(!isRecord(body)||!isRecord(body.patch))return NextResponse.json({error:"INVALID_BODY"},{status:400});
  const p=body.patch;
  const exactTop=["acceptanceCriteriaSha256","buildFreezeSha256","buildId","candidateFingerprint","expectedAfterListingFingerprint","expectedBeforeListingFingerprint","listingId","operation","operationId","patch","shopId"].sort();
  const exactPatch=["description","isSupply","priceUsd","quantity","tags","taxonomyId","title","whenMade","whoMade"].sort();
  if(JSON.stringify(Object.keys(body).sort())!==JSON.stringify(exactTop)||JSON.stringify(Object.keys(p).sort())!==JSON.stringify(exactPatch))return NextResponse.json({error:"B01_REPAIR_FIELD_MISMATCH"},{status:409});
  const input={operation:String(body.operation??"").trim(),operationId:String(body.operationId??"").trim(),buildId:String(body.buildId??"").trim(),buildFreezeSha256:String(body.buildFreezeSha256??"").trim().toLowerCase(),acceptanceCriteriaSha256:String(body.acceptanceCriteriaSha256??"").trim().toLowerCase(),candidateFingerprint:String(body.candidateFingerprint??"").trim().toLowerCase(),expectedBeforeListingFingerprint:String(body.expectedBeforeListingFingerprint??"").trim().toLowerCase(),expectedAfterListingFingerprint:String(body.expectedAfterListingFingerprint??"").trim().toLowerCase(),shopId:String(body.shopId??"").trim(),listingId:String(body.listingId??"").trim(),patch:{title:String(p.title??"").normalize("NFC").trim(),description:String(p.description??"").normalize("NFC").trim(),priceUsd:typeof p.priceUsd==="number"?p.priceUsd:NaN,tags:Array.isArray(p.tags)&&p.tags.every(x=>typeof x==="string")?(p.tags as string[]).map(x=>x.normalize("NFC").trim()):[],quantity:typeof p.quantity==="number"?p.quantity:NaN,whoMade:String(p.whoMade??"").trim(),whenMade:String(p.whenMade??"").trim(),taxonomyId:typeof p.taxonomyId==="number"?p.taxonomyId:NaN,isSupply:typeof p.isSupply==="boolean"?p.isSupply:null}};
  if(input.operation!=="UPDATE_ACTIVE_LISTING"||input.operationId!==OPERATION_ID||input.buildId!==BUILD_ID||input.buildFreezeSha256!==BUILD_FREEZE_SHA256||input.acceptanceCriteriaSha256!==ACCEPTANCE_CRITERIA_SHA256||input.candidateFingerprint!==CANDIDATE_FINGERPRINT||input.shopId!==SHOP_ID||input.listingId!==LISTING_ID||!SHA256.test(input.expectedBeforeListingFingerprint)||!SHA256.test(input.expectedAfterListingFingerprint)||!input.patch.title||!input.patch.description||!Number.isFinite(input.patch.priceUsd)||!Number.isSafeInteger(input.patch.quantity)||!input.patch.whoMade||!input.patch.whenMade||!Number.isSafeInteger(input.patch.taxonomyId)||input.patch.isSupply===null)return NextResponse.json({error:"B01_REPAIR_AUTHORIZATION_MISMATCH"},{status:409});
  const allowed=process.env.ETSY_B01_REPAIR_REQUEST_SHA256?.trim().toLowerCase()??""; const requestHash=hashOperationRequest(input); if(!SHA256.test(allowed))return NextResponse.json({error:"B01_REPAIR_HASH_NOT_CONFIGURED"},{status:503}); if(!secureEqual(requestHash,allowed))return NextResponse.json({error:"B01_REPAIR_HASH_MISMATCH",requestHash},{status:409});
  const repo=new NeonOperationLedgerRepository(); const now=new Date().toISOString(); const begun=await beginOperation(repo,OPERATION_ID,input,now); if(begun.status==="REPLAY"){if(begun.record.status==="SUCCEEDED")return NextResponse.json({status:"REPLAY",operationId:OPERATION_ID,requestHash:begun.record.requestHash,receipt:begun.record.receipt});return NextResponse.json({error:"B01_REPAIR_ALREADY_CLAIMED",operationId:OPERATION_ID,requestHash:begun.record.requestHash,ledgerStatus:begun.record.status},{status:409});}
  const token=await getValidEtsyAccessToken(); const before=await readListing(token); if(String(before.state).toLowerCase()!=="active")return NextResponse.json({error:"ETSY_TARGET_NOT_ACTIVE"},{status:409});
  const already=verifyEtsyReadBackIdentity(input.expectedAfterListingFingerprint,observation(before)); if(already.status==="MATCH"){const done=await recordOperationResult(repo,OPERATION_ID,begun.record.requestHash,"SUCCEEDED",new Date().toISOString(),{receipt:{reconciled:true,providerPatchCount:0}});return NextResponse.json({status:"RECONCILED",operationId:OPERATION_ID,requestHash:done.requestHash,receipt:done.receipt});}
  const pre=verifyEtsyReadBackIdentity(input.expectedBeforeListingFingerprint,observation(before)); if(pre.status!=="MATCH")return NextResponse.json({error:"ETSY_B01_PREIDENTITY_MISMATCH",actualFingerprint:pre.actualFingerprint},{status:409});
  const form=new URLSearchParams({title:input.patch.title,description:input.patch.description,price:input.patch.priceUsd.toFixed(2),quantity:String(input.patch.quantity),taxonomy_id:String(input.patch.taxonomyId),who_made:input.patch.whoMade,when_made:input.patch.whenMade,is_supply:String(input.patch.isSupply),type:"download",tags:input.patch.tags.join(",")});
  let r:Response; try{r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${LISTING_ID}`,{method:"PATCH",headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded"},body:form,cache:"no-store"});}catch{const pending=await recordOperationResult(repo,OPERATION_ID,begun.record.requestHash,"RECONCILIATION_REQUIRED",new Date().toISOString(),{recoveryPoint:"POST_PATCH_READ_BACK"});return NextResponse.json({error:"B01_REPAIR_AMBIGUOUS",requestHash:pending.requestHash},{status:202});}
  const provider=await parseJson(r); if(!r.ok){const failed=await recordOperationResult(repo,OPERATION_ID,begun.record.requestHash,"FAILED",new Date().toISOString(),{recoveryPoint:"PATCH_REJECTED",receipt:{providerStatusCode:r.status,providerError:provider}});return NextResponse.json({error:"B01_REPAIR_REJECTED",statusCode:r.status,providerError:provider,operationId:OPERATION_ID,requestHash:failed.requestHash},{status:502});}
  const after=await readListing(token); const post=verifyEtsyReadBackIdentity(input.expectedAfterListingFingerprint,observation(after)); if(post.status!=="MATCH"){const pending=await recordOperationResult(repo,OPERATION_ID,begun.record.requestHash,"RECONCILIATION_REQUIRED",new Date().toISOString(),{recoveryPoint:"POST_IDENTITY_MISMATCH",receipt:{actualFingerprint:post.actualFingerprint}});return NextResponse.json({error:"B01_REPAIR_POSTIDENTITY_MISMATCH",actualFingerprint:post.actualFingerprint,requestHash:pending.requestHash},{status:202});}
  const done=await recordOperationResult(repo,OPERATION_ID,begun.record.requestHash,"SUCCEEDED",new Date().toISOString(),{receipt:{providerStatusCode:r.status,readBack:true,providerPatchCount:1}}); return NextResponse.json({status:"UPDATED_AND_VERIFIED",operationId:OPERATION_ID,requestHash:done.requestHash,receipt:done.receipt});
}
