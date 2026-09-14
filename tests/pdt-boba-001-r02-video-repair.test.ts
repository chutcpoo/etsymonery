import assert from "node:assert/strict";
import test from "node:test";
import { hashOperationRequest, MemoryOperationLedgerRepository } from "../lib/operation-ledger";
import { PDT_BOBA_001_B01_DESCRIPTION } from "../lib/pdt-boba-001-b01-description";
import { exactPdtBoba001R02VideoRepairBody, handlePdtBoba001R02VideoRepair, PDT_BOBA_001_R02_VIDEO_REPAIR, verifyPdtBoba001R02VideoProtectedState } from "../lib/pdt-boba-001-r02-video-repair";

const AUTH="PDT-BOBA-001-R02-VIDEO-AUTH-20260914-01";
const TAGS=["bubble tea business","boba shop toolkit","boba operations","boba shop sop","cafe opening closing","daily prep log","stock waste tracker","shift handoff log","tea cafe template","milktea inventory","cafe cleaning sheet","drink shop checklist","google sheets boba"];
const GALLERY=[[8547319609,1,2000,1600],[8547319665,2,2000,1600],[8547319731,3,1600,900],[8547319783,4,1600,900],[8547319831,5,1600,900],[8547319873,6,1600,900],[8499440812,7,1600,900],[8499440860,8,1600,900],[8499440896,9,1600,900],[8547320067,10,1600,900],[8547320117,11,1600,900],[8499441032,12,1600,900]];
const FILES=[[1509032655604,1,"PoonthaiDigital_Boba_Checklist_A4.pdf",17459,"application/pdf"],[1509032655658,2,"PoonthaiDigital_Boba_Checklist_US_Letter.pdf",16632,"application/pdf"],[1509891952828,3,"Boba_Read_Me_License.pdf",4620,"application/pdf"],[1515492140861,4,"Boba_Quick_Start.pdf",5305,"application/pdf"],[1514712925238,5,"PoonthaiDigital_Boba_Shop_Operations_Tracker.zip",22264,"application/zip"]];
const core=(over:Record<string,unknown>={})=>({listing_id:4560696421,shop_id:23582741,state:"active",title:"Boba Shop Operations Toolkit, Cafe Daily SOP, Checklist, Excel Google Sheets Template (Digital Download)",description:PDT_BOBA_001_B01_DESCRIPTION.description,price:{amount:1290,divisor:100,currency_code:"USD"},taxonomy_id:12476,quantity:999,who_made:"i_did",when_made:"2020_2026",listing_type:"download",return_policy_id:1,file_data:"4 PDF, 1 ZIP",tags:[...TAGS],is_supply:false,...over});
const imgs=()=>GALLERY.map(([listing_image_id,rank,full_width,full_height])=>({listing_image_id,rank,full_width,full_height}));
const files=()=>FILES.map(([listing_file_id,rank,filename,size_bytes,filetype])=>({listing_file_id,rank,filename,size_bytes,filetype}));
const oldVideo=()=>({video_id:841193954,width:1600,height:1280,video_state:"active",video_url:"https://video.test/old.mp4",thumbnail_url:"old.jpg"});
const newVideo=()=>({video_id:950000001,width:1600,height:1280,video_state:"active",video_url:"https://video.test/new.mp4",thumbnail_url:"new.jpg"});

type Opt={listing?:Record<string,unknown>;postStatus?:number;deleteStatus?:number;throwPost?:boolean;throwDelete?:boolean;baselineOnly?:boolean};
function provider(o:Opt={}){
  let listing=o.listing??core(), videos=[oldVideo()], writes=0; const methods:string[]=[];
  const fetchImpl=(async(input:string|URL|Request,init?:RequestInit)=>{
    const url=String(input),method=init?.method??"GET"; methods.push(method);
    if(url.startsWith("https://video.test/")) return new Response(new Uint8Array([1]),{status:200});
    if(method==="POST"&&url.endsWith("/videos")){
      writes++; if(o.throwPost)throw new Error("ambiguous post");
      if(o.postStatus&&o.postStatus!==201)return Response.json({error:"rejected"},{status:o.postStatus});
      assert.ok(init?.body instanceof FormData); assert.equal(String(init.body.get("name")),PDT_BOBA_001_R02_VIDEO_REPAIR.asset.fileName);
      videos=[...videos,newVideo()]; return Response.json(newVideo(),{status:201});
    }
    if(method==="DELETE"){
      writes++; if(o.throwDelete)throw new Error("ambiguous delete");
      if(o.deleteStatus&&o.deleteStatus!==204)return Response.json({error:"rejected"},{status:o.deleteStatus});
      videos=videos.filter(v=>v.video_id!==841193954); return new Response(null,{status:204});
    }
    if(url.endsWith("/listings/4560696421"))return Response.json(listing);
    if(url.endsWith("/images"))return Response.json({results:imgs()});
    if(url.endsWith("/properties"))return Response.json({results:[]});
    if(url.endsWith("/files"))return Response.json({results:files()});
    if(url.endsWith("/videos"))return Response.json({results:structuredClone(videos)});
    return new Response("{}",{status:404});
  }) as typeof fetch;
  return {fetchImpl,writes:()=>writes,methods,videos:()=>videos};
}
function env(){process.env.PUBLISH_WRITES_ENABLED="true";process.env.ETSY_B01_WRITE_TOKEN="token";process.env.ETSY_SHOP_ID="23582741";process.env.ETSY_API_KEY="k";process.env.ETSY_SHARED_SECRET="s";}
const req=()=>new Request("https://x",{method:"POST",headers:{"x-autodigitalpublisher-write-token":"token"}});
const js=(r:Response)=>r.json() as Promise<Record<string,unknown>>;
const verifyVideoUrl=async(url:string,sha:string,size:number)=>url.includes("old")?sha===PDT_BOBA_001_R02_VIDEO_REPAIR.baselineVideo.sha256&&size===PDT_BOBA_001_R02_VIDEO_REPAIR.baselineVideo.sizeBytes:sha===PDT_BOBA_001_R02_VIDEO_REPAIR.asset.sha256&&size===PDT_BOBA_001_R02_VIDEO_REPAIR.asset.sizeBytes;
async function binding(p=provider()){
  const vr=await verifyPdtBoba001R02VideoProtectedState({getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyVideoUrl}), vx=await js(vr);
  assert.equal(vr.status,200); const fp=String(vx.protectedStateFingerprint); const body=exactPdtBoba001R02VideoRepairBody(AUTH,fp); return {fp,body,hash:hashOperationRequest(body),p};
}

process.env.ETSY_API_KEY="k";process.env.ETSY_SHARED_SECRET="s";
test("R02 video operation identity is exact and video-only",()=>{assert.equal(PDT_BOBA_001_R02_VIDEO_REPAIR.operationId,"PDT-BOBA-001-R02-VIDEO-REPAIR-001");assert.equal(PDT_BOBA_001_R02_VIDEO_REPAIR.operation,"REPLACE_LISTING_VIDEO_ONLY");assert.equal(PDT_BOBA_001_R02_VIDEO_REPAIR.asset.sha256,"2e7c4c4633da32d07ef0445e46d25846ee43645305a9193086a62dc1c4455d75");});
test("fresh verifier matches exact current listing and baseline video with zero writes",async()=>{const p=provider(),r=await verifyPdtBoba001R02VideoProtectedState({getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyVideoUrl}),x=await js(r);assert.equal(r.status,200);assert.equal(x.status,"PROTECTED_STATE_MATCH");assert.match(String(x.protectedStateFingerprint),/^[a-f0-9]{64}$/);assert.equal(x.baselineVideoSha256Verified,true);assert.equal(p.writes(),0);});
test("fresh verifier fails closed on protected listing drift",async()=>{const p=provider({listing:core({quantity:998})}),r=await verifyPdtBoba001R02VideoProtectedState({getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyVideoUrl});assert.equal(r.status,409);assert.equal(p.writes(),0);});
test("executor uploads R02 first, verifies it, then deletes old video",async()=>{env();const b=await binding(),repo=new MemoryOperationLedgerRepository();const r=await handlePdtBoba001R02VideoRepair(b.body,b.hash,req(),{repository:repo,getAccessToken:async()=>"t",fetchImpl:b.p.fetchImpl,verifyAsset:()=>true,verifyVideoUrl,loadAsset:async()=>Buffer.alloc(PDT_BOBA_001_R02_VIDEO_REPAIR.asset.sizeBytes),sleep:async()=>{},now:()=>"2026-09-14T03:00:00.000Z"}),x=await js(r);assert.equal(r.status,200);assert.equal(x.status,"UPDATED_AND_VERIFIED");assert.equal(x.ETSY_WRITE_COUNT,2);assert.deepEqual(b.p.methods.filter(m=>m==="POST"||m==="DELETE"),["POST","DELETE"]);assert.deepEqual(b.p.videos().map(v=>v.video_id),[950000001]);});
test("executor refuses authorization hash mismatch before any write",async()=>{env();const b=await binding(),repo=new MemoryOperationLedgerRepository();const r=await handlePdtBoba001R02VideoRepair(b.body,"0".repeat(64),req(),{repository:repo,getAccessToken:async()=>"t",fetchImpl:b.p.fetchImpl,verifyAsset:()=>true,verifyVideoUrl,loadAsset:async()=>Buffer.alloc(1)});assert.equal(r.status,409);assert.equal(b.p.writes(),0);});
test("ambiguous upload becomes reconciliation-required and never deletes baseline",async()=>{env();const p=provider({throwPost:true}),b=await binding(p),repo=new MemoryOperationLedgerRepository(),runtime={repository:repo,getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyAsset:()=>true,verifyVideoUrl,loadAsset:async()=>Buffer.alloc(PDT_BOBA_001_R02_VIDEO_REPAIR.asset.sizeBytes),sleep:async()=>{},now:()=>"2026-09-14T03:00:00.000Z"};let r=await handlePdtBoba001R02VideoRepair(b.body,b.hash,req(),runtime),x=await js(r);assert.equal(r.status,202);assert.equal(x.ETSY_WRITE_COUNT_STATUS,"UNRESOLVED_REQUIRES_RECONCILIATION");r=await handlePdtBoba001R02VideoRepair(b.body,b.hash,req(),runtime);assert.equal(r.status,202);assert.equal(p.writes(),1);assert.deepEqual(p.videos().map(v=>v.video_id),[841193954]);});
test("delete failure after confirmed upload stops with two videos and no retry",async()=>{env();const p=provider({deleteStatus:500}),b=await binding(p),repo=new MemoryOperationLedgerRepository(),runtime={repository:repo,getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyAsset:()=>true,verifyVideoUrl,loadAsset:async()=>Buffer.alloc(PDT_BOBA_001_R02_VIDEO_REPAIR.asset.sizeBytes),sleep:async()=>{},now:()=>"2026-09-14T03:00:00.000Z"};let r=await handlePdtBoba001R02VideoRepair(b.body,b.hash,req(),runtime),x=await js(r);assert.equal(r.status,202);assert.equal(x.ETSY_WRITE_COUNT,1);assert.equal(x.ETSY_WRITE_COUNT_STATUS,"CONFIRMED_PARTIAL");r=await handlePdtBoba001R02VideoRepair(b.body,b.hash,req(),runtime);assert.equal(r.status,202);assert.equal(p.writes(),2);assert.deepEqual(p.videos().map(v=>v.video_id),[841193954,950000001]);});
