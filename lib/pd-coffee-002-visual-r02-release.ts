import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { beginOperation, hashOperationRequest, NeonOperationLedgerRepository, recordOperationResult, type OperationLedgerRepository } from "./operation-ledger";
import { clearAuthorizedAsset, loadAuthorizedAsset } from "./authorized-operation-asset-store";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;

export const PD_COFFEE_002_EXPECTED_DESCRIPTION = `Run every coffee shop opening and closing shift with fewer missed tasks using this pre-filled, editable 8-tab operations toolkit for Excel, Google Sheets and print.

QUICK FACTS
• 1 ZIP containing the editable XLSX workbook + 4 PDFs
• Workbook: 8 editable tabs
• PDFs: A4, US Letter, Quick Start, and Read Me/License
• Pre-filled tasks you can customize for your own shop
• Instant digital download — no physical item

WORKBOOK TABS
Start Here | Opening | Closing | Brew & Prep | Cleaning | Stock & Waste | Cash & Handoff | Blank Checklist

WHAT THIS HELPS YOU DO
• Organize repeatable opening and closing routines
• Assign owners, target times, status and notes
• Track brew prep, cleaning, stock, waste and shift handoff
• Give new or existing staff a clearer daily workflow
• Print clean A4 or US Letter copies when paper is easier

HOW TO USE
Download and unzip the ZIP file first. Open the included XLSX workbook in Microsoft Excel, or upload it to Google Drive and open it with Google Sheets. Review the Start Here tab, replace the sample content with your own procedures, then test the workflow with your team before daily use.

IMPORTANT DOWNLOAD NOTE
Etsy’s app does not currently download digital purchases. After checkout, sign in to Etsy.com using a mobile browser or computer, then go to Your account > Purchases and reviews > Download Files. A desktop or laptop is recommended for first-time spreadsheet setup.

PLEASE NOTE
• PDF files are print-ready and are not text-editable.
• Results depend on the buyer’s own data and procedures.
• This is an operational planning tool, not accounting, legal, HR, or food-safety advice.
• Confirm all tasks against your equipment, staffing, local rules and approved procedures.

LICENSE
Single-business internal-use license. You may edit and print the files and share working copies with staff inside the purchasing business. You may not resell, redistribute, sublicense, upload publicly, or give the source files to another business.

CREATION DISCLOSURE
This original digital toolkit was designed by PoonthaiDigital with AI-assisted drafting and visual support, then manually edited, tested, and quality-checked.

Need help after purchase? Message PoonthaiDigital through Etsy with the filename, device or app used, and a screenshot.`;

export const PD_COFFEE_002_VISUAL_R02_RELEASE = Object.freeze({
  operation: "REPLACE_GALLERY_8_ALT_TEXT_8_PRESERVE_VIDEO_1_ONLY",
  operationId: "PD-COFFEE-002-VISUAL-R02-RELEASE-001",
  operationFingerprint: "cc9c3ca0ff12e8b421f1389912b2051a7046199dea0b6b0ed887c75b315eba6a",
  authorizationId: "PD-COFFEE-002-VISUAL-R02-AUTH-20260916-01",
  productId: "PD-COFFEE-002",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4561793463",
  candidateId: "ETSY-VISUAL-PD-COFFEE-002-V1-2026-09-16-R02",
  candidateFingerprint: "3dcd586a4c63ea2dbb99c1a05b2deab5407af7a15a109909ccc617ccc9bb9924",
  buildId: "ETSY-VISUAL-PD-COFFEE-002-BUILD-20260916-R02",
  acceptanceCriteriaId: "PD-COFFEE-002-VISUAL-AC-20260916-R02",
  freezeEvidenceDriveId: "1ec1TX_sE9VSnq7HGOhFF5QEKdEcXOaFQ",
  gallery: [
    { order: 1, fileName: "PD-COFFEE-002_01_HERO_coffee-shop-opening-closing-checklist.jpg", driveId: "116T59aQQLYerOKArQk8tQLS5WAzJkBAB", byteSize: 374358, sha256: "9157e9e34b76fb48d1b91ff10c50914652f5154bb7ecbb14d3a647c86786a08c", width: 2500, height: 2000, mimeType: "image/jpeg", altText: "Coffee shop opening and closing checklist hero showing a real Opening Excel workbook worksheet with verified eight-tab workflow and printable PDF format messaging." },
    { order: 2, fileName: "PD-COFFEE-002_02_WORKFLOW_opening-closing-workflow.jpg", driveId: "1Y-JOcsWZWO3er9-gL0fxPRuAK2dtIj7w", byteSize: 377211, sha256: "3c65863803303c215bd270bdef6bb5ac6779cbffcd6ea6bc23e767d85093d1ab", width: 2500, height: 2000, mimeType: "image/jpeg", altText: "Coffee shop opening and closing workflow showing real Opening and Closing workbook worksheets with area, task, suggested owner, target time, status and notes fields." },
    { order: 3, fileName: "PD-COFFEE-002_03_KEY-WORKSHEET_brew-and-prep.jpg", driveId: "1aPNE80jCLT1AG2TKC2J_HeMTBzpoN-0Q", byteSize: 260962, sha256: "3979ebfe77cbb187ab304510405160bbf89364303697db7f91db214c6d1b01bf", width: 2500, height: 2000, mimeType: "image/jpeg", altText: "Coffee shop Brew & Prep tracker showing a real workbook worksheet with item, unit, opening quantity, prepared, used, waste and closing quantity fields." },
    { order: 4, fileName: "PD-COFFEE-002_04_KEY-WORKSHEET_stock-and-waste.jpg", driveId: "1L4aQICEy9cF1s9ztbuqZO_yLfEU2CTfp", byteSize: 277699, sha256: "d1f04e0cb0f7556a32daba74c6fac3ecbc8cd510a7876b5fe7e3e222d88d74ed", width: 2500, height: 2000, mimeType: "image/jpeg", altText: "Coffee shop Stock & Waste tracker showing a real workbook worksheet with opening, received, used, waste, closing and reorder level fields." },
    { order: 5, fileName: "PD-COFFEE-002_05_WORKFLOW_cleaning-checklist.jpg", driveId: "1LZUub7Nhg8TY-4lBBBj_DAFbCBu_1LCP", byteSize: 349687, sha256: "e082b9ef637a1b29a8e5215ec687f4d2a2505fde0d4c3468bf45b595b9f8483b", width: 2500, height: 2000, mimeType: "image/jpeg", altText: "Coffee shop cleaning workflow showing a real Cleaning workbook worksheet with frequency, assigned to, status and verified by fields." },
    { order: 6, fileName: "PD-COFFEE-002_06_INCLUDED_eight-workbook-tabs.jpg", driveId: "1AFgPTUV38E4sKBa3p9KqnEQfRjXceiWE", byteSize: 261920, sha256: "2b8efb018148f4662d768a9c0db78001c2a38a63d256c2e2654dcd6322c9e158", width: 2500, height: 2000, mimeType: "image/jpeg", altText: "Coffee shop toolkit overview showing the real Start Here workbook preview and exact eight tabs: Start Here, Opening, Closing, Brew & Prep, Cleaning, Stock & Waste, Cash & Handoff and Blank Checklist." },
    { order: 7, fileName: "PD-COFFEE-002_07_INCLUDED_workbook-and-checklist-formats.jpg", driveId: "1vVrRWq457GRwrKKS84MmQUrH6HJOv4PN", byteSize: 300897, sha256: "8c089be4ef04e7be44e7c9db2424a47c6c92a02a6df9d51504fd095832bdb62b", width: 2500, height: 2000, mimeType: "image/jpeg", altText: "Coffee shop digital toolkit formats showing real Opening and Blank Checklist workbook previews with Excel workbook, A4 PDF and US Letter PDF format labels." },
    { order: 8, fileName: "PD-COFFEE-002_08_COMPATIBILITY_excel-workbook-digital-download.jpg", driveId: "1PaIC_TW7kritRUoygS54qydb1m8QZ8Gw", byteSize: 246271, sha256: "6be58b2fb2330ed2e07d40f2534b94190ddafd9c639802289d6867229fc65eb3", width: 2500, height: 2000, mimeType: "image/jpeg", altText: "Coffee shop digital download summary showing a real Start Here workbook preview with eight editable tabs, Microsoft Excel workbook, A4 PDF and US Letter PDF included." }
  ] as const,
  preserveVideo: { videoId: 839464137, width: 1080, height: 1920, videoState: "active" }
} as const);

const EXPECTED_BEFORE = Object.freeze({
  state: "active",
  title: "Coffee Shop Opening & Closing Checklist | Excel, Google Sheets, PDF",
  descriptionSha256: "b8c1795fe0f25ccefe8ace4ade3fb21be2f35e00dac443a275b9d434407ccc9f",
  descriptionLength: 2288,
  price: { amount: 890, divisor: 100, currencyCode: "USD" },
  taxonomyId: 12476, quantity: 999, whoMade: "i_did", whenMade: "2020_2026", listingType: "download", returnPolicyId: 1, fileData: "4 PDF, 1 ZIP",
  tags: ["coffee checklist","opening checklist","closing checklist","cafe operations","barista checklist","coffee shop excel","google sheets cafe","cafe manager tool","shift checklist","printable checklist","digital download","small business tool","espresso bar tool"] as readonly string[],
  gallery: [[8473627125,1,2000,2000],[8473627127,2,2000,2000],[8425756584,3,2000,2000],[8425756600,4,2000,2000],[8473627159,5,2000,2000],[8473627137,6,2000,2000],[8425756676,7,2000,2000],[8473627221,8,2000,2000]] as readonly (readonly number[])[],
  buyerFiles: [[1510699088213,1,"Coffee_Shop_Checklist_A4.pdf",21639,"application/pdf"],[1510699088375,2,"Coffee_Shop_Checklist_US_Letter.pdf",21103,"application/pdf"],[1509496615152,3,"Coffee_Shop_Quick_Start.pdf",4615,"application/pdf"],[1510699088555,4,"Coffee_Shop_Read_Me_License.pdf",4223,"application/pdf"],[1509979535618,5,"Coffee_Shop_Checklist.zip",15348,"application/zip"]] as readonly (readonly (string|number)[])[]
} as const);

type Rec = Record<string, unknown>;
type State = { listing: Rec; images: Rec[]; attributes: Rec[]; files: Rec[]; videos: Rec[]; statuses: Record<string, number> };
type GalleryAsset = (typeof PD_COFFEE_002_VISUAL_R02_RELEASE.gallery)[number];
export type PdCoffee002VisualR02Runtime = { fetchImpl?: typeof fetch; getAccessToken?: () => Promise<string>; repository?: OperationLedgerRepository; loadAsset?: (asset: GalleryAsset) => Promise<Buffer>; clearAsset?: (asset: GalleryAsset) => Promise<void>; verifyAsset?: (bytes: Buffer, asset: GalleryAsset) => boolean; sleep?: (ms:number)=>Promise<void>; now?:()=>string };

const isRec=(v:unknown):v is Rec=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const results=(v:unknown)=>isRec(v)&&Array.isArray(v.results)?v.results.filter(isRec):null;
const secureEqual=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
const normalizeDescription=(v:unknown)=>typeof v==="string"?v.normalize("NFC").replaceAll("&gt;",">"):"";
const hashText=(v:unknown)=>createHash("sha256").update(normalizeDescription(v),"utf8").digest("hex");
async function json(response:Response){const text=await response.text();try{return text?JSON.parse(text) as unknown:{}}catch{return {}}}
function multipartHeaders(token:string){const h=etsyApiHeaders(token);delete h["content-type"];return h}
function imageRows(s:State){return [...s.images].sort((a,b)=>Number(a.rank)-Number(b.rank)).map(i=>[Number(i.listing_image_id),Number(i.rank),Number(i.full_width),Number(i.full_height)])}
function fileRows(s:State){return [...s.files].sort((a,b)=>Number(a.rank)-Number(b.rank)).map(f=>[Number(f.listing_file_id),Number(f.rank),String(f.filename??""),Number(f.size_bytes),String(f.filetype??"")])}
function videoRows(s:State){return [...s.videos].map(v=>({videoId:Number(v.video_id),width:Number(v.width),height:Number(v.height),videoState:String(v.video_state??""),videoUrl:String(v.video_url??"")})).sort((a,b)=>a.videoId-b.videoId)}

async function readState(token:string,fetchImpl:typeof fetch):Promise<State>{
  const base="https://api.etsy.com/v3/application",shop=PD_COFFEE_002_VISUAL_R02_RELEASE.shopId,listing=PD_COFFEE_002_VISUAL_R02_RELEASE.listingId;
  const urls={listing:`${base}/listings/${listing}`,images:`${base}/listings/${listing}/images`,attributes:`${base}/shops/${shop}/listings/${listing}/properties`,files:`${base}/shops/${shop}/listings/${listing}/files`,videos:`${base}/listings/${listing}/videos`};
  const entries=await Promise.all(Object.entries(urls).map(async([name,url])=>{const response=await fetchImpl(url,{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"});return {name,response,value:await json(response)}}));
  const by=Object.fromEntries(entries.map(e=>[e.name,e])) as Record<string,{response:Response;value:unknown}>;
  const images=results(by.images.value),attributes=results(by.attributes.value),files=results(by.files.value),videos=results(by.videos.value);
  if(!by.listing.response.ok||!isRec(by.listing.value)||!by.images.response.ok||!by.attributes.response.ok||!by.files.response.ok||!by.videos.response.ok||!images||!attributes||!files||!videos)throw new Error("PD_COFFEE_002_R02_READBACK_FAILED");
  return {listing:by.listing.value,images,attributes,files,videos,statuses:Object.fromEntries(entries.map(e=>[e.name,e.response.status]))};
}

function protectedCoreMatches(s:State){
  const l=s.listing,p=isRec(l.price)?l.price:{};
  if(Number(l.listing_id)!==Number(PD_COFFEE_002_VISUAL_R02_RELEASE.listingId)||Number(l.shop_id)!==Number(PD_COFFEE_002_VISUAL_R02_RELEASE.shopId)||l.state!==EXPECTED_BEFORE.state||l.title!==EXPECTED_BEFORE.title)return false;
  if(hashText(l.description)!==EXPECTED_BEFORE.descriptionSha256||normalizeDescription(l.description).length!==EXPECTED_BEFORE.descriptionLength)return false;
  if(JSON.stringify(l.tags)!==JSON.stringify(EXPECTED_BEFORE.tags))return false;
  if(Number(p.amount)!==EXPECTED_BEFORE.price.amount||Number(p.divisor)!==EXPECTED_BEFORE.price.divisor||p.currency_code!==EXPECTED_BEFORE.price.currencyCode)return false;
  if(Number(l.taxonomy_id)!==EXPECTED_BEFORE.taxonomyId||Number(l.quantity)!==EXPECTED_BEFORE.quantity||l.who_made!==EXPECTED_BEFORE.whoMade||l.when_made!==EXPECTED_BEFORE.whenMade||(l.listing_type??l.type)!==EXPECTED_BEFORE.listingType)return false;
  if(Number(l.return_policy_id)!==EXPECTED_BEFORE.returnPolicyId||l.file_data!==EXPECTED_BEFORE.fileData||s.attributes.length!==0)return false;
  return JSON.stringify(fileRows(s))===JSON.stringify(EXPECTED_BEFORE.buyerFiles);
}
function preservedVideoMatches(s:State){const rows=videoRows(s),v=PD_COFFEE_002_VISUAL_R02_RELEASE.preserveVideo;return rows.length===1&&rows[0].videoId===v.videoId&&rows[0].width===v.width&&rows[0].height===v.height&&rows[0].videoState===v.videoState}
function exactPreWriteBaselineMatches(s:State){return protectedCoreMatches(s)&&JSON.stringify(imageRows(s))===JSON.stringify(EXPECTED_BEFORE.gallery)&&preservedVideoMatches(s)}
function protectedSnapshot(s:State){const l=s.listing,p=isRec(l.price)?l.price:{};return {listingId:Number(l.listing_id),shopId:Number(l.shop_id),state:l.state,title:l.title,descriptionSha256:hashText(l.description),descriptionLength:normalizeDescription(l.description).length,tags:l.tags,price:{amount:Number(p.amount),divisor:Number(p.divisor),currencyCode:p.currency_code},taxonomyId:Number(l.taxonomy_id),quantity:Number(l.quantity),whoMade:l.who_made,whenMade:l.when_made,listingType:l.listing_type??l.type,returnPolicyId:Number(l.return_policy_id),fileData:l.file_data,images:imageRows(s),attributes:s.attributes,files:fileRows(s),videos:videoRows(s).map(({videoId,width,height,videoState})=>({videoId,width,height,videoState}))} as Record<string,unknown>}

export function exactPdCoffee002AuthorizationHash(psv:string){return hashOperationRequest({authorizationId:PD_COFFEE_002_VISUAL_R02_RELEASE.authorizationId,operationId:PD_COFFEE_002_VISUAL_R02_RELEASE.operationId,operationFingerprint:PD_COFFEE_002_VISUAL_R02_RELEASE.operationFingerprint,candidateFingerprint:PD_COFFEE_002_VISUAL_R02_RELEASE.candidateFingerprint,scope:PD_COFFEE_002_VISUAL_R02_RELEASE.operation,protectedStateFingerprint:psv.trim().toLowerCase()})}
export function exactPdCoffee002ReleaseBody(psv:string){return {operation:PD_COFFEE_002_VISUAL_R02_RELEASE.operation,operationId:PD_COFFEE_002_VISUAL_R02_RELEASE.operationId,operationFingerprint:PD_COFFEE_002_VISUAL_R02_RELEASE.operationFingerprint,authorizationId:PD_COFFEE_002_VISUAL_R02_RELEASE.authorizationId,productId:PD_COFFEE_002_VISUAL_R02_RELEASE.productId,productVersion:PD_COFFEE_002_VISUAL_R02_RELEASE.productVersion,shopId:PD_COFFEE_002_VISUAL_R02_RELEASE.shopId,listingId:PD_COFFEE_002_VISUAL_R02_RELEASE.listingId,candidateId:PD_COFFEE_002_VISUAL_R02_RELEASE.candidateId,candidateFingerprint:PD_COFFEE_002_VISUAL_R02_RELEASE.candidateFingerprint,buildId:PD_COFFEE_002_VISUAL_R02_RELEASE.buildId,acceptanceCriteriaId:PD_COFFEE_002_VISUAL_R02_RELEASE.acceptanceCriteriaId,protectedStateFingerprint:psv.trim().toLowerCase(),gallery:PD_COFFEE_002_VISUAL_R02_RELEASE.gallery.map(a=>({...a})),preserveVideo:{...PD_COFFEE_002_VISUAL_R02_RELEASE.preserveVideo}}}

function writeAuthorizationError(request:Request){if(process.env.PUBLISH_WRITES_ENABLED!=="true")return NextResponse.json({error:"PD_COFFEE_002_R02_WRITES_DISABLED",ETSY_WRITE_COUNT:0},{status:403});const expected=process.env.ETSY_B01_WRITE_TOKEN?.trim()??"",supplied=request.headers.get(WRITE_HEADER)?.trim()??"";if(!expected)return NextResponse.json({error:"PD_COFFEE_002_R02_WRITE_AUTH_NOT_CONFIGURED",ETSY_WRITE_COUNT:0},{status:503});if(!supplied||!secureEqual(expected,supplied))return NextResponse.json({error:"PD_COFFEE_002_R02_UNAUTHORIZED",ETSY_WRITE_COUNT:0},{status:401});if((process.env.ETSY_SHOP_ID?.trim()??"")!==PD_COFFEE_002_VISUAL_R02_RELEASE.shopId)return NextResponse.json({error:"PD_COFFEE_002_R02_SHOP_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});return null}
function jpegDimensions(bytes:Buffer){if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return null;let o=2;while(o+9<bytes.length){if(bytes[o]!==0xff){o++;continue}const m=bytes[o+1];o+=2;if(m===0xd8||m===0xd9)continue;if(o+2>bytes.length)return null;const len=bytes.readUInt16BE(o);if(len<2||o+len>bytes.length)return null;const sof=(m>=0xc0&&m<=0xc3)||(m>=0xc5&&m<=0xc7)||(m>=0xc9&&m<=0xcb)||(m>=0xcd&&m<=0xcf);if(sof&&len>=7)return {height:bytes.readUInt16BE(o+3),width:bytes.readUInt16BE(o+5)};o+=len}return null}
function defaultVerifyAsset(bytes:Buffer,asset:GalleryAsset){if(bytes.length!==asset.byteSize||createHash("sha256").update(bytes).digest("hex")!==asset.sha256)return false;const d=jpegDimensions(bytes);return Boolean(d&&d.width===asset.width&&d.height===asset.height)}
async function loadAndVerifyAllAssets(runtime:PdCoffee002VisualR02Runtime){const loaded:Array<{asset:GalleryAsset;bytes:Buffer}>=[];for(const asset of PD_COFFEE_002_VISUAL_R02_RELEASE.gallery){let bytes:Buffer;try{bytes=await(runtime.loadAsset?runtime.loadAsset(asset):loadAuthorizedAsset(PD_COFFEE_002_VISUAL_R02_RELEASE.operationId,asset.sha256))}catch{throw new Error(`PD_COFFEE_002_R02_ASSET_NOT_READY_${asset.sha256.slice(0,8)}`)}if(!(runtime.verifyAsset??defaultVerifyAsset)(bytes,asset))throw new Error(`PD_COFFEE_002_R02_ASSET_IDENTITY_MISMATCH_${asset.sha256.slice(0,8)}`);loaded.push({asset,bytes})}return loaded}
async function pollState(token:string,fetchImpl:typeof fetch,predicate:(s:State)=>boolean,sleep:(ms:number)=>Promise<void>){let last:State|null=null;for(let i=0;i<8;i++){try{last=await readState(token,fetchImpl);if(predicate(last))return last}catch{}if(i<7)await sleep(800)}return last}
function finalGalleryMatches(s:State,ids:readonly string[]){if(!protectedCoreMatches(s)||!preservedVideoMatches(s)||s.images.length!==8)return false;const imgs=[...s.images].sort((a,b)=>Number(a.rank)-Number(b.rank));return PD_COFFEE_002_VISUAL_R02_RELEASE.gallery.every((a,i)=>{const im=imgs[i];return String(im?.listing_image_id??"")===ids[i]&&Number(im?.rank)===a.order&&Number(im?.full_width)===a.width&&Number(im?.full_height)===a.height&&String(im?.alt_text??"")===a.altText})}

export async function verifyPdCoffee002R02ProtectedState(runtime:PdCoffee002VisualR02Runtime={}){try{const token=await(runtime.getAccessToken??getValidEtsyAccessToken)(),state=await readState(token,runtime.fetchImpl??fetch),match=exactPreWriteBaselineMatches(state),psv=hashOperationRequest(protectedSnapshot(state));return NextResponse.json({status:match?"PROTECTED_STATE_MATCH":"PROTECTED_STATE_MISMATCH",operationId:PD_COFFEE_002_VISUAL_R02_RELEASE.operationId,operationFingerprint:PD_COFFEE_002_VISUAL_R02_RELEASE.operationFingerprint,listingId:PD_COFFEE_002_VISUAL_R02_RELEASE.listingId,candidateFingerprint:PD_COFFEE_002_VISUAL_R02_RELEASE.candidateFingerprint,protectedStateFingerprint:psv,expectedAuthorizationRequestHash:exactPdCoffee002AuthorizationHash(psv),galleryCount:state.images.length,videoCount:state.videos.length,preservedVideo:PD_COFFEE_002_VISUAL_R02_RELEASE.preserveVideo,providerReadStatus:state.statuses,scope:PD_COFFEE_002_VISUAL_R02_RELEASE.operation,ETSY_WRITE_COUNT:0},{status:match?200:409})}catch{return NextResponse.json({error:"PD_COFFEE_002_R02_PROTECTED_STATE_READ_FAILED",ETSY_WRITE_COUNT:0},{status:502})}}

export async function handlePdCoffee002R02Release(psv:string,authorizationRequestHash:string,request:Request,runtime:PdCoffee002VisualR02Runtime={}){
  const auth=writeAuthorizationError(request);if(auth)return auth;const protectedSha=psv.trim().toLowerCase(),authHash=authorizationRequestHash.trim().toLowerCase();if(!SHA256.test(protectedSha)||!SHA256.test(authHash))return NextResponse.json({error:"PD_COFFEE_002_R02_EXACT_AUTHORIZATION_BINDING_REQUIRED",ETSY_WRITE_COUNT:0},{status:409});const expectedAuthHash=exactPdCoffee002AuthorizationHash(protectedSha);if(!secureEqual(expectedAuthHash,authHash))return NextResponse.json({error:"PD_COFFEE_002_R02_AUTHORIZATION_REQUEST_HASH_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  const body=exactPdCoffee002ReleaseBody(protectedSha),repository=runtime.repository??new NeonOperationLedgerRepository(),requestHash=hashOperationRequest(body),existing=await repository.load(PD_COFFEE_002_VISUAL_R02_RELEASE.operationId);if(existing){if(existing.requestHash!==requestHash)return NextResponse.json({error:"OPERATION_ID_PAYLOAD_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});if(existing.status==="SUCCEEDED")return NextResponse.json({status:"REPLAY",operationId:existing.operationId,receipt:existing.receipt,ETSY_WRITE_COUNT:0});return NextResponse.json({error:"PD_COFFEE_002_R02_ALREADY_CLAIMED_DO_NOT_RETRY",ledgerStatus:existing.status,receipt:existing.receipt,ETSY_WRITE_COUNT:Number(existing.receipt?.ETSY_WRITE_COUNT)||0},{status:existing.status==="RECONCILIATION_REQUIRED"?202:409})}
  let staged:Awaited<ReturnType<typeof loadAndVerifyAllAssets>>;try{staged=await loadAndVerifyAllAssets(runtime)}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"PD_COFFEE_002_R02_ASSET_ERROR",ETSY_WRITE_COUNT:0},{status:409})}
  const fetchImpl=runtime.fetchImpl??fetch,token=await(runtime.getAccessToken??getValidEtsyAccessToken)();let before:State;try{before=await readState(token,fetchImpl)}catch{return NextResponse.json({error:"PD_COFFEE_002_R02_PREREAD_FAILED",ETSY_WRITE_COUNT:0},{status:502})}if(!exactPreWriteBaselineMatches(before))return NextResponse.json({error:"PD_COFFEE_002_R02_PROTECTED_STATE_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});const actualPsv=hashOperationRequest(protectedSnapshot(before));if(!secureEqual(actualPsv,protectedSha))return NextResponse.json({error:"PD_COFFEE_002_R02_FRESH_PSV_FINGERPRINT_MISMATCH",actualProtectedStateFingerprint:actualPsv,ETSY_WRITE_COUNT:0},{status:409});
  const begun=await beginOperation(repository,PD_COFFEE_002_VISUAL_R02_RELEASE.operationId,body,runtime.now?.()??new Date().toISOString());if(begun.status==="REPLAY")return NextResponse.json({error:"PD_COFFEE_002_R02_ALREADY_CLAIMED_DO_NOT_RETRY",ETSY_WRITE_COUNT:0},{status:409});
  const bySha=new Map(staged.map(e=>[e.asset.sha256,e.bytes])),uploadedIds:string[]=[];let confirmedWrites=0,writeAttempts=0;const imagesUrl=`https://api.etsy.com/v3/application/shops/${PD_COFFEE_002_VISUAL_R02_RELEASE.shopId}/listings/${PD_COFFEE_002_VISUAL_R02_RELEASE.listingId}/images`;
  for(const asset of PD_COFFEE_002_VISUAL_R02_RELEASE.gallery){const bytes=bySha.get(asset.sha256)!;const form=new FormData();form.set("image",new File([new Uint8Array(bytes)],asset.fileName,{type:asset.mimeType}),asset.fileName);form.set("rank",String(asset.order));form.set("overwrite","true");form.set("alt_text",asset.altText);let response:Response;writeAttempts++;try{response=await fetchImpl(imagesUrl,{method:"POST",headers:multipartHeaders(token),body:form,cache:"no-store"})}catch{await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:`GALLERY_${asset.order}_RESPONSE_AMBIGUOUS`,receipt:{uploadedIds,ETSY_WRITE_COUNT:confirmedWrites,ETSY_WRITE_ATTEMPT_COUNT:writeAttempts}});return NextResponse.json({error:"PD_COFFEE_002_R02_GALLERY_UPLOAD_AMBIGUOUS_DO_NOT_RETRY",uploadedIds,ETSY_WRITE_COUNT:confirmedWrites,ETSY_WRITE_ATTEMPT_COUNT:writeAttempts},{status:202})}const value=await json(response),imageId=isRec(value)?Number(value.listing_image_id):NaN;if(!response.ok||!Number.isSafeInteger(imageId)||imageId<1){const reconcile=confirmedWrites>0||response.status>=500;await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,reconcile?"RECONCILIATION_REQUIRED":"FAILED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:`GALLERY_${asset.order}_REJECTED_OR_UNVERIFIED`,receipt:{uploadedIds,providerStatus:response.status,ETSY_WRITE_COUNT:confirmedWrites,ETSY_WRITE_ATTEMPT_COUNT:writeAttempts}});return NextResponse.json({error:reconcile?"PD_COFFEE_002_R02_GALLERY_PARTIAL_DO_NOT_RETRY":"PD_COFFEE_002_R02_GALLERY_REJECTED",providerStatus:response.status,uploadedIds,ETSY_WRITE_COUNT:confirmedWrites,ETSY_WRITE_ATTEMPT_COUNT:writeAttempts},{status:reconcile?202:502})}confirmedWrites++;uploadedIds.push(String(imageId))}
  const sleep=runtime.sleep??((ms:number)=>new Promise<void>(r=>setTimeout(r,ms))),final=await pollState(token,fetchImpl,s=>finalGalleryMatches(s,uploadedIds),sleep);if(!final||!finalGalleryMatches(final,uploadedIds)){await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"FINAL_READBACK_UNVERIFIED",receipt:{uploadedIds,preservedVideoId:PD_COFFEE_002_VISUAL_R02_RELEASE.preserveVideo.videoId,ETSY_WRITE_COUNT:confirmedWrites,ETSY_WRITE_ATTEMPT_COUNT:writeAttempts}});return NextResponse.json({error:"PD_COFFEE_002_R02_FINAL_READBACK_FAILED_DO_NOT_RETRY",uploadedIds,ETSY_WRITE_COUNT:confirmedWrites,ETSY_WRITE_ATTEMPT_COUNT:writeAttempts},{status:202})}
  const done=await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"SUCCEEDED",runtime.now?.()??new Date().toISOString(),{receipt:{authorizationId:PD_COFFEE_002_VISUAL_R02_RELEASE.authorizationId,operationFingerprint:PD_COFFEE_002_VISUAL_R02_RELEASE.operationFingerprint,candidateFingerprint:PD_COFFEE_002_VISUAL_R02_RELEASE.candidateFingerprint,uploadedIds,preservedVideoId:PD_COFFEE_002_VISUAL_R02_RELEASE.preserveVideo.videoId,ETSY_WRITE_COUNT:confirmedWrites,ETSY_WRITE_ATTEMPT_COUNT:writeAttempts,verified:{galleryExactOrdered8:"PASS",altTextExact8:"PASS",videoPreservedExact1:"PASS",title:"PRESERVED",description:"PRESERVED",tags:"PRESERVED",price:"PRESERVED",taxonomy:"PRESERVED",quantity:"PRESERVED",buyerFiles:"PRESERVED",attributes:"PRESERVED"},readBackStatus:final.statuses}});
  for(const asset of PD_COFFEE_002_VISUAL_R02_RELEASE.gallery){try{await(runtime.clearAsset?runtime.clearAsset(asset):clearAuthorizedAsset(PD_COFFEE_002_VISUAL_R02_RELEASE.operationId,asset.sha256))}catch{}}
  return NextResponse.json({status:"UPDATED_AND_VERIFIED",mode:"WRITE_ONCE",operationId:done.operationId,requestHash:done.requestHash,ledgerStatus:done.status,uploadedIds,preservedVideoId:PD_COFFEE_002_VISUAL_R02_RELEASE.preserveVideo.videoId,ETSY_WRITE_COUNT:confirmedWrites,ETSY_WRITE_ATTEMPT_COUNT:writeAttempts,receipt:done.receipt});
}
