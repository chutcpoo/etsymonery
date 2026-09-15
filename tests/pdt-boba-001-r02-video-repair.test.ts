import assert from "node:assert/strict";
import test from "node:test";
import { hashOperationRequest, MemoryOperationLedgerRepository, OPERATION_LEDGER_SCHEMA_VERSION } from "../lib/operation-ledger";
import { PDT_BOBA_001_B01_DESCRIPTION } from "../lib/pdt-boba-001-b01-description";
import { exactPdtBoba001R02VideoRepairBody, handlePdtBoba001R02VideoRepair, PDT_BOBA_001_R02_VIDEO_REPAIR, verifyPdtBoba001R02VideoProtectedState, verifyPdtBoba001R02VideoReconciliation, exactPdtBoba001R02DeleteOldRecoveryBody, handlePdtBoba001R02DeleteOldRecovery, PDT_BOBA_001_R02_DELETE_OLD_RECOVERY, verifyPdtBoba001R02DeleteOldRecoveryProtectedState } from "../lib/pdt-boba-001-r02-video-repair";

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


const R02_RECON_REQUEST_HASH="e5bdbf451c907914ed7c20934c49b628c9bd83fbb8c4855b910f0419b865601a";
const R02_RECON_NEW_VIDEO_ID=842407035;
async function reconciliationRepo(over:Record<string,unknown>={}){
  const repo=new MemoryOperationLedgerRepository();
  await repo.save({
    schemaVersion:OPERATION_LEDGER_SCHEMA_VERSION,
    operationId:PDT_BOBA_001_R02_VIDEO_REPAIR.operationId,
    requestHash:R02_RECON_REQUEST_HASH,
    attempts:2,
    status:"RECONCILIATION_REQUIRED",
    recoveryPoint:"VIDEO_UPLOAD_READBACK_UNVERIFIED",
    receipt:{newVideoId:R02_RECON_NEW_VIDEO_ID,providerUploadStatus:201,ETSY_WRITE_COUNT:1,ETSY_WRITE_ATTEMPT_COUNT:1,ETSY_WRITE_COUNT_STATUS:"CONFIRMED",...over},
    createdAt:"2026-09-14T03:28:38.733Z",
    updatedAt:"2026-09-14T03:28:45.544Z"
  });
  return repo;
}
function reconciliationProvider(ids:number[],oldState:"active"|"inactive"="active"){
  const methods:string[]=[];
  const videos=ids.map(id=>id===841193954?({...oldVideo(),video_state:oldState}):({video_id:id,width:1600,height:1280,video_state:"active",video_url:`https://video.test/${id}.mp4`,thumbnail_url:"new.jpg"}));
  const fetchImpl=(async(input:string|URL|Request,init?:RequestInit)=>{
    const url=String(input),method=init?.method??"GET";methods.push(method);
    if(url.startsWith("https://video.test/")) return new Response(new Uint8Array([1]),{status:200});
    if(url.endsWith("/listings/4560696421"))return Response.json(core());
    if(url.endsWith("/images"))return Response.json({results:imgs()});
    if(url.endsWith("/properties"))return Response.json({results:[]});
    if(url.endsWith("/files"))return Response.json({results:files()});
    if(url.endsWith("/videos"))return Response.json({results:structuredClone(videos)});
    throw new Error(`unexpected request ${method} ${url}`);
  }) as typeof fetch;
  return {fetchImpl,methods};
}
const reconciliationVerifyVideoUrl=async(url:string,sha:string,size:number)=>{
  if(url.includes("old")) return sha===PDT_BOBA_001_R02_VIDEO_REPAIR.baselineVideo.sha256&&size===PDT_BOBA_001_R02_VIDEO_REPAIR.baselineVideo.sizeBytes;
  return sha===PDT_BOBA_001_R02_VIDEO_REPAIR.asset.sha256&&size===PDT_BOBA_001_R02_VIDEO_REPAIR.asset.sizeBytes;
};

test("R02 reconciliation classifies exact uploaded-new plus old baseline as delete pending with zero writes",async()=>{
  const p=reconciliationProvider([841193954,R02_RECON_NEW_VIDEO_ID]),repo=await reconciliationRepo();
  const r=await verifyPdtBoba001R02VideoReconciliation({repository:repo,getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyVideoUrl:reconciliationVerifyVideoUrl}),x=await js(r);
  assert.equal(r.status,200);assert.equal(x.status,"UPLOAD_CONFIRMED_DELETE_PENDING");assert.equal(x.ETSY_WRITE_COUNT,0);assert.equal(x.ledgerConfirmedWriteCount,1);assert.equal(x.newVideoProviderIdentityVerified,true);assert.equal(x.providerCdnSourceShaComparison,"NOT_APPLICABLE_PROVIDER_TRANSCODE");assert.equal(x.exactNextGate,"FRESH_EXPLICIT_AUTHORIZATION_REQUIRED_BEFORE_OLD_VIDEO_DELETE");
  assert.ok(p.methods.every(method=>method==="GET"));
});

test("R02 reconciliation treats retained inactive old provider record as complete and authorizes no delete",async()=>{
  const p=reconciliationProvider([841193954,R02_RECON_NEW_VIDEO_ID],"inactive"),repo=await reconciliationRepo();
  const r=await verifyPdtBoba001R02VideoReconciliation({repository:repo,getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyVideoUrl:reconciliationVerifyVideoUrl}),x=await js(r);
  assert.equal(r.status,200);assert.equal(x.status,"REPLACEMENT_CONFIRMED_COMPLETE_PROVIDER_RETAINS_INACTIVE_BASELINE");
  assert.deepEqual(x.liveVideoIds,[R02_RECON_NEW_VIDEO_ID]);assert.deepEqual(x.inactiveProviderVideoIds,[841193954]);
  assert.equal(x.exactNextGate,"BASELINE_LOCK_MEASUREMENT_NO_ADDITIONAL_ETSY_MUTATION_AUTHORIZED");assert.equal(x.ETSY_WRITE_COUNT,0);
  assert.ok(p.methods.every(method=>method==="GET"));
});

test("R02 reconciliation confirms complete provider state when only exact new video remains",async()=>{
  const p=reconciliationProvider([R02_RECON_NEW_VIDEO_ID]),repo=await reconciliationRepo();
  const r=await verifyPdtBoba001R02VideoReconciliation({repository:repo,getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyVideoUrl:reconciliationVerifyVideoUrl}),x=await js(r);
  assert.equal(r.status,200);assert.equal(x.status,"REPLACEMENT_CONFIRMED_COMPLETE");assert.equal(x.ledgerMayCloseReadOnly,true);assert.equal(x.newVideoProviderIdentityVerified,true);assert.equal(x.providerCdnSourceShaComparison,"NOT_APPLICABLE_PROVIDER_TRANSCODE");assert.equal(x.ETSY_WRITE_COUNT,0);assert.ok(p.methods.every(method=>method==="GET"));
});

test("R02 reconciliation fails closed if exact new video is not visible",async()=>{
  const p=reconciliationProvider([841193954]),repo=await reconciliationRepo();
  const r=await verifyPdtBoba001R02VideoReconciliation({repository:repo,getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyVideoUrl:reconciliationVerifyVideoUrl}),x=await js(r);
  assert.equal(r.status,409);assert.equal(x.status,"UPLOAD_NOT_VISIBLE_UNRESOLVED");assert.equal(x.ETSY_WRITE_COUNT,0);assert.ok(p.methods.every(method=>method==="GET"));
});

test("R02 reconciliation rejects exact new video id when provider state is not active",async()=>{
  const p=reconciliationProvider([841193954,R02_RECON_NEW_VIDEO_ID]),repo=await reconciliationRepo();
  const original=p.fetchImpl;
  p.fetchImpl=(async(input:string|URL|Request,init?:RequestInit)=>{
    const url=String(input);
    if(url.endsWith("/videos")){
      return Response.json({results:[oldVideo(),{video_id:R02_RECON_NEW_VIDEO_ID,width:1600,height:1280,video_state:"processing",video_url:"https://video.test/new-processing.mp4"}]});
    }
    return original(input,init);
  }) as typeof fetch;
  const r=await verifyPdtBoba001R02VideoReconciliation({repository:repo,getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyVideoUrl:reconciliationVerifyVideoUrl}),x=await js(r);
  assert.equal(r.status,409);assert.equal(x.status,"NEW_VIDEO_PROVIDER_IDENTITY_MISMATCH");assert.equal(x.providerVideoState,"processing");assert.equal(x.ETSY_WRITE_COUNT,0);
});

test("R02 reconciliation rejects ledger drift before Etsy access",async()=>{
  const p=reconciliationProvider([841193954,R02_RECON_NEW_VIDEO_ID]),repo=await reconciliationRepo({newVideoId:999});
  const r=await verifyPdtBoba001R02VideoReconciliation({repository:repo,getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyVideoUrl:reconciliationVerifyVideoUrl});
  assert.equal(r.status,409);assert.equal(p.methods.length,0);
});

test("R02 reconciliation route is GET-only and delegates to exact recovery verifier",async()=>{
  const {readFile}=await import("node:fs/promises");
  const source=await readFile(new URL("../app/api/etsy/test/boba-r02-reconciliation/route.ts",import.meta.url),"utf8");
  assert.match(source,/export async function GET\(/);assert.match(source,/verifyPdtBoba001R02VideoReconciliation\(\)/);
  assert.doesNotMatch(source,/export async function (POST|PUT|PATCH|DELETE)\(/);assert.doesNotMatch(source,/method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
});

function deleteOldProvider(options:{deleteStatus?:number;throwDelete?:boolean}={}){
  let videos=[oldVideo(),{video_id:R02_RECON_NEW_VIDEO_ID,width:1600,height:1280,video_state:"active",video_url:`https://video.test/${R02_RECON_NEW_VIDEO_ID}.mp4`,thumbnail_url:"new.jpg"}];
  const methods:string[]=[];
  const fetchImpl=(async(input:string|URL|Request,init?:RequestInit)=>{
    const url=String(input),method=init?.method??"GET";methods.push(method);
    if(url.startsWith("https://video.test/")) return new Response(new Uint8Array([1]),{status:200});
    if(url.endsWith("/listings/4560696421")) return Response.json(core());
    if(url.endsWith("/images")) return Response.json({results:imgs()});
    if(url.endsWith("/properties")) return Response.json({results:[]});
    if(url.endsWith("/files")) return Response.json({results:files()});
    if(url.endsWith("/videos")) return Response.json({results:structuredClone(videos)});
    if(url.endsWith("/videos/841193954")&&method==="DELETE"){
      if(options.throwDelete) throw new Error("network");
      const status=options.deleteStatus??204;
      if(status===204) videos=videos.filter(v=>v.video_id!==841193954);
      return new Response(null,{status});
    }
    throw new Error(`unexpected request ${method} ${url}`);
  }) as typeof fetch;
  return {fetchImpl,methods,videos:()=>structuredClone(videos)};
}

async function deleteOldBinding(repo:MemoryOperationLedgerRepository,p:ReturnType<typeof deleteOldProvider>){
  const verify=await verifyPdtBoba001R02DeleteOldRecoveryProtectedState({repository:repo,getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyVideoUrl:reconciliationVerifyVideoUrl});
  const v=await js(verify);assert.equal(verify.status,200);assert.equal(v.status,"PROTECTED_STATE_MATCH");
  const auth="PDT-BOBA-001-R02-VIDEO-DELETE-OLD-AUTH-20260915-01";
  const body=exactPdtBoba001R02DeleteOldRecoveryBody(auth,String(v.protectedStateFingerprint));
  return {body,hash:hashOperationRequest(body),protectedStateFingerprint:String(v.protectedStateFingerprint)};
}

test("R02 delete-old recovery verifier binds exact two-video state and writes zero",async()=>{
  const repo=await reconciliationRepo(),p=deleteOldProvider();
  const r=await verifyPdtBoba001R02DeleteOldRecoveryProtectedState({repository:repo,getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyVideoUrl:reconciliationVerifyVideoUrl}),x=await js(r);
  assert.equal(r.status,200);assert.equal(x.status,"PROTECTED_STATE_MATCH");assert.equal(x.operationId,PDT_BOBA_001_R02_DELETE_OLD_RECOVERY.operationId);assert.equal(x.oldVideoId,841193954);assert.equal(x.newVideoId,R02_RECON_NEW_VIDEO_ID);assert.equal(x.ETSY_WRITE_COUNT,0);assert.ok(p.methods.every(m=>m==="GET"));
});

test("R02 delete-old executor deletes old video exactly once and protects new video",async()=>{
  env();const repo=await reconciliationRepo(),p=deleteOldProvider(),binding=await deleteOldBinding(repo,p);
  const r=await handlePdtBoba001R02DeleteOldRecovery(binding.body,binding.hash,req(),{repository:repo,getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyVideoUrl:reconciliationVerifyVideoUrl,now:()=>"2026-09-15T00:30:00.000Z"}),x=await js(r);
  assert.equal(r.status,200);assert.equal(x.status,"UPDATED_AND_VERIFIED");assert.equal(x.ETSY_WRITE_COUNT,1);assert.deepEqual(p.videos().map(v=>v.video_id),[R02_RECON_NEW_VIDEO_ID]);assert.equal(p.methods.filter(m=>m==="DELETE").length,1);assert.equal(p.methods.filter(m=>m==="POST").length,0);
  const replay=await handlePdtBoba001R02DeleteOldRecovery(binding.body,binding.hash,req(),{repository:repo,getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyVideoUrl:reconciliationVerifyVideoUrl});assert.equal(replay.status,200);assert.equal(p.methods.filter(m=>m==="DELETE").length,1);
});

test("R02 delete-old ambiguous DELETE never retries and preserves new video",async()=>{
  env();const repo=await reconciliationRepo(),p=deleteOldProvider({throwDelete:true}),binding=await deleteOldBinding(repo,p);
  let r=await handlePdtBoba001R02DeleteOldRecovery(binding.body,binding.hash,req(),{repository:repo,getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyVideoUrl:reconciliationVerifyVideoUrl,now:()=>"2026-09-15T00:31:00.000Z"});assert.equal(r.status,202);assert.deepEqual(p.videos().map(v=>v.video_id),[841193954,R02_RECON_NEW_VIDEO_ID]);
  r=await handlePdtBoba001R02DeleteOldRecovery(binding.body,binding.hash,req(),{repository:repo,getAccessToken:async()=>"t",fetchImpl:p.fetchImpl,verifyVideoUrl:reconciliationVerifyVideoUrl});assert.equal(r.status,202);assert.equal(p.methods.filter(m=>m==="DELETE").length,1);
});

test("R02 delete-old public verifier is GET-only and workflow/ingress register exact recovery",async()=>{
  const {readFile}=await import("node:fs/promises");
  const route=await readFile(new URL("../app/api/etsy/test/boba-r02-delete-old-recovery/route.ts",import.meta.url),"utf8");
  const ingress=await readFile(new URL("../app/api/internal/etsy/authorized-operation/route.ts",import.meta.url),"utf8");
  const workflow=await readFile(new URL("../.github/workflows/execute-authorized-etsy-operation.yml",import.meta.url),"utf8");
  assert.match(route,/export async function GET\(/);assert.doesNotMatch(route,/export async function (POST|PUT|PATCH|DELETE)\(/);
  assert.match(ingress,/PDT_BOBA_001_R02_DELETE_OLD_RECOVERY\.operationId/);assert.match(ingress,/handlePdtBoba001R02DeleteOldRecovery/);
  assert.match(workflow,/PDT-BOBA-001-R02-VIDEO-DELETE-OLD-RECOVERY-001/);
});
