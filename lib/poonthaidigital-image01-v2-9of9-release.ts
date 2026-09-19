import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { etsyApiHeaders } from "./etsy";
import { getEtsyListingDetailEvidence } from "./etsy-listing-detail";
import { loadAuthorizedAsset, clearAuthorizedAsset } from "./authorized-operation-asset-store";
import { beginOperation, NeonOperationLedgerRepository, recordOperationResult } from "./operation-ledger";

export const IMAGE01_V2_RELEASE = Object.freeze({
  operationId:"POONTHAIDIGITAL-IMAGE01-V2-9OF9-RELEASE-001",
  authorizationId:"POONTHAIDIGITAL-IMAGE01-V2-9OF9-R01-AUTH-20260919-01",
  candidateFingerprint:"9488ad58b8b5c5c8df14bb21668687316dff061f5793ebef07bd53d4cfbeaa4d",
  buildFingerprint:"c3c357c021eaf178219d55169d73c87c5e9d13b861988514849a33c14f02a448",
  acceptanceCriteriaFingerprint:"34230b236572dd3ebdfdea1af42057b9c5e372fd3b11953a80606a8f22ffe502",
  protectedStateFingerprint:"5bf479cad2007bdec8199d13dae3dfa827ff264f967dab511007cae491da9b07",
  scopeFingerprint:"ea8757f7943523d51f1fa1d512103fc920e05cf5955cb1ace9b3b0a8f86ca752",
  authorizationRequestHash:"bf419e6b4c139b0bfce9c7bfdc1535f4e1fb59f81d4788149061ca4d7f14e901",
  shopId:23582741,maxEtsyWrites:9
} as const);

export const IMAGE01_V2_TARGETS = Object.freeze([
  {productId:"PDT-BPSC-001",listingId:4573789186,oldHeroId:8525075112,protectedSha256:"4b76835bae433d19b575f1603b14ff5318487387cc719769c1ed3b1071a3e00e",fileName:"01_PDT-BPSC-001_IMAGE01_SHOP_MASTER_HERO_DNA_V2_2000x2000.png",sha256:"c86bb635adcb66c7d566cb4288d4a834d2d7c19e2186280c36dca43dd7938b41",byteSize:348984,altText:"Bakery Production Schedule and Capacity Planner hero with a real Excel Daily Production Board preview, 9 planning tabs and A4/US Letter PDFs."},
  {productId:"PDT-HBOP-001",listingId:4566738686,oldHeroId:8573242111,protectedSha256:"a43d50b0c78a6621af7a016ba814939a7554ec08220b73d729a0ac4176c08c78",fileName:"02_PDT-HBOP-001_IMAGE01_SHOP_MASTER_HERO_DNA_V2_2000x2000.png",sha256:"b6012db88d0b0034433ca8a9b941acb8e741ae21e4c7d02c29147fb0251eec24",byteSize:386626,altText:"Home Bakery Order and Production Planner hero with a real Excel Operations Dashboard preview, 11 workbook tabs and A4/US Letter PDFs."},
  {productId:"PDT-PCSO-001",listingId:4569445414,oldHeroId:8525200664,protectedSha256:"9e59f567fcfbddb6d4a452a5b5ee5efef22d36490e5bf93bf6db884fd51a8f0c",fileName:"03_PDT-PCSO-001_IMAGE01_SHOP_MASTER_HERO_DNA_V2_2000x2000.png",sha256:"4a54d03930d958fcbe8d32b772421269fa4c04a056c70eec046f3c76b55d3abb",byteSize:311397,altText:"Private Chef Client Service Tracker hero with a real Dashboard and Next Actions preview, 12 workbook tabs, Excel and Google Sheets support."},
  {productId:"PDT-POGO-001",listingId:4568730165,oldHeroId:8573182859,protectedSha256:"740ecf2f24a007666945677c1724e3723b6f0f9f9b703d9798481e2ae2f47589",fileName:"04_PDT-POGO-001_IMAGE01_SHOP_MASTER_HERO_DNA_V2_2000x2000.png",sha256:"f3de65e28891ef82a80d472a9beea546fd3a9a109eb8d2563da880f6a133fbc3",byteSize:332238,altText:"Professional Organizer Client Project Tracker hero with a real Excel Dashboard preview, 11 workbook tabs and A4/US Letter PDFs."},
  {productId:"PDT-BOBA-001",listingId:4560696421,oldHeroId:8577752087,protectedSha256:"3e5a9e539f1a3fa816e7932111de506e7a513ded4fc27414bc0ba10b0290f95e",fileName:"05_PDT-BOBA-001_IMAGE01_SHOP_MASTER_HERO_DNA_V2_2000x2000.png",sha256:"5bbea9c3da013b69366c187b9a287caa06240cb12657c07d4ec79c1fa93836b6",byteSize:429969,altText:"Boba Shop Daily Operations Toolkit hero with a real Opening Checklist workbook preview, 9 editable tabs, Excel workbook and A4/US Letter PDFs."},
  {productId:"PD-REST-003",listingId:4561819638,oldHeroId:8526513644,protectedSha256:"40c87e0c7f4394d2a3b377a855df8e88f3952ce11ee4dffa78367d8f8a116056",fileName:"06_PD-REST-003_IMAGE01_SHOP_MASTER_HERO_DNA_V2_2000x2000.png",sha256:"7a94f47864f54f8f02d70b1537479fc2403c9c027905f0ec0eed9c198d016418",byteSize:521366,altText:"Restaurant Daily Operations Checklist hero with a real Opening worksheet preview, 8 editable tabs, Excel workbook and A4/US Letter PDFs."},
  {productId:"PD-COFFEE-002",listingId:4561793463,oldHeroId:8579355477,protectedSha256:"70f543546371622ee91b82d59ec613e6a54dd95f7ed1afad6788213614d686ec",fileName:"07_PD-COFFEE-002_IMAGE01_SHOP_MASTER_HERO_DNA_V2_2000x2000.png",sha256:"d9e7459129928a8c34dacc1c4b85ac9757606e1b85424f1813fde9e00a8e9bbd",byteSize:510119,altText:"Coffee Shop Opening and Closing Checklist hero with a real Opening worksheet preview, 8 editable tabs, Excel workbook and A4/US Letter PDFs."},
  {productId:"PD-CLEAN-004",listingId:4561795303,oldHeroId:8530911216,protectedSha256:"89307b8a4ca31a556869fe6b65e89fc0dc5e355b0806a45b84577358f93baff4",fileName:"08_PD-CLEAN-004_IMAGE01_SHOP_MASTER_HERO_DNA_V2_2000x2000.png",sha256:"04360cf58e314d78d3823da2f8ec1c4a3e39c76e390713aa4959324588b527ef",byteSize:434432,altText:"Cafe Cleaning Checklist and Schedule hero with a real Opening Clean worksheet preview, 8 editable tabs, Excel workbook and A4/US Letter PDFs."},
  {productId:"PD-STOCK-005",listingId:4561821192,oldHeroId:8580511217,protectedSha256:"3469cfaf28cb1198013a165e28bf467d9e872e814ed29247a826f4ce27c6516a",fileName:"09_PD-STOCK-005_IMAGE01_SHOP_MASTER_HERO_DNA_V2_2000x2000.png",sha256:"3c4de0e4818a0b8960a07113a702d339ff3c2a306fc2a011932d1572702cacc6",byteSize:389470,altText:"Restaurant and Cafe Inventory Tracker hero with a real Item Master worksheet preview, 8 editable tabs, Excel workbook and A4/US Letter PDFs."}
] as const);

type Rec=Record<string,unknown>;
type Target=(typeof IMAGE01_V2_TARGETS)[number];
type State={protectedSha256:string;heroId:number;heroAlt:string;galleryCount:number};
const isRec=(v:unknown):v is Rec=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const hash=(s:string)=>createHash("sha256").update(s,"utf8").digest("hex");
function stable(v:unknown):string{
  if(v===null)return "null";
  if(typeof v==="string"||typeof v==="number"||typeof v==="boolean")return JSON.stringify(v);
  if(Array.isArray(v))return "["+v.map(stable).join(",")+"]";
  if(isRec(v))return "{"+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}";
  throw new Error("UNSUPPORTED_STABLE_VALUE");
}
async function parseJson(r:Response){const t=await r.text();try{return t?JSON.parse(t) as unknown:{};}catch{return {};}}
function multipartHeaders(token:string){const h=etsyApiHeaders(token);delete h["content-type"];return h;}

async function readState(target:Target,token:string,fetchImpl:typeof fetch=fetch):Promise<State>{
  const detail=await getEtsyListingDetailEvidence({listingId:target.listingId,shopId:IMAGE01_V2_RELEASE.shopId,headers:etsyApiHeaders(token),fetchImpl}) as Rec;
  if(detail.status!=="PASS")throw new Error("DETAIL_READ_FAILED_"+target.productId);
  const vr=await fetchImpl("https://api.etsy.com/v3/application/listings/"+target.listingId+"/videos",{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"});
  const vv=await parseJson(vr);const videos=isRec(vv)&&Array.isArray(vv.results)?vv.results.filter(isRec):null;
  if(!vr.ok||!videos)throw new Error("VIDEO_READ_FAILED_"+target.productId);
  const listing=isRec(detail.listing)?detail.listing:{},gallery=isRec(detail.gallery)?detail.gallery:{},inventory=isRec(detail.inventory)?detail.inventory:{};
  const products=Array.isArray(inventory.products)?inventory.products.filter(isRec):[];
  const images=(Array.isArray(gallery.images)?gallery.images.filter(isRec):[]).sort((a,b)=>Number(a.rank)-Number(b.rank));
  const hero=images.find(x=>Number(x.rank)===1);if(!hero)throw new Error("HERO_NOT_FOUND_"+target.productId);
  const protectedState={
    listing_id:target.listingId,state:listing.state,
    images_2_plus:images.filter(x=>Number(x.rank)>=2).map(x=>({id:x.listing_image_id,rank:x.rank,w:x.full_width,h:x.full_height,alt:x.alt_text})),
    gallery_count:gallery.count,
    videos:videos.map(x=>({id:Number(x.video_id),w:Number(x.width),h:Number(x.height),state:String(x.video_state??"")})),
    title:listing.title,description_sha256:hash(typeof listing.description==="string"?listing.description:""),
    tags:listing.tags,price:listing.price,quantity:listing.quantity,
    sku:products.map(x=>x.sku).filter(x=>x!==null&&x!==undefined&&x!==""&&x!=="NOT_AVAILABLE"),
    shop_section_id:listing.shop_section_id,taxonomy_id:listing.taxonomy_id,
    attributes:detail.attributes,personalization:detail.personalization,auto_renew:listing.should_auto_renew,
    who_made:listing.who_made,when_made:listing.when_made,listing_type:listing.listing_type,
    buyer_files:detail.digitalBuyerFiles,offer_discount:detail.offerDiscount
  };
  return {protectedSha256:hash(stable(protectedState)),heroId:Number(hero.listing_image_id),heroAlt:String(hero.alt_text??""),galleryCount:Number(gallery.count)};
}
function assetValid(bytes:Buffer,t:Target){return bytes.length===t.byteSize&&createHash("sha256").update(bytes).digest("hex")===t.sha256&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.readUInt32BE(16)===2000&&bytes.readUInt32BE(20)===2000;}
const beforeMatches=(s:State,t:Target)=>s.heroId===t.oldHeroId&&s.protectedSha256===t.protectedSha256;
const finalMatches=(s:State,t:Target,id:number)=>s.heroId===id&&s.heroAlt===t.altText&&s.protectedSha256===t.protectedSha256;
function batchPsv(states:State[]){return hash(stable(states.map((s,i)=>({listing_id:IMAGE01_V2_TARGETS[i].listingId,hero_id:s.heroId,hero_alt:s.heroAlt,protected_sha256:s.protectedSha256}))));}

export async function verifyImage01V2ProtectedState(){
  try{
    const token=await getValidEtsyAccessToken(),states:State[]=[];
    for(const t of IMAGE01_V2_TARGETS)states.push(await readState(t,token));
    const psv=batchPsv(states),perListing=states.map((s,i)=>beforeMatches(s,IMAGE01_V2_TARGETS[i]));
    const ok=perListing.every(Boolean)&&psv===IMAGE01_V2_RELEASE.protectedStateFingerprint;
    return NextResponse.json({status:ok?"PROTECTED_STATE_MATCH":"PROTECTED_STATE_MISMATCH",operationId:IMAGE01_V2_RELEASE.operationId,protectedStateFingerprint:psv,perListing,ETSY_WRITE_COUNT:0},{status:ok?200:409});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"PSV_FAILED",ETSY_WRITE_COUNT:0},{status:502});}
}

export async function executeImage01V2Release(input:Rec){
  if(input.authorizationId!==IMAGE01_V2_RELEASE.authorizationId||input.authorizationRequestHash!==IMAGE01_V2_RELEASE.authorizationRequestHash||input.protectedStateFingerprint!==IMAGE01_V2_RELEASE.protectedStateFingerprint)return NextResponse.json({error:"IMAGE01_V2_EXACT_AUTHORIZATION_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  const staged:Array<{target:Target;bytes:Buffer}>=[];
  for(const target of IMAGE01_V2_TARGETS){let bytes:Buffer;try{bytes=await loadAuthorizedAsset(IMAGE01_V2_RELEASE.operationId,target.sha256);}catch{return NextResponse.json({error:"IMAGE01_V2_ASSET_NOT_READY",productId:target.productId,ETSY_WRITE_COUNT:0},{status:409});}if(!assetValid(bytes,target))return NextResponse.json({error:"IMAGE01_V2_ASSET_IDENTITY_MISMATCH",productId:target.productId,ETSY_WRITE_COUNT:0},{status:409});staged.push({target,bytes});}
  const token=await getValidEtsyAccessToken(),before:State[]=[];
  try{for(const t of IMAGE01_V2_TARGETS)before.push(await readState(t,token));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"IMAGE01_V2_PREREAD_FAILED",ETSY_WRITE_COUNT:0},{status:502});}
  if(!before.every((s,i)=>beforeMatches(s,IMAGE01_V2_TARGETS[i]))||batchPsv(before)!==IMAGE01_V2_RELEASE.protectedStateFingerprint)return NextResponse.json({error:"IMAGE01_V2_FRESH_PSV_MISMATCH",ETSY_WRITE_COUNT:0},{status:409});
  const repo=new NeonOperationLedgerRepository();
  const payload={operation:"REPLACE_IMAGE01_V2_9OF9_ONLY",...IMAGE01_V2_RELEASE,targets:IMAGE01_V2_TARGETS.map(t=>({productId:t.productId,listingId:t.listingId,sha256:t.sha256,altText:t.altText}))};
  const begun=await beginOperation(repo,IMAGE01_V2_RELEASE.operationId,payload,new Date().toISOString());
  if(begun.status==="REPLAY")return NextResponse.json({error:"IMAGE01_V2_ALREADY_CLAIMED_DO_NOT_RETRY",ledgerStatus:begun.record.status,receipt:begun.record.receipt,ETSY_WRITE_COUNT:Number(begun.record.receipt?.ETSY_WRITE_COUNT)||0},{status:begun.record.status==="RECONCILIATION_REQUIRED"?202:409});
  let writes=0,attempts=0;const completed:Array<{productId:string;listingId:number;newImageId:number}>=[];
  for(const item of staged){
    const target=item.target,form=new FormData();form.set("image",new File([new Uint8Array(item.bytes)],target.fileName,{type:"image/png"}),target.fileName);form.set("rank","1");form.set("overwrite","true");form.set("alt_text",target.altText);
    const url="https://api.etsy.com/v3/application/shops/"+IMAGE01_V2_RELEASE.shopId+"/listings/"+target.listingId+"/images";attempts++;
    let response:Response;
    try{response=await fetch(url,{method:"POST",headers:multipartHeaders(token),body:form,cache:"no-store"});}
    catch{await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",new Date().toISOString(),{recoveryPoint:target.productId+"_UPLOAD_RESPONSE_AMBIGUOUS",receipt:{completed,ETSY_WRITE_COUNT:writes,ETSY_WRITE_ATTEMPT_COUNT:attempts}});return NextResponse.json({error:"IMAGE01_V2_UPLOAD_AMBIGUOUS_DO_NOT_RETRY",failedProductId:target.productId,completed,ETSY_WRITE_COUNT:writes,ETSY_WRITE_ATTEMPT_COUNT:attempts},{status:202});}
    const value=await parseJson(response),newId=isRec(value)?Number(value.listing_image_id):NaN;
    if(!response.ok||!Number.isSafeInteger(newId)){const reconcile=response.status>=500||writes>0;await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,reconcile?"RECONCILIATION_REQUIRED":"FAILED",new Date().toISOString(),{recoveryPoint:target.productId+"_UPLOAD_REJECTED",receipt:{completed,providerStatus:response.status,ETSY_WRITE_COUNT:writes,ETSY_WRITE_ATTEMPT_COUNT:attempts}});return NextResponse.json({error:reconcile?"IMAGE01_V2_PARTIAL_OR_5XX_DO_NOT_RETRY":"IMAGE01_V2_UPLOAD_REJECTED",failedProductId:target.productId,providerStatus:response.status,completed,ETSY_WRITE_COUNT:writes,ETSY_WRITE_ATTEMPT_COUNT:attempts},{status:reconcile?202:502});}
    writes++;let after:State;try{after=await readState(target,token);}catch{await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",new Date().toISOString(),{recoveryPoint:target.productId+"_POSTREAD_FAILED",receipt:{completed,newImageId:newId,ETSY_WRITE_COUNT:writes,ETSY_WRITE_ATTEMPT_COUNT:attempts}});return NextResponse.json({error:"IMAGE01_V2_POSTREAD_FAILED_DO_NOT_RETRY",failedProductId:target.productId,newImageId:newId,completed,ETSY_WRITE_COUNT:writes,ETSY_WRITE_ATTEMPT_COUNT:attempts},{status:202});}
    if(!finalMatches(after,target,newId)){await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",new Date().toISOString(),{recoveryPoint:target.productId+"_POSTREAD_MISMATCH",receipt:{completed,newImageId:newId,ETSY_WRITE_COUNT:writes,ETSY_WRITE_ATTEMPT_COUNT:attempts}});return NextResponse.json({error:"IMAGE01_V2_POSTREAD_MISMATCH_DO_NOT_RETRY",failedProductId:target.productId,newImageId:newId,completed,ETSY_WRITE_COUNT:writes,ETSY_WRITE_ATTEMPT_COUNT:attempts},{status:202});}
    completed.push({productId:target.productId,listingId:target.listingId,newImageId:newId});
  }
  const done=await recordOperationResult(repo,begun.record.operationId,begun.record.requestHash,"SUCCEEDED",new Date().toISOString(),{receipt:{authorizationId:IMAGE01_V2_RELEASE.authorizationId,completed,ETSY_WRITE_COUNT:writes,ETSY_WRITE_ATTEMPT_COUNT:attempts,verified:{image01NewLive:"PASS_9_OF_9",image01Rank1:"PASS_9_OF_9",images02PlusPreserved:"PASS_9_OF_9",altText:"PASS_9_OF_9",protectedFields:"PASS_9_OF_9"}}});
  for(const t of IMAGE01_V2_TARGETS){try{await clearAuthorizedAsset(IMAGE01_V2_RELEASE.operationId,t.sha256);}catch{}}
  return NextResponse.json({status:"UPDATED_AND_VERIFIED",operationId:done.operationId,authorizationId:IMAGE01_V2_RELEASE.authorizationId,completed,ETSY_WRITE_COUNT:writes,ETSY_WRITE_ATTEMPT_COUNT:attempts,receipt:done.receipt});
}

export async function postReleaseQcImage01V2(){
  try{
    const token=await getValidEtsyAccessToken(),states:State[]=[];
    for(const t of IMAGE01_V2_TARGETS)states.push(await readState(t,token));
    const pass=states.every((s,i)=>s.heroId!==IMAGE01_V2_TARGETS[i].oldHeroId&&s.heroAlt===IMAGE01_V2_TARGETS[i].altText&&s.protectedSha256===IMAGE01_V2_TARGETS[i].protectedSha256);
    return NextResponse.json({status:pass?"POST_RELEASE_QC_PASS":"POST_RELEASE_QC_FAIL",operationId:IMAGE01_V2_RELEASE.operationId,heroIds:states.map(s=>s.heroId),ETSY_WRITE_COUNT:0},{status:pass?200:409});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"POST_RELEASE_QC_FAILED",ETSY_WRITE_COUNT:0},{status:502});}
}