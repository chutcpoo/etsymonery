import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { before, after } from "node:test";
import {
  createEtsyChatAssetHandler, getChatAssetIntakeStatus, CHAT_ASSET_MAX_BYTES
} from "../lib/etsy-chat-asset-intake";

const TOKEN = "test-token-only";
const FP = "a".repeat(64), LFP = "b".repeat(64);
const PRODUCT_ID = "P01_HOME_MAINTENANCE";
const FILE_ID = "1jYarRJzUDIpQHB-m25FBGuJVgc3hWkaw";
const SHOP_ID = 23582741, DRAFT_ID = 1234567890;
const ROOT = "1F2c8J04_Crv1GzN0KBMwlChxvBaYo7px";
const fileBytes = Buffer.from("%PDF-1.4\nfixture from Drive\n%%EOF", "utf8");
const sha = createHash("sha256").update(fileBytes).digest("hex");
const fileName = "Home_Maintenance_Starter_US_Letter.pdf";
const envNames = [
  "ETSY_DRAFT_WRITE_TOKEN", "ETSY_DRAFT_WRITES_ENABLED",
  "ETSY_CHAT_ASSET_WRITES_ENABLED", "ETSY_SHOP_ID", "GOOGLE_DRIVE_SOURCE_ROOT_ID",
  "ETSY_CHAT_APPROVED_PRODUCT_ID", "ETSY_CHAT_APPROVED_CANDIDATE_FINGERPRINT",
  "ETSY_CHAT_APPROVED_DRAFT_LISTING_ID", "ETSY_CHAT_APPROVED_ASSETS_JSON",
  "ETSY_QC_APPROVED_PRODUCT_ID", "ETSY_QC_APPROVED_CANDIDATE_FINGERPRINT",
  "ETSY_QC_APPROVED_LISTING_FINGERPRINT", "ETSY_QC_APPROVED_REPORT_SHA256",
  "ETSY_QC_APPROVED_REPORT_DRIVE_ID"
];
const beforeEnv: Record<string,string|undefined>={};
before(()=>{
  for(const n of envNames)beforeEnv[n]=process.env[n];
  process.env.ETSY_DRAFT_WRITE_TOKEN=TOKEN;
  process.env.ETSY_DRAFT_WRITES_ENABLED="false";
  process.env.ETSY_CHAT_ASSET_WRITES_ENABLED="false";
  process.env.ETSY_SHOP_ID=String(SHOP_ID);
  process.env.GOOGLE_DRIVE_SOURCE_ROOT_ID=ROOT;
});
after(()=>{for(const n of envNames){
 const v=beforeEnv[n];if(v===undefined)delete process.env[n];else process.env[n]=v;
}});
function manifest(action:"PREFLIGHT"|"UPLOAD"="PREFLIGHT"){
 return {
  action,operationId:"P01-ASSET-TEST-01",productId:PRODUCT_ID,
  candidateId:"P01-EXACT-CANDIDATE",candidateFingerprint:FP,
  expectedListingFingerprint:LFP,shopId:SHOP_ID,draftListingId:DRAFT_ID,
  kind:"UPLOAD_FILE",driveFileId:FILE_ID,assetName:fileName,
  expectedSha256:sha,expectedBytes:fileBytes.byteLength,rank:1,
  qc:{state:"QC_PASSED",productTruthVerified:true,
   testerFingerprint:FP,independentFinalQcFingerprint:FP}
 };
}
function request(m:Record<string,unknown>=manifest(),opts:{
 token?:string;bytes?:Buffer;filename?:string;mime?:string;length?:string
}={}){
 const f=new FormData();
 f.set("manifest",JSON.stringify(m));
 f.set("asset",new File([new Uint8Array(opts.bytes??fileBytes)],
   opts.filename??fileName,{type:opts.mime??"application/pdf"}));
 return new Request("https://preview.example/api/etsy/chat-assets",{
  method:"POST",headers:{
   ...(opts.token?{"x-autodigitalpublisher-write-token":opts.token}:{}),
   ...(opts.length?{"content-length":opts.length}:{})
  },body:f
 });
}
function allowed(){
 process.env.ETSY_DRAFT_WRITES_ENABLED="true";
 process.env.ETSY_CHAT_ASSET_WRITES_ENABLED="true";
 process.env.ETSY_CHAT_APPROVED_PRODUCT_ID=PRODUCT_ID;
 process.env.ETSY_CHAT_APPROVED_CANDIDATE_FINGERPRINT=FP;
 process.env.ETSY_CHAT_APPROVED_DRAFT_LISTING_ID=String(DRAFT_ID);
 process.env.ETSY_CHAT_APPROVED_ASSETS_JSON=JSON.stringify({
  rootId:ROOT,productId:PRODUCT_ID,candidateFingerprint:FP,
  expectedListingFingerprint:LFP,
  assets:[{
   driveFileId:FILE_ID,assetName:fileName,expectedSha256:sha,
   expectedBytes:fileBytes.byteLength,kind:"UPLOAD_FILE",rank:1
  }]
 });
 process.env.ETSY_QC_APPROVED_PRODUCT_ID=PRODUCT_ID;
 process.env.ETSY_QC_APPROVED_CANDIDATE_FINGERPRINT=FP;
 process.env.ETSY_QC_APPROVED_LISTING_FINGERPRINT=LFP;
 process.env.ETSY_QC_APPROVED_REPORT_SHA256="c".repeat(64);
 process.env.ETSY_QC_APPROVED_REPORT_DRIVE_ID="1ApprovedFixtureReviewReportId";
}
function lock(){process.env.ETSY_DRAFT_WRITES_ENABLED="false";
 process.env.ETSY_CHAT_ASSET_WRITES_ENABLED="false";
}
test("chat mode does not require a service account and writes are closed",()=>{
 const s=getChatAssetIntakeStatus();
 assert.equal(s.googleServiceAccountRequired,false);
 assert.equal(s.chatAssetWritesEnabled,false);
 assert.equal(s.maxFileBytes,CHAT_ASSET_MAX_BYTES);
});
test("unauthorized requests never invoke Etsy nor inspect buyer bytes",async()=>{
 let calls=0;
 const handler=createEtsyChatAssetHandler({
  assetPostHandler:async()=>{calls++;return Response.json({status:"APPLIED"});}
 });
 const response=await handler(request());
 assert.equal(response.status,401);
 assert.equal(calls,0);
});
test("read-only PREFLIGHT accepts matching original file bytes and returns no Etsy write",async()=>{
 let calls=0;
 const result=await createEtsyChatAssetHandler({
  assetPostHandler:async()=>{calls++;return Response.json({});}
 })(request(manifest(),{token:TOKEN}));
 const data=await result.json();
 assert.equal(result.status,200);
 assert.equal(data.status,"SOURCE_BYTES_VERIFIED");
 assert.equal(data.sourceDriveIdVerifiedByServer,false);
 assert.equal(data.bytesVerifiedAgainstExpectedSha256,true);
 assert.equal(data.ETSY_WRITE_COUNT,0);
 assert.equal(calls,0);
});
test("missing signed source bytes or mismatched filename fail before provider",async()=>{
 let calls=0;
 const handler=createEtsyChatAssetHandler({
  assetPostHandler:async()=>{calls++;return Response.json({});}
 });
 const changed=await handler(request(manifest(),{
  token:TOKEN,bytes:Buffer.from("%PDF-1.5\nincorrect replacement\n%%EOF")
 }));
 assert.equal(changed.status,409);
 assert.equal((await changed.json()).error,"ASSET_SIZE_MISMATCH");
 const name=await handler(request(manifest(),{token:TOKEN,filename:"wrong.pdf"}));
 assert.equal(name.status,409);
 assert.equal((await name.json()).error,"ASSET_FILENAME_MISMATCH");
 const broken=await handler(request(manifest(),{token:TOKEN,
  bytes:Buffer.from("not a PDF but same bytes__!!")}));
 assert.equal(broken.status,409);
 assert.equal(calls,0);
});
test("reject oversized multipart before parsing or contacting provider",async()=>{
 const x=await createEtsyChatAssetHandler()(request(manifest(),{
   token:TOKEN,length:String(4*1024*1024+1)
 }));
 assert.equal(x.status,413);
});
test("UPLOAD stays locked in Preview even for valid source bytes",async()=>{
 let called=0;
 const result=await createEtsyChatAssetHandler({
  verifyBuild:async()=>{called++;throw Error("NO_BUILD");},
  assetPostHandler:async()=>{called++;return Response.json({});}
 })(request(manifest("UPLOAD"),{token:TOKEN}));
 assert.equal(result.status,403);
 assert.equal((await result.json()).error,"ETSY_CHAT_ASSET_WRITES_DISABLED");
 assert.equal(called,0);
});
test("even enabled write gates require independently pinned exact file manifest",async()=>{
 allowed();
 delete process.env.ETSY_CHAT_APPROVED_ASSETS_JSON;
 let called=0;
 const x=await createEtsyChatAssetHandler({
  verifyBuild:async()=>{called++;throw Error("NO");},
  assetPostHandler:async()=>{called++;return Response.json({});}
 })(request(manifest("UPLOAD"),{token:TOKEN}));
 assert.equal(x.status,403);
 assert.equal((await x.json()).error,"ETSY_CHAT_ASSET_NOT_IN_SERVER_APPROVED_MANIFEST");
 assert.equal(called,0);
 lock();
});
test("an exactly pinned candidate with approved plan relays same SHA-256 to existing uploader",async()=>{
 allowed();
 let calls=0;
 const handler=createEtsyChatAssetHandler({
  verifyBuild:async()=>({
   allowed:true,status:"BUILD_PERMITTED",productId:PRODUCT_ID,
   planId:"PLAN-P01",planSha256:FP,approvedAt:"2026-10-21T00:00:00Z"
  }),
  assetPostHandler:async request=>{
   calls++;
   assert.equal(request.headers.get("x-autodigitalpublisher-write-token"),TOKEN);
   const f=await request.formData();
   assert.equal(f.get("assetName"),fileName);
   assert.equal(f.get("assetSha256"),sha);
   assert.equal(f.get("draftListingId"),String(DRAFT_ID));
   assert.equal(f.get("kind"),"UPLOAD_FILE");
   const item=f.get("asset") as File;
   assert.equal(createHash("sha256")
    .update(new Uint8Array(await item.arrayBuffer())).digest("hex"),sha);
   return Response.json({status:"APPLIED",receipt:{providerResourceId:"991"}});
  }
 });
 const x=await handler(request(manifest("UPLOAD"),{token:TOKEN}));
 const data=await x.json();
 assert.equal(x.status,200);
 assert.equal(data.ETSY_WRITE_COUNT,1);
 assert.equal(data.publishAuthorized,false);
 assert.equal(data.sourceDriveIdVerifiedByServer,false);
 assert.equal(calls,1);
 lock();
});
