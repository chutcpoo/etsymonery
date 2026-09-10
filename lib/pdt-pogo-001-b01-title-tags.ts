import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { beginOperation, hashOperationRequest, NeonOperationLedgerRepository, recordOperationResult, type OperationLedgerRepository } from "./operation-ledger";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;
const AUTH_ENV = "ETSY_PDT_POGO_001_B01_AUTHORIZATION_ID";
const HASH_ENV = "ETSY_PDT_POGO_001_B01_REQUEST_SHA256";

export const PDT_POGO_001_B01 = Object.freeze({
  operation: "UPDATE_ACTIVE_LISTING_TITLE_TAGS_ONLY",
  operationId: "PDT-POGO-001-B01-TITLE-TAGS-001",
  productId: "PDT-POGO-001",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4568730165",
  candidateId: "ETSY-OPT-RC-PDT-POGO-001-V1-2026-09-10-B",
  candidateFingerprint: "083f2ff64334a47ca6ae00e5e483a176870f944cb436eb1c2f746cf6bd383adb",
  buildId: "ETSY-OPT-RC-PDT-POGO-001-BUILD-20260910-B01",
  buildFingerprint: "f6dc0f02d0da132b121b590089fefb17bf9c3f803ad7c5036a3e218c3325d0f6",
  acceptanceCriteriaId: "ETSY-OPT-RC-PDT-POGO-001-AC-20260910-B01",
  acceptanceCriteriaSha256: "5406af11d3290fbe94ace1f6b20cdb1db8376265996fc0a79c4e61c9fff04855",
  protectedStateBaselineSha256: "9dcac3866ac932bc53cb5934edb34923f9cc7eb2d12411475cc13d74cbc90ced",
  title: "Professional Organizer Spreadsheet | Client Project, Room, Session & Follow-Up Tracker | Excel Business Template",
  tags: ["pro organizer","organizer business","client project","client tracker excel","project tracker","session tracker","room planner","declutter tracker","action tracker","follow up tracker","business spreadsheet","excel template","home organizer"] as readonly string[]
} as const);

const EXPECTED_BEFORE = Object.freeze({
  shopId: "23582741", listingId: "4568730165", state: "active",
  title: "Professional Organizer Spreadsheet | Client Project Tracker | Home Organizing Business Excel Template | Session & Follow-Up Dashboard",
  tags: ["organizer template","client tracker excel","organizing business","home organizer","project tracker","session tracker","room planner","declutter tracker","item decision log","action tracker","follow up tracker","excel template","business spreadsheet"] as readonly string[],
  descriptionSha256: "bfcd4bb75ad93215a58bfcaebd6af7c9da33000f28e51ab841ab2d657da84084",
  price: { amount: 1190, currency_code: "USD", divisor: 100 }, taxonomyId: 12476, quantity: 999,
  whoMade: "i_did", whenMade: "2020_2026", listingType: "download", attributesCount: 0,
  images: [[8523453929,1,2400,1800],[8475546882,2,2400,1800],[8475546890,3,2400,1800],[8475546894,4,2400,1800],[8523453943,5,2400,1800],[8523453961,6,2400,1800],[8475546968,7,2400,1800],[8523454001,8,2400,1800]] as readonly (readonly number[])[],
  buyerFiles: [[1512273836590,1,"PDT-POGO-001_Buyer_Package_V1.zip",100804,"application/zip"]] as readonly (readonly (number|string)[])[]
});

type Rec = Record<string, unknown>;
type State = { listing: Rec; images: Rec[]; attributes: Rec[]; files: Rec[]; statuses: Record<string, number> };
export type PdtPogo001B01Runtime = { fetchImpl?: typeof fetch; getAccessToken?: () => Promise<string>; repository?: OperationLedgerRepository; now?: () => string };
const isRec=(v:unknown):v is Rec=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const secureEqual=(a0:string,b0:string)=>{const a=Buffer.from(a0),b=Buffer.from(b0);return a.length===b.length&&timingSafeEqual(a,b);};
const hashText=(v:unknown)=>createHash("sha256").update(typeof v==="string"?v.normalize("NFC"):"","utf8").digest("hex");
function stable(v:unknown):unknown{if(Array.isArray(v))return v.map(stable);if(isRec(v))return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function baselineHash(){return createHash("sha256").update(JSON.stringify(stable(EXPECTED_BEFORE)),"utf8").digest("hex");}
async function json(r:Response){const t=await r.text();try{return t?JSON.parse(t):{};}catch{return{};}}
function results(v:unknown){return isRec(v)&&Array.isArray(v.results)?v.results.filter(isRec):null;}

export function exactPdtPogo001B01Body(authorizationId:string){return{operation:PDT_POGO_001_B01.operation,operationId:PDT_POGO_001_B01.operationId,authorizationId,productId:PDT_POGO_001_B01.productId,productVersion:PDT_POGO_001_B01.productVersion,shopId:PDT_POGO_001_B01.shopId,listingId:PDT_POGO_001_B01.listingId,candidateId:PDT_POGO_001_B01.candidateId,candidateFingerprint:PDT_POGO_001_B01.candidateFingerprint,buildId:PDT_POGO_001_B01.buildId,buildFingerprint:PDT_POGO_001_B01.buildFingerprint,acceptanceCriteriaId:PDT_POGO_001_B01.acceptanceCriteriaId,acceptanceCriteriaSha256:PDT_POGO_001_B01.acceptanceCriteriaSha256,protectedStateBaselineSha256:PDT_POGO_001_B01.protectedStateBaselineSha256,patch:{title:PDT_POGO_001_B01.title,tags:[...PDT_POGO_001_B01.tags]}};}

async function readState(token:string,fetchImpl:typeof fetch):Promise<State>{
  const base="https://api.etsy.com/v3/application",id=PDT_POGO_001_B01.listingId,shop=PDT_POGO_001_B01.shopId;
  const urls={listing:`${base}/listings/${id}`,images:`${base}/listings/${id}/images`,attributes:`${base}/shops/${shop}/listings/${id}/properties`,files:`${base}/shops/${shop}/listings/${id}/files`};
  const entries=await Promise.all(Object.entries(urls).map(async([name,url])=>{const response=await fetchImpl(url,{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"});return{name,response,value:await json(response)}}));
  const by=Object.fromEntries(entries.map(e=>[e.name,e])) as Record<string,{response:Response;value:unknown}>;
  const images=results(by.images.value),attributes=results(by.attributes.value),files=results(by.files.value);
  if(!by.listing.response.ok||!isRec(by.listing.value)||!by.images.response.ok||!by.attributes.response.ok||!by.files.response.ok||!images||!attributes||!files)throw new Error("PDT_POGO_001_B01_READ_FAILED");
  return{listing:by.listing.value,images,attributes,files,statuses:Object.fromEntries(entries.map(e=>[e.name,e.response.status]))};
}

function protectedCoreMatches(s:State){
  const l=s.listing,p=isRec(l.price)?l.price:{};
  if(String(l.shop_id)!==EXPECTED_BEFORE.shopId||String(l.listing_id)!==EXPECTED_BEFORE.listingId||String(l.state).toLowerCase()!==EXPECTED_BEFORE.state)return false;
  if(hashText(l.description)!==EXPECTED_BEFORE.descriptionSha256||Number(p.amount)!==EXPECTED_BEFORE.price.amount||p.currency_code!==EXPECTED_BEFORE.price.currency_code||Number(p.divisor)!==EXPECTED_BEFORE.price.divisor)return false;
  if(Number(l.taxonomy_id)!==EXPECTED_BEFORE.taxonomyId||Number(l.quantity)!==EXPECTED_BEFORE.quantity||l.who_made!==EXPECTED_BEFORE.whoMade||l.when_made!==EXPECTED_BEFORE.whenMade||(l.listing_type??l.type)!==EXPECTED_BEFORE.listingType||s.attributes.length!==EXPECTED_BEFORE.attributesCount)return false;
  const imgs=[...s.images].sort((a,b)=>Number(a.rank)-Number(b.rank)).map(x=>[Number(x.listing_image_id),Number(x.rank),Number(x.full_width),Number(x.full_height)]);
  const files=[...s.files].sort((a,b)=>Number(a.rank)-Number(b.rank)).map(x=>[Number(x.listing_file_id),Number(x.rank),x.filename,Number(x.size_bytes),x.filetype]);
  return JSON.stringify(imgs)===JSON.stringify(EXPECTED_BEFORE.images)&&JSON.stringify(files)===JSON.stringify(EXPECTED_BEFORE.buyerFiles);
}
const beforeMatches=(s:State)=>protectedCoreMatches(s)&&s.listing.title===EXPECTED_BEFORE.title&&JSON.stringify(s.listing.tags)===JSON.stringify(EXPECTED_BEFORE.tags);
const finalMatches=(s:State)=>protectedCoreMatches(s)&&s.listing.title===PDT_POGO_001_B01.title&&JSON.stringify(s.listing.tags)===JSON.stringify(PDT_POGO_001_B01.tags);

export async function verifyPdtPogo001B01ProtectedState(runtime:PdtPogo001B01Runtime={}){
  if(baselineHash()!==PDT_POGO_001_B01.protectedStateBaselineSha256)return NextResponse.json({error:"PDT_POGO_001_B01_INTERNAL_BASELINE_FINGERPRINT_MISMATCH",providerPatchCount:0,ETSY_WRITE_COUNT:0},{status:500});
  try{const token=await(runtime.getAccessToken??getValidEtsyAccessToken)();const state=await readState(token,runtime.fetchImpl??fetch);const match=beforeMatches(state);return NextResponse.json({status:match?"PROTECTED_STATE_MATCH":"PROTECTED_STATE_MISMATCH",operationId:PDT_POGO_001_B01.operationId,protectedStateBaselineSha256:PDT_POGO_001_B01.protectedStateBaselineSha256,providerPatchCount:0,ETSY_WRITE_COUNT:0,readStatus:state.statuses},{status:match?200:409});}catch{return NextResponse.json({error:"PDT_POGO_001_B01_VERIFICATION_FAILED",providerPatchCount:0,ETSY_WRITE_COUNT:0},{status:502});}
}

export async function handlePdtPogo001B01TitleTags(body:Rec,request:Request,runtime:PdtPogo001B01Runtime={}){
  if(process.env.PUBLISH_WRITES_ENABLED!=="true")return NextResponse.json({error:"PDT_POGO_001_B01_WRITES_DISABLED",providerPatchCount:0},{status:403});
  const expectedToken=process.env.ETSY_B01_WRITE_TOKEN?.trim()??"",supplied=request.headers.get(WRITE_HEADER)?.trim()??"";
  if(!expectedToken)return NextResponse.json({error:"PDT_POGO_001_B01_WRITE_AUTH_NOT_CONFIGURED",providerPatchCount:0},{status:503});
  if(!supplied||!secureEqual(supplied,expectedToken))return NextResponse.json({error:"PDT_POGO_001_B01_UNAUTHORIZED",providerPatchCount:0},{status:401});
  if(baselineHash()!==PDT_POGO_001_B01.protectedStateBaselineSha256||process.env.ETSY_SHOP_ID?.trim()!==PDT_POGO_001_B01.shopId)return NextResponse.json({error:"PDT_POGO_001_B01_IDENTITY_MISMATCH",providerPatchCount:0},{status:409});
  const authorizationId=process.env[AUTH_ENV]?.trim()??"",allowedHash=process.env[HASH_ENV]?.trim().toLowerCase()??"";
  if(!authorizationId||!SHA256.test(allowedHash))return NextResponse.json({error:"PDT_POGO_001_B01_PRODUCTION_AUTH_NOT_CONFIGURED",providerPatchCount:0},{status:503});
  const exactBody=exactPdtPogo001B01Body(authorizationId);
  if(JSON.stringify(body)!==JSON.stringify(exactBody)||!secureEqual(hashOperationRequest(body),allowedHash))return NextResponse.json({error:"PDT_POGO_001_B01_AUTHORIZATION_CONTRACT_MISMATCH",providerPatchCount:0},{status:409});
  const repository=runtime.repository??new NeonOperationLedgerRepository();
  const existing=await repository.load(PDT_POGO_001_B01.operationId);
  if(existing?.requestHash!==undefined&&existing.requestHash!==allowedHash)return NextResponse.json({error:"OPERATION_ID_PAYLOAD_MISMATCH",providerPatchCount:0},{status:409});
  if(existing?.status==="SUCCEEDED")return NextResponse.json({status:"REPLAY",mode:"WRITE_ONCE",operationId:existing.operationId,requestHash:existing.requestHash,ledgerStatus:existing.status,providerPatchCount:0,receipt:existing.receipt});
  const fetchImpl=runtime.fetchImpl??fetch,token=await(runtime.getAccessToken??getValidEtsyAccessToken)();
  let before:State;try{before=await readState(token,fetchImpl);}catch{return NextResponse.json({error:"PDT_POGO_001_B01_PREREAD_FAILED",providerPatchCount:0},{status:502});}
  if(existing){if(finalMatches(before)){const done=await recordOperationResult(repository,existing.operationId,existing.requestHash,"SUCCEEDED",runtime.now?.()??new Date().toISOString(),{receipt:{...(existing.receipt??{}),reconciled:true,providerPatchCount:0}});return NextResponse.json({status:"RECONCILED",mode:"WRITE_ONCE",operationId:done.operationId,requestHash:done.requestHash,ledgerStatus:done.status,providerPatchCount:0,receipt:done.receipt});}return NextResponse.json({error:"PDT_POGO_001_B01_ALREADY_CLAIMED",providerPatchCount:0},{status:409});}
  if(!beforeMatches(before))return NextResponse.json({error:"PDT_POGO_001_B01_PROTECTED_STATE_MISMATCH",providerPatchCount:0},{status:409});
  const now=runtime.now?.()??new Date().toISOString();const begun=await beginOperation(repository,PDT_POGO_001_B01.operationId,body,now);if(begun.status==="REPLAY")return NextResponse.json({error:"PDT_POGO_001_B01_ALREADY_CLAIMED",providerPatchCount:0},{status:409});
  const form=new URLSearchParams();form.set("title",PDT_POGO_001_B01.title);form.set("tags",PDT_POGO_001_B01.tags.join(","));
  let patch:Response|null=null;let providerBody:unknown={};try{patch=await fetchImpl(`https://api.etsy.com/v3/application/shops/${PDT_POGO_001_B01.shopId}/listings/${PDT_POGO_001_B01.listingId}`,{method:"PATCH",headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded; charset=utf-8"},body:form,cache:"no-store"});providerBody=await json(patch);}catch{}
  if(patch&&!patch.ok&&patch.status<500){const safe=isRec(providerBody)?Object.fromEntries(Object.entries(providerBody).filter(([k,v])=>["error","message","code"].includes(k)&&(typeof v==="string"||typeof v==="number"))):{};await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"FAILED",now,{recoveryPoint:"PATCH_REJECTED",receipt:{providerPatchCount:1,statusCode:patch.status,providerError:safe}});return NextResponse.json({error:"PDT_POGO_001_B01_PATCH_REJECTED",statusCode:patch.status,providerPatchCount:1,providerError:safe},{status:502});}
  let after:State|null=null;try{after=await readState(token,fetchImpl);}catch{}
  if(after&&finalMatches(after)){const done=await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"SUCCEEDED",runtime.now?.()??new Date().toISOString(),{receipt:{providerPatchCount:1,updateStatusCode:patch?.status??null,readBackStatus:after.statuses,verified:{title:"PASS",tagsExactOrdered13:"PASS",protectedState:"PASS"}}});return NextResponse.json({status:patch?.ok?"UPDATED_AND_VERIFIED":"RECONCILED",mode:"WRITE_ONCE",operationId:done.operationId,requestHash:done.requestHash,ledgerStatus:done.status,providerPatchCount:1,receipt:done.receipt});}
  const pending=await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"POST_PATCH_READBACK_REQUIRED",receipt:{providerPatchCount:1,updateStatusCode:patch?.status??null}});
  return NextResponse.json({status:"RECONCILIATION_REQUIRED",mode:"WRITE_ONCE",operationId:pending.operationId,requestHash:pending.requestHash,ledgerStatus:pending.status,providerPatchCount:1,recoveryPoint:pending.recoveryPoint},{status:202});
}
