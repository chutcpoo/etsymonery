import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { beginOperation, hashOperationRequest, NeonOperationLedgerRepository, recordOperationResult, type OperationLedgerRepository } from "./operation-ledger";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;
const AUTH_ENV = "ETSY_PD_STOCK_005_C01_AUTHORIZATION_ID";
const HASH_ENV = "ETSY_PD_STOCK_005_C01_REQUEST_SHA256";

export const PD_STOCK_005_C01 = Object.freeze({
  operation: "UPDATE_ACTIVE_LISTING_TITLE_TAGS_ONLY",
  operationId: "PD-STOCK-005-C01-TITLE-TAGS-001",
  productId: "PD-STOCK-005",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4561821192",
  candidateId: "ETSY-OPT-RC-PD-STOCK-005-V1-2026-09-10-C",
  candidateFingerprint: "58e1760b985eee0bdba4828c1c96e8e0a35c291ff061bb533441dccb4076375e",
  buildId: "ETSY-OPT-RC-PD-STOCK-005-BUILD-20260910-C01",
  buildFingerprint: "c0432a474a69909f7ed895fab83318cff86be2f1a09f62e555ce74fe5fb522f7",
  acceptanceCriteriaId: "ETSY-OPT-RC-PD-STOCK-005-AC-20260910-C01",
  acceptanceCriteriaSha256: "f8e232adbd3d95955cb57233b444c657e3baf65abae57b3f3a964ae23692f108",
  protectedStateBaselineSha256: "d5b7682cb2a14ef6da373b7eaf394f0cc02c5b140e758d3acf875b74fc051ed3",
  title: "Restaurant Inventory Spreadsheet | Stock, Waste, Reorder & Supplier Tracker | Excel Template",
  tags: ["inventory sheet","inventory tracker","restaurant inventory","cafe inventory","stock tracker","waste tracker","reorder tracker","supplier tracker","stock count sheet","food waste tracker","inventory excel","stock spreadsheet","stock control"] as readonly string[]
} as const);

const EXPECTED_BEFORE_SHA256 = "b3d6f529c308c78da7a8cbea10e3c0c523c7dcca55c37ab2e03b4d34accabe59";
const EXPECTED_BEFORE = Object.freeze({
  shopId: "23582741", listingId: "4561821192", state: "active",
  title: "Restaurant & Cafe Inventory Tracker | Stock, Waste, Reorder and Supplier Spreadsheet",
  tags: ["restaurant inventory","cafe stock tracker","kitchen inventory","food waste tracker","reorder spreadsheet","supplier tracker","par level sheet","stock count sheet","stock control","inventory excel","google sheets stock","waste cost log","food stocktake"] as readonly string[],
  descriptionSha256: "61e01e830c577c9a52dd799cab2aaee502d3b972ebf39aff4ae50c3e2c0abcd3",
  price: { amount: 890, currency_code: "USD", divisor: 100 }, taxonomyId: 12476, quantity: 999,
  whoMade: "i_did", whenMade: "2020_2026", listingType: "download", attributesCount: 0,
  images: [[8425781998,1,2000,2000],[8425781986,2,2000,2000],[8425782002,3,2000,2000],[8473652637,4,2000,2000],[8425782008,5,2000,2000],[8473652673,6,2000,2000],[8425782060,7,2000,2000],[8433083104,8,2000,2000]] as readonly (readonly number[])[],
  buyerFiles: [[1509497762118,1,"Inventory_Waste_A4.pdf",24247,"application/pdf"],[1509497762234,2,"Inventory_Waste_US_Letter.pdf",23237,"application/pdf"],[1509497762284,3,"Inventory_Waste_Quick_Start.pdf",4630,"application/pdf"],[1510700238185,4,"Inventory_Waste_Read_Me_License.pdf",4242,"application/pdf"],[1509980203922,5,"Inventory_Waste_Tracker.zip",16285,"application/zip"]] as readonly (readonly (number|string)[])[]
});

type Rec = Record<string, unknown>;
type State = { listing: Rec; images: Rec[]; attributes: Rec[]; files: Rec[]; statuses: Record<string, number> };
export type PdStock005C01Runtime = { fetchImpl?: typeof fetch; getAccessToken?: () => Promise<string>; repository?: OperationLedgerRepository; now?: () => string };
const isRec=(v:unknown):v is Rec=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const secureEqual=(a0:string,b0:string)=>{const a=Buffer.from(a0),b=Buffer.from(b0);return a.length===b.length&&timingSafeEqual(a,b);};
const hashText=(v:unknown)=>createHash("sha256").update(typeof v==="string"?v.normalize("NFC"):"","utf8").digest("hex");
function stable(v:unknown):unknown{if(Array.isArray(v))return v.map(stable);if(isRec(v))return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function baselineHash(){return createHash("sha256").update(JSON.stringify(stable(EXPECTED_BEFORE)),"utf8").digest("hex");}
async function json(r:Response){const t=await r.text();try{return t?JSON.parse(t):{};}catch{return{};}}
function results(v:unknown){return isRec(v)&&Array.isArray(v.results)?v.results.filter(isRec):null;}

export function exactPdStock005C01Body(authorizationId:string){return{operation:PD_STOCK_005_C01.operation,operationId:PD_STOCK_005_C01.operationId,authorizationId,productId:PD_STOCK_005_C01.productId,productVersion:PD_STOCK_005_C01.productVersion,shopId:PD_STOCK_005_C01.shopId,listingId:PD_STOCK_005_C01.listingId,candidateId:PD_STOCK_005_C01.candidateId,candidateFingerprint:PD_STOCK_005_C01.candidateFingerprint,buildId:PD_STOCK_005_C01.buildId,buildFingerprint:PD_STOCK_005_C01.buildFingerprint,acceptanceCriteriaId:PD_STOCK_005_C01.acceptanceCriteriaId,acceptanceCriteriaSha256:PD_STOCK_005_C01.acceptanceCriteriaSha256,protectedStateBaselineSha256:PD_STOCK_005_C01.protectedStateBaselineSha256,patch:{title:PD_STOCK_005_C01.title,tags:[...PD_STOCK_005_C01.tags]}};}

async function readState(token:string,fetchImpl:typeof fetch):Promise<State>{
  const base="https://api.etsy.com/v3/application",id=PD_STOCK_005_C01.listingId,shop=PD_STOCK_005_C01.shopId;
  const urls={listing:`${base}/listings/${id}`,images:`${base}/listings/${id}/images`,attributes:`${base}/shops/${shop}/listings/${id}/properties`,files:`${base}/shops/${shop}/listings/${id}/files`};
  const entries=await Promise.all(Object.entries(urls).map(async([name,url])=>{const response=await fetchImpl(url,{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"});return{name,response,value:await json(response)}}));
  const by=Object.fromEntries(entries.map(e=>[e.name,e])) as Record<string,{response:Response;value:unknown}>;
  const images=results(by.images.value),attributes=results(by.attributes.value),files=results(by.files.value);
  if(!by.listing.response.ok||!isRec(by.listing.value)||!by.images.response.ok||!by.attributes.response.ok||!by.files.response.ok||!images||!attributes||!files)throw new Error("PD_STOCK_005_C01_READ_FAILED");
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
const finalMatches=(s:State)=>protectedCoreMatches(s)&&s.listing.title===PD_STOCK_005_C01.title&&JSON.stringify(s.listing.tags)===JSON.stringify(PD_STOCK_005_C01.tags);

export async function verifyPdStock005C01ProtectedState(runtime:PdStock005C01Runtime={}){
  if(baselineHash()!==EXPECTED_BEFORE_SHA256)return NextResponse.json({error:"PD_STOCK_005_C01_INTERNAL_BASELINE_FINGERPRINT_MISMATCH",providerPatchCount:0,ETSY_WRITE_COUNT:0},{status:500});
  try{const token=await(runtime.getAccessToken??getValidEtsyAccessToken)();const state=await readState(token,runtime.fetchImpl??fetch);const match=beforeMatches(state);return NextResponse.json({status:match?"PROTECTED_STATE_MATCH":"PROTECTED_STATE_MISMATCH",operationId:PD_STOCK_005_C01.operationId,protectedStateBaselineSha256:PD_STOCK_005_C01.protectedStateBaselineSha256,providerPatchCount:0,ETSY_WRITE_COUNT:0,readStatus:state.statuses},{status:match?200:409});}catch{return NextResponse.json({error:"PD_STOCK_005_C01_VERIFICATION_FAILED",providerPatchCount:0,ETSY_WRITE_COUNT:0},{status:502});}
}

export async function handlePdStock005C01TitleTags(body:Rec,request:Request,runtime:PdStock005C01Runtime={}){
  if(process.env.PUBLISH_WRITES_ENABLED!=="true")return NextResponse.json({error:"PD_STOCK_005_C01_WRITES_DISABLED",providerPatchCount:0},{status:403});
  const expectedToken=process.env.ETSY_B01_WRITE_TOKEN?.trim()??"",supplied=request.headers.get(WRITE_HEADER)?.trim()??"";
  if(!expectedToken)return NextResponse.json({error:"PD_STOCK_005_C01_WRITE_AUTH_NOT_CONFIGURED",providerPatchCount:0},{status:503});
  if(!supplied||!secureEqual(supplied,expectedToken))return NextResponse.json({error:"PD_STOCK_005_C01_UNAUTHORIZED",providerPatchCount:0},{status:401});
  if(baselineHash()!==EXPECTED_BEFORE_SHA256||process.env.ETSY_SHOP_ID?.trim()!==PD_STOCK_005_C01.shopId)return NextResponse.json({error:"PD_STOCK_005_C01_IDENTITY_MISMATCH",providerPatchCount:0},{status:409});
  const authorizationId=process.env[AUTH_ENV]?.trim()??"",allowedHash=process.env[HASH_ENV]?.trim().toLowerCase()??"";
  if(!authorizationId||!SHA256.test(allowedHash))return NextResponse.json({error:"PD_STOCK_005_C01_PRODUCTION_AUTH_NOT_CONFIGURED",providerPatchCount:0},{status:503});
  const exactBody=exactPdStock005C01Body(authorizationId);
  if(JSON.stringify(body)!==JSON.stringify(exactBody)||!secureEqual(hashOperationRequest(body),allowedHash))return NextResponse.json({error:"PD_STOCK_005_C01_AUTHORIZATION_CONTRACT_MISMATCH",providerPatchCount:0},{status:409});
  const repository=runtime.repository??new NeonOperationLedgerRepository();
  const existing=await repository.load(PD_STOCK_005_C01.operationId);
  if(existing?.requestHash!==undefined&&existing.requestHash!==allowedHash)return NextResponse.json({error:"OPERATION_ID_PAYLOAD_MISMATCH",providerPatchCount:0},{status:409});
  if(existing?.status==="SUCCEEDED")return NextResponse.json({status:"REPLAY",mode:"WRITE_ONCE",operationId:existing.operationId,requestHash:existing.requestHash,ledgerStatus:existing.status,providerPatchCount:0,receipt:existing.receipt});
  const fetchImpl=runtime.fetchImpl??fetch,token=await(runtime.getAccessToken??getValidEtsyAccessToken)();
  let before:State;try{before=await readState(token,fetchImpl);}catch{return NextResponse.json({error:"PD_STOCK_005_C01_PREREAD_FAILED",providerPatchCount:0},{status:502});}
  if(existing){if(finalMatches(before)){const done=await recordOperationResult(repository,existing.operationId,existing.requestHash,"SUCCEEDED",runtime.now?.()??new Date().toISOString(),{receipt:{...(existing.receipt??{}),reconciled:true,providerPatchCount:0}});return NextResponse.json({status:"RECONCILED",mode:"WRITE_ONCE",operationId:done.operationId,requestHash:done.requestHash,ledgerStatus:done.status,providerPatchCount:0,receipt:done.receipt});}return NextResponse.json({error:"PD_STOCK_005_C01_ALREADY_CLAIMED",providerPatchCount:0},{status:409});}
  if(!beforeMatches(before))return NextResponse.json({error:"PD_STOCK_005_C01_PROTECTED_STATE_MISMATCH",providerPatchCount:0},{status:409});
  const now=runtime.now?.()??new Date().toISOString();const begun=await beginOperation(repository,PD_STOCK_005_C01.operationId,body,now);if(begun.status==="REPLAY")return NextResponse.json({error:"PD_STOCK_005_C01_ALREADY_CLAIMED",providerPatchCount:0},{status:409});
  const form=new URLSearchParams();form.set("title",PD_STOCK_005_C01.title);form.set("tags",PD_STOCK_005_C01.tags.join(","));
  let patch:Response|null=null;let providerBody:unknown={};try{patch=await fetchImpl(`https://api.etsy.com/v3/application/shops/${PD_STOCK_005_C01.shopId}/listings/${PD_STOCK_005_C01.listingId}`,{method:"PATCH",headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded; charset=utf-8"},body:form,cache:"no-store"});providerBody=await json(patch);}catch{}
  if(patch&&!patch.ok&&patch.status<500){const safe=isRec(providerBody)?Object.fromEntries(Object.entries(providerBody).filter(([k,v])=>["error","message","code"].includes(k)&&(typeof v==="string"||typeof v==="number"))):{};await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"FAILED",now,{recoveryPoint:"PATCH_REJECTED",receipt:{providerPatchCount:1,statusCode:patch.status,providerError:safe}});return NextResponse.json({error:"PD_STOCK_005_C01_PATCH_REJECTED",statusCode:patch.status,providerPatchCount:1,providerError:safe},{status:502});}
  let after:State|null=null;try{after=await readState(token,fetchImpl);}catch{}
  if(after&&finalMatches(after)){const done=await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"SUCCEEDED",runtime.now?.()??new Date().toISOString(),{receipt:{providerPatchCount:1,updateStatusCode:patch?.status??null,readBackStatus:after.statuses,verified:{title:"PASS",tagsExactOrdered13:"PASS",protectedState:"PASS"}}});return NextResponse.json({status:patch?.ok?"UPDATED_AND_VERIFIED":"RECONCILED",mode:"WRITE_ONCE",operationId:done.operationId,requestHash:done.requestHash,ledgerStatus:done.status,providerPatchCount:1,receipt:done.receipt});}
  const pending=await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"POST_PATCH_READBACK_REQUIRED",receipt:{providerPatchCount:1,updateStatusCode:patch?.status??null}});
  return NextResponse.json({status:"RECONCILIATION_REQUIRED",mode:"WRITE_ONCE",operationId:pending.operationId,requestHash:pending.requestHash,ledgerStatus:pending.status,providerPatchCount:1,recoveryPoint:pending.recoveryPoint},{status:202});
}
