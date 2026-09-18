import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { fetchEtsyReadWithRetry } from "./etsy-http";
import { getValidEtsyAccessToken } from "./etsy-auth";
import {
  beginOperation,
  hashOperationRequest,
  NeonOperationLedgerRepository,
  recordOperationResult,
  type OperationLedgerRepository
} from "./operation-ledger";
import { loadAuthorizedAsset } from "./authorized-operation-asset-store";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;

export const PD_STOCK_005_R03 = Object.freeze({
  operation: "LIVE_CATALOG_V3_API_MINIMAL_RELEASE",
  operationId: "PD-STOCK-005-LIVE-CATALOG-V3-R03-API-MINIMAL-001",
  productId: "PD-STOCK-005",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4561821192",
  candidateId: "ETSY-LIVE-CATALOG-V3-PD-STOCK-005-V1-2026-09-18-R03-C02",
  candidateFingerprint: "bf89bf8802894013648cc5b2e40743731c6a06a5d2482e8e3070bf1345e52219",
  buildId: "ETSY-LIVE-CATALOG-V3-PD-STOCK-005-BUILD-20260918-R03-C02",
  buildFingerprint: "1b454e9a7f567b7c1934c415bc084e97e6e64675461e754b8e959a3c6a69ba16",
  acceptanceCriteriaId: "ETSY-AC-PD-STOCK-005-LIVE-CATALOG-V3-R03-V1",
  acceptanceCriteriaSha256: "fea96708efbe0123b75b122a95574695e5f2af4a90ab2be0b68c87628c5e32f1",
  freezeSha256: "8db72acf1a2a59eabeb4e6d5d1ded5bf4bc6cf25cf147c7fbd7f88570f5accca",
  protectedStateFingerprint: "c0cc4e3db68bf935ec87ec28e3a3ff0f57b0f6493aa23aaf443bbe5514b354c8",
  current: {
    title: "Restaurant & Cafe Inventory Tracker | Stock, Waste, Reorder and Supplier Spreadsheet",
    tags: [
      "restaurant inventory","cafe stock tracker","kitchen inventory","food waste tracker",
      "reorder spreadsheet","supplier tracker","par level sheet","stock count sheet",
      "stock control","inventory excel","google sheets stock","waste cost log","food stocktake"
    ],
    descriptionSha256: "61e01e830c577c9a52dd799cab2aaee502d3b972ebf39aff4ae50c3e2c0abcd3"
  },
  target: {
    title: "Restaurant Inventory Spreadsheet | Cafe Stock, Waste, Reorder & Supplier Tracker",
    tags: [
      "restaurant inventory","cafe stock tracker","kitchen inventory","food waste tracker",
      "reorder spreadsheet","supplier tracker","par level sheet","stock count sheet",
      "inventory tracker","inventory excel","google sheets stock","waste cost log","food stocktake"
    ]
  },
  targets: [
    {
      slot: 3,
      currentListingFileId: 1509497762284,
      currentFileName: "Inventory_Waste_Quick_Start.pdf",
      currentSizeBytes: 4630,
      fileName: "PD-STOCK-005_V1_Inventory_Waste_Quick_Start_B01.pdf",
      targetSizeBytes: 6448,
      sha256: "2d3d1da280bbaa0b51071a20cab9d737075e59d6e424daf3caea224c4c2f89a7",
      googleDriveId: "1rit80tajmnpdzg17Oipr7RSlE9K0tpSs",
      mimeType: "application/pdf"
    },
    {
      slot: 5,
      currentListingFileId: 1509980203922,
      currentFileName: "Inventory_Waste_Tracker.zip",
      currentSizeBytes: 16285,
      fileName: "PD-STOCK-005_V1_Inventory_Waste_Tracker_B03.zip",
      targetSizeBytes: 62008,
      sha256: "c62011b1cbd09e3a4de910e0a9fe86e01d5a688dd05f1e2df16c0f8f536fd8ed",
      googleDriveId: "1rQ9AwR63_FwdRutwMUmfcqVNmoRUvSSv",
      mimeType: "application/zip"
    }
  ] as const
} as const);

const EXPECTED = Object.freeze({
  price: [890, 100, "USD"] as const,
  quantity: 999,
  shopSectionId: 60023263,
  autoRenew: true,
  isPersonalizable: false,
  isCustomizable: false,
  whoMade: "i_did",
  whenMade: "2020_2026",
  listingType: "download",
  taxonomyId: 12476,
  attributesCount: 0,
  sku: "PD-STOCK-005",
  gallery: [
    [8580511217,1,2500,2000],[8532646756,2,2500,2000],[8580511355,3,2500,2000],[8580511435,4,2500,2000],
    [8532646976,5,2500,2000],[8532647054,6,2500,2000],[8580511641,7,2500,2000],[8532647190,8,2500,2000]
  ] as readonly (readonly number[])[],
  video: [842820647,1920,1080,"active"] as const,
  preservedFiles: [
    [1509497762118,1,"Inventory_Waste_A4.pdf",24247,"application/pdf"],
    [1509497762234,2,"Inventory_Waste_US_Letter.pdf",23237,"application/pdf"],
    [1510700238185,4,"Inventory_Waste_Read_Me_License.pdf",4242,"application/pdf"]
  ] as readonly (readonly (number|string)[])[]
});

type Rec = Record<string, unknown>;
type Target = (typeof PD_STOCK_005_R03.targets)[number];
type State = {
  listing: Rec;
  images: Rec[];
  attributes: Rec[];
  files: Rec[];
  videos: Rec[];
  inventory: Rec;
  personalization: Rec;
  statuses: Record<string, number>;
};

type Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  loadAsset?: (target: Target) => Promise<Buffer>;
  verifyAsset?: (bytes: Buffer, target: Target, fileName?: string) => boolean;
  now?: () => string;
};

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const results = (v: unknown) => isRec(v) && Array.isArray(v.results) ? v.results.filter(isRec) : null;
const hashText = (v: unknown) => createHash("sha256").update(typeof v === "string" ? v.normalize("NFC") : "", "utf8").digest("hex");
const secureEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
async function json(response: Response) { const t = await response.text(); try { return t ? JSON.parse(t) as unknown : {}; } catch { return {}; } }
function multipartHeaders(token: string) { const headers = etsyApiHeaders(token); delete headers["content-type"]; return headers; }

export function exactPdStock005R03Body(authorizationId: string, protectedStateFingerprint: string) {
  return {
    operation: PD_STOCK_005_R03.operation,
    operationId: PD_STOCK_005_R03.operationId,
    authorizationId,
    protectedStateFingerprint,
    productId: PD_STOCK_005_R03.productId,
    productVersion: PD_STOCK_005_R03.productVersion,
    shopId: PD_STOCK_005_R03.shopId,
    listingId: PD_STOCK_005_R03.listingId,
    candidateId: PD_STOCK_005_R03.candidateId,
    candidateFingerprint: PD_STOCK_005_R03.candidateFingerprint,
    buildId: PD_STOCK_005_R03.buildId,
    buildFingerprint: PD_STOCK_005_R03.buildFingerprint,
    acceptanceCriteriaId: PD_STOCK_005_R03.acceptanceCriteriaId,
    acceptanceCriteriaSha256: PD_STOCK_005_R03.acceptanceCriteriaSha256,
    freezeSha256: PD_STOCK_005_R03.freezeSha256,
    title: PD_STOCK_005_R03.target.title,
    tags: [...PD_STOCK_005_R03.target.tags],
    targets: PD_STOCK_005_R03.targets.map(x => ({ ...x }))
  };
}

export function verifyPdStock005R03Asset(bytes: Buffer, target: Target, fileName = target.fileName) {
  return fileName === target.fileName
    && bytes.length === target.targetSizeBytes
    && createHash("sha256").update(bytes).digest("hex") === target.sha256;
}

async function readState(token: string, fetchImpl: typeof fetch): Promise<State> {
  const base = "https://api.etsy.com/v3/application";
  const listingId = PD_STOCK_005_R03.listingId, shopId = PD_STOCK_005_R03.shopId;
  const urls = {
    listing: `${base}/listings/${listingId}`,
    images: `${base}/listings/${listingId}/images`,
    attributes: `${base}/shops/${shopId}/listings/${listingId}/properties`,
    files: `${base}/shops/${shopId}/listings/${listingId}/files`,
    videos: `${base}/listings/${listingId}/videos`,
    inventory: `${base}/listings/batch/inventory?listing_ids=${listingId}`,
    personalization: `${base}/listings/${listingId}/personalization`
  };
  const entries: Array<{name:string;response:Response;value:unknown}> = [];
  for (const [name,url] of Object.entries(urls)) {
    const response = await fetchEtsyReadWithRetry(
      fetchImpl,
      url,
      { method:"GET", headers:etsyApiHeaders(token), cache:"no-store" },
      { maxAttempts:3, baseDelayMs:500, maxRetryDelayMs:2000 }
    );
    entries.push({name,response,value:await json(response)});
  }
  const by = Object.fromEntries(entries.map(x=>[x.name,x])) as Record<string,{response:Response;value:unknown}>;
  const images=results(by.images.value), attributes=results(by.attributes.value), files=results(by.files.value), videos=results(by.videos.value);
  if(!by.listing.response.ok||!isRec(by.listing.value)||!by.images.response.ok||!by.attributes.response.ok||!by.files.response.ok||!by.videos.response.ok||!by.inventory.response.ok||!by.personalization.response.ok||!images||!attributes||!files||!videos||!isRec(by.inventory.value)||!isRec(by.personalization.value)) throw new Error("PD_STOCK_005_R03_READBACK_FAILED");
  return {listing:by.listing.value,images,attributes,files,videos,inventory:by.inventory.value,personalization:by.personalization.value,statuses:Object.fromEntries(entries.map(x=>[x.name,x.response.status]))};
}

function inventorySku(state: State) {
  const rows = Array.isArray(state.inventory.results) ? state.inventory.results.filter(isRec) : [];
  const match = rows.find(x=>String(x.listing_id)===PD_STOCK_005_R03.listingId);
  if(!match||!isRec(match.inventory)||!Array.isArray(match.inventory.products)) return "";
  const product = match.inventory.products.filter(isRec)[0];
  return product && typeof product.sku === "string" ? product.sku : "";
}

function personalizationCount(state: State) {
  const q = state.personalization.personalization_questions;
  return Array.isArray(q) ? q.length : 0;
}

function galleryRows(state: State) {
  return [...state.images].sort((a,b)=>Number(a.rank)-Number(b.rank)).map(x=>[Number(x.listing_image_id),Number(x.rank),Number(x.full_width),Number(x.full_height)]);
}
function videoRow(state: State) {
  const v=[...state.videos].sort((a,b)=>Number(a.video_id)-Number(b.video_id))[0];
  return v ? [Number(v.video_id),Number(v.width),Number(v.height),String(v.video_state??"")] : [];
}
function fileRows(state: State) {
  return [...state.files].sort((a,b)=>Number(a.rank)-Number(b.rank)).map(x=>[Number(x.listing_file_id),Number(x.rank),String(x.filename),Number(x.size_bytes),String(x.filetype)]);
}
function commonProtectedMatches(state: State) {
  const l=state.listing, p=isRec(l.price)?l.price:{};
  return String(l.listing_id)===PD_STOCK_005_R03.listingId
    && String(l.state).toLowerCase()==="active"
    && hashText(l.description)===PD_STOCK_005_R03.current.descriptionSha256
    && Number(p.amount)===EXPECTED.price[0] && Number(p.divisor)===EXPECTED.price[1] && p.currency_code===EXPECTED.price[2]
    && Number(l.quantity)===EXPECTED.quantity
    && Number(l.shop_section_id)===EXPECTED.shopSectionId
    && l.should_auto_renew===EXPECTED.autoRenew
    && l.is_personalizable===EXPECTED.isPersonalizable
    && l.is_customizable===EXPECTED.isCustomizable
    && l.who_made===EXPECTED.whoMade && l.when_made===EXPECTED.whenMade
    && (l.listing_type??l.type)===EXPECTED.listingType
    && Number(l.taxonomy_id)===EXPECTED.taxonomyId
    && state.attributes.length===EXPECTED.attributesCount
    && inventorySku(state)===EXPECTED.sku
    && personalizationCount(state)===0
    && JSON.stringify(galleryRows(state))===JSON.stringify(EXPECTED.gallery)
    && JSON.stringify(videoRow(state))===JSON.stringify(EXPECTED.video);
}
function coreBeforeMatches(state: State){return commonProtectedMatches(state)&&state.listing.title===PD_STOCK_005_R03.current.title&&JSON.stringify(state.listing.tags)===JSON.stringify(PD_STOCK_005_R03.current.tags);}
function coreAfterMatches(state: State){return commonProtectedMatches(state)&&state.listing.title===PD_STOCK_005_R03.target.title&&JSON.stringify(state.listing.tags)===JSON.stringify(PD_STOCK_005_R03.target.tags);}

function beforeFilesMatch(state: State){
  const expected=[
    [1509497762118,1,"Inventory_Waste_A4.pdf",24247,"application/pdf"],
    [1509497762234,2,"Inventory_Waste_US_Letter.pdf",23237,"application/pdf"],
    [1509497762284,3,"Inventory_Waste_Quick_Start.pdf",4630,"application/pdf"],
    [1510700238185,4,"Inventory_Waste_Read_Me_License.pdf",4242,"application/pdf"],
    [1509980203922,5,"Inventory_Waste_Tracker.zip",16285,"application/zip"]
  ];
  return JSON.stringify(fileRows(state))===JSON.stringify(expected);
}
function progressFilesMatch(state: State, quickId?: number, zipId?: number, phase?: "QUICK_DELETED"|"ZIP_DELETED"){
  const rows=fileRows(state);
  const expected = phase==="QUICK_DELETED" ? [
    [1509497762118,1,"Inventory_Waste_A4.pdf",24247,"application/pdf"],
    [1509497762234,2,"Inventory_Waste_US_Letter.pdf",23237,"application/pdf"],
    [1510700238185,3,"Inventory_Waste_Read_Me_License.pdf",4242,"application/pdf"],
    [1509980203922,4,"Inventory_Waste_Tracker.zip",16285,"application/zip"]
  ] : phase==="ZIP_DELETED" ? [
    [1509497762118,1,"Inventory_Waste_A4.pdf",24247,"application/pdf"],
    [1509497762234,2,"Inventory_Waste_US_Letter.pdf",23237,"application/pdf"],
    [quickId??0,3,PD_STOCK_005_R03.targets[0].fileName,6448,"application/pdf"],
    [1510700238185,4,"Inventory_Waste_Read_Me_License.pdf",4242,"application/pdf"]
  ] : [
    [1509497762118,1,"Inventory_Waste_A4.pdf",24247,"application/pdf"],
    [1509497762234,2,"Inventory_Waste_US_Letter.pdf",23237,"application/pdf"],
    [quickId??0,3,PD_STOCK_005_R03.targets[0].fileName,6448,"application/pdf"],
    [1510700238185,4,"Inventory_Waste_Read_Me_License.pdf",4242,"application/pdf"],
    [zipId??1509980203922,5,zipId?PD_STOCK_005_R03.targets[1].fileName:"Inventory_Waste_Tracker.zip",zipId?62008:16285,zipId?"application/zip":"application/zip"]
  ];
  if(!quickId && phase!=="QUICK_DELETED") return false;
  return JSON.stringify(rows)===JSON.stringify(expected);
}

function authError(request:Request){
  const expected=process.env.ETSY_B01_WRITE_TOKEN?.trim()??"", supplied=request.headers.get(WRITE_HEADER)?.trim()??"";
  if(!expected) return NextResponse.json({error:"PD_STOCK_005_R03_WRITE_AUTH_NOT_CONFIGURED",ETSY_WRITE_COUNT:0},{status:503});
  if(!supplied||!secureEqual(supplied,expected)) return NextResponse.json({error:"PD_STOCK_005_R03_UNAUTHORIZED",ETSY_WRITE_COUNT:0},{status:401});
  return null;
}

export async function verifyPdStock005R03ProtectedState(runtime:Runtime={}){
  try{
    const token=await (runtime.getAccessToken??getValidEtsyAccessToken)();
    const state=await readState(token,runtime.fetchImpl??fetch);
    const match=coreBeforeMatches(state)&&beforeFilesMatch(state);
    return NextResponse.json({
      status:match?"PROTECTED_STATE_MATCH":"PROTECTED_STATE_MISMATCH",
      operationId:PD_STOCK_005_R03.operationId,
      candidateFingerprint:PD_STOCK_005_R03.candidateFingerprint,
      buildFingerprint:PD_STOCK_005_R03.buildFingerprint,
      acceptanceCriteriaSha256:PD_STOCK_005_R03.acceptanceCriteriaSha256,
      freezeSha256:PD_STOCK_005_R03.freezeSha256,
      protectedStateFingerprint:PD_STOCK_005_R03.protectedStateFingerprint,
      providerReadStatus:state.statuses,
      buyerFiles:fileRows(state),
      evidenceGaps:{buyerFileSha256:"SHA256_NOT_AVAILABLE_FROM_PROVIDER",offerDiscount:"NOT_AVAILABLE_FROM_CURRENT_ETSY_API_PATH",whatContent:"SELLER_UI_EVIDENCE_BOUND_SEPARATELY"},
      ETSY_WRITE_COUNT:0
    },{status:match?200:409});
  }catch{return NextResponse.json({error:"PD_STOCK_005_R03_VERIFICATION_FAILED",ETSY_WRITE_COUNT:0},{status:502});}
}

export async function handlePdStock005R03(body:Rec,authorizationRequestHash:string,request:Request,runtime:Runtime={}){
  if(process.env.PUBLISH_WRITES_ENABLED!=="true") return NextResponse.json({error:"PD_STOCK_005_R03_WRITES_DISABLED",ETSY_WRITE_COUNT:0},{status:403});
  const ae=authError(request); if(ae) return ae;
  if(process.env.ETSY_SHOP_ID?.trim()!==PD_STOCK_005_R03.shopId) return NextResponse.json({error:"PD_STOCK_005_R03_SHOP_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  const authorizationId=typeof body.authorizationId==="string"?body.authorizationId.trim():"";
  const protectedStateFingerprint=typeof body.protectedStateFingerprint==="string"?body.protectedStateFingerprint.trim().toLowerCase():"";
  if(!authorizationId||!SHA256.test(protectedStateFingerprint)||protectedStateFingerprint!==PD_STOCK_005_R03.protectedStateFingerprint||!SHA256.test(authorizationRequestHash)) return NextResponse.json({error:"PD_STOCK_005_R03_EXACT_AUTHORIZATION_BINDING_REQUIRED",ETSY_WRITE_COUNT:0},{status:409});
  const exact=exactPdStock005R03Body(authorizationId,protectedStateFingerprint);
  const requestHash=hashOperationRequest(body);
  if(requestHash!==hashOperationRequest(exact)||!secureEqual(requestHash,authorizationRequestHash)) return NextResponse.json({error:"PD_STOCK_005_R03_AUTHORIZATION_CONTRACT_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});

  const assets=[] as Array<{target:Target;bytes:Buffer}>;
  for(const target of PD_STOCK_005_R03.targets){
    let bytes:Buffer; try{bytes=await (runtime.loadAsset?runtime.loadAsset(target):loadAuthorizedAsset(PD_STOCK_005_R03.operationId,target.sha256));}catch{return NextResponse.json({error:"PD_STOCK_005_R03_ASSET_NOT_READY",slot:target.slot,ETSY_WRITE_COUNT:0},{status:409});}
    if(!(runtime.verifyAsset??verifyPdStock005R03Asset)(bytes,target,target.fileName)) return NextResponse.json({error:"PD_STOCK_005_R03_ASSET_IDENTITY_MISMATCH",slot:target.slot,ETSY_WRITE_COUNT:0},{status:409});
    assets.push({target,bytes});
  }

  const repo=runtime.repository??new NeonOperationLedgerRepository();
  const existing=await repo.load(PD_STOCK_005_R03.operationId);
  if(existing){
    if(existing.requestHash!==requestHash) return NextResponse.json({error:"OPERATION_ID_PAYLOAD_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
    if(existing.status==="SUCCEEDED") return NextResponse.json({status:"REPLAY",receipt:existing.receipt,ETSY_WRITE_COUNT:0});
    return NextResponse.json({error:"PD_STOCK_005_R03_ALREADY_CLAIMED_DO_NOT_RETRY",ledgerStatus:existing.status,receipt:existing.receipt,ETSY_WRITE_COUNT:Number(existing.receipt?.ETSY_WRITE_COUNT)||0},{status:202});
  }

  const token=await (runtime.getAccessToken??getValidEtsyAccessToken)(), fetchImpl=runtime.fetchImpl??fetch;
  let state=await readState(token,fetchImpl);
  if(!coreBeforeMatches(state)||!beforeFilesMatch(state)) return NextResponse.json({error:"PD_STOCK_005_R03_PRESTATE_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  const begun=await beginOperation(repo,PD_STOCK_005_R03.operationId,body,runtime.now?.()??new Date().toISOString());
  if(begun.status!=="STARTED") return NextResponse.json({error:"PD_STOCK_005_R03_OPERATION_NOT_STARTABLE",ETSY_WRITE_COUNT:0},{status:409});
  let record=begun.record, confirmed=0, attempts=0, quickId=0, zipId=0;
  const filesUrl=`https://api.etsy.com/v3/application/shops/${PD_STOCK_005_R03.shopId}/listings/${PD_STOCK_005_R03.listingId}/files`;
  const terminal=async(error:string,recoveryPoint:string,status=202)=>{
    await recordOperationResult(repo,record.operationId,record.requestHash,status===202?"RECONCILIATION_REQUIRED":"FAILED",runtime.now?.()??new Date().toISOString(),{recoveryPoint,receipt:{ETSY_WRITE_COUNT:confirmed,ETSY_WRITE_ATTEMPT_COUNT:attempts,ETSY_WRITE_COUNT_STATUS:"CONFIRMED"}});
    return NextResponse.json({error,ETSY_WRITE_COUNT:confirmed,ETSY_WRITE_ATTEMPT_COUNT:attempts,status:status===202?"RECONCILIATION_REQUIRED":"FAILED"},{status});
  };

  // 1) Replace Quick Start at rank 3.
  attempts++; let d1:Response;
  try{d1=await fetchImpl(`${filesUrl}/${PD_STOCK_005_R03.targets[0].currentListingFileId}`,{method:"DELETE",headers:etsyApiHeaders(token),cache:"no-store"});}catch{return terminal("PD_STOCK_005_R03_QUICK_DELETE_AMBIGUOUS","QUICK_DELETE_RESPONSE_AMBIGUOUS");}
  if(!d1.ok||d1.status!==204) return terminal("PD_STOCK_005_R03_QUICK_DELETE_REJECTED","QUICK_DELETE_REJECTED",d1.status>=500?202:502);
  state=await readState(token,fetchImpl);
  if(!coreBeforeMatches(state)||!progressFilesMatch(state,undefined,undefined,"QUICK_DELETED")) return terminal("PD_STOCK_005_R03_QUICK_DELETE_READBACK_MISMATCH","QUICK_DELETE_READBACK_MISMATCH");
  confirmed++;

  const q=assets[0]; const fq=new FormData(); fq.append("file",new File([Uint8Array.from(q.bytes)],q.target.fileName,{type:q.target.mimeType}),q.target.fileName); fq.append("name",q.target.fileName); fq.append("rank","3");
  attempts++; let u1:Response; try{u1=await fetchImpl(filesUrl,{method:"POST",headers:multipartHeaders(token),body:fq,cache:"no-store"});}catch{return terminal("PD_STOCK_005_R03_QUICK_UPLOAD_AMBIGUOUS","QUICK_UPLOAD_RESPONSE_AMBIGUOUS");}
  const u1v=await json(u1); if(!u1.ok||u1.status!==201||!isRec(u1v)) return terminal("PD_STOCK_005_R03_QUICK_UPLOAD_REJECTED","QUICK_UPLOAD_REJECTED",u1.status>=500?202:502);
  quickId=Number(u1v.listing_file_id); state=await readState(token,fetchImpl);
  if(!quickId||!coreBeforeMatches(state)||!progressFilesMatch(state,quickId)) return terminal("PD_STOCK_005_R03_QUICK_UPLOAD_READBACK_MISMATCH","QUICK_UPLOAD_READBACK_MISMATCH");
  confirmed++;

  // 2) Replace ZIP at rank 5.
  attempts++; let d2:Response; try{d2=await fetchImpl(`${filesUrl}/${PD_STOCK_005_R03.targets[1].currentListingFileId}`,{method:"DELETE",headers:etsyApiHeaders(token),cache:"no-store"});}catch{return terminal("PD_STOCK_005_R03_ZIP_DELETE_AMBIGUOUS","ZIP_DELETE_RESPONSE_AMBIGUOUS");}
  if(!d2.ok||d2.status!==204) return terminal("PD_STOCK_005_R03_ZIP_DELETE_REJECTED","ZIP_DELETE_REJECTED",d2.status>=500?202:502);
  state=await readState(token,fetchImpl);
  if(!coreBeforeMatches(state)||!progressFilesMatch(state,quickId,undefined,"ZIP_DELETED")) return terminal("PD_STOCK_005_R03_ZIP_DELETE_READBACK_MISMATCH","ZIP_DELETE_READBACK_MISMATCH");
  confirmed++;

  const z=assets[1]; const fz=new FormData(); fz.append("file",new File([Uint8Array.from(z.bytes)],z.target.fileName,{type:z.target.mimeType}),z.target.fileName); fz.append("name",z.target.fileName); fz.append("rank","5");
  attempts++; let u2:Response; try{u2=await fetchImpl(filesUrl,{method:"POST",headers:multipartHeaders(token),body:fz,cache:"no-store"});}catch{return terminal("PD_STOCK_005_R03_ZIP_UPLOAD_AMBIGUOUS","ZIP_UPLOAD_RESPONSE_AMBIGUOUS");}
  const u2v=await json(u2); if(!u2.ok||u2.status!==201||!isRec(u2v)) return terminal("PD_STOCK_005_R03_ZIP_UPLOAD_REJECTED","ZIP_UPLOAD_REJECTED",u2.status>=500?202:502);
  zipId=Number(u2v.listing_file_id); state=await readState(token,fetchImpl);
  if(!zipId||!coreBeforeMatches(state)||!progressFilesMatch(state,quickId,zipId)) return terminal("PD_STOCK_005_R03_ZIP_UPLOAD_READBACK_MISMATCH","ZIP_UPLOAD_READBACK_MISMATCH");
  confirmed++;

  // 3) Patch exact frozen title + ordered tags only after buyer files are exact.
  const patchUrl=`https://api.etsy.com/v3/application/shops/${PD_STOCK_005_R03.shopId}/listings/${PD_STOCK_005_R03.listingId}`;
  const patchBody=new URLSearchParams({title:PD_STOCK_005_R03.target.title,tags:PD_STOCK_005_R03.target.tags.join(",")});
  attempts++; let p:Response; try{p=await fetchImpl(patchUrl,{method:"PATCH",headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded"},body:patchBody,cache:"no-store"});}catch{return terminal("PD_STOCK_005_R03_LISTING_PATCH_AMBIGUOUS","LISTING_PATCH_RESPONSE_AMBIGUOUS");}
  if(!p.ok) return terminal("PD_STOCK_005_R03_LISTING_PATCH_REJECTED","LISTING_PATCH_REJECTED",p.status>=500?202:502);
  state=await readState(token,fetchImpl);
  if(!coreAfterMatches(state)||!progressFilesMatch(state,quickId,zipId)) return terminal("PD_STOCK_005_R03_POST_PATCH_READBACK_MISMATCH","POST_PATCH_READBACK_MISMATCH");
  confirmed++;

  const receipt={authorizationId,candidateFingerprint:PD_STOCK_005_R03.candidateFingerprint,buildFingerprint:PD_STOCK_005_R03.buildFingerprint,acceptanceCriteriaSha256:PD_STOCK_005_R03.acceptanceCriteriaSha256,protectedStateFingerprint,providerFileIds:{quickStart:quickId,zip:zipId},ETSY_WRITE_COUNT:confirmed,ETSY_WRITE_ATTEMPT_COUNT:attempts,ETSY_WRITE_COUNT_STATUS:"CONFIRMED",status:"UPDATED_AND_VERIFIED"};
  await recordOperationResult(repo,record.operationId,record.requestHash,"SUCCEEDED",runtime.now?.()??new Date().toISOString(),{receipt});
  return NextResponse.json({status:"UPDATED_AND_VERIFIED",receipt,ETSY_WRITE_COUNT:confirmed});
}
