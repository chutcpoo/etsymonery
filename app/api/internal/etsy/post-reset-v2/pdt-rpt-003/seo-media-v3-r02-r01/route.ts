import { createHash, timingSafeEqual } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SHOP_ID = 23582741;
const LISTING_ID = 4580303015;
const OPERATION_ID = "PDT-RPT-003-ETSY-SEO-MEDIA-V3-R02-R01-20261001";
const AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-RPT-003-ETSY-SEO-MEDIA-V3-R02-R01-20261001 LISTING-4580303015 TITLE-TAGS-MEDIA-01-10 ONLY KEEP-DESCRIPTION KEEP-CATEGORY KEEP-PRICE KEEP-BUYER-FILES KEEP-VIDEO KEEP-ACTIVE NO-PUBLISH EXACT-SCOPE-ONLY";

const OLD_TITLE =
  "Rental Property Tracker Excel | Landlord Income & Expense Spreadsheet | Long-Term + Short-Term Rentals";
const TARGET_TITLE =
  "Rental Property Tracker Excel | Landlord Income & Expense Spreadsheet + Airbnb / Short-Term Rental Dashboard";

const OLD_TAGS = Object.freeze([
  "rental property","landlord spreadsheet","rental spreadsheet","property tracker",
  "rental income","expense tracker","landlord excel","rental dashboard",
  "rent roll tracker","short term rental","rental bookkeeping","property expenses","real estate excel"
] as const);

const TARGET_TAGS = Object.freeze([
  "rental property","property tracker","rental spreadsheet","airbnb spreadsheet",
  "landlord spreadsheet","rental income","rental expenses","property income",
  "rent roll tracker","airbnb tracker","landlord excel","property dashboard","short term rental"
] as const);

const EXPECTED_TAXONOMY_ID = 12476;
const ZIP_SHA256 = "725a707ed2d62908037919893642417dfa584b1384f2d481c02addfa0d66211d";

const IMAGES = Object.freeze([
  {rank:1,fileName:"PDT-RPT-003_GALLERY_01_HERO_V3_R02_2000x2000.png",size:370134,sha256:"88620b3aa76a326c97182ff0a3abf24e24aecc345ade60e6fc95eb7ded2d8422",altText:"Rental Property Tracker V3 hero showing the real Excel workbook for long-term and short-term rental operations."},
  {rank:2,fileName:"PDT-RPT-003_GALLERY_02_DASHBOARD_V3_R02_2000x2000.png",size:359476,sha256:"c438b292eb1e3f15b57041faf57ef0eecc91359637fa27c910a1c0aebeb70d3f",altText:"Rental Property Tracker V3 portfolio dashboard using real workbook pixels for income, expenses, cash flow, rent and short-term rental performance."},
  {rank:3,fileName:"PDT-RPT-003_GALLERY_03_PROPERTY_REGISTER_V3_R02_2000x2000.png",size:390993,sha256:"1e8e426e4fc0b5503c0affc1934f7e27970e79a419669a38765331817bdd8dbf",altText:"Rental Property Tracker V3 property register showing real workbook fields for property ID, rental type, units or rooms and cash invested."},
  {rank:4,fileName:"PDT-RPT-003_GALLERY_04_RENT_ROLL_V3_R02_2000x2000.png",size:370578,sha256:"90ed97da735844eb2ff938011ad8c0cc6b54ef08458c70b4413ccdec6c79ce1b",altText:"Rental Property Tracker V3 rent roll showing real workbook proof for expected rent, rent received, remaining balance and payment status."},
  {rank:5,fileName:"PDT-RPT-003_GALLERY_05_INCOME_EXPENSES_V3_R02_2000x2000.png",size:509797,sha256:"75020027f5fb2f2c0affb60094f5cb8ca1b199b6d0dd4a74f8b5497bd39a7a2b",altText:"Rental Property Tracker V3 income and expense logs using real workbook pixels linked by property ID."},
  {rank:6,fileName:"PDT-RPT-003_GALLERY_06_STR_PERFORMANCE_V3_R02_2000x2000.png",size:290530,sha256:"33f5eece3776e7ea21b92a60bb578fc4d3056961f1933a516a8d5004d4d9d01a",altText:"Rental Property Tracker V3 short-term rental performance view showing booked nights, occupancy, booking revenue and ADR."},
  {rank:7,fileName:"PDT-RPT-003_GALLERY_07_ANNUAL_SUMMARY_V3_R02_2000x2000.png",size:314577,sha256:"1c5c84f6c01c13b7cb589fd3353260fd0fb93b25207330de0357da0a58a0bbfd",altText:"Rental Property Tracker V3 annual summary showing real per-property and portfolio performance from entered records."},
  {rank:8,fileName:"PDT-RPT-003_GALLERY_08_HOW_IT_WORKS_V3_R02_2000x2000.png",size:367197,sha256:"c7db2c4f37a9da25c62b3d1db3a35ac886a89b7c1024c0cefe4d3f73e72f95da",altText:"Rental Property Tracker V3 five-step workflow: register properties, enter transactions, review rent roll, review short-term rental occupancy and check the dashboard."},
  {rank:9,fileName:"PDT-RPT-003_GALLERY_09_WHAT_YOU_RECEIVE_V3_R02_2000x2000.png",size:309185,sha256:"ad9e768a08a046ae3b279a14bf3098b3e4e4a2dfaf0b1a1e9ba73859a57d75bc",altText:"Rental Property Tracker V3 what-you-receive image showing two Microsoft Excel workbooks, SAMPLE and CLEAN START, with eight tabs each."},
  {rank:10,fileName:"PDT-RPT-003_GALLERY_10_BOUNDARIES_V3_R02_2000x2000.png",size:426904,sha256:"c7378e9f02fb5bc9a498590ee860589ce0537d9a1801db471483662aa95a572b",altText:"Rental Property Tracker V3 boundaries: manual rental tracking only, with no bank sync, automatic rent collection, booking-platform integration or tax advice."}
] as const);

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const txt = (v: unknown) => typeof v === "string" ? v.normalize("NFC").trim() : "";
const num = (v: unknown) => Number(v);
const secureEqual = (a:string,b:string) => {
  const x=Buffer.from(a), y=Buffer.from(b);
  return x.length===y.length && timingSafeEqual(x,y);
};
const runtimeCommit = () => process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? "";
const gateEnabled = () => false;

async function parseJson(r:Response){ const t=await r.text(); if(!t)return {}; try{return JSON.parse(t) as unknown;}catch{return {};} }
function results(v:unknown){ return isRec(v)&&Array.isArray(v.results)?v.results.filter(isRec):null; }
function sameStrings(v:unknown,e:readonly string[]){ return Array.isArray(v)&&v.length===e.length&&v.every((x,i)=>typeof x==="string"&&x.normalize("NFC").trim()===e[i]); }

async function getRecord(token:string,url:string,code:string){
  const waits=[0,1200,2500]; let last=0;
  for(const ms of waits){
    if(ms) await new Promise(r=>setTimeout(r,ms));
    const r=await fetch(url,{method:"GET",headers:etsyApiHeaders(token),cache:"no-store"});
    last=r.status;
    if(r.status===429) continue;
    if(!r.ok) throw new Error(code+"_HTTP_"+r.status);
    const v=await parseJson(r); if(!isRec(v)) throw new Error(code+"_INVALID"); return v;
  }
  throw new Error(code+"_HTTP_"+last);
}

async function readState(token:string){
  const base="https://api.etsy.com/v3/application";
  const [listing,ip,fp,vp]=await Promise.all([
    getRecord(token,base+"/listings/"+LISTING_ID,"LISTING"),
    getRecord(token,base+"/listings/"+LISTING_ID+"/images","IMAGES"),
    getRecord(token,base+"/shops/"+SHOP_ID+"/listings/"+LISTING_ID+"/files","FILES"),
    getRecord(token,base+"/listings/"+LISTING_ID+"/videos","VIDEOS")
  ]);
  const images=results(ip), files=results(fp), videos=results(vp);
  if(!images||!files||!videos) throw new Error("COLLECTION_INVALID");
  return {
    listing,
    images:[...images].sort((a,b)=>num(a.rank)-num(b.rank)),
    files:[...files].sort((a,b)=>num(a.rank)-num(b.rank)),
    videos:[...videos].sort((a,b)=>num(a.video_id)-num(b.video_id))
  };
}

function protectedSnapshot(s:Awaited<ReturnType<typeof readState>>){
  const l=s.listing;
  return {
    state:txt(l.state),
    description:txt(l.description),
    price:l.price,
    taxonomyId:num(l.taxonomy_id),
    quantity:num(l.quantity),
    whoMade:txt(l.who_made),
    whenMade:txt(l.when_made),
    listingType:txt(l.listing_type),
    files:s.files.map(x=>({id:num(x.listing_file_id),rank:num(x.rank),name:txt(x.filename),size:num(x.size_bytes)})),
    videos:s.videos.map(x=>({id:num(x.video_id),state:txt(x.video_state),width:num(x.width),height:num(x.height)}))
  };
}
function protectedFingerprint(s:Awaited<ReturnType<typeof readState>>){
  return createHash("sha256").update(JSON.stringify(protectedSnapshot(s)),"utf8").digest("hex");
}
function seoSafe(l:Rec){
  const t=txt(l.title), tags=l.tags;
  return (t===OLD_TITLE&&sameStrings(tags,OLD_TAGS)) || (t===TARGET_TITLE&&sameStrings(tags,TARGET_TAGS));
}
function targetSafe(s:Awaited<ReturnType<typeof readState>>){
  return txt(s.listing.state)==="active" &&
    num(s.listing.taxonomy_id)===EXPECTED_TAXONOMY_ID &&
    txt(s.listing.listing_type)==="download" &&
    seoSafe(s.listing) &&
    s.images.length===10 &&
    s.files.length>=1 &&
    s.videos.length===1 &&
    txt(s.videos[0].video_state)==="active";
}
function exactV3AtRank(images:Rec[],rank:number){
  const e=IMAGES[rank-1], row=images.find(x=>num(x.rank)===rank);
  if(!e||!row) return false;
  if(txt(row.alt_text)!==e.altText) return false;
  const w=num(row.full_width),h=num(row.full_height);
  return (!w||!h)||(w===2000&&h===2000);
}
function allV3(images:Rec[]){ return images.length===10&&IMAGES.every(e=>exactV3AtRank(images,e.rank)); }
function seoMatches(l:Rec){ return txt(l.title)===TARGET_TITLE&&sameStrings(l.tags,TARGET_TAGS); }

function extractZipEntry(zip:Buffer,wanted:string){
  const EOCD=0x06054b50, CS=0x02014b50, LS=0x04034b50;
  const min=Math.max(0,zip.length-65557); let eocd=-1;
  for(let o=zip.length-22;o>=min;o--){ if(zip.readUInt32LE(o)===EOCD){eocd=o;break;} }
  if(eocd<0) throw new Error("ZIP_EOCD_MISSING");
  const count=zip.readUInt16LE(eocd+10); let cur=zip.readUInt32LE(eocd+16);
  for(let i=0;i<count;i++){
    if(zip.readUInt32LE(cur)!==CS) throw new Error("ZIP_CENTRAL_INVALID");
    const method=zip.readUInt16LE(cur+10), csize=zip.readUInt32LE(cur+20), usize=zip.readUInt32LE(cur+24);
    const nl=zip.readUInt16LE(cur+28), el=zip.readUInt16LE(cur+30), cl=zip.readUInt16LE(cur+32), lo=zip.readUInt32LE(cur+42);
    const name=zip.subarray(cur+46,cur+46+nl).toString("utf8");
    if(name===wanted){
      if(zip.readUInt32LE(lo)!==LS) throw new Error("ZIP_LOCAL_INVALID");
      const lnl=zip.readUInt16LE(lo+26), lel=zip.readUInt16LE(lo+28), start=lo+30+lnl+lel;
      const comp=zip.subarray(start,start+csize);
      const out=method===0?Buffer.from(comp):method===8?inflateRawSync(comp):null;
      if(!out) throw new Error("ZIP_METHOD_UNSUPPORTED");
      if(out.length!==usize) throw new Error("ZIP_ENTRY_SIZE_MISMATCH");
      return out;
    }
    cur+=46+nl+el+cl;
  }
  throw new Error("ZIP_ENTRY_MISSING_"+wanted);
}

function fileFromZip(zip:Buffer,e:(typeof IMAGES)[number]){
  const b=extractZipEntry(zip,"IMAGES_2000x2000/"+e.fileName);
  if(b.length!==e.size) throw new Error("ASSET_SIZE_MISMATCH_"+e.rank);
  const sha=createHash("sha256").update(b).digest("hex");
  if(!secureEqual(sha,e.sha256)) throw new Error("ASSET_SHA_MISMATCH_"+e.rank);
  const ab=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;
  return new File([ab],e.fileName,{type:"image/png"});
}

async function uploadImage(token:string,file:File,e:(typeof IMAGES)[number]){
  const body=new FormData();
  body.append("image",file,e.fileName);
  body.append("rank",String(e.rank));
  body.append("overwrite","true");
  body.append("alt_text",e.altText);
  const r=await fetch("https://api.etsy.com/v3/application/shops/"+SHOP_ID+"/listings/"+LISTING_ID+"/images",
    {method:"POST",headers:(()=>{const h=etsyApiHeaders(token); delete h["content-type"]; return h;})(),body,cache:"no-store"});
  const t=await r.text();
  if(!r.ok) throw new Error("IMAGE_UPLOAD_HTTP_"+r.status+"_"+t.slice(0,180));
}

async function patchSeo(token:string){
  const r=await fetch("https://api.etsy.com/v3/application/shops/"+SHOP_ID+"/listings/"+LISTING_ID,{
    method:"PATCH",
    headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({title:TARGET_TITLE,tags:TARGET_TAGS.join(",")}),
    cache:"no-store"
  });
  const t=await r.text();
  if(!r.ok) throw new Error("SEO_PATCH_HTTP_"+r.status+"_"+t.slice(0,180));
}

async function sleep(ms:number){ await new Promise(r=>setTimeout(r,ms)); }

async function plan(){
  const token=await getValidEtsyAccessToken();
  const s=await readState(token);
  const safe=targetSafe(s);
  const complete=safe&&seoMatches(s.listing)&&allV3(s.images);
  return {
    status:complete?"RPT_V3_R02_ALREADY_COMPLETE":safe?"RPT_V3_R02_READY":"RPT_V3_R02_BLOCKED",
    mode:"READ_ONLY",operationId:OPERATION_ID,listingId:LISTING_ID,
    targetTitle:TARGET_TITLE,targetTags:TARGET_TAGS,zipSha256:ZIP_SHA256,
    targetSafe:safe,complete,seoMatches:seoMatches(s.listing),
    v3ImageCount:IMAGES.filter(e=>exactV3AtRank(s.images,e.rank)).length,
    protectedFingerprint:protectedFingerprint(s),
    protectedSnapshot:protectedSnapshot(s),
    currentTitle:txt(s.listing.title),
    currentTags:Array.isArray(s.listing.tags)?s.listing.tags:[],
    imageCount:s.images.length,
    gateEnabled:gateEnabled(),
    deploymentCommit:runtimeCommit(),
    exactScope:{title:"UPDATE",tags:"UPDATE 13",images:"OVERWRITE 01-10",description:"KEEP",category:"KEEP",price:"KEEP",buyerFiles:"KEEP",video:"KEEP",state:"KEEP ACTIVE",publish:false},
    ETSY_WRITE_COUNT:0
  };
}

export async function GET(request:Request){
  try{
    const url=new URL(request.url);
    if(url.searchParams.get("execute")==="all"){
      if(!gateEnabled()) throw new Error("RPT_V3_R02_GATE_DISABLED");
      const auth=url.searchParams.get("authorizationText")?.normalize("NFC").trim()??"";
      if(!secureEqual(auth,AUTHORIZATION_TEXT)) throw new Error("RPT_AUTH_INVALID");
      const commit=url.searchParams.get("deploymentCommit")?.trim().toLowerCase()??"";
      if(!/^[a-f0-9]{40}$/.test(commit)||!secureEqual(commit,runtimeCommit())) throw new Error("RPT_COMMIT_MISMATCH");
      const expectedFp=url.searchParams.get("protectedFingerprint")?.trim().toLowerCase()??"";
      if(!/^[a-f0-9]{64}$/.test(expectedFp)) throw new Error("RPT_FP_INVALID");
      const assetUrl=url.searchParams.get("assetUrl")?.trim()??"";
      if(!assetUrl.startsWith("https://")) throw new Error("RPT_ASSET_URL_INVALID");

      const ar=await fetch(assetUrl,{cache:"no-store",redirect:"follow"});
      if(!ar.ok) throw new Error("RPT_ZIP_FETCH_HTTP_"+ar.status);
      const zip=Buffer.from(await ar.arrayBuffer());
      const zsha=createHash("sha256").update(zip).digest("hex");
      if(!secureEqual(zsha,ZIP_SHA256)) throw new Error("RPT_ZIP_SHA_MISMATCH");

      const token=await getValidEtsyAccessToken();
      const before=await readState(token);
      if(!targetSafe(before)||!secureEqual(protectedFingerprint(before),expectedFp)) throw new Error("RPT_FRESH_BASELINE_MISMATCH");
      let writes=0; const execution:Array<Record<string,unknown>>=[];

      if(!seoMatches(before.listing)){
        await patchSeo(token); writes++; execution.push({action:"PATCH_TITLE_TAGS"});
        await sleep(1200);
        const s=await readState(token);
        if(!secureEqual(protectedFingerprint(s),expectedFp)||!seoMatches(s.listing)) throw new Error("RPT_SEO_READBACK_FAILED");
      }

      for(let rank=10;rank>=1;rank--){
        let s=await readState(token);
        if(!secureEqual(protectedFingerprint(s),expectedFp)||s.images.length!==10) throw new Error("RPT_PROTECTED_DRIFT_BEFORE_IMAGE_"+rank);
        if(exactV3AtRank(s.images,rank)){ execution.push({action:"SKIP_ALREADY_EXACT",rank}); continue; }
        const e=IMAGES[rank-1], file=fileFromZip(zip,e);
        await uploadImage(token,file,e); writes++; execution.push({action:"OVERWRITE_IMAGE",rank});
        let ok=false;
        for(let a=0;a<8;a++){ await sleep(1200); s=await readState(token); if(secureEqual(protectedFingerprint(s),expectedFp)&&s.images.length===10&&exactV3AtRank(s.images,rank)){ok=true;break;} }
        if(!ok) throw new Error("RPT_IMAGE_READBACK_FAILED_"+rank);
      }

      const final=await readState(token);
      if(!secureEqual(protectedFingerprint(final),expectedFp)||!targetSafe(final)||!seoMatches(final.listing)||!allV3(final.images)) throw new Error("RPT_FINAL_READBACK_FAILED");
      return NextResponse.json({
        status:"RPT_V3_R02_SEO_MEDIA_PASS",operationId:OPERATION_ID,listingId:LISTING_ID,
        title:TARGET_TITLE,tags:TARGET_TAGS,state:"active",taxonomyId:num(final.listing.taxonomy_id),
        imageCount:10,v3ImageCount:10,buyerFileCount:final.files.length,videoCount:final.videos.length,
        descriptionUnchanged:true,categoryUnchanged:true,priceUnchanged:true,buyerFilesUnchanged:true,videoUnchanged:true,stateUnchanged:true,publishPerformed:false,
        execution,ETSY_WRITE_COUNT:writes
      },{headers:{"cache-control":"no-store"}});
    }

    const p=await plan();
    return NextResponse.json(p,{status:p.targetSafe?200:409,headers:{"cache-control":"no-store"}});
  }catch(e){
    return NextResponse.json({status:"RPT_V3_R02_BLOCKED_FAIL_CLOSED",error:e instanceof Error?e.message:"UNKNOWN",listingId:LISTING_ID,publishPerformed:false,ETSY_WRITE_COUNT:0},{status:409,headers:{"cache-control":"no-store"}});
  }
}
