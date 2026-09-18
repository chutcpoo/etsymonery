import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { fetchEtsyReadWithRetry } from "./etsy-http";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { clearAuthorizedAsset, loadAuthorizedAsset } from "./authorized-operation-asset-store";
import {
  beginOperation,
  hashOperationRequest,
  NeonOperationLedgerRepository,
  recordOperationResult,
  type OperationLedgerRepository
} from "./operation-ledger";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;

export const PD_STOCK_005_R03_RECOVERY_R02 = Object.freeze({
  operation: "RECOVER_UPLOAD_ZIP_THEN_PATCH_TITLE_TAGS",
  operationId: "PD-STOCK-005-LIVE-CATALOG-V3-R03-RECOVERY-R02-001",
  parentOperationId: "PD-STOCK-005-LIVE-CATALOG-V3-R03-API-MINIMAL-001",
  productId: "PD-STOCK-005",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4561821192",
  candidateId: "ETSY-LIVE-CATALOG-V3-PD-STOCK-005-V1-R03-RECOVERY-R02-20260918",
  candidateFingerprint: "e94267af7c2c2276002ba297a0aeb0f4bb446f1d83a645828bc32b489dc09efb",
  buildId: "ETSY-LIVE-CATALOG-V3-PD-STOCK-005-R03-RECOVERY-R02-BUILD-20260918",
  buildFingerprint: "b8be3087868484f21ded40725c5f2ef62806127a070856fc3c227d014e409699",
  acceptanceCriteriaId: "ETSY-AC-PD-STOCK-005-R03-RECOVERY-R02-V1",
  acceptanceCriteriaSha256: "0308e9c2db7f8b44323d62b41a7574a61096eed2bfa29ca946fe5bc0b5547a38",
  protectedStateFingerprint: "12debe0530e3123b5d95ddbf4b55e1ea9bd2b4cc2b7fc6c88d4b43084a6920b1",
  freezeSha256: "04b562172fa06b290332531edd42ac20d811612fbd1046fedad2dc3115d21421",
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
    ],
    zip: {
      fileName: "PD-STOCK-005_V1_Inventory_Waste_Tracker_B03.zip",
      targetSizeBytes: 62008,
      sha256: "c62011b1cbd09e3a4de910e0a9fe86e01d5a688dd05f1e2df16c0f8f536fd8ed",
      googleDriveId: "1rQ9AwR63_FwdRutwMUmfcqVNmoRUvSSv",
      mimeType: "application/zip",
      rank: 5
    }
  }
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
    [8580511217,1,2500,2000,"Restaurant and cafe inventory and waste tracker hero showing a real Excel workbook Start Here preview with count, waste and reorder workflow and eight workbook tabs."],
    [8532646756,2,2500,2000,"Inventory tracker gallery image listing the eight workbook tabs—Start Here, Item Master, Daily Count, Waste Log, Reorder Plan, Suppliers, Weekly Summary and Blank Tracker—beside a real workbook preview."],
    [8580511355,3,2500,2000,"Real Daily Count worksheet preview showing opening, received, used, waste, calculated closing, physical closing and variance fields for inventory review."],
    [8580511435,4,2500,2000,"Real Waste Log worksheet preview showing quantity wasted, reason, unit cost, waste cost and recorded-by fields for restaurant and cafe inventory tracking."],
    [8532646976,5,2500,2000,"Real Reorder Plan worksheet preview showing current stock, reorder level, suggested order quantity, unit cost, estimated cost and order status fields."],
    [8532647054,6,2500,2000,"Real Item Master and Suppliers worksheet previews showing par and reorder settings, primary supplier details, lead time and supplier status fields."],
    [8580511641,7,2500,2000,"Real Weekly Summary worksheet preview showing stock value, purchases, usage value, waste cost, waste percentage and items reordered for manager review."],
    [8532647190,8,2500,2000,"Digital download overview showing a real Excel workbook preview and A4 printable PDF cover, with A4 and US Letter PDFs, Quick Start, and Read Me plus License files included."]
  ] as readonly (readonly (number|string)[])[],
  video: [842820647,1920,1080,"active"] as const,
  protectedFiles: [
    [1509497762118,1,"Inventory_Waste_A4.pdf",24247,"application/pdf"],
    [1509497762234,2,"Inventory_Waste_US_Letter.pdf",23237,"application/pdf"],
    [1515946927296,3,"PD-STOCK-005_V1_Inventory_Waste_Quick_Start_B01.pdf",6448,"application/pdf"],
    [1510700238185,4,"Inventory_Waste_Read_Me_License.pdf",4242,"application/pdf"]
  ] as readonly (readonly (number|string)[])[]
});

type Rec = Record<string, unknown>;
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
  loadAsset?: () => Promise<Buffer>;
  clearAsset?: () => Promise<void>;
  verifyAsset?: (bytes: Buffer) => boolean;
  now?: () => string;
};

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const results = (v: unknown) => isRec(v) && Array.isArray(v.results) ? v.results.filter(isRec) : null;
const hashText = (v: unknown) => createHash("sha256").update(typeof v === "string" ? v.normalize("NFC") : "", "utf8").digest("hex");
const secureEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
async function json(response: Response) {
  const t = await response.text();
  try { return t ? JSON.parse(t) as unknown : {}; } catch { return {}; }
}
function multipartHeaders(token: string) {
  const headers = etsyApiHeaders(token);
  delete headers["content-type"];
  return headers;
}
function inventorySku(state: State) {
  const rows = Array.isArray(state.inventory.results) ? state.inventory.results.filter(isRec) : [];
  const match = rows.find(x => String(x.listing_id) === PD_STOCK_005_R03_RECOVERY_R02.listingId);
  if (!match || !isRec(match.inventory) || !Array.isArray(match.inventory.products)) return "";
  const product = match.inventory.products.filter(isRec)[0];
  return product && typeof product.sku === "string" ? product.sku : "";
}
function personalizationCount(state: State) {
  const q = state.personalization.personalization_questions;
  return Array.isArray(q) ? q.length : 0;
}
function galleryRows(state: State) {
  return [...state.images].sort((a,b)=>Number(a.rank)-Number(b.rank))
    .map(x=>[Number(x.listing_image_id),Number(x.rank),Number(x.full_width),Number(x.full_height),String(x.alt_text??"")]);
}
function videoRow(state: State) {
  const v = [...state.videos].sort((a,b)=>Number(a.video_id)-Number(b.video_id))[0];
  return v ? [Number(v.video_id),Number(v.width),Number(v.height),String(v.video_state??"")] : [];
}
function fileRows(state: State) {
  return [...state.files].sort((a,b)=>Number(a.rank)-Number(b.rank))
    .map(x=>[Number(x.listing_file_id),Number(x.rank),String(x.filename),Number(x.size_bytes),String(x.filetype)]);
}
async function readState(token: string, fetchImpl: typeof fetch): Promise<State> {
  const base = "https://api.etsy.com/v3/application";
  const listingId = PD_STOCK_005_R03_RECOVERY_R02.listingId;
  const shopId = PD_STOCK_005_R03_RECOVERY_R02.shopId;
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
  if(!by.listing.response.ok||!isRec(by.listing.value)||!by.images.response.ok||!by.attributes.response.ok||!by.files.response.ok||!by.videos.response.ok||!by.inventory.response.ok||!by.personalization.response.ok||!images||!attributes||!files||!videos||!isRec(by.inventory.value)||!isRec(by.personalization.value)) {
    throw new Error("PD_STOCK_005_R03_RECOVERY_R02_READBACK_FAILED");
  }
  return {listing:by.listing.value,images,attributes,files,videos,inventory:by.inventory.value,personalization:by.personalization.value,statuses:Object.fromEntries(entries.map(x=>[x.name,x.response.status]))};
}
function protectedCoreMatches(state: State) {
  const l = state.listing, p = isRec(l.price) ? l.price : {};
  return String(l.listing_id)===PD_STOCK_005_R03_RECOVERY_R02.listingId
    && String(l.shop_id)===PD_STOCK_005_R03_RECOVERY_R02.shopId
    && String(l.state).toLowerCase()==="active"
    && hashText(l.description)===PD_STOCK_005_R03_RECOVERY_R02.current.descriptionSha256
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
function currentMetadataMatches(state: State) {
  return state.listing.title===PD_STOCK_005_R03_RECOVERY_R02.current.title
    && JSON.stringify(state.listing.tags)===JSON.stringify(PD_STOCK_005_R03_RECOVERY_R02.current.tags);
}
function targetMetadataMatches(state: State) {
  return state.listing.title===PD_STOCK_005_R03_RECOVERY_R02.target.title
    && JSON.stringify(state.listing.tags)===JSON.stringify(PD_STOCK_005_R03_RECOVERY_R02.target.tags);
}
function beforeFilesMatch(state: State) {
  return JSON.stringify(fileRows(state))===JSON.stringify(EXPECTED.protectedFiles);
}
function afterUploadFilesMatch(state: State) {
  const rows=fileRows(state), z=PD_STOCK_005_R03_RECOVERY_R02.target.zip;
  return rows.length===5
    && JSON.stringify(rows.slice(0,4))===JSON.stringify(EXPECTED.protectedFiles)
    && Number(rows[4][0])>0
    && Number(rows[4][0])!==1509980203922
    && rows[4][1]===5
    && rows[4][2]===z.fileName
    && rows[4][3]===z.targetSizeBytes
    && rows[4][4]===z.mimeType;
}
function verifyAsset(bytes: Buffer) {
  const z=PD_STOCK_005_R03_RECOVERY_R02.target.zip;
  return bytes.length===z.targetSizeBytes && createHash("sha256").update(bytes).digest("hex")===z.sha256;
}
function authError(request: Request) {
  const expected=process.env.ETSY_B01_WRITE_TOKEN?.trim()??"", supplied=request.headers.get(WRITE_HEADER)?.trim()??"";
  if(!expected) return NextResponse.json({error:"PD_STOCK_005_R03_RECOVERY_R02_WRITE_AUTH_NOT_CONFIGURED",ETSY_WRITE_COUNT:0},{status:503});
  if(!supplied||!secureEqual(supplied,expected)) return NextResponse.json({error:"PD_STOCK_005_R03_RECOVERY_R02_UNAUTHORIZED",ETSY_WRITE_COUNT:0},{status:401});
  return null;
}

export function exactPdStock005R03RecoveryR02Body(authorizationId: string, protectedStateFingerprint: string) {
  return {
    operation: PD_STOCK_005_R03_RECOVERY_R02.operation,
    operationId: PD_STOCK_005_R03_RECOVERY_R02.operationId,
    authorizationId: authorizationId.trim(),
    protectedStateFingerprint: protectedStateFingerprint.trim().toLowerCase(),
    parentOperationId: PD_STOCK_005_R03_RECOVERY_R02.parentOperationId,
    productId: PD_STOCK_005_R03_RECOVERY_R02.productId,
    productVersion: PD_STOCK_005_R03_RECOVERY_R02.productVersion,
    shopId: PD_STOCK_005_R03_RECOVERY_R02.shopId,
    listingId: PD_STOCK_005_R03_RECOVERY_R02.listingId,
    candidateId: PD_STOCK_005_R03_RECOVERY_R02.candidateId,
    candidateFingerprint: PD_STOCK_005_R03_RECOVERY_R02.candidateFingerprint,
    buildId: PD_STOCK_005_R03_RECOVERY_R02.buildId,
    buildFingerprint: PD_STOCK_005_R03_RECOVERY_R02.buildFingerprint,
    acceptanceCriteriaId: PD_STOCK_005_R03_RECOVERY_R02.acceptanceCriteriaId,
    acceptanceCriteriaSha256: PD_STOCK_005_R03_RECOVERY_R02.acceptanceCriteriaSha256,
    freezeSha256: PD_STOCK_005_R03_RECOVERY_R02.freezeSha256,
    target: {
      title: PD_STOCK_005_R03_RECOVERY_R02.target.title,
      tags: [...PD_STOCK_005_R03_RECOVERY_R02.target.tags],
      zip: {...PD_STOCK_005_R03_RECOVERY_R02.target.zip}
    },
    protectedQuickStartListingFileId: 1515946927296
  };
}

export async function verifyPdStock005R03RecoveryR02ProtectedState(runtime: Runtime={}) {
  try {
    const token=await(runtime.getAccessToken??getValidEtsyAccessToken)();
    const state=await readState(token,runtime.fetchImpl??fetch);
    const match=protectedCoreMatches(state)&&currentMetadataMatches(state)&&beforeFilesMatch(state);
    return NextResponse.json({
      status:match?"PROTECTED_STATE_MATCH":"PROTECTED_STATE_MISMATCH",
      operationId:PD_STOCK_005_R03_RECOVERY_R02.operationId,
      parentOperationId:PD_STOCK_005_R03_RECOVERY_R02.parentOperationId,
      candidateFingerprint:PD_STOCK_005_R03_RECOVERY_R02.candidateFingerprint,
      buildFingerprint:PD_STOCK_005_R03_RECOVERY_R02.buildFingerprint,
      acceptanceCriteriaSha256:PD_STOCK_005_R03_RECOVERY_R02.acceptanceCriteriaSha256,
      freezeSha256:PD_STOCK_005_R03_RECOVERY_R02.freezeSha256,
      protectedStateFingerprint:PD_STOCK_005_R03_RECOVERY_R02.protectedStateFingerprint,
      providerReadStatus:state.statuses,
      buyerFiles:fileRows(state),
      protectedQuickStartListingFileId:1515946927296,
      recoveryScope:"UPLOAD_ZIP_THEN_PATCH_TITLE_TAGS",
      evidenceGaps:{
        buyerFileSha256:"SHA256_NOT_AVAILABLE_FROM_PROVIDER",
        offerDiscount:"NOT_AVAILABLE_FROM_CURRENT_ETSY_API_PATH",
        whatContent:"SELLER_UI_EVIDENCE_BOUND_SEPARATELY"
      },
      ETSY_WRITE_COUNT:0
    },{status:match?200:409});
  } catch {
    return NextResponse.json({error:"PD_STOCK_005_R03_RECOVERY_R02_VERIFICATION_FAILED",ETSY_WRITE_COUNT:0},{status:502});
  }
}

export async function verifyPdStock005R03RecoveryR02PostRelease(runtime: Runtime={}) {
  try {
    const token=await(runtime.getAccessToken??getValidEtsyAccessToken)();
    const state=await readState(token,runtime.fetchImpl??fetch);
    const files=fileRows(state);
    const gallery=galleryRows(state);
    const video=videoRow(state);
    const match=protectedCoreMatches(state)&&targetMetadataMatches(state)&&afterUploadFilesMatch(state);
    const zipId=Number(files[4]?.[0])||0;
    return NextResponse.json({
      status:match?"POST_RELEASE_QC_PASS":"POST_RELEASE_QC_FAIL",
      operationId:PD_STOCK_005_R03_RECOVERY_R02.operationId,
      parentOperationId:PD_STOCK_005_R03_RECOVERY_R02.parentOperationId,
      candidateFingerprint:PD_STOCK_005_R03_RECOVERY_R02.candidateFingerprint,
      buildFingerprint:PD_STOCK_005_R03_RECOVERY_R02.buildFingerprint,
      acceptanceCriteriaSha256:PD_STOCK_005_R03_RECOVERY_R02.acceptanceCriteriaSha256,
      freezeSha256:PD_STOCK_005_R03_RECOVERY_R02.freezeSha256,
      protectedStateFingerprint:PD_STOCK_005_R03_RECOVERY_R02.protectedStateFingerprint,
      providerReadStatus:state.statuses,
      buyerFiles:files,
      gallery,
      video,
      title:state.listing.title,
      tags:state.listing.tags,
      providerFileIds:{quickStart:1515946927296,zip:zipId||null},
      verified:{
        listingActive:String(state.listing.state).toLowerCase()==="active"?"PASS":"FAIL",
        quickStartExact:files.some(x=>x[0]===1515946927296&&x[1]===3&&x[2]==="PD-STOCK-005_V1_Inventory_Waste_Quick_Start_B01.pdf"&&x[3]===6448)?"PASS":"FAIL",
        oldZipAbsent:files.every(x=>x[0]!==1509980203922)?"PASS":"FAIL",
        newZipExact:afterUploadFilesMatch(state)?"PASS":"FAIL",
        titleAndTagsExact:targetMetadataMatches(state)?"PASS":"FAIL",
        protectedCoreExact:protectedCoreMatches(state)?"PASS":"FAIL",
        gallery8OrderAltTextExact:JSON.stringify(gallery)===JSON.stringify(EXPECTED.gallery)?"PASS":"FAIL",
        videoExact:JSON.stringify(video)===JSON.stringify(EXPECTED.video)?"PASS":"FAIL"
      },
      evidenceGaps:{
        buyerFileSha256:"SHA256_NOT_AVAILABLE_FROM_PROVIDER_READBACK",
        offerDiscount:"NOT_AVAILABLE_FROM_CURRENT_ETSY_API_PATH",
        whatContent:"SELLER_UI_EVIDENCE_BOUND_SEPARATELY",
        productTruth:"CANONICAL_GOOGLE_DRIVE_EVIDENCE_BOUND_SEPARATELY"
      },
      ETSY_WRITE_COUNT:0
    },{status:match?200:409});
  } catch {
    return NextResponse.json({error:"PD_STOCK_005_R03_RECOVERY_R02_POST_RELEASE_QC_READ_FAILED",ETSY_WRITE_COUNT:0},{status:502});
  }
}

export async function handlePdStock005R03RecoveryR02(body: Rec, authorizationRequestHash: string, request: Request, runtime: Runtime={}) {
  if(process.env.PUBLISH_WRITES_ENABLED!=="true") return NextResponse.json({error:"PD_STOCK_005_R03_RECOVERY_R02_WRITES_DISABLED",ETSY_WRITE_COUNT:0},{status:403});
  const ae=authError(request); if(ae) return ae;
  if(process.env.ETSY_SHOP_ID?.trim()!==PD_STOCK_005_R03_RECOVERY_R02.shopId) return NextResponse.json({error:"PD_STOCK_005_R03_RECOVERY_R02_SHOP_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});

  const authorizationId=typeof body.authorizationId==="string"?body.authorizationId.trim():"";
  const protectedStateFingerprint=typeof body.protectedStateFingerprint==="string"?body.protectedStateFingerprint.trim().toLowerCase():"";
  if(!authorizationId||!SHA256.test(protectedStateFingerprint)||protectedStateFingerprint!==PD_STOCK_005_R03_RECOVERY_R02.protectedStateFingerprint||!SHA256.test(authorizationRequestHash)) {
    return NextResponse.json({error:"PD_STOCK_005_R03_RECOVERY_R02_EXACT_AUTHORIZATION_BINDING_REQUIRED",ETSY_WRITE_COUNT:0},{status:409});
  }
  const exact=exactPdStock005R03RecoveryR02Body(authorizationId,protectedStateFingerprint);
  const requestHash=hashOperationRequest(body);
  if(requestHash!==hashOperationRequest(exact)||!secureEqual(requestHash,authorizationRequestHash)) {
    return NextResponse.json({error:"PD_STOCK_005_R03_RECOVERY_R02_AUTHORIZATION_CONTRACT_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  }

  const repo=runtime.repository??new NeonOperationLedgerRepository();
  const existing=await repo.load(PD_STOCK_005_R03_RECOVERY_R02.operationId);
  if(existing) {
    if(existing.requestHash!==requestHash) return NextResponse.json({error:"OPERATION_ID_PAYLOAD_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
    if(existing.status==="SUCCEEDED") return NextResponse.json({status:"REPLAY",receipt:existing.receipt,ETSY_WRITE_COUNT:0});
    return NextResponse.json({error:"PD_STOCK_005_R03_RECOVERY_R02_ALREADY_CLAIMED_DO_NOT_RETRY",ledgerStatus:existing.status,receipt:existing.receipt,ETSY_WRITE_COUNT:Number(existing.receipt?.ETSY_WRITE_COUNT)||0},{status:existing.status==="RECONCILIATION_REQUIRED"?202:409});
  }

  let bytes:Buffer;
  try {
    bytes=await(runtime.loadAsset?runtime.loadAsset():loadAuthorizedAsset(PD_STOCK_005_R03_RECOVERY_R02.parentOperationId,PD_STOCK_005_R03_RECOVERY_R02.target.zip.sha256));
  } catch {
    return NextResponse.json({error:"PD_STOCK_005_R03_RECOVERY_R02_ASSET_NOT_READY",ETSY_WRITE_COUNT:0},{status:409});
  }
  if(!(runtime.verifyAsset??verifyAsset)(bytes)) return NextResponse.json({error:"PD_STOCK_005_R03_RECOVERY_R02_ASSET_IDENTITY_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});

  const token=await(runtime.getAccessToken??getValidEtsyAccessToken)();
  const fetchImpl=runtime.fetchImpl??fetch;
  let state:State;
  try { state=await readState(token,fetchImpl); }
  catch { return NextResponse.json({error:"PD_STOCK_005_R03_RECOVERY_R02_PREREAD_FAILED",ETSY_WRITE_COUNT:0},{status:502}); }
  if(!protectedCoreMatches(state)||!currentMetadataMatches(state)||!beforeFilesMatch(state)) {
    return NextResponse.json({error:"PD_STOCK_005_R03_RECOVERY_R02_PRESTATE_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  }

  const begun=await beginOperation(repo,PD_STOCK_005_R03_RECOVERY_R02.operationId,body,runtime.now?.()??new Date().toISOString());
  if(begun.status!=="STARTED") return NextResponse.json({error:"PD_STOCK_005_R03_RECOVERY_R02_OPERATION_NOT_STARTABLE",ETSY_WRITE_COUNT:0},{status:409});
  const filesUrl=`https://api.etsy.com/v3/application/shops/${PD_STOCK_005_R03_RECOVERY_R02.shopId}/listings/${PD_STOCK_005_R03_RECOVERY_R02.listingId}/files`;
  let confirmed=0, attempts=0, newZipId=0;

  const terminal=async(error:string,recoveryPoint:string,statusCode:number,writeStatus:"CONFIRMED"|"UNRESOLVED_REQUIRES_RECONCILIATION"="CONFIRMED")=>{
    await recordOperationResult(
      repo,begun.record.operationId,begun.record.requestHash,
      statusCode===202?"RECONCILIATION_REQUIRED":"FAILED",
      runtime.now?.()??new Date().toISOString(),
      {recoveryPoint,receipt:{ETSY_WRITE_COUNT:confirmed,ETSY_WRITE_ATTEMPT_COUNT:attempts,ETSY_WRITE_COUNT_STATUS:writeStatus}}
    );
    return NextResponse.json({error,status:statusCode===202?"RECONCILIATION_REQUIRED":"FAILED",ETSY_WRITE_COUNT:confirmed,ETSY_WRITE_ATTEMPT_COUNT:attempts,ETSY_WRITE_COUNT_STATUS:writeStatus},{status:statusCode});
  };

  // W1: upload exact frozen ZIP at rank 5. No delete is authorized in Recovery R02.
  const z=PD_STOCK_005_R03_RECOVERY_R02.target.zip;
  const form=new FormData();
  form.append("file",new File([Uint8Array.from(bytes)],z.fileName,{type:z.mimeType}),z.fileName);
  form.append("name",z.fileName);
  form.append("rank","5");
  attempts++;
  let upload:Response;
  try {
    upload=await fetchImpl(filesUrl,{method:"POST",headers:multipartHeaders(token),body:form,cache:"no-store"});
  } catch {
    return terminal("PD_STOCK_005_R03_RECOVERY_R02_ZIP_UPLOAD_AMBIGUOUS","ZIP_UPLOAD_RESPONSE_AMBIGUOUS",202,"UNRESOLVED_REQUIRES_RECONCILIATION");
  }
  const uploadValue=await json(upload);
  try { state=await readState(token,fetchImpl); }
  catch { return terminal("PD_STOCK_005_R03_RECOVERY_R02_ZIP_UPLOAD_READBACK_FAILED","ZIP_UPLOAD_READBACK_FAILED",202,"UNRESOLVED_REQUIRES_RECONCILIATION"); }
  const uploadVerified=protectedCoreMatches(state)&&currentMetadataMatches(state)&&afterUploadFilesMatch(state);
  if(!upload.ok||upload.status!==201||!uploadVerified) {
    if(uploadVerified) { confirmed=1; return terminal("PD_STOCK_005_R03_RECOVERY_R02_ZIP_UPLOAD_PROVIDER_MISMATCH","ZIP_UPLOAD_PROVIDER_MISMATCH",202,"CONFIRMED"); }
    return terminal("PD_STOCK_005_R03_RECOVERY_R02_ZIP_UPLOAD_NOT_VERIFIED","ZIP_UPLOAD_NOT_VERIFIED",202,"UNRESOLVED_REQUIRES_RECONCILIATION");
  }
  if(isRec(uploadValue)) newZipId=Number(uploadValue.listing_file_id)||0;
  const providerRows=fileRows(state);
  newZipId=newZipId||Number(providerRows[4]?.[0])||0;
  if(!newZipId) return terminal("PD_STOCK_005_R03_RECOVERY_R02_NEW_ZIP_ID_MISSING","ZIP_UPLOAD_ID_MISSING",202,"CONFIRMED");
  confirmed=1;

  // W2: only after exact five-file readback, patch exact frozen title + ordered tags.
  const patchUrl=`https://api.etsy.com/v3/application/shops/${PD_STOCK_005_R03_RECOVERY_R02.shopId}/listings/${PD_STOCK_005_R03_RECOVERY_R02.listingId}`;
  const patchBody=new URLSearchParams({title:PD_STOCK_005_R03_RECOVERY_R02.target.title,tags:PD_STOCK_005_R03_RECOVERY_R02.target.tags.join(",")});
  attempts++;
  let patch:Response;
  try {
    patch=await fetchImpl(patchUrl,{method:"PATCH",headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded"},body:patchBody,cache:"no-store"});
  } catch {
    return terminal("PD_STOCK_005_R03_RECOVERY_R02_LISTING_PATCH_AMBIGUOUS","LISTING_PATCH_RESPONSE_AMBIGUOUS",202,"UNRESOLVED_REQUIRES_RECONCILIATION");
  }
  try { state=await readState(token,fetchImpl); }
  catch { return terminal("PD_STOCK_005_R03_RECOVERY_R02_POST_PATCH_READBACK_FAILED","POST_PATCH_READBACK_FAILED",202,"UNRESOLVED_REQUIRES_RECONCILIATION"); }
  const finalVerified=protectedCoreMatches(state)&&targetMetadataMatches(state)&&afterUploadFilesMatch(state);
  if(!patch.ok||!finalVerified) {
    if(finalVerified) { confirmed=2; return terminal("PD_STOCK_005_R03_RECOVERY_R02_PATCH_PROVIDER_MISMATCH","LISTING_PATCH_PROVIDER_MISMATCH",202,"CONFIRMED"); }
    return terminal("PD_STOCK_005_R03_RECOVERY_R02_POST_PATCH_MISMATCH","POST_PATCH_MISMATCH",202,"UNRESOLVED_REQUIRES_RECONCILIATION");
  }
  confirmed=2;

  const receipt={
    authorizationId,
    parentOperationId:PD_STOCK_005_R03_RECOVERY_R02.parentOperationId,
    candidateFingerprint:PD_STOCK_005_R03_RECOVERY_R02.candidateFingerprint,
    buildFingerprint:PD_STOCK_005_R03_RECOVERY_R02.buildFingerprint,
    acceptanceCriteriaSha256:PD_STOCK_005_R03_RECOVERY_R02.acceptanceCriteriaSha256,
    freezeSha256:PD_STOCK_005_R03_RECOVERY_R02.freezeSha256,
    protectedStateFingerprint,
    providerFileIds:{quickStart:1515946927296,zip:newZipId},
    ETSY_WRITE_COUNT:2,
    ETSY_WRITE_ATTEMPT_COUNT:2,
    ETSY_WRITE_COUNT_STATUS:"CONFIRMED",
    status:"UPDATED_AND_VERIFIED"
  };
  await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,"SUCCEEDED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"RECOVERY_VERIFIED",receipt});
  try { await(runtime.clearAsset?runtime.clearAsset():clearAuthorizedAsset(PD_STOCK_005_R03_RECOVERY_R02.parentOperationId,z.sha256)); } catch {}
  return NextResponse.json({status:"UPDATED_AND_VERIFIED",operationId:PD_STOCK_005_R03_RECOVERY_R02.operationId,receipt,ETSY_WRITE_COUNT:2,ETSY_WRITE_ATTEMPT_COUNT:2,ETSY_WRITE_COUNT_STATUS:"CONFIRMED"});
}
