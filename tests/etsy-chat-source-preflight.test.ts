import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {createSourcePreflightPostHandler,parseSourcePreflight} from "../lib/etsy-chat-source-preflight";
const bytes=Buffer.from("%PDF-1.4\nSTANDALONE-P01-FIXTURE\n%%EOF");
const digest=createHash("sha256").update(bytes).digest("hex");
const root="1F2c8J04_Crv1GzN0KBMwlChxvBaYo7px";
const file="Home_Maintenance_Starter_US_Letter.pdf";
const token="unit-only-token";
function manifest(){return{
  action:"SOURCE_PREFLIGHT",sourceRootId:root,productId:"P01_HOME_MAINTENANCE",
  driveFileId:"1jYarRJzUDIpQHB-m25FBGuJVgc3hWkaw",assetName:file,
  expectedSha256:digest,expectedBytes:bytes.byteLength,kind:"UPLOAD_FILE",rank:1
};}
function req(m:unknown=manifest(), options:{token?:string,blob?:Buffer,name?:string,contentLength?:number,mime?:string}={}){
 const f=new FormData();
 f.set("manifest",JSON.stringify(m));
 f.set("asset",new File([new Uint8Array(options.blob??bytes)],options.name??file,{type:options.mime??"application/pdf"}));
 return new Request("https://preview.example/api/etsy/chat-assets/source-preflight",{
   method:"POST",headers:{
      ...(options.token?{"x-autodigitalpublisher-write-token":options.token}:{}),
      ...(options.contentLength?{"content-length":String(options.contentLength)}:{})
   },body:f
 });
}
async function withEnv(fn:()=>Promise<void>){
 const k=["ETSY_DRAFT_WRITE_TOKEN","GOOGLE_DRIVE_SOURCE_ROOT_ID",
          "ETSY_CHAT_ASSET_WRITES_ENABLED","ETSY_DRAFT_WRITES_ENABLED","PUBLISH_WRITES_ENABLED"];
 const old=Object.fromEntries(k.map(x=>[x,process.env[x]]));
 process.env.ETSY_DRAFT_WRITE_TOKEN=token;
 process.env.GOOGLE_DRIVE_SOURCE_ROOT_ID=root;
 process.env.ETSY_CHAT_ASSET_WRITES_ENABLED="false";
 process.env.ETSY_DRAFT_WRITES_ENABLED="false";
 process.env.PUBLISH_WRITES_ENABLED="false";
 try{await fn();}finally{for(const x of k){if(old[x]===undefined)delete process.env[x];else process.env[x]=old[x];}}
}
test("standalone source preflight does not require candidate or draft listing",async()=>{
 await withEnv(async()=>{
  const r=await createSourcePreflightPostHandler()(req(manifest(),{token}));
  const x=await r.json();
  assert.equal(r.status,200);
  assert.equal(x.status,"SOURCE_BYTES_VERIFIED");
  assert.equal(x.sourceDriveIdVerifiedByServer,false);
  assert.equal(x.draftCreated,false);
  assert.equal(x.ETSY_WRITE_COUNT,0);
 });
});
test("authentication before parsing bytes and root identity",async()=>{
 await withEnv(async()=>{
  const r=await createSourcePreflightPostHandler()(req());
  assert.equal(r.status,401);
  const w=await createSourcePreflightPostHandler()(req({...manifest(),sourceRootId:"1UnapprovedRoot1234567890"},{token}));
  assert.equal(w.status,403);
 });
});
test("mismatched SHA, wrong filename and MIME get blocked",async()=>{
 await withEnv(async()=>{
  for(const [m,o] of [
    [{...manifest(),expectedSha256:"a".repeat(64)},{token}],
    [manifest(),{token,name:"different.pdf"}],
    [manifest(),{token,mime:"image/jpeg"}]
  ]as const){
   const r=await createSourcePreflightPostHandler()(req(m,o));
   assert.equal(r.status,409);
   assert.equal((await r.json()).ETSY_WRITE_COUNT,0);
  }
 });
});
test("preflight rejects all Etsy mutating action names",()=>{
 assert.throws(()=>parseSourcePreflight({...manifest(),action:"UPLOAD"}),/SOURCE_PREFLIGHT_ONLY/);
 assert.throws(()=>parseSourcePreflight({...manifest(),draftListingId:0,action:"CREATE_DRAFT"}),/SOURCE_PREFLIGHT_ONLY/);
});
test("body length and malicious file identities rejected",async()=>{
 await withEnv(async()=>{
  const tooLarge=await createSourcePreflightPostHandler()(req(manifest(),{token,contentLength:5*1024*1024}));
  assert.equal(tooLarge.status,413);
  assert.throws(()=>parseSourcePreflight({...manifest(),driveFileId:"https://example.com/file"}),/INVALID_SOURCE_IDENTITY/);
 });
});
