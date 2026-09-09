import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { beginOperation, hashOperationRequest, NeonOperationLedgerRepository, recordOperationResult, type OperationLedgerRepository } from "./operation-ledger";
import { clearAuthorizedAsset, loadAuthorizedAsset } from "./authorized-operation-asset-store";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";

export const PD_REST_003_A02 = Object.freeze({
  operation: "UPDATE_ACTIVE_LISTING_TITLE_TAGS_IMAGE1_ONLY",
  operationId: "PD-REST-003-A02-TITLE-TAGS-IMAGE1-001",
  authorizationId: "PTQC-PD-REST-003-A02-AUTH-20260909-01",
  productId: "PD-REST-003",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4561819638",
  candidateId: "ETSY-REVENUE-REPAIR-PD-REST-003-V1-2026-09-09-A",
  candidateFingerprint: "fece609138ed621418a242d9534067fa377013222e081406df058c56cc95330d",
  buildId: "ETSY-REVENUE-REPAIR-PD-REST-003-BUILD-20260909-A02",
  buildFingerprint: "4650da97d8fbcfd8648e7f841f0b7e101095b7a89708f829f8ac040f6daf66a0",
  acceptanceCriteriaVersion: "PD-REST-003-REVENUE-REPAIR-AC-V1",
  acceptanceCriteriaSha256: "9c16d7cc987f39be2e13d0468cbee66fe98c3193a8feb80c3c85c6e28737a6ac",
  protectedFieldSnapshotSha256: "939a8ffada532ea9fe9a10cdb2d80e2c018eb22efdbf364a73c2238b3de01462",
  requestSha256: "dce3ea352e4ed9ee1c67941f62f63c1d8c531509b25f0dc18346a266cb24d2e5",
  title: "Restaurant Opening & Closing Checklist | Daily Operations Template",
  tags: ["restaurant checklist","opening checklist","closing checklist","restaurant manager","daily operations","manager checklist","kitchen checklist","shift checklist","restaurant excel","restaurant template","shift handoff","restaurant forms","food service"] as readonly string[],
  image: {
    fileName: "PD-REST-003_RR_A02_IMAGE01_FINAL.png",
    googleDriveId: "1t5-NAn-BulSPYoaTtNjzpUu1hnXaJjJJ",
    byteSize: 161742,
    sha256: "792bb7ccfbc5c22acf7f301f78157a8e06e6fed1ee783c32b3a0452e987d14de",
    width: 3000,
    height: 3000,
    mimeType: "image/png",
    targetRank: 1
  },
  positioning: {
    primary: "Restaurant Opening, Closing & Daily Operations System for Managers",
    workflow: "Open → Pre-Service → Operate → Close → Handoff"
  }
} as const);

const EXPECTED_BEFORE = Object.freeze({
  title: "Restaurant Daily Operations Checklist | Excel, Google Sheets, PDF",
  tags: ["restaurant checklist","daily operations","opening checklist","closing checklist","restaurant excel","google sheets food","food service tool","kitchen checklist","manager checklist","shift handoff","prep log","printable checklist","digital download"] as readonly string[],
  image1Id: 8488103494,
  descriptionSha256: "00952dcd077bb602ff6b6ed37c0784e90bbf0e09eba3d8354177a0a7402f8be5",
  price: { amount: 990, divisor: 100, currency_code: "USD" },
  taxonomyId: 12476,
  quantity: 998,
  whoMade: "i_did",
  whenMade: "2020_2026",
  listingType: "download",
  images2to9: [[8488103428,2,2000,2000],[8488103480,3,2000,2000],[8488103438,4,2000,2000],[8536001153,5,2000,2000],[8536001075,6,2000,2000],[8488103510,7,2000,2000],[8536001073,8,2000,2000],[8488103512,9,2000,2000]] as readonly (readonly number[])[],
  buyerFiles: [[1509497122622,1,"Restaurant_Operations_A4.pdf",20782,"application/pdf"],[1509497122824,2,"Restaurant_Operations_US_Letter.pdf",20228,"application/pdf"],[1509497122832,3,"Restaurant_Read_Me_License.pdf",4219,"application/pdf"],[1511184698189,4,"Restaurant_Operations.zip",15018,"application/zip"],[1512037381313,5,"Restaurant_Quick_Start.pdf",31217,"application/pdf"]] as readonly (readonly (number|string)[])[]
} as const);

type RecordValue = Record<string, unknown>;
type ReadState = { listing: RecordValue; images: RecordValue[]; attributes: RecordValue[]; files: RecordValue[]; statuses: Record<string, number> };

export type PdRest003A02Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  loadAsset?: () => Promise<Buffer>;
  clearAsset?: () => Promise<void>;
  verifyAsset?: (bytes: Buffer) => boolean;
  now?: () => string;
};

function isRecord(value: unknown): value is RecordValue { return typeof value === "object" && value !== null && !Array.isArray(value); }
function secureEqual(left: string, right: string) { const a=Buffer.from(left), b=Buffer.from(right); return a.length===b.length && timingSafeEqual(a,b); }
async function parseJson(response: Response) { const text=await response.text(); if(!text)return {}; try{return JSON.parse(text) as unknown;}catch{return {};} }
function hashText(value: unknown) { return createHash("sha256").update(typeof value === "string" ? value.normalize("NFC") : "", "utf8").digest("hex"); }
function exactArray(value: unknown, expected: readonly unknown[]) { return Array.isArray(value) && JSON.stringify(value)===JSON.stringify(expected); }
function normalizedResults(value: unknown) { return isRecord(value)&&Array.isArray(value.results) ? value.results.filter(isRecord) : null; }

export function exactPdRest003A02Body() {
  return {
    operation: PD_REST_003_A02.operation, operationId: PD_REST_003_A02.operationId, authorizationId: PD_REST_003_A02.authorizationId,
    productId: PD_REST_003_A02.productId, productVersion: PD_REST_003_A02.productVersion, shopId: PD_REST_003_A02.shopId, listingId: PD_REST_003_A02.listingId,
    candidateId: PD_REST_003_A02.candidateId, candidateFingerprint: PD_REST_003_A02.candidateFingerprint, buildId: PD_REST_003_A02.buildId, buildFingerprint: PD_REST_003_A02.buildFingerprint,
    acceptanceCriteriaVersion: PD_REST_003_A02.acceptanceCriteriaVersion, acceptanceCriteriaSha256: PD_REST_003_A02.acceptanceCriteriaSha256, protectedFieldSnapshotSha256: PD_REST_003_A02.protectedFieldSnapshotSha256,
    patch: { title: PD_REST_003_A02.title, tags: [...PD_REST_003_A02.tags], image1: { ...PD_REST_003_A02.image } },
    positioningLock: { ...PD_REST_003_A02.positioning }
  };
}

function authorizationError(request: Request) {
  const expected=process.env.ETSY_B01_WRITE_TOKEN?.trim()??"", supplied=request.headers.get(WRITE_HEADER)?.trim()??"";
  if(!expected)return NextResponse.json({error:"PD_REST_003_A02_AUTH_NOT_CONFIGURED",providerWriteCount:0},{status:503});
  if(!supplied||!secureEqual(supplied,expected))return NextResponse.json({error:"PD_REST_003_A02_UNAUTHORIZED",providerWriteCount:0},{status:401});
  return null;
}

function verifyAsset(bytes: Buffer) {
  if(bytes.length!==PD_REST_003_A02.image.byteSize)return false;
  if(createHash("sha256").update(bytes).digest("hex")!==PD_REST_003_A02.image.sha256)return false;
  const signature=Buffer.from([137,80,78,71,13,10,26,10]);
  return bytes.subarray(0,8).equals(signature)&&bytes.readUInt32BE(16)===PD_REST_003_A02.image.width&&bytes.readUInt32BE(20)===PD_REST_003_A02.image.height;
}

async function readState(accessToken:string, fetchImpl:typeof fetch):Promise<ReadState> {
  const base="https://api.etsy.com/v3/application", listingId=PD_REST_003_A02.listingId, shopId=PD_REST_003_A02.shopId;
  const endpoints={listing:`${base}/listings/${listingId}`,images:`${base}/listings/${listingId}/images`,attributes:`${base}/shops/${shopId}/listings/${listingId}/properties`,files:`${base}/shops/${shopId}/listings/${listingId}/files`};
  const entries=await Promise.all(Object.entries(endpoints).map(async([name,url])=>{const response=await fetchImpl(url,{method:"GET",headers:etsyApiHeaders(accessToken),cache:"no-store"});const value=await parseJson(response);return {name,response,value};}));
  const by=Object.fromEntries(entries.map(x=>[x.name,x])) as Record<string,{name:string;response:Response;value:unknown}>;
  if(!by.listing.response.ok||!isRecord(by.listing.value)||!by.images.response.ok||!by.attributes.response.ok||!by.files.response.ok)throw new Error("PD_REST_003_A02_READBACK_FAILED");
  const images=normalizedResults(by.images.value), attributes=normalizedResults(by.attributes.value), files=normalizedResults(by.files.value);
  if(!images||!attributes||!files)throw new Error("PD_REST_003_A02_READBACK_INVALID");
  return {listing:by.listing.value,images,attributes,files,statuses:Object.fromEntries(entries.map(x=>[x.name,x.response.status]))};
}

function protectedStateMatches(state: ReadState) {
  const l=state.listing, price=isRecord(l.price)?l.price:{};
  if(String(l.shop_id)!==PD_REST_003_A02.shopId||String(l.state).toLowerCase()!=="active"||hashText(l.description)!==EXPECTED_BEFORE.descriptionSha256)return false;
  if(Number(price.amount)!==EXPECTED_BEFORE.price.amount||Number(price.divisor)!==EXPECTED_BEFORE.price.divisor||price.currency_code!==EXPECTED_BEFORE.price.currency_code)return false;
  if(Number(l.taxonomy_id)!==EXPECTED_BEFORE.taxonomyId||Number(l.quantity)!==EXPECTED_BEFORE.quantity||l.who_made!==EXPECTED_BEFORE.whoMade||l.when_made!==EXPECTED_BEFORE.whenMade||(l.listing_type??l.type)!==EXPECTED_BEFORE.listingType)return false;
  if(state.attributes.length!==0)return false;
  const protectedImages=state.images.filter(x=>Number(x.rank)>=2).sort((a,b)=>Number(a.rank)-Number(b.rank)).map(x=>[Number(x.listing_image_id),Number(x.rank),Number(x.full_width),Number(x.full_height)]);
  if(JSON.stringify(protectedImages)!==JSON.stringify(EXPECTED_BEFORE.images2to9))return false;
  const files=state.files.sort((a,b)=>Number(a.rank)-Number(b.rank)).map(x=>[Number(x.listing_file_id),Number(x.rank),x.filename,Number(x.size_bytes),x.filetype]);
  return JSON.stringify(files)===JSON.stringify(EXPECTED_BEFORE.buyerFiles);
}

function beforeStateMatches(state: ReadState) {
  const rank1=state.images.find(x=>Number(x.rank)===1);
  return protectedStateMatches(state)&&state.listing.title===EXPECTED_BEFORE.title&&exactArray(state.listing.tags,EXPECTED_BEFORE.tags)&&Number(rank1?.listing_image_id)===EXPECTED_BEFORE.image1Id;
}

function finalStateMatches(state: ReadState, uploadedImageId:string) {
  const rank1=state.images.find(x=>Number(x.rank)===1);
  return protectedStateMatches(state)&&state.listing.title===PD_REST_003_A02.title&&exactArray(state.listing.tags,PD_REST_003_A02.tags)&&String(rank1?.listing_image_id??"")===uploadedImageId&&Number(rank1?.full_width)===PD_REST_003_A02.image.width&&Number(rank1?.full_height)===PD_REST_003_A02.image.height;
}

function multipartHeaders(token:string){const headers=etsyApiHeaders(token);delete headers["content-type"];return headers;}
function response(status:"UPDATED_AND_VERIFIED"|"RECONCILED", requestHash:string, providerWriteCount:number, receipt:Record<string,unknown>){return NextResponse.json({status,mode:"WRITE_ONCE",operationId:PD_REST_003_A02.operationId,requestHash,ledgerStatus:"SUCCEEDED",providerWriteCount,authorizationId:PD_REST_003_A02.authorizationId,buildId:PD_REST_003_A02.buildId,buildFingerprint:PD_REST_003_A02.buildFingerprint,receipt});}

export async function handlePdRest003A02TitleTagsImage1(body:Record<string,unknown>,request:Request,runtime:PdRest003A02Runtime={}) {
  if(process.env.PUBLISH_WRITES_ENABLED!=="true")return NextResponse.json({error:"PD_REST_003_A02_WRITES_DISABLED",providerWriteCount:0},{status:403});
  const auth=authorizationError(request);if(auth)return auth;
  if(hashOperationRequest(body)!==PD_REST_003_A02.requestSha256||hashOperationRequest(exactPdRest003A02Body())!==PD_REST_003_A02.requestSha256)return NextResponse.json({error:"PD_REST_003_A02_AUTHORIZATION_CONTRACT_MISMATCH",providerWriteCount:0},{status:409});
  if((process.env.ETSY_SHOP_ID?.trim()??"")!==PD_REST_003_A02.shopId)return NextResponse.json({error:"PD_REST_003_A02_SHOP_MISMATCH",providerWriteCount:0},{status:409});
  const repository=runtime.repository??new NeonOperationLedgerRepository(), now=runtime.now?.()??new Date().toISOString();
  const existing=await repository.load(PD_REST_003_A02.operationId);
  if(existing){
    if(existing.requestHash!==PD_REST_003_A02.requestSha256)return NextResponse.json({error:"OPERATION_ID_PAYLOAD_MISMATCH",providerWriteCount:0},{status:409});
    if(existing.status==="SUCCEEDED")return NextResponse.json({status:"REPLAY",mode:"WRITE_ONCE",operationId:existing.operationId,requestHash:existing.requestHash,ledgerStatus:existing.status,providerWriteCount:0,receipt:existing.receipt});
  }

  let asset:Buffer;
  try{asset=await(runtime.loadAsset??(()=>loadAuthorizedAsset(PD_REST_003_A02.operationId,PD_REST_003_A02.image.sha256)))();}catch{return NextResponse.json({error:"PD_REST_003_A02_ASSET_NOT_READY",providerWriteCount:0},{status:409});}
  if(!(runtime.verifyAsset??verifyAsset)(asset))return NextResponse.json({error:"PD_REST_003_A02_ASSET_IDENTITY_MISMATCH",providerWriteCount:0},{status:409});

  const fetchImpl=runtime.fetchImpl??fetch, accessToken=await(runtime.getAccessToken??getValidEtsyAccessToken)();
  let before:ReadState;try{before=await readState(accessToken,fetchImpl);}catch{return NextResponse.json({error:"PD_REST_003_A02_PREREAD_FAILED",providerWriteCount:0},{status:502});}
  if(!beforeStateMatches(before))return NextResponse.json({error:"PD_REST_003_A02_PRECONDITION_MISMATCH",providerWriteCount:0},{status:409});

  let begun:Awaited<ReturnType<typeof beginOperation>>;try{begun=await beginOperation(repository,PD_REST_003_A02.operationId,body,now);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"OPERATION_LEDGER_ERROR",providerWriteCount:0},{status:409});}
  if(begun.status==="REPLAY"){
    if(begun.record.status==="SUCCEEDED")return NextResponse.json({status:"REPLAY",mode:"WRITE_ONCE",operationId:begun.record.operationId,requestHash:begun.record.requestHash,ledgerStatus:begun.record.status,providerWriteCount:0,receipt:begun.record.receipt});
    const uploadedImageId=typeof begun.record.receipt?.uploadedImageId==="string"?begun.record.receipt.uploadedImageId:"";
    if(begun.record.status==="RECONCILIATION_REQUIRED"&&uploadedImageId){try{const current=await readState(accessToken,fetchImpl);if(finalStateMatches(current,uploadedImageId)){const done=await recordOperationResult(repository,PD_REST_003_A02.operationId,begun.record.requestHash,"SUCCEEDED",runtime.now?.()??new Date().toISOString(),{receipt:{...begun.record.receipt,reconciled:true}});await(runtime.clearAsset??(()=>clearAuthorizedAsset(PD_REST_003_A02.operationId,PD_REST_003_A02.image.sha256)))();return response("RECONCILED",done.requestHash,0,done.receipt??{});}}catch{} }
    return NextResponse.json({error:"PD_REST_003_A02_ALREADY_CLAIMED",ledgerStatus:begun.record.status,providerWriteCount:0},{status:409});
  }

  let providerWriteCount=0, uploadedImageId="";
  const uploadBody=new FormData();uploadBody.append("image",new File([Uint8Array.from(asset)],PD_REST_003_A02.image.fileName,{type:PD_REST_003_A02.image.mimeType}),PD_REST_003_A02.image.fileName);uploadBody.append("rank","1");uploadBody.append("overwrite","true");
  const uploadUrl=`https://api.etsy.com/v3/application/shops/${PD_REST_003_A02.shopId}/listings/${PD_REST_003_A02.listingId}/images`;
  try{
    providerWriteCount=1;const upload=await fetchImpl(uploadUrl,{method:"POST",headers:multipartHeaders(accessToken),body:uploadBody,cache:"no-store"});const value=await parseJson(upload);
    if(!upload.ok){if(upload.status<500){await recordOperationResult(repository,PD_REST_003_A02.operationId,begun.record.requestHash,"FAILED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"IMAGE_UPLOAD_REJECTED",receipt:{providerWriteCount,statusCode:upload.status}});return NextResponse.json({error:"PD_REST_003_A02_IMAGE_UPLOAD_REJECTED",statusCode:upload.status,providerWriteCount},{status:502});}throw new Error("AMBIGUOUS_IMAGE_UPLOAD");}
    if(!isRecord(value)||!value.listing_image_id)throw new Error("AMBIGUOUS_IMAGE_UPLOAD");uploadedImageId=String(value.listing_image_id);
  }catch{
    let current:ReadState|null=null;try{current=await readState(accessToken,fetchImpl);}catch{}
    const rank1=current?.images.find(x=>Number(x.rank)===1);if(current&&protectedStateMatches(current)&&Number(rank1?.listing_image_id)!==EXPECTED_BEFORE.image1Id&&rank1?.listing_image_id){uploadedImageId=String(rank1.listing_image_id);}else{const pending=await recordOperationResult(repository,PD_REST_003_A02.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"IMAGE_UPLOAD_READBACK",receipt:{providerWriteCount}});return NextResponse.json({error:"PD_REST_003_A02_IMAGE_UPLOAD_AMBIGUOUS",requestHash:pending.requestHash,providerWriteCount},{status:202});}
  }

  let afterImage:ReadState;try{afterImage=await readState(accessToken,fetchImpl);}catch{const pending=await recordOperationResult(repository,PD_REST_003_A02.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"IMAGE_POSTREAD_FAILED",receipt:{providerWriteCount,uploadedImageId}});return NextResponse.json({error:"PD_REST_003_A02_IMAGE_POSTREAD_FAILED",requestHash:pending.requestHash,providerWriteCount},{status:202});}
  const rank1=afterImage.images.find(x=>Number(x.rank)===1);if(!protectedStateMatches(afterImage)||String(rank1?.listing_image_id??"")!==uploadedImageId){const pending=await recordOperationResult(repository,PD_REST_003_A02.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"IMAGE_POSTREAD_MISMATCH",receipt:{providerWriteCount,uploadedImageId}});return NextResponse.json({error:"PD_REST_003_A02_IMAGE_POSTREAD_MISMATCH",requestHash:pending.requestHash,providerWriteCount},{status:202});}

  const patchBody=new URLSearchParams();patchBody.set("title",PD_REST_003_A02.title);patchBody.set("tags",PD_REST_003_A02.tags.join(","));const patchUrl=`https://api.etsy.com/v3/application/shops/${PD_REST_003_A02.shopId}/listings/${PD_REST_003_A02.listingId}`;
  try{
    providerWriteCount=2;const patch=await fetchImpl(patchUrl,{method:"PATCH",headers:{...etsyApiHeaders(accessToken),"content-type":"application/x-www-form-urlencoded"},body:patchBody,cache:"no-store"});await parseJson(patch);
    if(!patch.ok){if(patch.status<500){await recordOperationResult(repository,PD_REST_003_A02.operationId,begun.record.requestHash,"FAILED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"TITLE_TAGS_PATCH_REJECTED",receipt:{providerWriteCount,uploadedImageId,statusCode:patch.status}});return NextResponse.json({error:"PD_REST_003_A02_TITLE_TAGS_PATCH_REJECTED",statusCode:patch.status,providerWriteCount},{status:502});}throw new Error("AMBIGUOUS_TITLE_TAGS_PATCH");}
  }catch{
    let current:ReadState|null=null;try{current=await readState(accessToken,fetchImpl);}catch{}
    if(current&&finalStateMatches(current,uploadedImageId)){const done=await recordOperationResult(repository,PD_REST_003_A02.operationId,begun.record.requestHash,"SUCCEEDED",runtime.now?.()??new Date().toISOString(),{receipt:{providerWriteCount,uploadedImageId,reconciled:true}});await(runtime.clearAsset??(()=>clearAuthorizedAsset(PD_REST_003_A02.operationId,PD_REST_003_A02.image.sha256)))();return response("RECONCILED",done.requestHash,providerWriteCount,done.receipt??{});}
    const pending=await recordOperationResult(repository,PD_REST_003_A02.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"TITLE_TAGS_PATCH_READBACK",receipt:{providerWriteCount,uploadedImageId}});return NextResponse.json({error:"PD_REST_003_A02_TITLE_TAGS_PATCH_AMBIGUOUS",requestHash:pending.requestHash,providerWriteCount},{status:202});
  }

  let final:ReadState;try{final=await readState(accessToken,fetchImpl);}catch{const pending=await recordOperationResult(repository,PD_REST_003_A02.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"FINAL_READBACK_FAILED",receipt:{providerWriteCount,uploadedImageId}});return NextResponse.json({error:"PD_REST_003_A02_FINAL_READBACK_FAILED",requestHash:pending.requestHash,providerWriteCount},{status:202});}
  if(!finalStateMatches(final,uploadedImageId)){const pending=await recordOperationResult(repository,PD_REST_003_A02.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"FINAL_READBACK_MISMATCH",receipt:{providerWriteCount,uploadedImageId}});return NextResponse.json({error:"PD_REST_003_A02_FINAL_READBACK_MISMATCH",requestHash:pending.requestHash,providerWriteCount},{status:202});}
  const done=await recordOperationResult(repository,PD_REST_003_A02.operationId,begun.record.requestHash,"SUCCEEDED",runtime.now?.()??new Date().toISOString(),{receipt:{providerWriteCount,uploadedImageId,verified:{title:"PASS",tagsExactOrdered13:"PASS",image1Rank:"PASS",protectedCore:"PASS",buyerFiles:"PASS",attributes:"PASS",images2to9:"PASS"},readBackStatus:final.statuses}});
  await(runtime.clearAsset??(()=>clearAuthorizedAsset(PD_REST_003_A02.operationId,PD_REST_003_A02.image.sha256)))();return response("UPDATED_AND_VERIFIED",done.requestHash,providerWriteCount,done.receipt??{});
}
