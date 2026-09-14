import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { clearAuthorizedAsset, loadAuthorizedAsset } from "./authorized-operation-asset-store";
import { beginOperation, hashOperationRequest, NeonOperationLedgerRepository, recordOperationResult, type OperationLedgerRepository } from "./operation-ledger";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;
const AUTHORIZATION_ID = /^PDT-BOBA-001-R02-VIDEO-AUTH-20260914-[0-9]{2}$/;

export const PDT_BOBA_001_R02_VIDEO_REPAIR = Object.freeze({
  operation: "REPLACE_LISTING_VIDEO_ONLY",
  operationId: "PDT-BOBA-001-R02-VIDEO-REPAIR-001",
  productId: "PDT-BOBA-001",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4560696421",
  candidateId: "ETSY-REPAIR-PDT-BOBA-001-V1-2026-09-14-R02",
  candidateFingerprint: "2cd122f43780a45758a25a45c70102b22b623eccf0953fa3cfaff20aebdcc43c",
  buildId: "ETSY-REPAIR-PDT-BOBA-001-BUILD-20260914-R02",
  buildFingerprint: "774d071272b9f68f8527499fb2c80b3193cc6a2a0ec5e6bdb5805a5190a734b2",
  buildFreezeSha256: "8824d27f80bb04e143b96077a174111349f99def6abeb0d0915237a3d59cbf4e",
  acceptanceCriteriaId: "ETSY-AC-PDT-BOBA-001-REPAIR-R02-V1",
  acceptanceCriteriaSha256: "c3f4ab3807f537d610e55bcf25daba919e47f352424d67786186e14ac00d75df",
  asset: {
    fileName: "PDT-BOBA-001_R02_VIDEO_FINAL.mp4",
    mimeType: "video/mp4",
    sizeBytes: 1348647,
    sha256: "2e7c4c4633da32d07ef0445e46d25846ee43645305a9193086a62dc1c4455d75",
    driveId: "1O4OjmJGUKqyF2m74X42mUZS7SLAxFPtf"
  },
  baselineVideo: {
    videoId: 841193954,
    width: 1600,
    height: 1280,
    videoState: "active",
    sizeBytes: 972813,
    sha256: "6661163f017f86656c65e3485782bf4dc3a77e0c77f2a10acf95f376f76618fd"
  }
} as const);

type Rec = Record<string, unknown>;
type State = { listing: Rec; images: Rec[]; attributes: Rec[]; files: Rec[]; videos: Rec[]; statuses: Record<string, number> };
export type R02VideoRuntime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  loadAsset?: () => Promise<Buffer>;
  clearAsset?: () => Promise<void>;
  verifyAsset?: (bytes: Buffer) => boolean;
  verifyVideoUrl?: (url: string, expectedSha256: string, expectedSize: number) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => string;
};

const TITLE = "Boba Shop Operations Toolkit, Cafe Daily SOP, Checklist, Excel Google Sheets Template (Digital Download)";
const DESCRIPTION_SHA256 = "7a2e5de9d37961bff1219442785d8006f7498111f84aa89e0c4cba2372e678e5";
const TAGS = ["bubble tea business","boba shop toolkit","boba operations","boba shop sop","cafe opening closing","daily prep log","stock waste tracker","shift handoff log","tea cafe template","milktea inventory","cafe cleaning sheet","drink shop checklist","google sheets boba"];
const GALLERY = [[8547319609,1,2000,1600],[8547319665,2,2000,1600],[8547319731,3,1600,900],[8547319783,4,1600,900],[8547319831,5,1600,900],[8547319873,6,1600,900],[8499440812,7,1600,900],[8499440860,8,1600,900],[8499440896,9,1600,900],[8547320067,10,1600,900],[8547320117,11,1600,900],[8499441032,12,1600,900]];
const FILES = [[1509032655604,1,"PoonthaiDigital_Boba_Checklist_A4.pdf",17459,"application/pdf"],[1509032655658,2,"PoonthaiDigital_Boba_Checklist_US_Letter.pdf",16632,"application/pdf"],[1509891952828,3,"Boba_Read_Me_License.pdf",4620,"application/pdf"],[1515492140861,4,"Boba_Quick_Start.pdf",5305,"application/pdf"],[1514712925238,5,"PoonthaiDigital_Boba_Shop_Operations_Tracker.zip",22264,"application/zip"]];
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const results = (v: unknown) => isRec(v) && Array.isArray(v.results) ? v.results.filter(isRec) : null;
const hashText = (v: unknown) => createHash("sha256").update(typeof v === "string" ? v.normalize("NFC") : "", "utf8").digest("hex");
const secureEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
async function json(r: Response) { const t = await r.text(); try { return t ? JSON.parse(t) : {}; } catch { return {}; } }
function multipartHeaders(token: string) { const h = etsyApiHeaders(token); delete h["content-type"]; return h; }
function fileRows(s: State) { return [...s.files].sort((a,b)=>Number(a.rank)-Number(b.rank)).map(f=>[Number(f.listing_file_id),Number(f.rank),String(f.filename??""),Number(f.size_bytes),String(f.filetype??"")]); }
function imageRows(s: State) { return [...s.images].sort((a,b)=>Number(a.rank)-Number(b.rank)).map(i=>[Number(i.listing_image_id),Number(i.rank),Number(i.full_width),Number(i.full_height)]); }
function videoRows(videos: Rec[]) { return [...videos].map(v=>({videoId:Number(v.video_id),width:Number(v.width),height:Number(v.height),videoState:String(v.video_state??""),videoUrl:String(v.video_url??"")})).sort((a,b)=>a.videoId-b.videoId); }

async function readState(token: string, fetchImpl: typeof fetch): Promise<State> {
  const base = "https://api.etsy.com/v3/application", shop = PDT_BOBA_001_R02_VIDEO_REPAIR.shopId, listing = PDT_BOBA_001_R02_VIDEO_REPAIR.listingId;
  const urls = { listing:`${base}/listings/${listing}`, images:`${base}/listings/${listing}/images`, attributes:`${base}/shops/${shop}/listings/${listing}/properties`, files:`${base}/shops/${shop}/listings/${listing}/files`, videos:`${base}/listings/${listing}/videos` };
  const entries = await Promise.all(Object.entries(urls).map(async ([name,url]) => { const response = await fetchImpl(url,{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"}); return {name,response,value:await json(response)}; }));
  const by = Object.fromEntries(entries.map(e=>[e.name,e])) as Record<string,{response:Response;value:unknown}>;
  const images=results(by.images.value), attributes=results(by.attributes.value), files=results(by.files.value), videos=results(by.videos.value);
  if(!by.listing.response.ok||!isRec(by.listing.value)||!by.images.response.ok||!by.attributes.response.ok||!by.files.response.ok||!by.videos.response.ok||!images||!attributes||!files||!videos) throw new Error("PDT_BOBA_R02_VIDEO_READBACK_FAILED");
  return {listing:by.listing.value,images,attributes,files,videos,statuses:Object.fromEntries(entries.map(e=>[e.name,e.response.status]))};
}

function coreMatches(s: State) {
  const l=s.listing,p=isRec(l.price)?l.price:{};
  if(String(l.listing_id)!==PDT_BOBA_001_R02_VIDEO_REPAIR.listingId||String(l.shop_id)!==PDT_BOBA_001_R02_VIDEO_REPAIR.shopId||l.state!=="active"||l.title!==TITLE||hashText(l.description)!==DESCRIPTION_SHA256) return false;
  if(JSON.stringify(l.tags)!==JSON.stringify(TAGS)||Number(p.amount)!==1290||Number(p.divisor)!==100||p.currency_code!=="USD"||Number(l.taxonomy_id)!==12476||Number(l.quantity)!==999||l.who_made!=="i_did"||l.when_made!=="2020_2026"||(l.listing_type??l.type)!=="download"||Number(l.return_policy_id)!==1||l.file_data!=="4 PDF, 1 ZIP"||s.attributes.length!==0) return false;
  if("is_supply" in l && l.is_supply !== false) return false;
  return JSON.stringify(imageRows(s))===JSON.stringify(GALLERY) && JSON.stringify(fileRows(s))===JSON.stringify(FILES);
}

async function defaultVerifyVideoUrl(fetchImpl: typeof fetch, url: string, expectedSha256: string, expectedSize: number) {
  if(!url.startsWith("https://")) return false;
  const r=await fetchImpl(url,{method:"GET",cache:"no-store"}); if(!r.ok) return false;
  const bytes=Buffer.from(await r.arrayBuffer()); return bytes.length===expectedSize&&createHash("sha256").update(bytes).digest("hex")===expectedSha256;
}

async function baselineMatches(s: State, runtime: R02VideoRuntime) {
  const rows=videoRows(s.videos), expected=PDT_BOBA_001_R02_VIDEO_REPAIR.baselineVideo;
  if(rows.length!==1) return false;
  const v=rows[0];
  if(v.videoId!==expected.videoId||v.width!==expected.width||v.height!==expected.height||v.videoState!==expected.videoState||!v.videoUrl) return false;
  const verify=runtime.verifyVideoUrl ?? ((url,sha,size)=>defaultVerifyVideoUrl(runtime.fetchImpl??fetch,url,sha,size));
  return verify(v.videoUrl,expected.sha256,expected.sizeBytes);
}

function protectedSnapshot(s: State, baselineVideoSha256: string) {
  const l=s.listing,p=isRec(l.price)?l.price:{};
  return {
    listingId:Number(l.listing_id),shopId:Number(l.shop_id),state:l.state,title:l.title,descriptionSha256:hashText(l.description),tags:l.tags,
    price:{amount:Number(p.amount),divisor:Number(p.divisor),currencyCode:p.currency_code},taxonomyId:Number(l.taxonomy_id),quantity:Number(l.quantity),whoMade:l.who_made,whenMade:l.when_made,listingType:l.listing_type??l.type,returnPolicyId:Number(l.return_policy_id),fileData:l.file_data,
    images:imageRows(s),attributes:s.attributes,files:fileRows(s),videos:videoRows(s.videos).map(v=>({videoId:v.videoId,width:v.width,height:v.height,videoState:v.videoState})),baselineVideoSha256
  } as Record<string,unknown>;
}

function assetMatches(bytes: Buffer) { const a=PDT_BOBA_001_R02_VIDEO_REPAIR.asset; return bytes.length===a.sizeBytes&&createHash("sha256").update(bytes).digest("hex")===a.sha256; }
function authError(request: Request) { const expected=process.env.ETSY_B01_WRITE_TOKEN?.trim()??"", supplied=request.headers.get(WRITE_HEADER)?.trim()??""; if(!expected) return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_WRITE_AUTH_NOT_CONFIGURED",ETSY_WRITE_COUNT:0},{status:503}); if(!supplied||!secureEqual(supplied,expected)) return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_UNAUTHORIZED",ETSY_WRITE_COUNT:0},{status:401}); return null; }

export function exactPdtBoba001R02VideoRepairBody(authorizationId: string, protectedStateFingerprint: string) {
  return {operation:PDT_BOBA_001_R02_VIDEO_REPAIR.operation,operationId:PDT_BOBA_001_R02_VIDEO_REPAIR.operationId,authorizationId:authorizationId.trim(),protectedStateFingerprint:protectedStateFingerprint.trim().toLowerCase(),productId:PDT_BOBA_001_R02_VIDEO_REPAIR.productId,productVersion:PDT_BOBA_001_R02_VIDEO_REPAIR.productVersion,shopId:PDT_BOBA_001_R02_VIDEO_REPAIR.shopId,listingId:PDT_BOBA_001_R02_VIDEO_REPAIR.listingId,candidateId:PDT_BOBA_001_R02_VIDEO_REPAIR.candidateId,candidateFingerprint:PDT_BOBA_001_R02_VIDEO_REPAIR.candidateFingerprint,buildId:PDT_BOBA_001_R02_VIDEO_REPAIR.buildId,buildFingerprint:PDT_BOBA_001_R02_VIDEO_REPAIR.buildFingerprint,buildFreezeSha256:PDT_BOBA_001_R02_VIDEO_REPAIR.buildFreezeSha256,acceptanceCriteriaId:PDT_BOBA_001_R02_VIDEO_REPAIR.acceptanceCriteriaId,acceptanceCriteriaSha256:PDT_BOBA_001_R02_VIDEO_REPAIR.acceptanceCriteriaSha256,asset:{...PDT_BOBA_001_R02_VIDEO_REPAIR.asset},baselineVideo:{...PDT_BOBA_001_R02_VIDEO_REPAIR.baselineVideo}};
}

export async function verifyPdtBoba001R02VideoProtectedState(runtime: R02VideoRuntime={}) {
  try {
    const token=await(runtime.getAccessToken??getValidEtsyAccessToken)(), s=await readState(token,runtime.fetchImpl??fetch);
    const baselineOk=await baselineMatches(s,runtime), match=coreMatches(s)&&baselineOk;
    const snapshot=protectedSnapshot(s,baselineOk?PDT_BOBA_001_R02_VIDEO_REPAIR.baselineVideo.sha256:"MISMATCH");
    const protectedStateFingerprint=hashOperationRequest(snapshot);
    return NextResponse.json({status:match?"PROTECTED_STATE_MATCH":"PROTECTED_STATE_MISMATCH",operationId:PDT_BOBA_001_R02_VIDEO_REPAIR.operationId,candidateFingerprint:PDT_BOBA_001_R02_VIDEO_REPAIR.candidateFingerprint,buildFingerprint:PDT_BOBA_001_R02_VIDEO_REPAIR.buildFingerprint,buildFreezeSha256:PDT_BOBA_001_R02_VIDEO_REPAIR.buildFreezeSha256,acceptanceCriteriaSha256:PDT_BOBA_001_R02_VIDEO_REPAIR.acceptanceCriteriaSha256,protectedStateFingerprint,currentVideoCount:s.videos.length,baselineVideoId:PDT_BOBA_001_R02_VIDEO_REPAIR.baselineVideo.videoId,baselineVideoSha256Verified:baselineOk,providerReadStatus:s.statuses,scope:"VIDEO_ONLY_REPAIR",ETSY_WRITE_COUNT:0},{status:match?200:409});
  } catch { return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_VERIFICATION_FAILED",ETSY_WRITE_COUNT:0},{status:502}); }
}

async function pollState(token:string,fetchImpl:typeof fetch,predicate:(s:State)=>boolean,sleep:(ms:number)=>Promise<void>) {
  let last:State|null=null;
  for(let i=0;i<5;i++){try{last=await readState(token,fetchImpl);if(predicate(last))return last;}catch{}if(i<4)await sleep(750);}
  return last;
}

export async function handlePdtBoba001R02VideoRepair(body: Rec, authorizationRequestHash: string, request: Request, runtime: R02VideoRuntime={}) {
  if(process.env.PUBLISH_WRITES_ENABLED!=="true") return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_WRITES_DISABLED",ETSY_WRITE_COUNT:0},{status:403});
  const ae=authError(request); if(ae) return ae;
  if(process.env.ETSY_SHOP_ID?.trim()!==PDT_BOBA_001_R02_VIDEO_REPAIR.shopId) return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_SHOP_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  const authorizationId=typeof body.authorizationId==="string"?body.authorizationId.trim():"", protectedStateFingerprint=typeof body.protectedStateFingerprint==="string"?body.protectedStateFingerprint.trim().toLowerCase():"", requestHash=authorizationRequestHash.trim().toLowerCase();
  if(!AUTHORIZATION_ID.test(authorizationId)||!SHA256.test(protectedStateFingerprint)||!SHA256.test(requestHash)) return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_EXACT_AUTHORIZATION_BINDING_REQUIRED",ETSY_WRITE_COUNT:0},{status:409});
  const exact=exactPdtBoba001R02VideoRepairBody(authorizationId,protectedStateFingerprint), actualHash=hashOperationRequest(body);
  if(actualHash!==hashOperationRequest(exact)||!secureEqual(actualHash,requestHash)) return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_AUTHORIZATION_CONTRACT_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  const repo=runtime.repository??new NeonOperationLedgerRepository(), existing=await repo.load(PDT_BOBA_001_R02_VIDEO_REPAIR.operationId);
  if(existing&&existing.requestHash!==requestHash) return NextResponse.json({error:"OPERATION_ID_PAYLOAD_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  if(existing?.status==="SUCCEEDED") return NextResponse.json({status:"REPLAY",operationId:existing.operationId,receipt:existing.receipt,ETSY_WRITE_COUNT:0});
  if(existing) return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_ALREADY_CLAIMED_DO_NOT_RETRY",ledgerStatus:existing.status,receipt:existing.receipt,ETSY_WRITE_COUNT:Number(existing.receipt?.ETSY_WRITE_COUNT)||0},{status:existing.status==="RECONCILIATION_REQUIRED"?202:409});
  let bytes:Buffer; try{bytes=await(runtime.loadAsset?runtime.loadAsset():loadAuthorizedAsset(PDT_BOBA_001_R02_VIDEO_REPAIR.operationId,PDT_BOBA_001_R02_VIDEO_REPAIR.asset.sha256));}catch{return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_ASSET_NOT_READY",ETSY_WRITE_COUNT:0},{status:409});}
  if(!(runtime.verifyAsset??assetMatches)(bytes)) return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_ASSET_IDENTITY_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  const token=await(runtime.getAccessToken??getValidEtsyAccessToken)(), fetchImpl=runtime.fetchImpl??fetch, sleep=runtime.sleep??((ms)=>new Promise(resolve=>setTimeout(resolve,ms)));
  let before:State; try{before=await readState(token,fetchImpl);}catch{return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_PREREAD_FAILED",ETSY_WRITE_COUNT:0},{status:502});}
  if(!coreMatches(before)||!(await baselineMatches(before,{...runtime,fetchImpl}))) return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_PROTECTED_STATE_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  const currentFingerprint=hashOperationRequest(protectedSnapshot(before,PDT_BOBA_001_R02_VIDEO_REPAIR.baselineVideo.sha256));
  if(!secureEqual(currentFingerprint,protectedStateFingerprint)) return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_FRESH_PSV_FINGERPRINT_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  const begun=await beginOperation(repo,PDT_BOBA_001_R02_VIDEO_REPAIR.operationId,body,runtime.now?.()??new Date().toISOString());
  if(begun.status==="REPLAY") return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_ALREADY_CLAIMED_DO_NOT_RETRY",ETSY_WRITE_COUNT:0},{status:409});

  const form=new FormData(); form.set("name",PDT_BOBA_001_R02_VIDEO_REPAIR.asset.fileName); form.set("video",new File([new Uint8Array(bytes)],PDT_BOBA_001_R02_VIDEO_REPAIR.asset.fileName,{type:PDT_BOBA_001_R02_VIDEO_REPAIR.asset.mimeType}));
  const videosUrl=`https://api.etsy.com/v3/application/shops/${PDT_BOBA_001_R02_VIDEO_REPAIR.shopId}/listings/${PDT_BOBA_001_R02_VIDEO_REPAIR.listingId}/videos`;
  let upload:Response;
  try{upload=await fetchImpl(videosUrl,{method:"POST",headers:multipartHeaders(token),body:form,cache:"no-store"});}
  catch{await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"VIDEO_UPLOAD_RESPONSE_AMBIGUOUS",receipt:{ETSY_WRITE_COUNT:0,ETSY_WRITE_ATTEMPT_COUNT:1,ETSY_WRITE_COUNT_STATUS:"UNRESOLVED_REQUIRES_RECONCILIATION"}});return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_UPLOAD_AMBIGUOUS_DO_NOT_RETRY",ETSY_WRITE_COUNT:0,ETSY_WRITE_ATTEMPT_COUNT:1,ETSY_WRITE_COUNT_STATUS:"UNRESOLVED_REQUIRES_RECONCILIATION"},{status:202});}
  const uploadBody=await json(upload), newVideoId=isRec(uploadBody)?Number(uploadBody.video_id):NaN;
  if(upload.status!==201||!Number.isSafeInteger(newVideoId)||newVideoId<1){await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,upload.status>=500?"RECONCILIATION_REQUIRED":"FAILED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"VIDEO_UPLOAD_REJECTED_OR_UNVERIFIED",receipt:{providerUploadStatus:upload.status,ETSY_WRITE_COUNT:0,ETSY_WRITE_ATTEMPT_COUNT:1,ETSY_WRITE_COUNT_STATUS:upload.status>=500?"UNRESOLVED_REQUIRES_RECONCILIATION":"CONFIRMED_ZERO"}});return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_UPLOAD_NOT_VERIFIED_DO_NOT_RETRY",providerStatus:upload.status,ETSY_WRITE_COUNT:0,ETSY_WRITE_ATTEMPT_COUNT:1},{status:upload.status>=500?202:502});}

  const afterUpload=await pollState(token,fetchImpl,s=>coreMatches(s)&&videoRows(s.videos).some(v=>v.videoId===PDT_BOBA_001_R02_VIDEO_REPAIR.baselineVideo.videoId)&&videoRows(s.videos).some(v=>v.videoId===newVideoId),sleep);
  const newMeta=afterUpload?videoRows(afterUpload.videos).find(v=>v.videoId===newVideoId):undefined;
  const verifyUrl=runtime.verifyVideoUrl??((url,sha,size)=>defaultVerifyVideoUrl(fetchImpl,url,sha,size));
  const newBinaryOk=Boolean(newMeta?.videoUrl)&&await verifyUrl(newMeta!.videoUrl,PDT_BOBA_001_R02_VIDEO_REPAIR.asset.sha256,PDT_BOBA_001_R02_VIDEO_REPAIR.asset.sizeBytes).catch(()=>false);
  if(!afterUpload||!newMeta||!newBinaryOk){await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"VIDEO_UPLOAD_READBACK_UNVERIFIED",receipt:{providerUploadStatus:upload.status,newVideoId,ETSY_WRITE_COUNT:1,ETSY_WRITE_ATTEMPT_COUNT:1,ETSY_WRITE_COUNT_STATUS:"CONFIRMED"}});return NextResponse.json({error:"PDT_BOBA_R02_VIDEO_POST_UPLOAD_READBACK_FAILED_DO_NOT_RETRY",newVideoId,ETSY_WRITE_COUNT:1,ETSY_WRITE_ATTEMPT_COUNT:1,ETSY_WRITE_COUNT_STATUS:"CONFIRMED"},{status:202});}

  const deleteUrl=`${videosUrl}/${PDT_BOBA_001_R02_VIDEO_REPAIR.baselineVideo.videoId}`; let del:Response;
  try{del=await fetchImpl(deleteUrl,{method:"DELETE",headers:etsyApiHeaders(token),cache:"no-store"});}
  catch{await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"OLD_VIDEO_DELETE_RESPONSE_AMBIGUOUS",receipt:{providerUploadStatus:upload.status,newVideoId,ETSY_WRITE_COUNT:1,ETSY_WRITE_ATTEMPT_COUNT:2,ETSY_WRITE_COUNT_STATUS:"UNRESOLVED_REQUIRES_RECONCILIATION"}});return NextResponse.json({error:"PDT_BOBA_R02_OLD_VIDEO_DELETE_AMBIGUOUS_DO_NOT_RETRY",newVideoId,ETSY_WRITE_COUNT:1,ETSY_WRITE_ATTEMPT_COUNT:2,ETSY_WRITE_COUNT_STATUS:"UNRESOLVED_REQUIRES_RECONCILIATION"},{status:202});}
  if(del.status!==204){await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"OLD_VIDEO_DELETE_NOT_CONFIRMED",receipt:{providerUploadStatus:upload.status,providerDeleteStatus:del.status,newVideoId,ETSY_WRITE_COUNT:1,ETSY_WRITE_ATTEMPT_COUNT:2,ETSY_WRITE_COUNT_STATUS:"CONFIRMED_PARTIAL"}});return NextResponse.json({error:"PDT_BOBA_R02_OLD_VIDEO_DELETE_NOT_CONFIRMED_DO_NOT_RETRY",newVideoId,providerDeleteStatus:del.status,ETSY_WRITE_COUNT:1,ETSY_WRITE_ATTEMPT_COUNT:2,ETSY_WRITE_COUNT_STATUS:"CONFIRMED_PARTIAL"},{status:202});}

  const final=await pollState(token,fetchImpl,s=>coreMatches(s)&&videoRows(s.videos).length===1&&videoRows(s.videos)[0]?.videoId===newVideoId,sleep), finalMeta=final?videoRows(final.videos)[0]:undefined;
  const finalBinaryOk=Boolean(finalMeta?.videoUrl)&&await verifyUrl(finalMeta!.videoUrl,PDT_BOBA_001_R02_VIDEO_REPAIR.asset.sha256,PDT_BOBA_001_R02_VIDEO_REPAIR.asset.sizeBytes).catch(()=>false);
  if(!final||!finalMeta||!finalBinaryOk){await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"FINAL_VIDEO_READBACK_UNVERIFIED",receipt:{providerUploadStatus:upload.status,providerDeleteStatus:del.status,newVideoId,deletedVideoId:PDT_BOBA_001_R02_VIDEO_REPAIR.baselineVideo.videoId,ETSY_WRITE_COUNT:2,ETSY_WRITE_ATTEMPT_COUNT:2,ETSY_WRITE_COUNT_STATUS:"CONFIRMED"}});return NextResponse.json({error:"PDT_BOBA_R02_FINAL_VIDEO_READBACK_FAILED_DO_NOT_RETRY",newVideoId,ETSY_WRITE_COUNT:2,ETSY_WRITE_ATTEMPT_COUNT:2,ETSY_WRITE_COUNT_STATUS:"CONFIRMED"},{status:202});}

  const receipt={scope:"VIDEO_ONLY_REPAIR",providerUploadStatus:upload.status,providerDeleteStatus:del.status,newVideoId,deletedVideoId:PDT_BOBA_001_R02_VIDEO_REPAIR.baselineVideo.videoId,uploadedAssetSha256:PDT_BOBA_001_R02_VIDEO_REPAIR.asset.sha256,providerVideoSha256Verified:true,protectedStateFingerprint,ETSY_WRITE_COUNT:2,ETSY_WRITE_ATTEMPT_COUNT:2,ETSY_WRITE_COUNT_STATUS:"CONFIRMED"};
  await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,"SUCCEEDED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"VIDEO_REPLACEMENT_VERIFIED",receipt});
  try{await(runtime.clearAsset?runtime.clearAsset():clearAuthorizedAsset(PDT_BOBA_001_R02_VIDEO_REPAIR.operationId,PDT_BOBA_001_R02_VIDEO_REPAIR.asset.sha256));}catch{}
  return NextResponse.json({status:"UPDATED_AND_VERIFIED",operationId:PDT_BOBA_001_R02_VIDEO_REPAIR.operationId,receipt,ETSY_WRITE_COUNT:2,ETSY_WRITE_ATTEMPT_COUNT:2,ETSY_WRITE_COUNT_STATUS:"CONFIRMED"});
}
