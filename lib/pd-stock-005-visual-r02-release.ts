import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { beginOperation, hashOperationRequest, NeonOperationLedgerRepository, recordOperationResult, type OperationLedgerRepository } from "./operation-ledger";
import { clearAuthorizedAsset, loadAuthorizedAsset } from "./authorized-operation-asset-store";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;

export const PD_STOCK_005_VISUAL_R02_RELEASE = Object.freeze({
  operation: "REPLACE_GALLERY_8_ALT_TEXT_8_PRESERVE_VIDEO_COUNT_0_ONLY",
  operationId: "PD-STOCK-005-VISUAL-R02-RELEASE-001",
  operationFingerprint: "ea0a9759ff0925d2c908f0605ab2473eeae995c93d77c33fa7c310558661953e",
  authorizationId: "PD-STOCK-005-VISUAL-R02-AUTH-20260916-01",
  productId: "PD-STOCK-005",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4561821192",
  candidateId: "PD-STOCK-005-VISUAL-R02-CANDIDATE-20260916-01",
  candidateFingerprint: "f7939f5cf44b19ffa7c76e6fe7b0fb31644517a1e323490e12d09c46f77346b9",
  buildId: "PD-STOCK-005-VISUAL-R02-BUILD-20260916-01",
  acceptanceCriteriaId: "PD-STOCK-005-VISUAL-R02-AC-20260916-01",
  freezeEvidenceDriveId: "1pyzoxvkpFqQk1t9PlsrEeXTHeaPURho2",
  gallery: [
    { order: 1, fileName: "PD-STOCK-005_01_HERO_restaurant-cafe-inventory-tracker.jpg", driveId: "1mhH5w0ca6FLBB2_His6S2W2T93heLdz3", byteSize: 278821, sha256: "047709b988b0adf5e1112256bdab56c7d01f223326a1ff33ab6df84a6cbf45a2", width: 2500, height: 2000, mimeType: "image/jpeg", altText: "Restaurant and cafe inventory and waste tracker hero showing a real Excel workbook Start Here preview with count, waste and reorder workflow and eight workbook tabs." },
    { order: 2, fileName: "PD-STOCK-005_02_INCLUDED_eight-workbook-tabs.jpg", driveId: "1Y-CnOxqMl_zbCyBN87_dDSE3znjsCdPr", byteSize: 243162, sha256: "cf5787844c97faec1ba9f0d541acdb96ca7966051ad6c64c05a07f9333ef3154", width: 2500, height: 2000, mimeType: "image/jpeg", altText: "Inventory tracker gallery image listing the eight workbook tabs—Start Here, Item Master, Daily Count, Waste Log, Reorder Plan, Suppliers, Weekly Summary and Blank Tracker—beside a real workbook preview." },
    { order: 3, fileName: "PD-STOCK-005_03_WORKSHEET_daily-count-variance.jpg", driveId: "1qPLpbM0EdqaDCt9LHvt30hyr8YL0scuW", byteSize: 206518, sha256: "ac06ca2516d0be7c73a5221467b44a94f6c9d65ba80808e7fd1135565968ed82", width: 2500, height: 2000, mimeType: "image/jpeg", altText: "Real Daily Count worksheet preview showing opening, received, used, waste, calculated closing, physical closing and variance fields for inventory review." },
    { order: 4, fileName: "PD-STOCK-005_04_WORKSHEET_waste-log.jpg", driveId: "1-vLBTcJOmM2XQDzCHg9cEa7WedB3i89_", byteSize: 191185, sha256: "5a61568954bc2f5663fc4e0f441431cd3a39272bc8a310183e2e9bd734ec7ee6", width: 2500, height: 2000, mimeType: "image/jpeg", altText: "Real Waste Log worksheet preview showing quantity wasted, reason, unit cost, waste cost and recorded-by fields for restaurant and cafe inventory tracking." },
    { order: 5, fileName: "PD-STOCK-005_05_WORKSHEET_reorder-plan.jpg", driveId: "1FPn3WZtg-Qck4eFeXYMq8ghpoZA7r4Df", byteSize: 204025, sha256: "807365f251212825e0a1835a16244545e628469991695df5ff17fa219a03362d", width: 2500, height: 2000, mimeType: "image/jpeg", altText: "Real Reorder Plan worksheet preview showing current stock, reorder level, suggested order quantity, unit cost, estimated cost and order status fields." },
    { order: 6, fileName: "PD-STOCK-005_06_WORKFLOW_item-master-and-suppliers.jpg", driveId: "1o6RJjkz2nyqN_c-MxIcXNHiV9QgC5XBN", byteSize: 290674, sha256: "814eac76a852ce1f6247a0d2e1d3427760ffa34d7a46f7ed8dcee2cc71be252f", width: 2500, height: 2000, mimeType: "image/jpeg", altText: "Real Item Master and Suppliers worksheet previews showing par and reorder settings, primary supplier details, lead time and supplier status fields." },
    { order: 7, fileName: "PD-STOCK-005_07_REVIEW_weekly-summary.jpg", driveId: "18rHLfwUtUlu90n8MvqrFTAk5SHG3iHZK", byteSize: 193304, sha256: "40a7e85f2f32b7160b3c05aeb88c14c25989dfb96896a2ac175a40af515ed6ea", width: 2500, height: 2000, mimeType: "image/jpeg", altText: "Real Weekly Summary worksheet preview showing stock value, purchases, usage value, waste cost, waste percentage and items reordered for manager review." },
    { order: 8, fileName: "PD-STOCK-005_08_DELIVERY_workbook-printable-pdfs.jpg", driveId: "1yAKXVlI8uESXSqtNbHlXWbVdmEtOblU-", byteSize: 215858, sha256: "d918b05361e16c1fdc8fc76787313174ca7bc6a6a7d67f71f67867f1b47ba81a", width: 2500, height: 2000, mimeType: "image/jpeg", altText: "Digital download overview showing a real Excel workbook preview and A4 printable PDF cover, with A4 and US Letter PDFs, Quick Start, and Read Me plus License files included." }
  ] as const,
  expectedVideoCount: 0,
  productTruth: {
    buyerZipSha256: "3841d6260b1e41d987338b247c955235fc0085380d1a2c75420e23df5f9bfc22",
    innerWorkbookSha256: "95c7b9a18e1f9ed9403ec0f3b47c02c086bdc321632f1ec5aa11640befe783d1"
  }
} as const);

const EXPECTED_BEFORE = Object.freeze({
  state: "active",
  title: "Restaurant & Cafe Inventory Tracker | Stock, Waste, Reorder and Supplier Spreadsheet",
  descriptionSha256: "61e01e830c577c9a52dd799cab2aaee502d3b972ebf39aff4ae50c3e2c0abcd3",
  price: { amount: 890, divisor: 100, currencyCode: "USD" },
  taxonomyId: 12476,
  quantity: 999,
  whoMade: "i_did",
  whenMade: "2020_2026",
  listingType: "download",
  returnPolicyId: 1,
  fileData: "4 PDF, 1 ZIP",
  tags: ["restaurant inventory","cafe stock tracker","kitchen inventory","food waste tracker","reorder spreadsheet","supplier tracker","par level sheet","stock count sheet","stock control","inventory excel","google sheets stock","waste cost log","food stocktake"] as readonly string[],
  gallery: [[8425781998,1,2000,2000],[8425781986,2,2000,2000],[8425782002,3,2000,2000],[8473652637,4,2000,2000],[8425782008,5,2000,2000],[8473652673,6,2000,2000],[8425782060,7,2000,2000],[8433083104,8,2000,2000]] as readonly (readonly number[])[],
  buyerFiles: [[1509497762118,1,"Inventory_Waste_A4.pdf",24247,"application/pdf"],[1509497762234,2,"Inventory_Waste_US_Letter.pdf",23237,"application/pdf"],[1509497762284,3,"Inventory_Waste_Quick_Start.pdf",4630,"application/pdf"],[1510700238185,4,"Inventory_Waste_Read_Me_License.pdf",4242,"application/pdf"],[1509980203922,5,"Inventory_Waste_Tracker.zip",16285,"application/zip"]] as readonly (readonly (string|number)[])[]
} as const);

type Rec = Record<string, unknown>;
type State = { listing: Rec; images: Rec[]; attributes: Rec[]; files: Rec[]; videos: Rec[]; statuses: Record<string, number> };
type GalleryAsset = (typeof PD_STOCK_005_VISUAL_R02_RELEASE.gallery)[number];
export type PdStock005VisualR02Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  loadAsset?: (asset: GalleryAsset) => Promise<Buffer>;
  clearAsset?: (asset: GalleryAsset) => Promise<void>;
  verifyAsset?: (bytes: Buffer, asset: GalleryAsset) => boolean;
  hashText?: (value: unknown) => string;
  sleep?: (ms: number) => Promise<void>;
  now?: () => string;
};

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const results = (v: unknown) => isRec(v) && Array.isArray(v.results) ? v.results.filter(isRec) : null;
const secureEqual = (a: string, b: string) => { const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); };
const defaultHashText = (v: unknown) => createHash("sha256").update(typeof v === "string" ? v.normalize("NFC") : "", "utf8").digest("hex");
async function json(response: Response) { const text=await response.text(); try { return text ? JSON.parse(text) as unknown : {}; } catch { return {}; } }
function multipartHeaders(token: string) { const h=etsyApiHeaders(token); delete h["content-type"]; return h; }
function imageRows(s: State) { return [...s.images].sort((a,b)=>Number(a.rank)-Number(b.rank)).map(i=>[Number(i.listing_image_id),Number(i.rank),Number(i.full_width),Number(i.full_height)]); }
function fileRows(s: State) { return [...s.files].sort((a,b)=>Number(a.rank)-Number(b.rank)).map(f=>[Number(f.listing_file_id),Number(f.rank),String(f.filename??""),Number(f.size_bytes),String(f.filetype??"")]); }

async function readState(token: string, fetchImpl: typeof fetch): Promise<State> {
  const base="https://api.etsy.com/v3/application",shop=PD_STOCK_005_VISUAL_R02_RELEASE.shopId,listing=PD_STOCK_005_VISUAL_R02_RELEASE.listingId;
  const urls={listing:`${base}/listings/${listing}`,images:`${base}/listings/${listing}/images`,attributes:`${base}/shops/${shop}/listings/${listing}/properties`,files:`${base}/shops/${shop}/listings/${listing}/files`,videos:`${base}/listings/${listing}/videos`};
  const entries=await Promise.all(Object.entries(urls).map(async([name,url])=>{const response=await fetchImpl(url,{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"});return{name,response,value:await json(response)}}));
  const by=Object.fromEntries(entries.map(e=>[e.name,e])) as Record<string,{response:Response;value:unknown}>;
  const images=results(by.images.value),attributes=results(by.attributes.value),files=results(by.files.value),videos=results(by.videos.value);
  if(!by.listing.response.ok||!isRec(by.listing.value)||!by.images.response.ok||!by.attributes.response.ok||!by.files.response.ok||!by.videos.response.ok||!images||!attributes||!files||!videos) throw new Error("PD_STOCK_005_R02_READBACK_FAILED");
  return {listing:by.listing.value,images,attributes,files,videos,statuses:Object.fromEntries(entries.map(e=>[e.name,e.response.status]))};
}

function protectedCoreMatches(s: State, hasher=defaultHashText) {
  const l=s.listing,p=isRec(l.price)?l.price:{};
  if(Number(l.listing_id)!==Number(PD_STOCK_005_VISUAL_R02_RELEASE.listingId)||Number(l.shop_id)!==Number(PD_STOCK_005_VISUAL_R02_RELEASE.shopId)||l.state!==EXPECTED_BEFORE.state||l.title!==EXPECTED_BEFORE.title) return false;
  if(hasher(l.description)!==EXPECTED_BEFORE.descriptionSha256||JSON.stringify(l.tags)!==JSON.stringify(EXPECTED_BEFORE.tags)) return false;
  if(Number(p.amount)!==EXPECTED_BEFORE.price.amount||Number(p.divisor)!==EXPECTED_BEFORE.price.divisor||p.currency_code!==EXPECTED_BEFORE.price.currencyCode) return false;
  if(Number(l.taxonomy_id)!==EXPECTED_BEFORE.taxonomyId||Number(l.quantity)!==EXPECTED_BEFORE.quantity||l.who_made!==EXPECTED_BEFORE.whoMade||l.when_made!==EXPECTED_BEFORE.whenMade||(l.listing_type??l.type)!==EXPECTED_BEFORE.listingType) return false;
  if(Number(l.return_policy_id)!==EXPECTED_BEFORE.returnPolicyId||l.file_data!==EXPECTED_BEFORE.fileData||s.attributes.length!==0) return false;
  return JSON.stringify(fileRows(s))===JSON.stringify(EXPECTED_BEFORE.buyerFiles);
}
function videosPreservedAtZero(s: State) { return s.videos.length===PD_STOCK_005_VISUAL_R02_RELEASE.expectedVideoCount; }
function exactPreWriteBaselineMatches(s: State, hasher=defaultHashText) { return protectedCoreMatches(s,hasher)&&JSON.stringify(imageRows(s))===JSON.stringify(EXPECTED_BEFORE.gallery)&&videosPreservedAtZero(s); }
function protectedSnapshot(s: State, hasher=defaultHashText) { const l=s.listing,p=isRec(l.price)?l.price:{}; return {listingId:Number(l.listing_id),shopId:Number(l.shop_id),state:l.state,title:l.title,descriptionSha256:hasher(l.description),tags:l.tags,price:{amount:Number(p.amount),divisor:Number(p.divisor),currencyCode:p.currency_code},taxonomyId:Number(l.taxonomy_id),quantity:Number(l.quantity),whoMade:l.who_made,whenMade:l.when_made,listingType:l.listing_type??l.type,returnPolicyId:Number(l.return_policy_id),fileData:l.file_data,images:imageRows(s),attributes:s.attributes,files:fileRows(s),videoCount:s.videos.length} as Record<string,unknown>; }

export function exactPdStock005R02AuthorizationHash(psv: string) { return hashOperationRequest({authorizationId:PD_STOCK_005_VISUAL_R02_RELEASE.authorizationId,operationId:PD_STOCK_005_VISUAL_R02_RELEASE.operationId,operationFingerprint:PD_STOCK_005_VISUAL_R02_RELEASE.operationFingerprint,candidateFingerprint:PD_STOCK_005_VISUAL_R02_RELEASE.candidateFingerprint,scope:PD_STOCK_005_VISUAL_R02_RELEASE.operation,protectedStateFingerprint:psv.trim().toLowerCase()}); }
export function exactPdStock005R02ReleaseBody(psv: string) { return {operation:PD_STOCK_005_VISUAL_R02_RELEASE.operation,operationId:PD_STOCK_005_VISUAL_R02_RELEASE.operationId,operationFingerprint:PD_STOCK_005_VISUAL_R02_RELEASE.operationFingerprint,authorizationId:PD_STOCK_005_VISUAL_R02_RELEASE.authorizationId,productId:PD_STOCK_005_VISUAL_R02_RELEASE.productId,productVersion:PD_STOCK_005_VISUAL_R02_RELEASE.productVersion,shopId:PD_STOCK_005_VISUAL_R02_RELEASE.shopId,listingId:PD_STOCK_005_VISUAL_R02_RELEASE.listingId,candidateId:PD_STOCK_005_VISUAL_R02_RELEASE.candidateId,candidateFingerprint:PD_STOCK_005_VISUAL_R02_RELEASE.candidateFingerprint,buildId:PD_STOCK_005_VISUAL_R02_RELEASE.buildId,acceptanceCriteriaId:PD_STOCK_005_VISUAL_R02_RELEASE.acceptanceCriteriaId,protectedStateFingerprint:psv.trim().toLowerCase(),gallery:PD_STOCK_005_VISUAL_R02_RELEASE.gallery.map(a=>({...a})),expectedVideoCount:0}; }

function writeAuthorizationError(request: Request) {
  if(process.env.PUBLISH_WRITES_ENABLED!=="true") return NextResponse.json({error:"PD_STOCK_005_R02_WRITES_DISABLED",ETSY_WRITE_COUNT:0},{status:403});
  const expected=process.env.ETSY_B01_WRITE_TOKEN?.trim()??"",supplied=request.headers.get(WRITE_HEADER)?.trim()??"";
  if(!expected) return NextResponse.json({error:"PD_STOCK_005_R02_WRITE_AUTH_NOT_CONFIGURED",ETSY_WRITE_COUNT:0},{status:503});
  if(!supplied||!secureEqual(expected,supplied)) return NextResponse.json({error:"PD_STOCK_005_R02_UNAUTHORIZED",ETSY_WRITE_COUNT:0},{status:401});
  if((process.env.ETSY_SHOP_ID?.trim()??"")!==PD_STOCK_005_VISUAL_R02_RELEASE.shopId) return NextResponse.json({error:"PD_STOCK_005_R02_SHOP_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  return null;
}
function jpegDimensions(bytes: Buffer) { if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return null;let o=2;while(o+9<bytes.length){if(bytes[o]!==0xff){o++;continue}const m=bytes[o+1];o+=2;if(m===0xd8||m===0xd9)continue;if(o+2>bytes.length)return null;const len=bytes.readUInt16BE(o);if(len<2||o+len>bytes.length)return null;const sof=(m>=0xc0&&m<=0xc3)||(m>=0xc5&&m<=0xc7)||(m>=0xc9&&m<=0xcb)||(m>=0xcd&&m<=0xcf);if(sof&&len>=7)return{height:bytes.readUInt16BE(o+3),width:bytes.readUInt16BE(o+5)};o+=len}return null; }
function defaultVerifyAsset(bytes: Buffer, asset: GalleryAsset) { if(bytes.length!==asset.byteSize||createHash("sha256").update(bytes).digest("hex")!==asset.sha256)return false;const d=jpegDimensions(bytes);return Boolean(d&&d.width===asset.width&&d.height===asset.height); }
async function loadAndVerifyAllAssets(runtime: PdStock005VisualR02Runtime) { const loaded:Array<{asset:GalleryAsset;bytes:Buffer}>=[];for(const asset of PD_STOCK_005_VISUAL_R02_RELEASE.gallery){let bytes:Buffer;try{bytes=await(runtime.loadAsset?runtime.loadAsset(asset):loadAuthorizedAsset(PD_STOCK_005_VISUAL_R02_RELEASE.operationId,asset.sha256));}catch{throw new Error(`PD_STOCK_005_R02_ASSET_NOT_READY_${asset.sha256.slice(0,8)}`)}if(!(runtime.verifyAsset??defaultVerifyAsset)(bytes,asset))throw new Error(`PD_STOCK_005_R02_ASSET_IDENTITY_MISMATCH_${asset.sha256.slice(0,8)}`);loaded.push({asset,bytes});}return loaded; }
async function pollState(token:string,fetchImpl:typeof fetch,predicate:(s:State)=>boolean,sleep:(ms:number)=>Promise<void>){let last:State|null=null;for(let i=0;i<8;i++){try{last=await readState(token,fetchImpl);if(predicate(last))return last;}catch{}if(i<7)await sleep(800);}return last;}
function finalGalleryMatches(s:State,ids:readonly string[],hasher=defaultHashText){if(!protectedCoreMatches(s,hasher)||!videosPreservedAtZero(s)||s.images.length!==8)return false;const imgs=[...s.images].sort((a,b)=>Number(a.rank)-Number(b.rank));return PD_STOCK_005_VISUAL_R02_RELEASE.gallery.every((a,i)=>{const im=imgs[i];return String(im?.listing_image_id??"")===ids[i]&&Number(im?.rank)===a.order&&Number(im?.full_width)===a.width&&Number(im?.full_height)===a.height&&String(im?.alt_text??"")===a.altText;});}

export async function verifyPdStock005R02ProtectedState(runtime:PdStock005VisualR02Runtime={}) {
  try { const token=await(runtime.getAccessToken??getValidEtsyAccessToken)(),hasher=runtime.hashText??defaultHashText,state=await readState(token,runtime.fetchImpl??fetch),match=exactPreWriteBaselineMatches(state,hasher),psv=hashOperationRequest(protectedSnapshot(state,hasher));return NextResponse.json({status:match?"PROTECTED_STATE_MATCH":"PROTECTED_STATE_MISMATCH",operationId:PD_STOCK_005_VISUAL_R02_RELEASE.operationId,operationFingerprint:PD_STOCK_005_VISUAL_R02_RELEASE.operationFingerprint,listingId:PD_STOCK_005_VISUAL_R02_RELEASE.listingId,candidateFingerprint:PD_STOCK_005_VISUAL_R02_RELEASE.candidateFingerprint,protectedStateFingerprint:psv,expectedAuthorizationRequestHash:exactPdStock005R02AuthorizationHash(psv),galleryCount:state.images.length,videoCount:state.videos.length,providerReadStatus:state.statuses,scope:PD_STOCK_005_VISUAL_R02_RELEASE.operation,ETSY_WRITE_COUNT:0},{status:match?200:409}); }
  catch { return NextResponse.json({error:"PD_STOCK_005_R02_PROTECTED_STATE_READ_FAILED",ETSY_WRITE_COUNT:0},{status:502}); }
}

export async function handlePdStock005R02Release(psv:string,authorizationRequestHash:string,request:Request,runtime:PdStock005VisualR02Runtime={}) {
  const auth=writeAuthorizationError(request);if(auth)return auth;
  const protectedSha=psv.trim().toLowerCase(),authHash=authorizationRequestHash.trim().toLowerCase();
  if(!SHA256.test(protectedSha)||!SHA256.test(authHash))return NextResponse.json({error:"PD_STOCK_005_R02_EXACT_AUTHORIZATION_BINDING_REQUIRED",ETSY_WRITE_COUNT:0},{status:409});
  const expectedAuthHash=exactPdStock005R02AuthorizationHash(protectedSha);if(!secureEqual(expectedAuthHash,authHash))return NextResponse.json({error:"PD_STOCK_005_R02_AUTHORIZATION_REQUEST_HASH_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  const body=exactPdStock005R02ReleaseBody(protectedSha),repository=runtime.repository??new NeonOperationLedgerRepository(),requestHash=hashOperationRequest(body),existing=await repository.load(PD_STOCK_005_VISUAL_R02_RELEASE.operationId);
  if(existing){if(existing.requestHash!==requestHash)return NextResponse.json({error:"OPERATION_ID_PAYLOAD_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});if(existing.status==="SUCCEEDED")return NextResponse.json({status:"REPLAY",operationId:existing.operationId,receipt:existing.receipt,ETSY_WRITE_COUNT:0});return NextResponse.json({error:"PD_STOCK_005_R02_ALREADY_CLAIMED_DO_NOT_RETRY",ledgerStatus:existing.status,receipt:existing.receipt,ETSY_WRITE_COUNT:Number(existing.receipt?.ETSY_WRITE_COUNT)||0},{status:existing.status==="RECONCILIATION_REQUIRED"?202:409});}
  let staged:Awaited<ReturnType<typeof loadAndVerifyAllAssets>>;try{staged=await loadAndVerifyAllAssets(runtime);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"PD_STOCK_005_R02_ASSET_ERROR",ETSY_WRITE_COUNT:0},{status:409});}
  const fetchImpl=runtime.fetchImpl??fetch,token=await(runtime.getAccessToken??getValidEtsyAccessToken)(),hasher=runtime.hashText??defaultHashText;let before:State;try{before=await readState(token,fetchImpl);}catch{return NextResponse.json({error:"PD_STOCK_005_R02_PREREAD_FAILED",ETSY_WRITE_COUNT:0},{status:502});}
  if(!exactPreWriteBaselineMatches(before,hasher))return NextResponse.json({error:"PD_STOCK_005_R02_PROTECTED_STATE_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});const actualPsv=hashOperationRequest(protectedSnapshot(before,hasher));if(!secureEqual(actualPsv,protectedSha))return NextResponse.json({error:"PD_STOCK_005_R02_FRESH_PSV_FINGERPRINT_MISMATCH",actualProtectedStateFingerprint:actualPsv,ETSY_WRITE_COUNT:0},{status:409});
  const begun=await beginOperation(repository,PD_STOCK_005_VISUAL_R02_RELEASE.operationId,body,runtime.now?.()??new Date().toISOString());if(begun.status==="REPLAY")return NextResponse.json({error:"PD_STOCK_005_R02_ALREADY_CLAIMED_DO_NOT_RETRY",ETSY_WRITE_COUNT:0},{status:409});
  const bySha=new Map(staged.map(e=>[e.asset.sha256,e.bytes])),uploadedIds:string[]=[];let confirmedWrites=0,writeAttempts=0;const imagesUrl=`https://api.etsy.com/v3/application/shops/${PD_STOCK_005_VISUAL_R02_RELEASE.shopId}/listings/${PD_STOCK_005_VISUAL_R02_RELEASE.listingId}/images`;
  for(const asset of PD_STOCK_005_VISUAL_R02_RELEASE.gallery){const bytes=bySha.get(asset.sha256)!;const form=new FormData();form.set("image",new File([new Uint8Array(bytes)],asset.fileName,{type:asset.mimeType}),asset.fileName);form.set("rank",String(asset.order));form.set("overwrite","true");form.set("alt_text",asset.altText);let response:Response;writeAttempts++;try{response=await fetchImpl(imagesUrl,{method:"POST",headers:multipartHeaders(token),body:form,cache:"no-store"});}catch{await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:`GALLERY_${asset.order}_RESPONSE_AMBIGUOUS`,receipt:{uploadedIds,ETSY_WRITE_COUNT:confirmedWrites,ETSY_WRITE_ATTEMPT_COUNT:writeAttempts}});return NextResponse.json({error:"PD_STOCK_005_R02_GALLERY_UPLOAD_AMBIGUOUS_DO_NOT_RETRY",uploadedIds,ETSY_WRITE_COUNT:confirmedWrites,ETSY_WRITE_ATTEMPT_COUNT:writeAttempts},{status:202});}const value=await json(response),imageId=isRec(value)?Number(value.listing_image_id):NaN;if(!response.ok||!Number.isSafeInteger(imageId)||imageId<1){const reconcile=confirmedWrites>0||response.status>=500;await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,reconcile?"RECONCILIATION_REQUIRED":"FAILED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:`GALLERY_${asset.order}_REJECTED_OR_UNVERIFIED`,receipt:{uploadedIds,providerStatus:response.status,ETSY_WRITE_COUNT:confirmedWrites,ETSY_WRITE_ATTEMPT_COUNT:writeAttempts}});return NextResponse.json({error:reconcile?"PD_STOCK_005_R02_GALLERY_PARTIAL_DO_NOT_RETRY":"PD_STOCK_005_R02_GALLERY_REJECTED",providerStatus:response.status,uploadedIds,ETSY_WRITE_COUNT:confirmedWrites,ETSY_WRITE_ATTEMPT_COUNT:writeAttempts},{status:reconcile?202:502});}confirmedWrites++;uploadedIds.push(String(imageId));}
  const sleep=runtime.sleep??((ms:number)=>new Promise<void>(r=>setTimeout(r,ms))),final=await pollState(token,fetchImpl,s=>finalGalleryMatches(s,uploadedIds,hasher),sleep);if(!final||!finalGalleryMatches(final,uploadedIds,hasher)){await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"FINAL_READBACK_UNVERIFIED",receipt:{uploadedIds,expectedVideoCount:0,ETSY_WRITE_COUNT:confirmedWrites,ETSY_WRITE_ATTEMPT_COUNT:writeAttempts}});return NextResponse.json({error:"PD_STOCK_005_R02_FINAL_READBACK_FAILED_DO_NOT_RETRY",uploadedIds,ETSY_WRITE_COUNT:confirmedWrites,ETSY_WRITE_ATTEMPT_COUNT:writeAttempts},{status:202});}
  const done=await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"SUCCEEDED",runtime.now?.()??new Date().toISOString(),{receipt:{authorizationId:PD_STOCK_005_VISUAL_R02_RELEASE.authorizationId,operationFingerprint:PD_STOCK_005_VISUAL_R02_RELEASE.operationFingerprint,candidateFingerprint:PD_STOCK_005_VISUAL_R02_RELEASE.candidateFingerprint,uploadedIds,videoCount:0,ETSY_WRITE_COUNT:confirmedWrites,ETSY_WRITE_ATTEMPT_COUNT:writeAttempts,verified:{galleryExactOrdered8:"PASS",altTextExact8:"PASS",videoCountPreservedZero:"PASS",title:"PRESERVED",description:"PRESERVED",tags:"PRESERVED",price:"PRESERVED",taxonomy:"PRESERVED",quantity:"PRESERVED",buyerFiles:"PRESERVED",attributes:"PRESERVED"},readBackStatus:final.statuses}});
  for(const asset of PD_STOCK_005_VISUAL_R02_RELEASE.gallery){try{await(runtime.clearAsset?runtime.clearAsset(asset):clearAuthorizedAsset(PD_STOCK_005_VISUAL_R02_RELEASE.operationId,asset.sha256));}catch{}}
  return NextResponse.json({status:"UPDATED_AND_VERIFIED",mode:"WRITE_ONCE",operationId:done.operationId,requestHash:done.requestHash,ledgerStatus:done.status,uploadedIds,videoCount:0,ETSY_WRITE_COUNT:confirmedWrites,ETSY_WRITE_ATTEMPT_COUNT:writeAttempts,receipt:done.receipt});
}
