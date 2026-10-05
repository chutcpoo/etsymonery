import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createListingFingerprint } from "../../../../../../../lib/candidate-fingerprint";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "../../../../../../../lib/etsy-readback-normalizer";
import { getEtsySellerStateSnapshot } from "../../../../../../../lib/etsy-seller-state-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHOP_ID = 23582741;
const GATE = "[GATE_CPR_RELEASE_R01]";
const OPERATION_ID = "PDT-CPR-003-V1-ETSY-COMPLETE-R01-20261005";
const NONCE_SHA256 = "06d813ff41be0d58efab5b0a5dd7e59194cf4cf1cec8e61c67e797773d98eeff";
const SHOP_SECTION = "Schedules & Checklists";

// PDT-PCL-002 known listing ID (must be active before CPR-003 can publish)
const PCL_002_LISTING_ID = 4588681044;

const TITLE = "Cleaning Service Proposal Template, Editable Excel & PDF, Commercial Bid System, Scope Matrix, 3-Tier Pricing";
const DESCRIPTION = [
  "Professional cleaning service proposal system for commercial cleaning businesses. Includes an editable Excel template with 6 structured worksheets, a completed fictional reference example, an 8-page client-ready printable proposal PDF, a 2-page facility intake sheet, and a 6-page user guide. Designed for winning commercial cleaning contracts through a structured 3-tier pricing framework.",
  "",
  "WHAT YOU RECEIVE — EXACTLY 5 FILES",
  "1. Cleaning Service Proposal Template - Premium Final.xlsx — 6 sheets; blank reusable commercial proposal template with formulas",
  "2. Cleaning Service Proposal Example - Premium Final.xlsx — 6 sheets; fictional 14,500 sq ft commercial reference proposal",
  "3. Cleaning Service Proposal Printable - Premium Final.pdf — 8 pages; client-ready proposal example for presentation binders or PDF pitch",
  "4. Cleaning Service Proposal User Guide - Premium Final.pdf — 6 pages; bidding strategy, workflow, and customization guide",
  "5. Cleaning Service Proposal Facility Intake Sheet - Premium Final.pdf — 2 pages; commercial pre-bid walkthrough & facility intake sheet",
  "",
  "KEY FEATURES",
  "• 6 structured commercial worksheets",
  "• Room-by-room scope matrix with Included / Optional Add-on / Excluded status dropdown",
  "• 3-Tier pricing framework (Essential Clean, Standard Clean, Executive Clean)",
  "• Automatic annual contract value calculation formula",
  "• Formal proposal cover with client & provider details",
  "• Company profile section with operational pillars",
  "• Structured commercial service terms & operating policies",
  "• 8-page client-ready printable proposal example",
  "• 2-page facility intake sheet for pre-bid walkthroughs",
  "• Full workflow guide",
  "",
  "IMPORTANT PRODUCT TRUTH",
  "• Primary intended workbook environment: Microsoft Excel Desktop (Windows and macOS)",
  "• Can be opened in Google Sheets with standard formula fidelity",
  "• Manual workbook only — no automated bid engine",
  "• Package rates require manual input",
  "• No VBA or macros",
  "• No CRM or calendar sync",
  "• Service terms are structured general business policies, not legal advice",
  "• Printable PDF and example workbook contain fictional sample data",
  "• Digital files only; no physical item is shipped",
  "",
  "FULL COMMERCIAL WORKFLOW",
  "1. Pre-bid walkthrough using the Facility Intake Sheet",
  "2. Build scope in Sheet 3 using the room-by-room matrix",
  "3. Set tier pricing in Sheet 4",
  "4. Present the printed proposal to the client",
  "5. Copy agreed tier into Sheet 6 for the service agreement"
].join("\n");

const TAGS = [
  "cleaning proposal",
  "cleaning business",
  "commercial cleaning",
  "cleaning bid",
  "proposal template",
  "cleaning contract",
  "cleaning service",
  "excel template",
  "cleaning pricing",
  "janitorial proposal",
  "cleaning quote",
  "bid proposal",
  "janitorial bid"
] as const;

const LISTING_DRAFT = Object.freeze({ title: TITLE, description: DESCRIPTION, priceUsd: 6.9, tags: [...TAGS], quantity: 999, who_made: "i_did", when_made: "2020_2026", taxonomy_id: 12476, type: "download", state: "draft" });
const LISTING_ACTIVE = Object.freeze({ ...LISTING_DRAFT, state: "active" });
const DRAFT_FP = createListingFingerprint(LISTING_DRAFT);
const ACTIVE_FP = createListingFingerprint(LISTING_ACTIVE);

// PROTECTED: listings that MUST remain untouched at all times.
const PROTECTED = Object.freeze([
  { listingId: 4587646332, state: "active", title: "Cleaning Business Schedule Template, Editable Excel Planner, Daily Weekly Monthly Tasks" }
] as const);

type Spec = { name: string; size: number; sha: string; mime: string };

/**
 * Buyer files: exactly 5 canonical files (no zip) uploaded to the Etsy listing.
 * Order matches rank 1-5. Verified against Google Drive files.
 */
const FILES: Spec[] = [
  { name: "Cleaning Service Proposal Template - Premium Final.xlsx", size: 17661, sha: "fe81f89881b4ae425dabe7fb7fa06243e5b348bde546f5441bfea5ee115e33af", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { name: "Cleaning Service Proposal Example - Premium Final.xlsx", size: 17779, sha: "c2cc4a77d4d087867ac36722b2bff371cfdf3074b09fdb84a2f50b9a8679e36f", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { name: "Cleaning Service Proposal Printable - Premium Final.pdf", size: 810924, sha: "786e1a5ce7948e22c6d4507b9d85c1ed2928ac6e35c898a132862bee470c25ab", mime: "application/pdf" },
  { name: "Cleaning Service Proposal User Guide - Premium Final.pdf", size: 469980, sha: "818898d435a477ae7e9eafb1e9490eca540a1b3f9cd380cb7943ae61d05d9b5b", mime: "application/pdf" },
  { name: "Cleaning Service Proposal Facility Intake Sheet - Premium Final.pdf", size: 427886, sha: "b2b7b6531837e4cc30293237db79e645bad762f6749849baf73ef367ce87e81a", mime: "application/pdf" }
];

const IMAGES: Spec[] = [
  ["01_Hero.jpg",729837,"500d3e6cba6fcc43eeb4935c4667f20874a8fc9a7d0093d8bba074f7e9bdfcbe"],
  ["02_What_You_Get.jpg",562714,"068b75a4e33d41c40df1e5e7bd6f09934b9a5158c443c71996b1b5196138cb92"],
  ["03_Scope_Matrix.jpg",701493,"c3b3f494e006dfc2a0658370e2823f23de905e89dd97ed4f57a57e67fb24587d"],
  ["04_Pricing_Schedule.jpg",675193,"530cde1d025e62abdc1a4abb5a3619612aefc068b2fa721f3c8ac554716bbc46"],
  ["05_Service_Agreement.jpg",645281,"ff06b56bb117dacd3f7d18ea523f4dc111da39c6d30c7ab8cc0cacf979eb50ea"],
  ["06_How_It_Works.jpg",746261,"252fa00ce2a6a79a9dec80b0223bc0f5baa62984040f99f7afed3d8fee557a73"],
  ["07_Real_World_Use.jpg",642161,"34e90fb4f7d337ebed0eda5fb30345a37ec8f8dccf784be49ffee7c791f8ae0f"],
  ["08_Who_Its_For.jpg",745528,"860282abcf730cc2390c22b6fa5f626ad0c59dac06e1b03de4ea72ca68e4dd31"],
  ["09_Compatibility_Notes.jpg",649298,"1c2700cd3b51e57be61c070080a9919614582e15d255760dfbf1d1712d948a7f"],
  ["10_Collection_Cross_Sell.jpg",838866,"f53872dabd01d94cdd523e6c191980256e523b2507a555034165fc9b69f1cc9c"]
].map(([name,size,sha]) => ({ name: String(name), size: Number(size), sha: String(sha), mime: "image/jpeg" }));

const VIDEO: Spec = { name: "Cleaning_Service_Proposal_Listing_Video.mp4", size: 541981, sha: "66bc0d87003c624f4913c69573c8471c9d8c1f4cdd4f9078cb0dd39f6826a214", mime: "video/mp4" };

type Rec = Record<string, unknown>;
function isRec(v: unknown): v is Rec { return typeof v === "object" && v !== null && !Array.isArray(v); }
function secure(a: string, b: string) { const x=Buffer.from(a), y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
function hash(b: Buffer) { return createHash("sha256").update(b).digest("hex"); }
function nonceOk(v: string) { return secure(createHash("sha256").update(v,"utf8").digest("hex"), NONCE_SHA256); }
function gateEnabled() { return process.env.VERCEL_ENV === "production" && (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").includes(GATE); }
function multipartHeaders(token: string) { const h=etsyApiHeaders(token); delete h["content-type"]; return h; }
async function sleep(ms:number){ await new Promise(r=>setTimeout(r,ms)); }
async function jsonBody(r:Response){ const t=await r.text(); try{return t?JSON.parse(t):{};}catch{return{};} }
function rows(v:unknown): Rec[] { return Array.isArray((v as Record<string,unknown>)?.results)?(v as Record<string,Rec[]>).results:[]; }
function toObservation(v:Rec):EtsyReadBackObservation{return{title:v.title,description:v.description,price:v.price as EtsyReadBackObservation["price"],tags:v.tags,quantity:v.quantity,who_made:v.who_made,when_made:v.when_made,taxonomy_id:v.taxonomy_id,type:v.listing_type??v.type??"download",state:v.state};}
function listingMatches(v:Rec,active=false){ const fp=active?ACTIVE_FP:DRAFT_FP; return verifyEtsyReadBackIdentity(fp,toObservation(v)).status==="MATCH" && String(v.state)===(active?"active":"draft") && Number(v.shop_id)===SHOP_ID; }
function sameEtsyFilename(actual:unknown,expected:string){return String(actual??"").replace(/\s+/g,"")===expected.replace(/\s+/g,"");}
function fileRowsOk(a:Rec[]){if(a.length!==FILES.length)return false;const x=[...a].sort((p,q)=>Number(p.rank)-Number(q.rank));return x.every((r,i)=>Number(r.rank)===i+1&&sameEtsyFilename(r.filename,FILES[i].name)&&Number(r.size_bytes)===FILES[i].size);}
function imageRowsOk(a:Rec[]){if(a.length!==IMAGES.length)return false;const ranks=[...a].map(r=>Number(r.rank)).sort((a,b)=>a-b);return ranks.every((r,i)=>r===i+1);}
function videoRowsOk(a:Rec[]){return a.length===1&&String(a[0]?.video_state??"")==="active";}
function allowedAssetUrl(raw:string){let u:URL;try{u=new URL(raw);}catch{throw new Error("ASSET_URL_INVALID");}if(u.protocol!=="https:"||u.username||u.password||!u.hostname.endsWith(".oaiusercontent.com")||!u.pathname.includes("/files/")||!u.pathname.endsWith("/raw"))throw new Error("ASSET_URL_NOT_ALLOWED");return u.toString();}
async function fetchAsset(url:string,spec:Spec){const r=await fetch(allowedAssetUrl(url),{cache:"no-store"});if(!r.ok)throw new Error(`ASSET_FETCH_HTTP_${r.status}`);const b=Buffer.from(await r.arrayBuffer());if(b.length!==spec.size)throw new Error("ASSET_SIZE_MISMATCH");if(!secure(hash(b),spec.sha))throw new Error("ASSET_SHA256_MISMATCH");return b;}

async function getWithRetry(token:string, path:string, maxAttempts=4):Promise<unknown> {
  const url = "https://api.etsy.com/v3/application" + path;
  let lastErr: Error = new Error("ETSY_GET_RETRY_EXHAUSTED");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await fetch(url, {headers: etsyApiHeaders(token), cache: "no-store"});
    if (r.ok) return jsonBody(r);
    if (r.status === 429 || r.status === 502 || r.status === 503 || r.status === 504) {
      const retryAfter = r.headers.get("retry-after");
      let delayMs = Math.min(8000, 1000 * 2 ** (attempt - 1));
      if (retryAfter) { const parsed = Number(retryAfter); if (Number.isFinite(parsed) && parsed >= 0) delayMs = Math.min(8000, Math.ceil(parsed * 1000)); }
      if (delayMs >= 10000 && attempt < maxAttempts) { lastErr = new Error(`GET_${path}_RATE_LIMIT_QUOTA_DEPLETED`); break; }
      lastErr = new Error(`GET_${path}_${r.status}_ATTEMPT_${attempt}`);
      if (attempt < maxAttempts) await sleep(delayMs);
      continue;
    }
    throw new Error(`GET_${path}_${r.status}`);
  }
  throw lastErr;
}

async function getListing(token:string,id:number){return getWithRetry(token,`/listings/${id}`);}
async function getImages(token:string,id:number){return rows(await getWithRetry(token,`/listings/${id}/images`));}
async function getFiles(token:string,id:number){return rows(await getWithRetry(token,`/shops/${SHOP_ID}/listings/${id}/files`));}
async function getVideos(token:string,id:number){return rows(await getWithRetry(token,`/listings/${id}/videos`));}
async function getSections(token:string){return rows(await getWithRetry(token,`/shops/${SHOP_ID}/sections`));}

async function uploadBuyerFile(token:string,id:number,spec:Spec,rank:number,b:Buffer){const f=new FormData();f.append("file",new File([new Uint8Array(b)],spec.name,{type:spec.mime}),spec.name);f.append("name",spec.name);f.append("rank",String(rank));const r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${id}/files`,{method:"POST",headers:multipartHeaders(token),body:f,cache:"no-store"});if(!r.ok)throw new Error(`BUYER_FILE_UPLOAD_HTTP_${r.status}`);return jsonBody(r);}
async function uploadImage(token:string,id:number,spec:Spec,rank:number,b:Buffer){const f=new FormData();f.append("image",new File([new Uint8Array(b)],spec.name,{type:spec.mime}),spec.name);f.append("rank",String(rank));const r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${id}/images`,{method:"POST",headers:multipartHeaders(token),body:f,cache:"no-store"});if(!r.ok)throw new Error(`IMAGE_UPLOAD_HTTP_${r.status}`);return jsonBody(r);}
async function uploadVideo(token:string,id:number,spec:Spec,b:Buffer){const f=new FormData();f.append("video",new File([new Uint8Array(b)],spec.name,{type:spec.mime}),spec.name);f.append("name",spec.name);const r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${id}/videos`,{method:"POST",headers:multipartHeaders(token),body:f,cache:"no-store"});if(!r.ok){const d=(await r.text()).replace(/\s+/g," ").slice(0,300);throw new Error(`VIDEO_UPLOAD_HTTP_${r.status}_${d}`);}return jsonBody(r);}
async function patchListing(token:string,id:number,params:Record<string,string>){const body=new URLSearchParams(params);const r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${id}`,{method:"PATCH",headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded"},body,cache:"no-store"});if(!r.ok)throw new Error(`LISTING_PATCH_HTTP_${r.status}`);return jsonBody(r);}

async function verifySeller(token:string, id:number, active=false){
  const state = await getEtsySellerStateSnapshot({shopId:SHOP_ID, accessToken:token});
  if (state.counts.inactive!==0||state.counts.sold_out!==0||state.counts.expired!==0) throw new Error("SELLER_COUNTS_UNEXPECTED_STATES");
  if (state.counts.active < 1) throw new Error("SELLER_COUNTS_MISMATCH_ACTIVE");
  for (const p of PROTECTED) {
    const row=state.listings.find(x=>x.listingId===p.listingId);
    if (!row||row.state!==p.state||row.title!==p.title) throw new Error(`PROTECTED_LISTING_DRIFT_${p.listingId}`);
  }
  // PCL-002 must remain active throughout CPR-003 publish process
  const pcl002=state.listings.find(x=>x.listingId===PCL_002_LISTING_ID);
  if (!pcl002||pcl002.state!=="active") throw new Error("PCL002_ACTIVE_DRIFT");
  if (pcl002.title !== "Professional Cleaning Checklist Template, Editable Excel & A4 PDF, Deep Clean, Move-In Move-Out, Quality Control") throw new Error("PCL002_TITLE_DRIFT");
  const target=state.listings.find(x=>x.listingId===id);
  if (!target||target.title!==TITLE) throw new Error("TARGET_LISTING_NOT_FOUND");
  if (active && target.state!=="active") throw new Error("TARGET_LISTING_STATE_MISMATCH_EXPECTED_ACTIVE");
  if (!active && target.state!=="draft") throw new Error("TARGET_LISTING_STATE_MISMATCH_EXPECTED_DRAFT");
  return state;
}

export async function GET(request:Request){
  try {
    const url=new URL(request.url);
    const id=Number(url.searchParams.get("listingId"));
    if(!Number.isSafeInteger(id)||id<=0) throw new Error("LISTING_ID_REQUIRED");
    const token=await getValidEtsyAccessToken();
    const l=await getListing(token,id);
    if (!isRec(l)) throw new Error("LISTING_READ_INVALID");
    const isActive=String(l.state)==="active";
    if(!listingMatches(l,isActive)) throw new Error("LISTING_IDENTITY_MISMATCH");

    // Sequential reads with spacing
    await sleep(650);
    const im = await getImages(token,id);
    await sleep(650);
    const fi = await getFiles(token,id);
    await sleep(650);
    const vi = await getVideos(token,id);
    await sleep(650);
    const sec = await getSections(token);
    await sleep(650);
    const state = await verifySeller(token,id,isActive);

    const section=sec.find((r)=>String(r.title??"").trim()===SHOP_SECTION);
    return NextResponse.json({
      status:"READ_ONLY",listingId:id,state:String(l.state),coreOk:true,
      assets:{
        images:imageRowsOk(im),imageCount:im.length,
        files:fileRowsOk(fi),fileCount:fi.length,
        video:videoRowsOk(vi),videoCount:vi.length,
        sectionMatched:Boolean(section&&Number(l.shop_section_id)===Number(section.shop_section_id))
      },
      fileRows:fi.map((r)=>({rank:Number(r.rank),filename:String(r.filename??""),sizeBytes:Number(r.size_bytes)})),
      imageRows:im.map((r)=>({rank:Number(r.rank),imageId:Number(r.listing_image_id)})),
      videoRows:vi.map((r)=>({videoId:Number(r.video_id),state:String(r.video_state??"")})),
      shopSectionId:Number(l.shop_section_id??0),expectedShopSectionId:Number(section?.shop_section_id??0),
      sellerCounts:state.counts,gateEnabled:gateEnabled(),ETSY_WRITE_COUNT:0
    },{headers:{"cache-control":"no-store"}});
  } catch(e) {
    return NextResponse.json({status:"READ_ONLY_FAILED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:0},{status:409});
  }
}

export async function POST(request:Request){
  let writes=0;
  try {
    if(!gateEnabled()) throw new Error("CPR_COMPLETE_GATE_DISABLED");
    if((request.headers.get("x-operation-id")??"")!==OPERATION_ID) throw new Error("CPR_OPERATION_ID_INVALID");

    const contentType = request.headers.get("content-type") ?? "";
    let nonce = "";
    let action = "";
    let rank = 0;
    let assetFile: File | null = null;
    let assetUrl = "";
    let id = 0;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      nonce = String(form.get("nonce") ?? "").trim();
      action = String(form.get("action") ?? "").trim();
      rank = Number(form.get("rank"));
      const f = form.get("asset");
      if (f instanceof File) assetFile = f;
      const lId = form.get("listingId");
      if (lId && Number.isSafeInteger(Number(lId)) && Number(lId) > 0) id = Number(lId);
    } else {
      const body = await request.json() as Record<string, unknown>;
      nonce = typeof body.nonce === "string" ? body.nonce.trim() : "";
      action = typeof body.action === "string" ? body.action.trim() : "";
      rank = Number(body.rank);
      assetUrl = typeof body.assetUrl === "string" ? body.assetUrl.trim() : "";
      if (body.listingId && Number.isSafeInteger(Number(body.listingId)) && Number(body.listingId) > 0) {
        id = Number(body.listingId);
      }
    }

    if(!nonce||!nonceOk(nonce)) throw new Error("CPR_NONCE_INVALID");
    if(!Number.isSafeInteger(id)||id<=0) throw new Error("LISTING_ID_INVALID");

    const token=await getValidEtsyAccessToken();
    const l=await getListing(token,id);
    if (!isRec(l)) throw new Error("LISTING_READ_INVALID");

    if (action !== "publish") {
      if(!listingMatches(l,false)) throw new Error("DRAFT_CORE_MISMATCH");
      await verifySeller(token,id,false);
    }

    async function getAssetBytes(spec: Spec): Promise<Buffer> {
      if (assetFile) {
        const ab = await assetFile.arrayBuffer();
        const b = Buffer.from(ab);
        if (b.length !== spec.size) throw new Error(`ASSET_SIZE_MISMATCH: expected ${spec.size}, got ${b.length}`);
        if (!secure(hash(b), spec.sha)) throw new Error(`ASSET_SHA256_MISMATCH for ${spec.name}`);
        return b;
      }
      if (assetUrl) {
        return fetchAsset(assetUrl, spec);
      }
      throw new Error("ASSET_REQUIRED");
    }

    if(action==="file"){
      if(!Number.isInteger(rank)||rank<1||rank>FILES.length) throw new Error("FILE_RANK_INVALID");
      const spec=FILES[rank-1];
      const current=await getFiles(token,id);
      const existing=current.find((r)=>Number(r.rank)===rank);
      if(existing){
        if(sameEtsyFilename(existing.filename,spec.name)&&Number(existing.size_bytes)===spec.size) return NextResponse.json({status:"ALREADY_PRESENT",action,rank,ETSY_WRITE_COUNT:0});
        throw new Error("FILE_RANK_CONFLICT");
      }
      const b=await getAssetBytes(spec);
      await sleep(500);
      await uploadBuyerFile(token,id,spec,rank,b);
      writes=1;
      await sleep(1200);
      const after=await getFiles(token,id);
      const row=after.find((r)=>Number(r.rank)===rank);
      if(!row||!sameEtsyFilename(row.filename,spec.name)||Number(row.size_bytes)!==spec.size) throw new Error("FILE_FINAL_VERIFY_FAILED");
      return NextResponse.json({status:"PASS",action,rank,fileName:spec.name,fileCount:after.length,ETSY_WRITE_COUNT:writes});
    }

    if(action==="image"){
      if(!Number.isInteger(rank)||rank<1||rank>IMAGES.length) throw new Error("IMAGE_RANK_INVALID");
      const spec=IMAGES[rank-1];
      const current=await getImages(token,id);
      if(current.some((r)=>Number(r.rank)===rank)) return NextResponse.json({status:"ALREADY_PRESENT",action,rank,ETSY_WRITE_COUNT:0});
      const b=await getAssetBytes(spec);
      await sleep(500);
      await uploadImage(token,id,spec,rank,b);
      writes=1;
      await sleep(1200);
      const after=await getImages(token,id);
      if(!after.some((r)=>Number(r.rank)===rank)) throw new Error("IMAGE_FINAL_VERIFY_FAILED");
      return NextResponse.json({status:"PASS",action,rank,fileName:spec.name,imageCount:after.length,ETSY_WRITE_COUNT:writes});
    }

    if(action==="video"){
      const current=await getVideos(token,id);
      if(current.length){
        if(videoRowsOk(current)) return NextResponse.json({status:"ALREADY_PRESENT",action,ETSY_WRITE_COUNT:0});
        for(let i=0;i<6;i++){
          await sleep(3000);
          const poll=await getVideos(token,id);
          if(videoRowsOk(poll)) return NextResponse.json({status:"ALREADY_PRESENT_NOW_READY",action,videoState:poll[0]?.video_state,ETSY_WRITE_COUNT:0});
        }
        throw new Error("VIDEO_CONFLICT_NOT_ACTIVE");
      }
      const b=await getAssetBytes(VIDEO);
      await sleep(500);
      await uploadVideo(token,id,VIDEO,b);
      writes=1;
      let after:Rec[]=[];
      for(let i=0;i<10;i++){
        await sleep(2500);
        after=await getVideos(token,id);
        if(videoRowsOk(after)) break;
      }
      if(!videoRowsOk(after)) throw new Error("VIDEO_FINAL_VERIFY_FAILED");
      return NextResponse.json({status:"PASS",action,videoCount:after.length,videoState:after[0]?.video_state,ETSY_WRITE_COUNT:writes});
    }

    if(action==="section"){
      const sec=await getSections(token);
      const section=sec.find((r)=>String(r.title??"").trim()===SHOP_SECTION);
      if(!section||!Number(section.shop_section_id)) throw new Error("SECTION_NOT_FOUND");
      if(Number(l.shop_section_id)===Number(section.shop_section_id)) return NextResponse.json({status:"ALREADY_PRESENT",action,shopSectionId:Number(section.shop_section_id),ETSY_WRITE_COUNT:0});
      await patchListing(token,id,{shop_section_id:String(section.shop_section_id)});
      writes=1;
      await sleep(1000);
      const after=await getListing(token,id);
      if(isRec(after)&&after.shop_section_id!=null&&Number(after.shop_section_id)!==Number(section.shop_section_id)) throw new Error("SECTION_FINAL_VERIFY_FAILED");
      return NextResponse.json({status:"PASS",action,shopSectionId:Number(section.shop_section_id),shopSectionTitle:SHOP_SECTION,ETSY_WRITE_COUNT:writes});
    }

    if(action==="publish"){
      if(!listingMatches(l,false)) throw new Error("PUBLISH_DRAFT_IDENTITY_FAILED");
      const sec=await getSections(token);
      const section=sec.find((r)=>String(r.title??"").trim()===SHOP_SECTION);
      if(!section||Number(l.shop_section_id)!==Number(section.shop_section_id)) throw new Error("PUBLISH_SECTION_GATE_FAILED");
      await sleep(500);
      const im=await getImages(token,id);
      await sleep(500);
      const fi=await getFiles(token,id);
      await sleep(500);
      const vi=await getVideos(token,id);
      if(!imageRowsOk(im)||!fileRowsOk(fi)||!videoRowsOk(vi)) throw new Error("PUBLISH_ASSET_GATE_FAILED");
      await patchListing(token,id,{state:"active"});
      writes=1;
      let after = l;
      for(let i=0;i<10;i++){
        await sleep(2000);
        const readBack = await getListing(token,id);
        if(isRec(readBack)){ after=readBack; if(String(after.state)==="active") break; }
      }
      if(!isRec(after)||!listingMatches(after,true)) throw new Error("PUBLISH_FINAL_VERIFY_FAILED");
      const seller=await verifySeller(token,id,true);
      return NextResponse.json({
        status:"PUBLISHED_PASS",
        listingId:id,
        url:`https://www.etsy.com/listing/${id}`,
        imageCount:im.length,
        fileCount:fi.length,
        videoCount:vi.length,
        sellerCounts:seller.counts,
        ETSY_WRITE_COUNT:writes
      });
    }

    throw new Error("ACTION_INVALID");
  } catch(e) {
    return NextResponse.json({
      status:writes>0?"RECONCILIATION_REQUIRED":"BLOCKED_FAIL_CLOSED",
      error:e instanceof Error?e.message:"UNKNOWN",
      ETSY_WRITE_COUNT:writes
    },{status:writes>0?202:409,headers:{"cache-control":"no-store"}});
  }
}
