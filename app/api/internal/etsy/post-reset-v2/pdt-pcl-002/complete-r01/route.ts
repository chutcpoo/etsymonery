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
const GATE = "[GATE_PCL_RELEASE_R01]";
const OPERATION_ID = "PDT-PCL-002-V1-ETSY-COMPLETE-R01-20261005";
const NONCE_SHA256 = "55b0dc63251b4444719331c49cdcb60613b99e84ba9c5c4028dcade5c0d01385";
const SHOP_SECTION = "Schedules & Checklists";

const TITLE = "Professional Cleaning Checklist Template, Editable Excel & A4 PDF, Deep Clean, Move-In Move-Out, Quality Control";
const DESCRIPTION = [
  "Professional cleaning checklist template for cleaning businesses. Includes editable Excel workbooks, a separate fictional example workbook, an A4 printable checklist pack, and a User Guide. Built for routine residential cleaning, deep cleaning, move-in / move-out work, and internal quality-control review.",
  "",
  "WHAT YOU RECEIVE — EXACTLY 4 FILES",
  "1. Professional Cleaning Checklist Template - Premium Final.xlsx — 11 sheets; blank reusable working pages",
  "2. Professional Cleaning Checklist Example - Premium Final.xlsx — 12 sheets; fictional entries showing intended use",
  "3. Professional Cleaning Checklist Printable - Premium Final.pdf — 10 pages; A4 print-friendly operational checklist pack",
  "4. Professional Cleaning Checklist User Guide - Premium Final.pdf — 6 pages; setup, workflow, compatibility and troubleshooting",
  "",
  "KEY CONTENT",
  "• Standard cleaning checklist",
  "• Kitchen checklist",
  "• Bathroom checklist",
  "• Bedroom / living-area checklist",
  "• Deep-clean checklist",
  "• Move-in / move-out checklist",
  "• Quality Control Signoff",
  "• Editable Master Checklist / task library",
  "• A4 printable pack",
  "• Quick-start and troubleshooting guidance",
  "",
  "IMPORTANT PRODUCT TRUTH",
  "• Primary intended workbook environment: Microsoft Excel Desktop",
  "• Other spreadsheet software may display validation, formatting or print layouts differently",
  "• Manual workbook only",
  "• No VBA or macros",
  "• No CRM",
  "• No calendar sync",
  "• No automatic reminders",
  "• No invoicing or payroll features",
  "• Example workbook contains fictional entries",
  "• Digital files only; no physical item is shipped",
  "",
  "HOW TO USE",
  "1. Keep one untouched master copy of the Template workbook.",
  "2. Complete Setup for the job.",
  "3. Choose the checklist matching the agreed service scope.",
  "4. Edit task wording or rows as needed.",
  "5. Record Done / N/A and flag Issue or Follow-up where applicable.",
  "6. Complete Quality Control Signoff when an internal review is needed.",
  "7. Use the A4 Printable PDF when paper is more practical."
].join("\n");
const TAGS = ["cleaning checklist","cleaning business","house cleaning list","deep clean checklist","move out checklist","move in checklist","cleaning template","excel checklist","printable checklist","quality control","cleaning forms","cleaner checklist","residential clean"] as const;
const LISTING_DRAFT = Object.freeze({ title: TITLE, description: DESCRIPTION, priceUsd: 4.9, tags: [...TAGS], quantity: 999, who_made: "i_did", when_made: "2020_2026", taxonomy_id: 12476, type: "download", state: "draft" });
const LISTING_ACTIVE = Object.freeze({ ...LISTING_DRAFT, state: "active" });
const DRAFT_FP = createListingFingerprint(LISTING_DRAFT);
const ACTIVE_FP = createListingFingerprint(LISTING_ACTIVE);

const PROTECTED = Object.freeze([
  { listingId: 4587646332, state: "active", title: "Cleaning Business Schedule Template, Editable Excel Planner, Daily Weekly Monthly Tasks" },
  { listingId: 4579470012, state: "draft", title: "Bar Inventory Spreadsheet | Liquor Stock & Pour Cost Tracker" }
] as const);

type Spec = { name: string; size: number; sha: string; mime: string };
const FILES: Spec[] = [
  { name: "Professional Cleaning Checklist Template - Premium Final.xlsx", size: 33474, sha: "05deeb686559fa12f3549d73a13f07905b9165035084226c602ff119ab7baf3f", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { name: "Professional Cleaning Checklist Example - Premium Final.xlsx", size: 35788, sha: "121b2ff8ae6f4a9ab096d5cd58920805440dee57fcce8edaa1ec714937ac8341", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { name: "Professional Cleaning Checklist Printable - Premium Final.pdf", size: 47977, sha: "e6f6c35ec88b34dccefdf6d10c09cfe29189c4674de55b3bd5c36ddba2e46711", mime: "application/pdf" },
  { name: "Professional Cleaning Checklist User Guide - Premium Final.pdf", size: 35600, sha: "af9a5cd8d1db00d27f7bbffa24087043859c07c85f229bda3963022f74abb588", mime: "application/pdf" }
];
const IMAGES: Spec[] = [
  ["01_Hero_Cover.jpg",679436,"fa0f6750ddede803b001ef53188e8df7b57b89eb9153af3fd4c35d8b08288fd6"],
  ["02_What_You_Get.jpg",643191,"4d786c6cdf5b65f1789d9335f174f2071c1ab5aaf132785f8d983486cc6ed085"],
  ["03_Standard_Cleaning.jpg",695827,"4ff24c67e31b3db0faa07e3ca1b801689ecfdd36fae850afce0b60c9af6c8b07"],
  ["04_Deep_MoveInOut.jpg",690534,"8fbc8f5296fca62183aa438f15d9b1251cca86e60d57e6735431141b519ca737"],
  ["05_Key_Features.jpg",661238,"004ddbdc72ca57f7587b69f46b43208fc4df3d34ecbcb26aca1f8fbfc9d0ea58"],
  ["06_How_It_Helps.jpg",464106,"d3975c7bcf83fb84debbbb87256e49d84e1818f385c20be6bf03dd9975946265"],
  ["07_Who_Its_For.jpg",473613,"86b6fdd21d27e76134738f488e71f76b6da1a225236cd248cb9e65efefd8ead5"],
  ["08_Compatibility.jpg",474340,"770ff2b17f502ad6fe45c7b29eafe10f532333d0c134f979d8986605002c5f31"],
  ["09_Before_You_Buy.jpg",678662,"6b99c5150e52cf736709acb3ee5c916158443a500458509e86c6c1094fbcf3da"],
  ["10_Brand_Collection.jpg",634122,"45c17c50e92872d96431f84ccd560702472fa61032d04e10c50a211082f753ae"]
].map(([name,size,sha]) => ({ name: String(name), size: Number(size), sha: String(sha), mime: "image/jpeg" }));
const VIDEO: Spec = { name: "Professional_Cleaning_Checklist_Listing_Video.mp4", size: 541641, sha: "35be05b5f71b5c24ff7871e391a37c072053d8a106ca504c38818dce7c897593", mime: "video/mp4" };

type Rec = Record<string, unknown>;
function isRec(v: unknown): v is Rec { return typeof v === "object" && v !== null && !Array.isArray(v); }
function secure(a: string,b: string) { const x=Buffer.from(a), y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
function hash(b: Buffer) { return createHash("sha256").update(b).digest("hex"); }
function nonceOk(v: string) { return secure(createHash("sha256").update(v,"utf8").digest("hex"), NONCE_SHA256); }
function gateEnabled() { return process.env.VERCEL_ENV === "production" && (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").includes(GATE); }
function multipartHeaders(token: string) { const h=etsyApiHeaders(token); delete h["content-type"]; return h; }
async function sleep(ms:number){ await new Promise(r=>setTimeout(r,ms)); }
async function json(r:Response){ const t=await r.text(); try{return t?JSON.parse(t):{};}catch{return{};} }
async function get(token:string,path:string){ const r=await fetch("https://api.etsy.com/v3/application"+path,{headers:etsyApiHeaders(token),cache:"no-store"}); if(!r.ok) throw new Error(`GET_${path}_${r.status}`); return json(r); }
function rows(v:any){ return Array.isArray(v?.results)?v.results:[]; }
function toObservation(v:Rec):EtsyReadBackObservation{return{title:v.title,description:v.description,price:v.price as EtsyReadBackObservation["price"],tags:v.tags,quantity:v.quantity,who_made:v.who_made,when_made:v.when_made,taxonomy_id:v.taxonomy_id,type:v.listing_type??v.type??"download",state:v.state};}
function listingMatches(v:Rec,active=false){ const fp=active?ACTIVE_FP:DRAFT_FP; return verifyEtsyReadBackIdentity(fp,toObservation(v)).status==="MATCH" && String(v.state)===(active?"active":"draft") && Number(v.shop_id)===SHOP_ID; }
function sameEtsyFilename(actual:unknown,expected:string){return String(actual??"").replace(/\s+/g,"")===expected.replace(/\s+/g,"");}
function fileRowsOk(a:any[]){if(a.length!==FILES.length)return false;const x=[...a].sort((p,q)=>Number(p.rank)-Number(q.rank));return x.every((r,i)=>Number(r.rank)===i+1&&sameEtsyFilename(r.filename,FILES[i].name)&&Number(r.size_bytes)===FILES[i].size);}
function imageRowsOk(a:any[]){if(a.length!==IMAGES.length)return false;const ranks=[...a].map(r=>Number(r.rank)).sort((a,b)=>a-b);return ranks.every((r,i)=>r===i+1);}
function videoRowsOk(a:any[]){return a.length===1&&String(a[0]?.video_state??"")==="active";}
function allowedAssetUrl(raw:string){let u:URL;try{u=new URL(raw);}catch{throw new Error("ASSET_URL_INVALID");}if(u.protocol!=="https:"||u.username||u.password||!u.hostname.endsWith(".oaiusercontent.com")||!u.pathname.includes("/files/")||!u.pathname.endsWith("/raw"))throw new Error("ASSET_URL_NOT_ALLOWED");return u.toString();}
async function fetchAsset(url:string,spec:Spec){const r=await fetch(allowedAssetUrl(url),{cache:"no-store"});if(!r.ok)throw new Error(`ASSET_FETCH_HTTP_${r.status}`);const b=Buffer.from(await r.arrayBuffer());if(b.length!==spec.size)throw new Error("ASSET_SIZE_MISMATCH");if(!secure(hash(b),spec.sha))throw new Error("ASSET_SHA256_MISMATCH");return b;}
async function listing(token:string,id:number){return get(token,`/listings/${id}`);}
async function images(token:string,id:number){return rows(await get(token,`/listings/${id}/images`));}
async function files(token:string,id:number){return rows(await get(token,`/shops/${SHOP_ID}/listings/${id}/files`));}
async function videos(token:string,id:number){return rows(await get(token,`/listings/${id}/videos`));}
async function sections(token:string){return rows(await get(token,`/shops/${SHOP_ID}/sections`));}
async function uploadBuyerFile(token:string,id:number,spec:Spec,rank:number,b:Buffer){const f=new FormData();f.append("file",new File([new Uint8Array(b)],spec.name,{type:spec.mime}),spec.name);f.append("name",spec.name);f.append("rank",String(rank));const r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${id}/files`,{method:"POST",headers:multipartHeaders(token),body:f,cache:"no-store"});if(!r.ok)throw new Error(`BUYER_FILE_UPLOAD_HTTP_${r.status}`);return json(r);}
async function uploadImage(token:string,id:number,spec:Spec,rank:number,b:Buffer){const f=new FormData();f.append("image",new File([new Uint8Array(b)],spec.name,{type:spec.mime}),spec.name);f.append("rank",String(rank));const r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${id}/images`,{method:"POST",headers:multipartHeaders(token),body:f,cache:"no-store"});if(!r.ok)throw new Error(`IMAGE_UPLOAD_HTTP_${r.status}`);return json(r);}
async function uploadVideo(token:string,id:number,spec:Spec,b:Buffer){const f=new FormData();f.append("video",new File([new Uint8Array(b)],spec.name,{type:spec.mime}),spec.name);f.append("name",spec.name);const r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${id}/videos`,{method:"POST",headers:multipartHeaders(token),body:f,cache:"no-store"});if(!r.ok){const d=(await r.text()).replace(/\s+/g," ").slice(0,300);throw new Error(`VIDEO_UPLOAD_HTTP_${r.status}_${d}`);}return json(r);}
async function patchListing(token:string,id:number,params:Record<string,string>){const body=new URLSearchParams(params);const r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${id}`,{method:"PATCH",headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded"},body,cache:"no-store"});if(!r.ok)throw new Error(`LISTING_PATCH_HTTP_${r.status}`);return json(r);}

async function verifySeller(token:string,id:number,active=false){const state=await getEtsySellerStateSnapshot({shopId:SHOP_ID,accessToken:token});const expectedActive=active?2:1, expectedDraft=active?1:2;if(state.total!==3||state.counts.active!==expectedActive||state.counts.draft!==expectedDraft||state.counts.inactive!==0||state.counts.sold_out!==0||state.counts.expired!==0)throw new Error("SELLER_COUNTS_MISMATCH");for(const p of PROTECTED){const row=state.listings.find(x=>x.listingId===p.listingId);if(!row||row.state!==p.state||row.title!==p.title)throw new Error(`PROTECTED_LISTING_DRIFT_${p.listingId}`);}const target=state.listings.find(x=>x.listingId===id);if(!target||target.title!==TITLE||target.state!==(active?"active":"draft"))throw new Error("TARGET_LISTING_STATE_MISMATCH");return state;}

export async function GET(request:Request){try{const url=new URL(request.url);const id=Number(url.searchParams.get("listingId"));if(!Number.isSafeInteger(id)||id<=0)throw new Error("LISTING_ID_REQUIRED");const token=await getValidEtsyAccessToken();const l=await listing(token,id);const active=String(l.state)==="active";if(!listingMatches(l,active))throw new Error("LISTING_IDENTITY_MISMATCH");const [im,fi,vi,state,sec]=await Promise.all([images(token,id),files(token,id),videos(token,id),verifySeller(token,id,active),sections(token)]);const section=sec.find((r:any)=>String(r.title??"").trim()===SHOP_SECTION);return NextResponse.json({status:"READ_ONLY",listingId:id,state:String(l.state),coreOk:true,assets:{images:imageRowsOk(im),imageCount:im.length,files:fileRowsOk(fi),fileCount:fi.length,video:videoRowsOk(vi),videoCount:vi.length},shopSectionId:Number(l.shop_section_id??0),expectedShopSectionId:Number(section?.shop_section_id??0),sellerCounts:state.counts,gateEnabled:gateEnabled(),ETSY_WRITE_COUNT:0},{headers:{"cache-control":"no-store"}});}catch(e){return NextResponse.json({status:"READ_ONLY_FAILED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:0},{status:409});}}

export async function POST(request:Request){let writes=0;try{if(!gateEnabled())throw new Error("PCL_COMPLETE_GATE_DISABLED");if((request.headers.get("x-operation-id")??"")!==OPERATION_ID)throw new Error("PCL_OPERATION_ID_INVALID");const body=await request.json() as {nonce?:unknown;listingId?:unknown;action?:unknown;rank?:unknown;assetUrl?:unknown};const nonce=typeof body.nonce==="string"?body.nonce.trim():"";if(!nonce||!nonceOk(nonce))throw new Error("PCL_NONCE_INVALID");const id=Number(body.listingId);if(!Number.isSafeInteger(id)||id<=0)throw new Error("LISTING_ID_INVALID");const action=typeof body.action==="string"?body.action.trim():"";const token=await getValidEtsyAccessToken();const l=await listing(token,id);if(!listingMatches(l,false))throw new Error("DRAFT_CORE_MISMATCH");await verifySeller(token,id,false);

if(action==="file"){const rank=Number(body.rank);if(!Number.isInteger(rank)||rank<1||rank>FILES.length)throw new Error("FILE_RANK_INVALID");const spec=FILES[rank-1];const current=await files(token,id);const existing=current.find((r:any)=>Number(r.rank)===rank);if(existing){if(sameEtsyFilename(existing.filename,spec.name)&&Number(existing.size_bytes)===spec.size)return NextResponse.json({status:"ALREADY_PRESENT",action,rank,ETSY_WRITE_COUNT:0});throw new Error("FILE_RANK_CONFLICT");}const b=await fetchAsset(String(body.assetUrl??""),spec);await sleep(500);await uploadBuyerFile(token,id,spec,rank,b);writes=1;await sleep(1200);const after=await files(token,id);const row=after.find((r:any)=>Number(r.rank)===rank);if(!row||!sameEtsyFilename(row.filename,spec.name)||Number(row.size_bytes)!==spec.size)throw new Error("FILE_FINAL_VERIFY_FAILED");return NextResponse.json({status:"PASS",action,rank,fileName:spec.name,fileCount:after.length,ETSY_WRITE_COUNT:writes});}

if(action==="image"){const rank=Number(body.rank);if(!Number.isInteger(rank)||rank<1||rank>IMAGES.length)throw new Error("IMAGE_RANK_INVALID");const spec=IMAGES[rank-1];const current=await images(token,id);if(current.some((r:any)=>Number(r.rank)===rank))return NextResponse.json({status:"ALREADY_PRESENT",action,rank,ETSY_WRITE_COUNT:0});const b=await fetchAsset(String(body.assetUrl??""),spec);await sleep(500);await uploadImage(token,id,spec,rank,b);writes=1;await sleep(1200);const after=await images(token,id);if(!after.some((r:any)=>Number(r.rank)===rank))throw new Error("IMAGE_FINAL_VERIFY_FAILED");return NextResponse.json({status:"PASS",action,rank,fileName:spec.name,imageCount:after.length,ETSY_WRITE_COUNT:writes});}

if(action==="video"){const current=await videos(token,id);if(current.length){if(videoRowsOk(current))return NextResponse.json({status:"ALREADY_PRESENT",action,ETSY_WRITE_COUNT:0});throw new Error("VIDEO_CONFLICT");}const b=await fetchAsset(String(body.assetUrl??""),VIDEO);await sleep(500);await uploadVideo(token,id,VIDEO,b);writes=1;let after:any[]=[];for(let i=0;i<8;i++){await sleep(2000);after=await videos(token,id);if(videoRowsOk(after))break;}if(!videoRowsOk(after))throw new Error("VIDEO_FINAL_VERIFY_FAILED");return NextResponse.json({status:"PASS",action,videoCount:after.length,videoState:after[0]?.video_state,ETSY_WRITE_COUNT:writes});}

if(action==="section"){const sec=await sections(token);const section=sec.find((r:any)=>String(r.title??"").trim()===SHOP_SECTION);if(!section||!Number(section.shop_section_id))throw new Error("SECTION_NOT_FOUND");if(Number(l.shop_section_id)===Number(section.shop_section_id))return NextResponse.json({status:"ALREADY_PRESENT",action,shopSectionId:Number(section.shop_section_id),ETSY_WRITE_COUNT:0});await patchListing(token,id,{shop_section_id:String(section.shop_section_id)});writes=1;await sleep(1000);const after=await listing(token,id);if(after.shop_section_id!=null&&Number(after.shop_section_id)!==Number(section.shop_section_id))throw new Error("SECTION_FINAL_VERIFY_FAILED");return NextResponse.json({status:"PASS",action,shopSectionId:Number(section.shop_section_id),shopSectionTitle:SHOP_SECTION,ETSY_WRITE_COUNT:writes});}

if(action==="publish"){const sec=await sections(token);const section=sec.find((r:any)=>String(r.title??"").trim()===SHOP_SECTION);if(!section||Number(l.shop_section_id)!==Number(section.shop_section_id))throw new Error("PUBLISH_SECTION_GATE_FAILED");const im=await images(token,id);await sleep(500);const fi=await files(token,id);await sleep(500);const vi=await videos(token,id);if(!imageRowsOk(im)||!fileRowsOk(fi)||!videoRowsOk(vi))throw new Error("PUBLISH_ASSET_GATE_FAILED");await patchListing(token,id,{state:"active"});writes=1;let after=l;for(let i=0;i<8;i++){await sleep(1500);after=await listing(token,id);if(String(after.state)==="active")break;}if(!listingMatches(after,true))throw new Error("PUBLISH_FINAL_VERIFY_FAILED");const seller=await verifySeller(token,id,true);return NextResponse.json({status:"PUBLISHED_PASS",listingId:id,url:`https://www.etsy.com/listing/${id}`,imageCount:im.length,fileCount:fi.length,videoCount:vi.length,sellerCounts:seller.counts,ETSY_WRITE_COUNT:writes});}

throw new Error("ACTION_INVALID");}catch(e){return NextResponse.json({status:writes>0?"RECONCILIATION_REQUIRED":"BLOCKED_FAIL_CLOSED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:writes},{status:writes>0?202:409,headers:{"cache-control":"no-store"}});}}
