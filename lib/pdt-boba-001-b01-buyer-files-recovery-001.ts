import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { loadAuthorizedAsset, clearAuthorizedAsset } from "./authorized-operation-asset-store";
import { beginOperation, hashOperationRequest, NeonOperationLedgerRepository, recordOperationResult, type OperationLedgerRepository } from "./operation-ledger";
import { PDT_BOBA_001_B01_BUYER_FILES, PDT_BOBA_001_B01_BUYER_FILE_SHA_EVIDENCE_GAP } from "./pdt-boba-001-b01-buyer-files";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;
const AUTH_ENV = "ETSY_BOBA_B01_RECOVERY_001_AUTHORIZATION_ID";
const REQUEST_SHA_ENV = "ETSY_BOBA_B01_RECOVERY_001_REQUEST_SHA256";
const PARENT_OPERATION_ID = PDT_BOBA_001_B01_BUYER_FILES.operationId;
const QUICK_START = PDT_BOBA_001_B01_BUYER_FILES.targets[0];
const OLD_ZIP = PDT_BOBA_001_B01_BUYER_FILES.targets[1];

export const PDT_BOBA_001_B01_RECOVERY_001 = Object.freeze({
  operation: "RECOVER_UPLOAD_REPLACEMENT_QUICK_START_ONLY",
  operationId: "PDT-BOBA-001-B01-BUYER-FILES-RECOVERY-001",
  parentOperationId: PARENT_OPERATION_ID,
  productId: PDT_BOBA_001_B01_BUYER_FILES.productId,
  productVersion: PDT_BOBA_001_B01_BUYER_FILES.productVersion,
  shopId: PDT_BOBA_001_B01_BUYER_FILES.shopId,
  listingId: PDT_BOBA_001_B01_BUYER_FILES.listingId,
  candidateId: PDT_BOBA_001_B01_BUYER_FILES.candidateId,
  candidateFingerprint: PDT_BOBA_001_B01_BUYER_FILES.candidateFingerprint,
  buildId: PDT_BOBA_001_B01_BUYER_FILES.buildId,
  buildFingerprint: PDT_BOBA_001_B01_BUYER_FILES.buildFingerprint,
  buildFreezeSha256: PDT_BOBA_001_B01_BUYER_FILES.buildFreezeSha256,
  acceptanceCriteriaId: PDT_BOBA_001_B01_BUYER_FILES.acceptanceCriteriaId,
  acceptanceCriteriaSha256: PDT_BOBA_001_B01_BUYER_FILES.acceptanceCriteriaSha256,
  target: { ...QUICK_START },
  expectedParentRecoveryPoint: "TARGET_4_DELETE_RECONCILED_READ_ONLY",
  expectedParentConfirmedMutationCount: 1
} as const);

type Rec = Record<string, unknown>;
type State = { listing: Rec; images: Rec[]; attributes: Rec[]; files: Rec[]; videos: Rec[]; statuses: Record<string, number> };
export type PdtBoba001B01RecoveryRuntime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  parentRepository?: OperationLedgerRepository;
  loadAsset?: () => Promise<Buffer>;
  clearAsset?: () => Promise<void>;
  verifyAsset?: (bytes: Buffer) => boolean;
  now?: () => string;
};

const EXPECTED_TAGS = ["bubble tea business","boba shop toolkit","boba operations","boba shop sop","cafe opening closing","daily prep log","stock waste tracker","shift handoff log","tea cafe template","milktea inventory","cafe cleaning sheet","drink shop checklist","google sheets boba"];
const EXPECTED_GALLERY = [[8547319609,1,2000,1600],[8547319665,2,2000,1600],[8547319731,3,1600,900],[8547319783,4,1600,900],[8547319831,5,1600,900],[8547319873,6,1600,900],[8499440812,7,1600,900],[8499440860,8,1600,900],[8499440896,9,1600,900],[8547320067,10,1600,900],[8547320117,11,1600,900],[8499441032,12,1600,900]];
const PROTECTED_FILES = [[1509032655604,1,"PoonthaiDigital_Boba_Checklist_A4.pdf",17459,"application/pdf"],[1509032655658,2,"PoonthaiDigital_Boba_Checklist_US_Letter.pdf",16632,"application/pdf"],[1509891952828,3,"Boba_Read_Me_License.pdf",4620,"application/pdf"]];
const TITLE = "Boba Shop Operations Toolkit, Cafe Daily SOP, Checklist, Excel Google Sheets Template (Digital Download)";
const DESCRIPTION_SHA256 = "7a2e5de9d37961bff1219442785d8006f7498111f84aa89e0c4cba2372e678e5";

const isRec=(v:unknown):v is Rec=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const results=(v:unknown)=>isRec(v)&&Array.isArray(v.results)?v.results.filter(isRec):null;
const hashText=(v:unknown)=>createHash("sha256").update(typeof v==="string"?v.normalize("NFC"):"","utf8").digest("hex");
const secureEqual=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
async function json(r:Response){const t=await r.text();try{return t?JSON.parse(t):{};}catch{return {};}}
function multipartHeaders(token:string){const h=etsyApiHeaders(token);delete h["content-type"];return h;}
function fileRows(state:State){return [...state.files].sort((a,b)=>Number(a.rank)-Number(b.rank)).map(f=>[Number(f.listing_file_id),Number(f.rank),f.filename,Number(f.size_bytes),f.filetype]);}
function videoSnapshot(videos:Rec[]){return [...videos].map(v=>({video_id:Number(v.video_id),height:Number(v.height),width:Number(v.width),thumbnail_url:String(v.thumbnail_url??""),video_url:String(v.video_url??""),video_state:String(v.video_state??"")})).sort((a,b)=>a.video_id-b.video_id);}

async function readState(token:string,fetchImpl:typeof fetch):Promise<State>{
  const base="https://api.etsy.com/v3/application",shop=PDT_BOBA_001_B01_RECOVERY_001.shopId,listing=PDT_BOBA_001_B01_RECOVERY_001.listingId;
  const urls={listing:`${base}/listings/${listing}`,images:`${base}/listings/${listing}/images`,attributes:`${base}/shops/${shop}/listings/${listing}/properties`,files:`${base}/shops/${shop}/listings/${listing}/files`,videos:`${base}/listings/${listing}/videos`};
  const entries=await Promise.all(Object.entries(urls).map(async([name,url])=>{const response=await fetchImpl(url,{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"});return{name,response,value:await json(response)};}));
  const by=Object.fromEntries(entries.map(e=>[e.name,e])) as Record<string,{response:Response;value:unknown}>;
  const images=results(by.images.value),attributes=results(by.attributes.value),files=results(by.files.value),videos=results(by.videos.value);
  if(!by.listing.response.ok||!isRec(by.listing.value)||!by.images.response.ok||!by.attributes.response.ok||!by.files.response.ok||!by.videos.response.ok||!images||!attributes||!files||!videos)throw new Error("RECOVERY_READBACK_FAILED");
  return{listing:by.listing.value,images,attributes,files,videos,statuses:Object.fromEntries(entries.map(e=>[e.name,e.response.status]))};
}

function coreMatches(state:State,fileData:string){const l=state.listing,p=isRec(l.price)?l.price:{};if(String(l.listing_id)!==PDT_BOBA_001_B01_RECOVERY_001.listingId||String(l.shop_id)!==PDT_BOBA_001_B01_RECOVERY_001.shopId)return false;if(l.state!=="active"||l.title!==TITLE||hashText(l.description)!==DESCRIPTION_SHA256)return false;if(JSON.stringify(l.tags)!==JSON.stringify(EXPECTED_TAGS)||Number(p.amount)!==1290||Number(p.divisor)!==100||p.currency_code!=="USD")return false;if(Number(l.taxonomy_id)!==12476||Number(l.quantity)!==999||l.who_made!=="i_did"||l.when_made!=="2020_2026"||(l.listing_type??l.type)!=="download"||Number(l.return_policy_id)!==1||l.file_data!==fileData||state.attributes.length!==0)return false;const gallery=[...state.images].sort((a,b)=>Number(a.rank)-Number(b.rank)).map(i=>[Number(i.listing_image_id),Number(i.rank),Number(i.full_width),Number(i.full_height)]);return JSON.stringify(gallery)===JSON.stringify(EXPECTED_GALLERY);}
function beforeFilesMatch(state:State){const rows=fileRows(state);const expected=[...PROTECTED_FILES,[OLD_ZIP.currentListingFileId,4,OLD_ZIP.fileName,OLD_ZIP.currentSizeBytes,OLD_ZIP.mimeType]];return rows.length===4&&JSON.stringify(rows)===JSON.stringify(expected)&&!state.files.some(f=>Number(f.listing_file_id)===QUICK_START.currentListingFileId);}
function afterFilesMatch(state:State){const rows=fileRows(state);if(rows.length!==5||JSON.stringify(rows.slice(0,3))!==JSON.stringify(PROTECTED_FILES))return false;const q=rows[3],z=rows[4];return Number(q[0])!==QUICK_START.currentListingFileId&&q[1]===4&&q[2]===QUICK_START.fileName&&q[3]===QUICK_START.targetSizeBytes&&q[4]===QUICK_START.mimeType&&z[0]===OLD_ZIP.currentListingFileId&&z[1]===5&&z[2]===OLD_ZIP.fileName&&z[3]===OLD_ZIP.currentSizeBytes&&z[4]===OLD_ZIP.mimeType;}
async function parentReconciliationMatches(repo:OperationLedgerRepository){const r=await repo.load(PARENT_OPERATION_ID);return Boolean(r&&r.status==="RECONCILIATION_REQUIRED"&&r.recoveryPoint===PDT_BOBA_001_B01_RECOVERY_001.expectedParentRecoveryPoint&&Number(r.receipt?.ETSY_WRITE_COUNT)===1&&r.receipt?.ETSY_WRITE_COUNT_STATUS==="CONFIRMED"&&r.receipt?.reconciliationState==="SLOT_4_DELETE_CONFIRMED");}
function verifyAsset(bytes:Buffer){return bytes.length===QUICK_START.targetSizeBytes&&createHash("sha256").update(bytes).digest("hex")===QUICK_START.sha256;}
function authError(request:Request){const expected=process.env.ETSY_B01_WRITE_TOKEN?.trim()??"",supplied=request.headers.get(WRITE_HEADER)?.trim()??"";if(!expected)return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_WRITE_AUTH_NOT_CONFIGURED",ETSY_WRITE_COUNT:0},{status:503});if(!supplied||!secureEqual(supplied,expected))return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_UNAUTHORIZED",ETSY_WRITE_COUNT:0},{status:401});return null;}

export function exactPdtBoba001B01Recovery001Body(authorizationId:string){return{operation:PDT_BOBA_001_B01_RECOVERY_001.operation,operationId:PDT_BOBA_001_B01_RECOVERY_001.operationId,authorizationId,parentOperationId:PDT_BOBA_001_B01_RECOVERY_001.parentOperationId,productId:PDT_BOBA_001_B01_RECOVERY_001.productId,productVersion:PDT_BOBA_001_B01_RECOVERY_001.productVersion,shopId:PDT_BOBA_001_B01_RECOVERY_001.shopId,listingId:PDT_BOBA_001_B01_RECOVERY_001.listingId,candidateId:PDT_BOBA_001_B01_RECOVERY_001.candidateId,candidateFingerprint:PDT_BOBA_001_B01_RECOVERY_001.candidateFingerprint,buildId:PDT_BOBA_001_B01_RECOVERY_001.buildId,buildFingerprint:PDT_BOBA_001_B01_RECOVERY_001.buildFingerprint,buildFreezeSha256:PDT_BOBA_001_B01_RECOVERY_001.buildFreezeSha256,acceptanceCriteriaId:PDT_BOBA_001_B01_RECOVERY_001.acceptanceCriteriaId,acceptanceCriteriaSha256:PDT_BOBA_001_B01_RECOVERY_001.acceptanceCriteriaSha256,target:{...PDT_BOBA_001_B01_RECOVERY_001.target},expectedParentRecoveryPoint:PDT_BOBA_001_B01_RECOVERY_001.expectedParentRecoveryPoint,expectedParentConfirmedMutationCount:1};}

export async function verifyPdtBoba001B01Recovery001ProtectedState(runtime:PdtBoba001B01RecoveryRuntime={}){try{const repo=runtime.parentRepository??runtime.repository??new NeonOperationLedgerRepository();if(!(await parentReconciliationMatches(repo)))return NextResponse.json({status:"PROTECTED_STATE_MISMATCH",reason:"PARENT_RECONCILIATION_MISMATCH",operationId:PDT_BOBA_001_B01_RECOVERY_001.operationId,ETSY_WRITE_COUNT:0},{status:409});const token=await(runtime.getAccessToken??getValidEtsyAccessToken)(),state=await readState(token,runtime.fetchImpl??fetch),match=coreMatches(state,"3 PDF, 1 ZIP")&&beforeFilesMatch(state);return NextResponse.json({status:match?"PROTECTED_STATE_MATCH":"PROTECTED_STATE_MISMATCH",operationId:PDT_BOBA_001_B01_RECOVERY_001.operationId,parentOperationId:PARENT_OPERATION_ID,candidateFingerprint:PDT_BOBA_001_B01_RECOVERY_001.candidateFingerprint,buildFingerprint:PDT_BOBA_001_B01_RECOVERY_001.buildFingerprint,buildFreezeSha256:PDT_BOBA_001_B01_RECOVERY_001.buildFreezeSha256,acceptanceCriteriaSha256:PDT_BOBA_001_B01_RECOVERY_001.acceptanceCriteriaSha256,currentBuyerFileCount:state.files.length,recoveryScope:"UPLOAD_REPLACEMENT_QUICK_START_ONLY",forbiddenMutation:"DELETE",providerReadStatus:state.statuses,evidenceGaps:{buyerFileSha256:PDT_BOBA_001_B01_BUYER_FILE_SHA_EVIDENCE_GAP},ETSY_WRITE_COUNT:0},{status:match?200:409});}catch{return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_VERIFICATION_FAILED",ETSY_WRITE_COUNT:0},{status:502});}}

export async function handlePdtBoba001B01Recovery001(body:Rec,request:Request,runtime:PdtBoba001B01RecoveryRuntime={}){
  if(process.env.PUBLISH_WRITES_ENABLED!=="true")return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_WRITES_DISABLED",ETSY_WRITE_COUNT:0},{status:403});const ae=authError(request);if(ae)return ae;if(process.env.ETSY_SHOP_ID?.trim()!==PDT_BOBA_001_B01_RECOVERY_001.shopId)return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_SHOP_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  const authorizationId=process.env[AUTH_ENV]?.trim()??"",allowed=process.env[REQUEST_SHA_ENV]?.trim().toLowerCase()??"";if(!authorizationId||!SHA256.test(allowed))return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_PRODUCTION_AUTH_NOT_CONFIGURED",ETSY_WRITE_COUNT:0},{status:503});const exact=exactPdtBoba001B01Recovery001Body(authorizationId),hash=hashOperationRequest(body);if(hash!==hashOperationRequest(exact)||!secureEqual(hash,allowed))return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_AUTHORIZATION_CONTRACT_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  const repo=runtime.repository??new NeonOperationLedgerRepository(),parentRepo=runtime.parentRepository??repo,existing=await repo.load(PDT_BOBA_001_B01_RECOVERY_001.operationId);if(existing&&existing.requestHash!==allowed)return NextResponse.json({error:"OPERATION_ID_PAYLOAD_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});if(existing?.status==="SUCCEEDED")return NextResponse.json({status:"REPLAY",operationId:existing.operationId,receipt:existing.receipt,ETSY_WRITE_COUNT:0});if(existing)return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_ALREADY_CLAIMED_DO_NOT_RETRY",ledgerStatus:existing.status,receipt:existing.receipt,ETSY_WRITE_COUNT:Number(existing.receipt?.ETSY_WRITE_COUNT)||0},{status:existing.status==="RECONCILIATION_REQUIRED"?202:409});if(!(await parentReconciliationMatches(parentRepo)))return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_PARENT_RECONCILIATION_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  let bytes:Buffer;try{bytes=await(runtime.loadAsset?runtime.loadAsset():loadAuthorizedAsset(PDT_BOBA_001_B01_RECOVERY_001.operationId,QUICK_START.sha256));}catch{return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_ASSET_NOT_READY",ETSY_WRITE_COUNT:0},{status:409});}if(!(runtime.verifyAsset??verifyAsset)(bytes))return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_ASSET_IDENTITY_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  const token=await(runtime.getAccessToken??getValidEtsyAccessToken)(),fetchImpl=runtime.fetchImpl??fetch;let before:State;try{before=await readState(token,fetchImpl);}catch{return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_PREREAD_FAILED",ETSY_WRITE_COUNT:0},{status:502});}if(!coreMatches(before,"3 PDF, 1 ZIP")||!beforeFilesMatch(before))return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_CURRENT_4_FILE_STATE_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});const beforeVideos=videoSnapshot(before.videos),begun=await beginOperation(repo,PDT_BOBA_001_B01_RECOVERY_001.operationId,body,runtime.now?.()??new Date().toISOString());if(begun.status==="REPLAY")return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_ALREADY_CLAIMED_DO_NOT_RETRY",ETSY_WRITE_COUNT:0},{status:409});
  const form=new FormData();form.set("rank","4");form.set("name",QUICK_START.fileName);form.set("file",new File([new Uint8Array(bytes)],QUICK_START.fileName,{type:QUICK_START.mimeType}));const filesUrl=`https://api.etsy.com/v3/application/shops/${PDT_BOBA_001_B01_RECOVERY_001.shopId}/listings/${PDT_BOBA_001_B01_RECOVERY_001.listingId}/files`;
  let upload:Response;try{upload=await fetchImpl(filesUrl,{method:"POST",headers:multipartHeaders(token),body:form,cache:"no-store"});}catch{await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"QUICK_START_UPLOAD_RESPONSE_AMBIGUOUS",receipt:{ETSY_WRITE_COUNT:0,ETSY_WRITE_ATTEMPT_COUNT:1,ETSY_WRITE_COUNT_STATUS:"UNRESOLVED_REQUIRES_RECONCILIATION",protectedVideoSnapshot:beforeVideos}});return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_UPLOAD_AMBIGUOUS_DO_NOT_RETRY",ETSY_WRITE_COUNT:0,ETSY_WRITE_ATTEMPT_COUNT:1,ETSY_WRITE_COUNT_STATUS:"UNRESOLVED_REQUIRES_RECONCILIATION"},{status:202});}
  let after:State;try{after=await readState(token,fetchImpl);}catch{await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"QUICK_START_UPLOAD_READBACK_FAILED",receipt:{ETSY_WRITE_COUNT:0,ETSY_WRITE_ATTEMPT_COUNT:1,ETSY_WRITE_COUNT_STATUS:"UNRESOLVED_REQUIRES_RECONCILIATION",providerStatus:upload.status,protectedVideoSnapshot:beforeVideos}});return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_POST_UPLOAD_READBACK_FAILED_DO_NOT_RETRY",ETSY_WRITE_COUNT:0,ETSY_WRITE_ATTEMPT_COUNT:1,ETSY_WRITE_COUNT_STATUS:"UNRESOLVED_REQUIRES_RECONCILIATION"},{status:202});}
  const unchanged=coreMatches(after,"3 PDF, 1 ZIP")&&beforeFilesMatch(after)&&JSON.stringify(videoSnapshot(after.videos))===JSON.stringify(beforeVideos),changed=coreMatches(after,"4 PDF, 1 ZIP")&&afterFilesMatch(after)&&JSON.stringify(videoSnapshot(after.videos))===JSON.stringify(beforeVideos);if(!upload.ok||upload.status!==201){const count=changed?1:0,status=changed?"RECONCILIATION_REQUIRED":unchanged?"FAILED":"RECONCILIATION_REQUIRED";await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,status,runtime.now?.()??new Date().toISOString(),{recoveryPoint:changed?"QUICK_START_UPLOAD_CONFIRMED_DESPITE_RESPONSE":"QUICK_START_UPLOAD_REJECTED",receipt:{ETSY_WRITE_COUNT:count,ETSY_WRITE_ATTEMPT_COUNT:1,ETSY_WRITE_COUNT_STATUS:changed||unchanged?"CONFIRMED":"UNRESOLVED_REQUIRES_RECONCILIATION",providerStatus:upload.status}});return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_UPLOAD_NOT_VERIFIED_DO_NOT_RETRY",ETSY_WRITE_COUNT:count,ETSY_WRITE_ATTEMPT_COUNT:1,ETSY_WRITE_COUNT_STATUS:changed||unchanged?"CONFIRMED":"UNRESOLVED_REQUIRES_RECONCILIATION"},{status:status==="FAILED"?502:202});}
  if(!changed){await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"QUICK_START_UPLOAD_RESPONSE_SUCCESS_STATE_MISMATCH",receipt:{ETSY_WRITE_COUNT:0,ETSY_WRITE_ATTEMPT_COUNT:1,ETSY_WRITE_COUNT_STATUS:"UNRESOLVED_REQUIRES_RECONCILIATION",providerStatus:upload.status}});return NextResponse.json({error:"PDT_BOBA_RECOVERY_001_UPLOAD_STATE_MISMATCH_DO_NOT_RETRY",ETSY_WRITE_COUNT:0,ETSY_WRITE_ATTEMPT_COUNT:1,ETSY_WRITE_COUNT_STATUS:"UNRESOLVED_REQUIRES_RECONCILIATION"},{status:202});}
  const receipt={parentOperationId:PARENT_OPERATION_ID,parentConfirmedMutationCount:1,recoveryScope:"UPLOAD_REPLACEMENT_QUICK_START_ONLY",providerFilename:QUICK_START.fileName,providerSizeBytes:QUICK_START.targetSizeBytes,providerBuyerFileSha256:PDT_BOBA_001_B01_BUYER_FILE_SHA_EVIDENCE_GAP,ETSY_WRITE_COUNT:1,ETSY_WRITE_ATTEMPT_COUNT:1,ETSY_WRITE_COUNT_STATUS:"CONFIRMED"};await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,"SUCCEEDED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"QUICK_START_UPLOAD_VERIFIED",receipt});try{await(runtime.clearAsset?runtime.clearAsset():clearAuthorizedAsset(PDT_BOBA_001_B01_RECOVERY_001.operationId,QUICK_START.sha256));}catch{}return NextResponse.json({status:"UPDATED_AND_VERIFIED",operationId:PDT_BOBA_001_B01_RECOVERY_001.operationId,receipt,ETSY_WRITE_COUNT:1,ETSY_WRITE_ATTEMPT_COUNT:1,ETSY_WRITE_COUNT_STATUS:"CONFIRMED"});
}
