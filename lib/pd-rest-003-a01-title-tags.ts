import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { beginOperation, hashOperationRequest, NeonOperationLedgerRepository, recordOperationResult, type OperationLedgerRepository } from "./operation-ledger";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;
const AUTHORIZATION_ID_ENV = "ETSY_PD_REST_003_A01_AUTHORIZATION_ID";
const REQUEST_SHA_ENV = "ETSY_PD_REST_003_A01_REQUEST_SHA256";

export const PD_REST_003_A01 = Object.freeze({
  operation: "UPDATE_ACTIVE_LISTING_TITLE_TAGS_ONLY",
  operationId: "PD-REST-003-A01-TITLE-TAGS-001",
  productId: "PD-REST-003",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4561819638",
  candidateId: "ETSY-OPT-RC-PD-REST-003-V1-2026-09-10-A",
  candidateFingerprint: "ff711a57a61d2a9d289400380d5a5c0f4120e9dab08f90553f0bb00958f6a1e7",
  buildId: "ETSY-OPT-RC-PD-REST-003-BUILD-20260910-A01",
  buildFingerprint: "635dafc06cc7daf4b1a531bfa6ff26a72d67eeac728325d682c93e75f20a4bfd",
  acceptanceCriteriaId: "ETSY-OPT-RC-PD-REST-003-AC-20260910-A01",
  acceptanceCriteriaSha256: "250d115f35bbb13546ee9ccf5213c8ba24c8fd710c295088bf230315517eaa3f",
  protectedStateBaselineSha256: "13f6c3584b6a054276d0419f489f0c40056cf3798d01706ea498cf94221b8555",
  title: "Restaurant Opening & Closing Checklist | Daily Operations, Prep, Cleaning & Shift Handoff | Excel Google Sheets PDF",
  tags: [
    "restaurant checklist", "restaurant opening", "restaurant closing", "daily operations", "restaurant manager",
    "manager checklist", "opening checklist", "closing checklist", "shift handoff", "kitchen checklist",
    "restaurant excel", "restaurant forms", "food temp log"
  ] as readonly string[]
} as const);

const EXPECTED_BEFORE = Object.freeze({
  shopId: "23582741",
  listingId: "4561819638",
  state: "active",
  title: "Restaurant Opening & Closing Checklist | Daily Operations Template",
  tags: [
    "restaurant checklist", "opening checklist", "closing checklist", "restaurant manager", "daily operations",
    "manager checklist", "kitchen checklist", "shift checklist", "restaurant excel", "restaurant template",
    "shift handoff", "restaurant forms", "food service"
  ] as readonly string[],
  descriptionSha256: "00952dcd077bb602ff6b6ed37c0784e90bbf0e09eba3d8354177a0a7402f8be5",
  price: { amount: 990, divisor: 100, currency_code: "USD" },
  taxonomyId: 12476,
  quantity: 998,
  whoMade: "i_did",
  whenMade: "2020_2026",
  listingType: "download",
  attributesCount: 0,
  images: [
    [8496992722,1,3000,3000],[8488103428,2,2000,2000],[8488103480,3,2000,2000],
    [8488103438,4,2000,2000],[8536001153,5,2000,2000],[8536001075,6,2000,2000],
    [8488103510,7,2000,2000],[8536001073,8,2000,2000],[8488103512,9,2000,2000]
  ] as readonly (readonly number[])[],
  buyerFiles: [
    [1509497122622,1,"Restaurant_Operations_A4.pdf",20782,"application/pdf"],
    [1509497122824,2,"Restaurant_Operations_US_Letter.pdf",20228,"application/pdf"],
    [1509497122832,3,"Restaurant_Read_Me_License.pdf",4219,"application/pdf"],
    [1511184698189,4,"Restaurant_Operations.zip",15018,"application/zip"],
    [1512037381313,5,"Restaurant_Quick_Start.pdf",31217,"application/pdf"]
  ] as readonly (readonly (number|string)[])[]
});

type Rec = Record<string, unknown>;
type State = { listing: Rec; images: Rec[]; attributes: Rec[]; files: Rec[]; statuses: Record<string, number> };
export type PdRest003A01Runtime = { fetchImpl?: typeof fetch; getAccessToken?: () => Promise<string>; repository?: OperationLedgerRepository; now?: () => string };

const isRec = (value: unknown): value is Rec => typeof value === "object" && value !== null && !Array.isArray(value);
const hashText = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value.normalize("NFC") : "", "utf8").digest("hex");
const secureEqual = (left: string, right: string) => { const a=Buffer.from(left), b=Buffer.from(right); return a.length===b.length && timingSafeEqual(a,b); };
function stableValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(stableValue); if (isRec(value)) return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,stableValue(value[key])])); return value; }
function protectedBaselineFingerprint() { return createHash("sha256").update(JSON.stringify(stableValue(EXPECTED_BEFORE)),"utf8").digest("hex"); }
async function json(response: Response) { const text=await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return {}; } }
function results(value: unknown) { return isRec(value)&&Array.isArray(value.results) ? value.results.filter(isRec) : null; }

export function exactPdRest003A01Body(authorizationId: string) {
  return {
    operation: PD_REST_003_A01.operation, operationId: PD_REST_003_A01.operationId, authorizationId,
    productId: PD_REST_003_A01.productId, productVersion: PD_REST_003_A01.productVersion,
    shopId: PD_REST_003_A01.shopId, listingId: PD_REST_003_A01.listingId,
    candidateId: PD_REST_003_A01.candidateId, candidateFingerprint: PD_REST_003_A01.candidateFingerprint,
    buildId: PD_REST_003_A01.buildId, buildFingerprint: PD_REST_003_A01.buildFingerprint,
    acceptanceCriteriaId: PD_REST_003_A01.acceptanceCriteriaId, acceptanceCriteriaSha256: PD_REST_003_A01.acceptanceCriteriaSha256,
    protectedStateBaselineSha256: PD_REST_003_A01.protectedStateBaselineSha256,
    patch: { title: PD_REST_003_A01.title, tags: [...PD_REST_003_A01.tags] }
  };
}
function exact(body: Rec, authorizationId: string) { return JSON.stringify(body)===JSON.stringify(exactPdRest003A01Body(authorizationId)); }

async function readState(token: string, fetchImpl: typeof fetch): Promise<State> {
  const base="https://api.etsy.com/v3/application", listingId=PD_REST_003_A01.listingId, shopId=PD_REST_003_A01.shopId;
  const urls={listing:`${base}/listings/${listingId}`,images:`${base}/listings/${listingId}/images`,attributes:`${base}/shops/${shopId}/listings/${listingId}/properties`,files:`${base}/shops/${shopId}/listings/${listingId}/files`};
  const entries=await Promise.all(Object.entries(urls).map(async([name,url])=>{const response=await fetchImpl(url,{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"});return {name,response,value:await json(response)};}));
  const by=Object.fromEntries(entries.map((entry)=>[entry.name,entry])) as Record<string,{response:Response;value:unknown}>;
  const images=results(by.images.value), attributes=results(by.attributes.value), files=results(by.files.value);
  if(!by.listing.response.ok||!isRec(by.listing.value)||!by.images.response.ok||!by.attributes.response.ok||!by.files.response.ok||!images||!attributes||!files) throw new Error("PD_REST_003_A01_READ_FAILED");
  return {listing:by.listing.value,images,attributes,files,statuses:Object.fromEntries(entries.map((entry)=>[entry.name,entry.response.status]))};
}

function protectedCoreMatches(state: State) {
  const l=state.listing, price=isRec(l.price)?l.price:{};
  if(String(l.shop_id)!==EXPECTED_BEFORE.shopId||String(l.listing_id)!==EXPECTED_BEFORE.listingId||String(l.state).toLowerCase()!==EXPECTED_BEFORE.state) return false;
  if(hashText(l.description)!==EXPECTED_BEFORE.descriptionSha256||Number(price.amount)!==EXPECTED_BEFORE.price.amount||Number(price.divisor)!==EXPECTED_BEFORE.price.divisor||price.currency_code!==EXPECTED_BEFORE.price.currency_code) return false;
  if(Number(l.taxonomy_id)!==EXPECTED_BEFORE.taxonomyId||Number(l.quantity)!==EXPECTED_BEFORE.quantity||l.who_made!==EXPECTED_BEFORE.whoMade||l.when_made!==EXPECTED_BEFORE.whenMade||(l.listing_type??l.type)!==EXPECTED_BEFORE.listingType||state.attributes.length!==EXPECTED_BEFORE.attributesCount) return false;
  const images=[...state.images].sort((a,b)=>Number(a.rank)-Number(b.rank)).map((x)=>[Number(x.listing_image_id),Number(x.rank),Number(x.full_width),Number(x.full_height)]);
  const files=[...state.files].sort((a,b)=>Number(a.rank)-Number(b.rank)).map((x)=>[Number(x.listing_file_id),Number(x.rank),x.filename,Number(x.size_bytes),x.filetype]);
  return JSON.stringify(images)===JSON.stringify(EXPECTED_BEFORE.images)&&JSON.stringify(files)===JSON.stringify(EXPECTED_BEFORE.buyerFiles);
}
const beforeMatches=(state:State)=>protectedCoreMatches(state)&&state.listing.title===EXPECTED_BEFORE.title&&JSON.stringify(state.listing.tags)===JSON.stringify(EXPECTED_BEFORE.tags);
const finalMatches=(state:State)=>protectedCoreMatches(state)&&state.listing.title===PD_REST_003_A01.title&&JSON.stringify(state.listing.tags)===JSON.stringify(PD_REST_003_A01.tags);

function authError(request: Request) { const expected=process.env.ETSY_B01_WRITE_TOKEN?.trim()??"", supplied=request.headers.get(WRITE_HEADER)?.trim()??""; if(!expected)return NextResponse.json({error:"PD_REST_003_A01_WRITE_AUTH_NOT_CONFIGURED",providerPatchCount:0},{status:503}); if(!supplied||!secureEqual(supplied,expected))return NextResponse.json({error:"PD_REST_003_A01_UNAUTHORIZED",providerPatchCount:0},{status:401}); return null; }

export async function verifyPdRest003A01ProtectedState(runtime: PdRest003A01Runtime={}) {
  if(protectedBaselineFingerprint()!==PD_REST_003_A01.protectedStateBaselineSha256) return NextResponse.json({error:"PD_REST_003_A01_INTERNAL_BASELINE_FINGERPRINT_MISMATCH",providerPatchCount:0,ETSY_WRITE_COUNT:0},{status:500});
  try { const token=await(runtime.getAccessToken??getValidEtsyAccessToken)(); const state=await readState(token,runtime.fetchImpl??fetch); const match=beforeMatches(state); return NextResponse.json({status:match?"PROTECTED_STATE_MATCH":"PROTECTED_STATE_MISMATCH",operationId:PD_REST_003_A01.operationId,protectedStateBaselineSha256:PD_REST_003_A01.protectedStateBaselineSha256,providerPatchCount:0,ETSY_WRITE_COUNT:0,readStatus:state.statuses},{status:match?200:409}); }
  catch { return NextResponse.json({error:"PD_REST_003_A01_VERIFICATION_FAILED",providerPatchCount:0,ETSY_WRITE_COUNT:0},{status:502}); }
}

export async function handlePdRest003A01TitleTags(body: Rec, request: Request, runtime: PdRest003A01Runtime={}) {
  if(process.env.PUBLISH_WRITES_ENABLED!=="true") return NextResponse.json({error:"PD_REST_003_A01_WRITES_DISABLED",providerPatchCount:0},{status:403});
  const auth=authError(request); if(auth)return auth;
  if(protectedBaselineFingerprint()!==PD_REST_003_A01.protectedStateBaselineSha256) return NextResponse.json({error:"PD_REST_003_A01_INTERNAL_BASELINE_FINGERPRINT_MISMATCH",providerPatchCount:0},{status:409});
  if(process.env.ETSY_SHOP_ID?.trim()!==PD_REST_003_A01.shopId) return NextResponse.json({error:"PD_REST_003_A01_SHOP_MISMATCH",providerPatchCount:0},{status:409});
  const authorizationId=process.env[AUTHORIZATION_ID_ENV]?.trim()??"", allowedRequestHash=process.env[REQUEST_SHA_ENV]?.trim().toLowerCase()??"";
  if(!authorizationId||!SHA256.test(allowedRequestHash)) return NextResponse.json({error:"PD_REST_003_A01_PRODUCTION_AUTH_NOT_CONFIGURED",providerPatchCount:0},{status:503});
  if(!exact(body,authorizationId)||!secureEqual(hashOperationRequest(body),allowedRequestHash)) return NextResponse.json({error:"PD_REST_003_A01_AUTHORIZATION_CONTRACT_MISMATCH",providerPatchCount:0},{status:409});

  const repository=runtime.repository??new NeonOperationLedgerRepository();
  const existing=await repository.load(PD_REST_003_A01.operationId);
  if(existing?.requestHash!==undefined&&existing.requestHash!==allowedRequestHash) return NextResponse.json({error:"OPERATION_ID_PAYLOAD_MISMATCH",providerPatchCount:0},{status:409});
  if(existing?.status==="SUCCEEDED") return NextResponse.json({status:"REPLAY",mode:"WRITE_ONCE",operationId:existing.operationId,requestHash:existing.requestHash,ledgerStatus:existing.status,providerPatchCount:0,receipt:existing.receipt});

  const fetchImpl=runtime.fetchImpl??fetch, token=await(runtime.getAccessToken??getValidEtsyAccessToken)();
  let before:State; try { before=await readState(token,fetchImpl); } catch { return NextResponse.json({error:"PD_REST_003_A01_PREREAD_FAILED",providerPatchCount:0},{status:502}); }
  if(existing){ if(finalMatches(before)){const done=await recordOperationResult(repository,existing.operationId,existing.requestHash,"SUCCEEDED",runtime.now?.()??new Date().toISOString(),{receipt:{...(existing.receipt??{}),reconciled:true,providerPatchCount:0}});return NextResponse.json({status:"RECONCILED",mode:"WRITE_ONCE",operationId:done.operationId,requestHash:done.requestHash,ledgerStatus:done.status,providerPatchCount:0,receipt:done.receipt});} return NextResponse.json({error:"PD_REST_003_A01_ALREADY_CLAIMED",providerPatchCount:0},{status:409}); }
  if(!beforeMatches(before)) return NextResponse.json({error:"PD_REST_003_A01_PROTECTED_STATE_MISMATCH",providerPatchCount:0},{status:409});

  const now=runtime.now?.()??new Date().toISOString();
  const begun=await beginOperation(repository,PD_REST_003_A01.operationId,body,now);
  if(begun.status==="REPLAY") return NextResponse.json({error:"PD_REST_003_A01_ALREADY_CLAIMED",providerPatchCount:0},{status:409});

  const form=new URLSearchParams(); form.set("title",PD_REST_003_A01.title); form.set("tags",PD_REST_003_A01.tags.join(","));
  let patch:Response|null=null; try { patch=await fetchImpl(`https://api.etsy.com/v3/application/shops/${PD_REST_003_A01.shopId}/listings/${PD_REST_003_A01.listingId}`,{method:"PATCH",headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded"},body:form,cache:"no-store"}); await json(patch); } catch {}
  if(patch&&!patch.ok&&patch.status<500){await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"FAILED",now,{recoveryPoint:"PATCH_REJECTED",receipt:{providerPatchCount:1,statusCode:patch.status}});return NextResponse.json({error:"PD_REST_003_A01_PATCH_REJECTED",providerPatchCount:1},{status:502});}
  let after:State|null=null; try { after=await readState(token,fetchImpl); } catch {}
  if(after&&finalMatches(after)){const done=await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"SUCCEEDED",runtime.now?.()??new Date().toISOString(),{receipt:{providerPatchCount:1,updateStatusCode:patch?.status??null,readBackStatus:after.statuses,verified:{title:"PASS",tagsExactOrdered13:"PASS",protectedState:"PASS"}}});return NextResponse.json({status:patch?.ok?"UPDATED_AND_VERIFIED":"RECONCILED",mode:"WRITE_ONCE",operationId:done.operationId,requestHash:done.requestHash,ledgerStatus:done.status,providerPatchCount:1,receipt:done.receipt});}
  const pending=await recordOperationResult(repository,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",runtime.now?.()??new Date().toISOString(),{recoveryPoint:"POST_PATCH_READBACK",receipt:{providerPatchCount:1,updateStatusCode:patch?.status??null}});
  return NextResponse.json({error:"PD_REST_003_A01_RECONCILIATION_REQUIRED",requestHash:pending.requestHash,providerPatchCount:1},{status:202});
}
