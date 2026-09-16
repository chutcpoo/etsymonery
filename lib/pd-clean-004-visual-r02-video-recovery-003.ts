import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { beginOperation, hashOperationRequest, NeonOperationLedgerRepository, recordOperationResult, type OperationLedgerRepository } from "./operation-ledger";
import { clearAuthorizedAsset, loadAuthorizedAsset } from "./authorized-operation-asset-store";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;

export const PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003 = Object.freeze({
  operation: "ADD_VIDEO_1_ONLY",
  operationId: "PD-CLEAN-004-VISUAL-R02-VIDEO-RECOVERY-003",
  recoveryOf: "PD-CLEAN-004-VISUAL-R02-RELEASE-002",
  recoveryReason: "ETSY_HTTP_429_VIDEO_UPLOAD_AFTER_GALLERY_VERIFIED",
  operationFingerprint: "646013c31e026e35e0f9e5c83284d48856dc54c0b2cfcbb40dbc48c5836afadf",
  authorizationId: "PD-CLEAN-004-VISUAL-R02-VIDEO-AUTH-20260916-04-RECOVERY",
  productId: "PD-CLEAN-004",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4561795303",
  candidateId: "ETSY-VISUAL-PD-CLEAN-004-V1-2026-09-16-R02",
  candidateFingerprint: "4448973e5abee4bd344414307c12066248af5f9ab7de26062333deee7f77f069",
  freezeEvidenceDriveId: "1N6-nRz8kJQaX3mIlstWSoK9VzTOIZdiE_8VFe05Xoqw",
  authorizationEvidenceDriveId: "1QxCtkxMZ2EL_DlthfgdcWXlKjSM2i3Af0SgLiyRibmI",
  protectedStateDriveId: "1CGbMDLobZgKbOBVzPigvrCzx2sg7Z3EtmSiWElZMD-Q",
  gallery: [
    [8530911216, 1, 2500, 2000, "Cafe cleaning checklist and schedule hero showing a real Opening Clean Excel workbook worksheet, with opening, service reset, closing, weekly, monthly and verification workflow messaging."],
    [8530911270, 2, 2500, 2000, "Cafe cleaning toolkit overview showing a real Start Here workbook preview beside the exact eight tabs: Start Here, Opening Clean, Service Reset, Closing Clean, Weekly, Monthly, Verification and Blank Checklist."],
    [8530911328, 3, 2500, 2000, "Opening Clean worksheet for a cafe cleaning checklist showing real workbook fields for area, cleaning task, frequency, assigned to, due time, status, verified by and notes."],
    [8578773895, 4, 2500, 2000, "Cafe cleaning workflow showing real Service Reset and Closing Clean workbook worksheets side by side, with assignment, status and verified by fields used through service and closing."],
    [8578773955, 5, 2500, 2000, "Cafe cleaning schedule showing real Weekly and Monthly workbook worksheets with assigned to, due day or date, status, verified by and notes fields for recurring cleaning tasks."],
    [8530911418, 6, 2500, 2000, "Cafe cleaning verification worksheet showing a real workbook preview with date, shift, area, issue or missed task, immediate action, assigned to, due, status, verified by and notes fields."],
    [8530911460, 7, 2500, 2000, "Editable cafe cleaning workbook showing real Opening Clean task rows with cleaning task, assigned to, status, verified by and notes fields that can be customized for a business workflow."],
    [8530911500, 8, 2500, 2000, "What you get with the cafe cleaning toolkit: real Start Here workbook preview beside the buyer ZIP, A4 eight-page PDF, US Letter eight-page PDF, two-page Quick Start and two-page Read Me and License PDF."]
  ] as readonly (readonly [number, number, number, number, string])[],
  video: {
    fileName: "PD-CLEAN-004_VIDEO_cafe-cleaning-checklist.mp4",
    driveId: "1tEEOIDctFE8jGhi9N9seKPWQKfcC3nc4",
    byteSize: 412385,
    sha256: "c4c366024450af646f68951d57fa0a6f93e903dba3784503faddc644fd051102",
    width: 1920,
    height: 1080,
    durationSeconds: 12,
    mimeType: "video/mp4"
  }
} as const);

const EXPECTED_CORE = Object.freeze({
  state: "active",
  title: "Cafe Cleaning Checklist & Schedule | Excel, Google Sheets, PDF",
  descriptionSha256: "8499e2bdebfee3c3cd45abb54fb4ac3bbed0349e4e93849425b54b1cbc97deda",
  descriptionLength: 2323,
  price: { amount: 790, divisor: 100, currencyCode: "USD" },
  taxonomyId: 12476,
  quantity: 999,
  whoMade: "i_did",
  whenMade: "2020_2026",
  listingType: "download",
  returnPolicyId: 1,
  fileData: "4 PDF, 1 ZIP",
  tags: ["cafe cleaning", "cleaning checklist", "weekly cleaning", "monthly cleaning", "closing cleaning", "opening cleaning", "coffee shop cleaning", "cleaning schedule", "cafe manager tool", "printable checklist", "excel checklist", "google sheets cafe", "digital download"] as readonly string[],
  buyerFiles: [
    [1509497461832, 1, "Cafe_Cleaning_A4.pdf", 20770, "application/pdf"],
    [1509497461994, 2, "Cafe_Cleaning_US_Letter.pdf", 20342, "application/pdf"],
    [1510699937465, 3, "Cafe_Cleaning_Quick_Start.pdf", 4613, "application/pdf"],
    [1510699937529, 4, "Cafe_Cleaning_Read_Me_License.pdf", 4219, "application/pdf"],
    [1511184503089, 5, "Cafe_Cleaning_Checklist.zip", 15289, "application/zip"]
  ] as readonly (readonly (string | number)[])[]
} as const);

type Rec = Record<string, unknown>;
type State = { listing: Rec; images: Rec[]; attributes: Rec[]; files: Rec[]; videos: Rec[]; statuses: Record<string, number> };
export type PdClean004VideoRecovery003Runtime = { fetchImpl?: typeof fetch; getAccessToken?: () => Promise<string>; repository?: OperationLedgerRepository; loadAsset?: () => Promise<Buffer>; clearAsset?: () => Promise<void>; verifyVideoUrl?: (url: string, sha: string, size: number) => Promise<boolean>; sleep?: (ms: number) => Promise<void>; now?: () => string };

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const results = (v: unknown) => isRec(v) && Array.isArray(v.results) ? v.results.filter(isRec) : null;
const normalizeDescription = (v: unknown) => typeof v === "string" ? v.normalize("NFC").replaceAll("&gt;", ">") : "";
const hashText = (v: unknown) => createHash("sha256").update(normalizeDescription(v), "utf8").digest("hex");
const secureEqual = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
async function json(r: Response) { const t = await r.text(); try { return t ? JSON.parse(t) as unknown : {}; } catch { return {}; } }
function multipartHeaders(token: string) { const h = etsyApiHeaders(token); delete h["content-type"]; return h; }
function imageRows(s: State) { return [...s.images].sort((a,b)=>Number(a.rank)-Number(b.rank)).map(i => [Number(i.listing_image_id), Number(i.rank), Number(i.full_width), Number(i.full_height), String(i.alt_text ?? "")]); }
function fileRows(s: State) { return [...s.files].sort((a,b)=>Number(a.rank)-Number(b.rank)).map(f => [Number(f.listing_file_id), Number(f.rank), String(f.filename ?? ""), Number(f.size_bytes), String(f.filetype ?? "")]); }
function videoRows(s: State) { return [...s.videos].map(v => ({ videoId:Number(v.video_id), width:Number(v.width), height:Number(v.height), videoState:String(v.video_state ?? ""), videoUrl:String(v.video_url ?? "") })).sort((a,b)=>a.videoId-b.videoId); }

async function readState(token: string, fetchImpl: typeof fetch): Promise<State> {
  const base = "https://api.etsy.com/v3/application"; const shop = PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.shopId; const listing = PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.listingId;
  const urls = { listing:`${base}/listings/${listing}`, images:`${base}/listings/${listing}/images`, attributes:`${base}/shops/${shop}/listings/${listing}/properties`, files:`${base}/shops/${shop}/listings/${listing}/files`, videos:`${base}/listings/${listing}/videos` };
  const entries = await Promise.all(Object.entries(urls).map(async ([name,url]) => { const response = await fetchImpl(url,{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"}); return {name,response,value:await json(response)}; }));
  const by = Object.fromEntries(entries.map(e=>[e.name,e])) as Record<string,{response:Response;value:unknown}>;
  const images=results(by.images.value), attributes=results(by.attributes.value), files=results(by.files.value), videos=results(by.videos.value);
  if(!by.listing.response.ok || !isRec(by.listing.value) || !by.images.response.ok || !by.attributes.response.ok || !by.files.response.ok || !by.videos.response.ok || !images || !attributes || !files || !videos) throw new Error("PD_CLEAN_004_VIDEO_RECOVERY_003_READBACK_FAILED");
  return {listing:by.listing.value,images,attributes,files,videos,statuses:Object.fromEntries(entries.map(e=>[e.name,e.response.status]))};
}

function protectedCoreMatches(s: State) {
  const l=s.listing; const p=isRec(l.price)?l.price:{};
  if(String(l.listing_id)!==PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.listingId || String(l.shop_id)!==PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.shopId) return false;
  if(String(l.state).toLowerCase()!==EXPECTED_CORE.state || l.title!==EXPECTED_CORE.title) return false;
  if(hashText(l.description)!==EXPECTED_CORE.descriptionSha256 || normalizeDescription(l.description).length!==EXPECTED_CORE.descriptionLength) return false;
  if(JSON.stringify(l.tags)!==JSON.stringify(EXPECTED_CORE.tags)) return false;
  if(Number(p.amount)!==EXPECTED_CORE.price.amount || Number(p.divisor)!==EXPECTED_CORE.price.divisor || p.currency_code!==EXPECTED_CORE.price.currencyCode) return false;
  if(Number(l.taxonomy_id)!==EXPECTED_CORE.taxonomyId || Number(l.quantity)!==EXPECTED_CORE.quantity) return false;
  if(l.who_made!==EXPECTED_CORE.whoMade || l.when_made!==EXPECTED_CORE.whenMade || (l.listing_type ?? l.type)!==EXPECTED_CORE.listingType) return false;
  if(Number(l.return_policy_id)!==EXPECTED_CORE.returnPolicyId || l.file_data!==EXPECTED_CORE.fileData || s.attributes.length!==0) return false;
  if("is_supply" in l && l.is_supply!==false) return false;
  return JSON.stringify(fileRows(s))===JSON.stringify(EXPECTED_CORE.buyerFiles);
}
function exactGalleryMatches(s: State){ return JSON.stringify(imageRows(s))===JSON.stringify(PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.gallery); }
function exactPreWriteMatches(s: State){ return protectedCoreMatches(s) && exactGalleryMatches(s) && videoRows(s).length===0; }
function protectedSnapshot(s: State){ const l=s.listing; const p=isRec(l.price)?l.price:{}; return {listingId:Number(l.listing_id),shopId:Number(l.shop_id),state:l.state,title:l.title,descriptionSha256:hashText(l.description),descriptionLength:normalizeDescription(l.description).length,tags:l.tags,price:{amount:Number(p.amount),divisor:Number(p.divisor),currencyCode:p.currency_code},taxonomyId:Number(l.taxonomy_id),quantity:Number(l.quantity),whoMade:l.who_made,whenMade:l.when_made,listingType:l.listing_type ?? l.type,returnPolicyId:Number(l.return_policy_id),fileData:l.file_data,images:imageRows(s),attributes:s.attributes,files:fileRows(s),videos:videoRows(s).map(({videoId,width,height,videoState})=>({videoId,width,height,videoState}))} as Record<string,unknown>; }

export function exactPdClean004VideoRecovery003AuthorizationHash(protectedStateFingerprint:string){ return hashOperationRequest({authorizationId:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.authorizationId,operationId:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.operationId,recoveryOf:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.recoveryOf,recoveryReason:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.recoveryReason,operationFingerprint:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.operationFingerprint,candidateFingerprint:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.candidateFingerprint,scope:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.operation,protectedStateFingerprint:protectedStateFingerprint.trim().toLowerCase()}); }
export function exactPdClean004VideoRecovery003Body(protectedStateFingerprint:string){ return {operation:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.operation,operationId:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.operationId,recoveryOf:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.recoveryOf,recoveryReason:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.recoveryReason,operationFingerprint:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.operationFingerprint,authorizationId:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.authorizationId,productId:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.productId,productVersion:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.productVersion,shopId:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.shopId,listingId:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.listingId,candidateId:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.candidateId,candidateFingerprint:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.candidateFingerprint,protectedStateFingerprint:protectedStateFingerprint.trim().toLowerCase(),video:{...PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.video}}; }
function writeAuthorizationError(request:Request){ if(process.env.PUBLISH_WRITES_ENABLED!=="true") return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_WRITES_DISABLED",ETSY_WRITE_COUNT:0},{status:403}); const expected=process.env.ETSY_B01_WRITE_TOKEN?.trim()??""; const supplied=request.headers.get(WRITE_HEADER)?.trim()??""; if(!expected) return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_WRITE_AUTH_NOT_CONFIGURED",ETSY_WRITE_COUNT:0},{status:503}); if(!supplied || !secureEqual(expected,supplied)) return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_UNAUTHORIZED",ETSY_WRITE_COUNT:0},{status:401}); if((process.env.ETSY_SHOP_ID?.trim()??"")!==PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.shopId) return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_SHOP_MISMATCH",ETSY_WRITE_COUNT:0},{status:409}); return null; }
function verifyVideoBytes(bytes:Buffer){ const a=PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.video; return bytes.length===a.byteSize && createHash("sha256").update(bytes).digest("hex")===a.sha256 && bytes.length>12 && bytes.toString("ascii",4,8)==="ftyp"; }
async function defaultVerifyVideoUrl(fetchImpl:typeof fetch,url:string,sha:string,size:number){ if(!url.startsWith("https://"))return false; const r=await fetchImpl(url,{method:"GET",cache:"no-store"}); if(!r.ok)return false; const b=Buffer.from(await r.arrayBuffer()); return b.length===size && createHash("sha256").update(b).digest("hex")===sha; }
async function pollState(token:string,fetchImpl:typeof fetch,predicate:(s:State)=>boolean,sleep:(ms:number)=>Promise<void>){ let last:State|null=null; for(let n=0;n<6;n++){ try{last=await readState(token,fetchImpl);if(predicate(last))return last;}catch{} if(n<5)await sleep(1000);} return last; }

export async function verifyPdClean004VideoRecovery003ProtectedState(runtime:PdClean004VideoRecovery003Runtime={}){
  try{const token=await(runtime.getAccessToken??getValidEtsyAccessToken)();const state=await readState(token,runtime.fetchImpl??fetch);const match=exactPreWriteMatches(state);return NextResponse.json({status:match?"PROTECTED_STATE_MATCH":"PROTECTED_STATE_MISMATCH",operationId:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.operationId,operationFingerprint:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.operationFingerprint,listingId:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.listingId,candidateFingerprint:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.candidateFingerprint,protectedStateFingerprint:hashOperationRequest(protectedSnapshot(state)),galleryCount:state.images.length,videoCount:state.videos.length,providerReadStatus:state.statuses,scope:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.operation,ETSY_WRITE_COUNT:0},{status:match?200:409});}catch{return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_PROTECTED_STATE_READ_FAILED",ETSY_WRITE_COUNT:0},{status:502});}
}

export async function handlePdClean004VideoRecovery003(protectedStateFingerprint:string,authorizationRequestHash:string,request:Request,runtime:PdClean004VideoRecovery003Runtime={}){
  const auth=writeAuthorizationError(request);if(auth)return auth;const protectedSha=protectedStateFingerprint.trim().toLowerCase();const authHash=authorizationRequestHash.trim().toLowerCase();if(!SHA256.test(protectedSha)||!SHA256.test(authHash))return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_EXACT_BINDING_REQUIRED",ETSY_WRITE_COUNT:0},{status:409});const expectedAuth=exactPdClean004VideoRecovery003AuthorizationHash(protectedSha);if(!secureEqual(expectedAuth,authHash))return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_AUTH_HASH_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  const body=exactPdClean004VideoRecovery003Body(protectedSha);const repository=runtime.repository??new NeonOperationLedgerRepository();const exactRequestHash=hashOperationRequest(body);const existing=await repository.load(PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.operationId);if(existing){if(existing.requestHash!==exactRequestHash)return NextResponse.json({error:"OPERATION_ID_PAYLOAD_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});if(existing.status==="SUCCEEDED")return NextResponse.json({status:"REPLAY",operationId:existing.operationId,receipt:existing.receipt,ETSY_WRITE_COUNT:0});return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_ALREADY_CLAIMED_DO_NOT_RETRY",ledgerStatus:existing.status,receipt:existing.receipt,ETSY_WRITE_COUNT:Number(existing.receipt?.ETSY_WRITE_COUNT)||0},{status:existing.status==="RECONCILIATION_REQUIRED"?202:409});}
  let videoBytes:Buffer;try{videoBytes=await(runtime.loadAsset?runtime.loadAsset():loadAuthorizedAsset(PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.operationId,PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.video.sha256));}catch{return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_ASSET_NOT_READY",ETSY_WRITE_COUNT:0},{status:409});}if(!verifyVideoBytes(videoBytes))return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_ASSET_IDENTITY_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  const fetchImpl=runtime.fetchImpl??fetch;const token=await(runtime.getAccessToken??getValidEtsyAccessToken)();let before:State;try{before=await readState(token,fetchImpl);}catch{return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_PREREAD_FAILED",ETSY_WRITE_COUNT:0},{status:502});}if(!exactPreWriteMatches(before))return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_PROTECTED_STATE_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});const actualSha=hashOperationRequest(protectedSnapshot(before));if(!secureEqual(actualSha,protectedSha))return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_FRESH_PSV_FINGERPRINT_MISMATCH",actualProtectedStateFingerprint:actualSha,ETSY_WRITE_COUNT:0},{status:409});
  const now=runtime.now?.()??new Date().toISOString();const begun=await beginOperation(repository,PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.operationId,body,now);if(begun.status==="REPLAY")return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_ALREADY_CLAIMED_DO_NOT_RETRY",ETSY_WRITE_COUNT:0},{status:409});
  const asset=PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.video;const form=new FormData();form.set("name",asset.fileName);form.set("video",new File([new Uint8Array(videoBytes)],asset.fileName,{type:asset.mimeType}));const url=`https://api.etsy.com/v3/application/shops/${PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.shopId}/listings/${PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.listingId}/videos`;
  let response:Response;try{response=await fetchImpl(url,{method:"POST",headers:multipartHeaders(token),body:form,cache:"no-store"});}catch{await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"VIDEO_UPLOAD_RESPONSE_AMBIGUOUS",receipt:{ETSY_WRITE_COUNT:0,ETSY_WRITE_ATTEMPT_COUNT:1}});return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_AMBIGUOUS_DO_NOT_RETRY",ETSY_WRITE_COUNT:0,ETSY_WRITE_ATTEMPT_COUNT:1},{status:202});}
  const value=await json(response);const videoId=isRec(value)?Number(value.video_id):NaN;
  if(response.status!==201 || !Number.isSafeInteger(videoId) || videoId<1){
    if(response.status===429){let readback:State|null=null;try{readback=await readState(token,fetchImpl);}catch{}if(readback && exactGalleryMatches(readback) && protectedCoreMatches(readback) && videoRows(readback).length===0){await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"FAILED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"VIDEO_UPLOAD_429_CONFIRMED_NO_WRITE",receipt:{providerStatus:429,videoCount:0,ETSY_WRITE_COUNT:0,ETSY_WRITE_ATTEMPT_COUNT:1}});return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_PROVIDER_429_CONFIRMED_NO_WRITE",providerStatus:429,videoCount:0,ETSY_WRITE_COUNT:0,ETSY_WRITE_ATTEMPT_COUNT:1},{status:502});}}
    const reconciliation=response.status>=500 || response.status===429;await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,reconciliation?"RECONCILIATION_REQUIRED":"FAILED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:reconciliation?"VIDEO_UPLOAD_REJECTED_OR_UNVERIFIED":"VIDEO_UPLOAD_REJECTED",receipt:{providerStatus:response.status,ETSY_WRITE_COUNT:0,ETSY_WRITE_ATTEMPT_COUNT:1}});return NextResponse.json({error:reconciliation?"PD_CLEAN_004_VIDEO_RECOVERY_003_RECONCILIATION_REQUIRED_DO_NOT_RETRY":"PD_CLEAN_004_VIDEO_RECOVERY_003_REJECTED",providerStatus:response.status,ETSY_WRITE_COUNT:0,ETSY_WRITE_ATTEMPT_COUNT:1},{status:reconciliation?202:502});
  }
  const sleep=runtime.sleep??((ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)));const final=await pollState(token,fetchImpl,s=>protectedCoreMatches(s)&&exactGalleryMatches(s)&&videoRows(s).length===1&&videoRows(s)[0]?.videoId===videoId,sleep);const finalVideo=final?videoRows(final)[0]:undefined;const verifyVideoUrl=runtime.verifyVideoUrl??((u,sha,size)=>defaultVerifyVideoUrl(fetchImpl,u,sha,size));const binaryVerified=Boolean(finalVideo?.videoUrl)&&await verifyVideoUrl(finalVideo!.videoUrl,asset.sha256,asset.byteSize).catch(()=>false);
  if(!final || !protectedCoreMatches(final) || !exactGalleryMatches(final) || !finalVideo || finalVideo.videoId!==videoId || finalVideo.width!==asset.width || finalVideo.height!==asset.height || !binaryVerified){await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"FINAL_VIDEO_READBACK_UNVERIFIED",receipt:{videoId,ETSY_WRITE_COUNT:1,ETSY_WRITE_ATTEMPT_COUNT:1}});return NextResponse.json({error:"PD_CLEAN_004_VIDEO_RECOVERY_003_FINAL_READBACK_FAILED_DO_NOT_RETRY",videoId,ETSY_WRITE_COUNT:1,ETSY_WRITE_ATTEMPT_COUNT:1},{status:202});}
  const done=await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"SUCCEEDED",runtime.now?.()??new Date().toISOString(),{receipt:{authorizationId:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.authorizationId,operationFingerprint:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.operationFingerprint,candidateFingerprint:PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.candidateFingerprint,videoId,ETSY_WRITE_COUNT:1,ETSY_WRITE_ATTEMPT_COUNT:1,verified:{galleryUnchanged8:"PASS",altTextUnchanged8:"PASS",videoExact1:"PASS",title:"PRESERVED",description:"PRESERVED",tags:"PRESERVED",price:"PRESERVED",taxonomy:"PRESERVED",quantity:"PRESERVED",buyerFiles:"PRESERVED",attributes:"PRESERVED"},readBackStatus:final.statuses}});
  try{await(runtime.clearAsset?runtime.clearAsset():clearAuthorizedAsset(PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.operationId,asset.sha256));}catch{}
  return NextResponse.json({status:"UPDATED_AND_VERIFIED",mode:"WRITE_ONCE",operationId:done.operationId,requestHash:done.requestHash,ledgerStatus:done.status,videoId,ETSY_WRITE_COUNT:1,ETSY_WRITE_ATTEMPT_COUNT:1,receipt:done.receipt});
}
