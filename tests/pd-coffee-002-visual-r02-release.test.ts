import assert from "node:assert/strict";
import test from "node:test";
import { PD_COFFEE_002_EXPECTED_DESCRIPTION, PD_COFFEE_002_VISUAL_R02_RELEASE, exactPdCoffee002AuthorizationHash, handlePdCoffee002R02Release, verifyPdCoffee002R02ProtectedState } from "../lib/pd-coffee-002-visual-r02-release";
import { MemoryOperationLedgerRepository } from "../lib/operation-ledger";
process.env.ETSY_API_KEY="test-key"; process.env.ETSY_SHARED_SECRET="test-secret";

test("Coffee R02 identity is exact, gallery-only, and preserves existing video",()=>{
  const r=PD_COFFEE_002_VISUAL_R02_RELEASE;
  assert.equal(r.operationId,"PD-COFFEE-002-VISUAL-R02-RELEASE-001"); assert.equal(r.listingId,"4561793463"); assert.equal(r.productId,"PD-COFFEE-002");
  assert.equal(r.operation,"REPLACE_GALLERY_8_ALT_TEXT_8_PRESERVE_VIDEO_1_ONLY"); assert.equal(r.operationFingerprint,"cc9c3ca0ff12e8b421f1389912b2051a7046199dea0b6b0ed887c75b315eba6a");
  assert.equal(r.candidateFingerprint,"3dcd586a4c63ea2dbb99c1a05b2deab5407af7a15a109909ccc617ccc9bb9924"); assert.equal(r.gallery.length,8); assert.equal(r.gallery.filter(a=>a.altText.length>0).length,8);
  assert.deepEqual(r.preserveVideo,{videoId:839464137,width:1080,height:1920,videoState:"active"});
  for(const [i,a] of r.gallery.entries()){assert.equal(a.order,i+1);assert.equal(a.width,2500);assert.equal(a.height,2000);assert.match(a.sha256,/^[a-f0-9]{64}$/);assert.ok(a.altText.length<=250)}
});

test("authorization mismatch fails closed before provider activity",async()=>{
  process.env.PUBLISH_WRITES_ENABLED="true";process.env.ETSY_B01_WRITE_TOKEN="write-token";process.env.ETSY_SHOP_ID="23582741";let tokenCalls=0,loads=0;
  const request=new Request("https://example.test",{method:"POST",headers:{"x-autodigitalpublisher-write-token":"write-token"}});
  const response=await handlePdCoffee002R02Release("b".repeat(64),"0".repeat(64),request,{repository:new MemoryOperationLedgerRepository(),getAccessToken:async()=>{tokenCalls++;return "token"},loadAsset:async()=>{loads++;return Buffer.alloc(1)}});
  assert.equal(response.status,409);assert.equal((await response.json()).ETSY_WRITE_COUNT,0);assert.equal(tokenCalls,0);assert.equal(loads,0);
});

function harness(){
  const R=PD_COFFEE_002_VISUAL_R02_RELEASE;
  const oldIds=[8473627125,8473627127,8425756584,8425756600,8473627159,8473627137,8425756676,8473627221];
  let images:Array<{listing_image_id:number;rank:number;full_width:number;full_height:number;alt_text:string|null}>=oldIds.map((id,i)=>({listing_image_id:id,rank:i+1,full_width:2000,full_height:2000,alt_text:null}));
  const listing={listing_id:4561793463,shop_id:23582741,state:"active",title:"Coffee Shop Opening & Closing Checklist | Excel, Google Sheets, PDF",description:PD_COFFEE_002_EXPECTED_DESCRIPTION,price:{amount:890,divisor:100,currency_code:"USD"},taxonomy_id:12476,quantity:999,who_made:"i_did",when_made:"2020_2026",listing_type:"download",return_policy_id:1,file_data:"4 PDF, 1 ZIP",tags:["coffee checklist","opening checklist","closing checklist","cafe operations","barista checklist","coffee shop excel","google sheets cafe","cafe manager tool","shift checklist","printable checklist","digital download","small business tool","espresso bar tool"]};
  const files=[{listing_file_id:1510699088213,rank:1,filename:"Coffee_Shop_Checklist_A4.pdf",size_bytes:21639,filetype:"application/pdf"},{listing_file_id:1510699088375,rank:2,filename:"Coffee_Shop_Checklist_US_Letter.pdf",size_bytes:21103,filetype:"application/pdf"},{listing_file_id:1509496615152,rank:3,filename:"Coffee_Shop_Quick_Start.pdf",size_bytes:4615,filetype:"application/pdf"},{listing_file_id:1510699088555,rank:4,filename:"Coffee_Shop_Read_Me_License.pdf",size_bytes:4223,filetype:"application/pdf"},{listing_file_id:1509979535618,rank:5,filename:"Coffee_Shop_Checklist.zip",size_bytes:15348,filetype:"application/zip"}];
  const videos=[{video_id:839464137,width:1080,height:1920,video_state:"active",video_url:"https://v.example/vid_v1.mp4"}];
  const writes:string[]=[];
  const fetchImpl:typeof fetch=async(input,init)=>{const url=String(input);const method=init?.method??"GET";if(method==="POST"){writes.push(url);assert.ok(url.endsWith("/images"),`unexpected write endpoint ${url}`);const form=init?.body as FormData,rank=Number(form.get("rank")),alt=String(form.get("alt_text"));assert.equal(String(form.get("overwrite")),"true");const asset=R.gallery[rank-1];assert.equal(alt,asset.altText);const id=900000+rank;images=images.filter(i=>Number(i.rank)!==rank);images.push({listing_image_id:id,rank,full_width:2500,full_height:2000,alt_text:alt});return Response.json({listing_image_id:id},{status:201})}if(url.endsWith(`/listings/${R.listingId}`))return Response.json(listing);if(url.endsWith("/images"))return Response.json({results:[...images].sort((a,b)=>a.rank-b.rank)});if(url.endsWith("/properties"))return Response.json({results:[]});if(url.endsWith("/files"))return Response.json({results:files});if(url.endsWith("/videos"))return Response.json({results:videos});throw new Error(`unexpected URL ${url}`)};
  return {fetchImpl,writes};
}

test("FROM_ZERO: exact eight gallery writes succeed while video and protected fields remain read-only",async()=>{
  process.env.PUBLISH_WRITES_ENABLED="true";process.env.ETSY_B01_WRITE_TOKEN="write-token";process.env.ETSY_SHOP_ID="23582741";
  const h=harness(),verify=await verifyPdCoffee002R02ProtectedState({fetchImpl:h.fetchImpl,getAccessToken:async()=>"token"});assert.equal(verify.status,200);const v=await verify.json();assert.equal(v.status,"PROTECTED_STATE_MATCH");assert.equal(v.videoCount,1);assert.equal(v.ETSY_WRITE_COUNT,0);
  const psv=String(v.protectedStateFingerprint),auth=exactPdCoffee002AuthorizationHash(psv),request=new Request("https://example.test",{method:"POST",headers:{"x-autodigitalpublisher-write-token":"write-token"}});
  const response=await handlePdCoffee002R02Release(psv,auth,request,{repository:new MemoryOperationLedgerRepository(),fetchImpl:h.fetchImpl,getAccessToken:async()=>"token",loadAsset:async a=>Buffer.alloc(a.byteSize),verifyAsset:()=>true,clearAsset:async()=>{},sleep:async()=>{}});
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.status,"UPDATED_AND_VERIFIED");assert.equal(body.ETSY_WRITE_COUNT,8);assert.equal(body.ETSY_WRITE_ATTEMPT_COUNT,8);assert.equal(body.preservedVideoId,839464137);assert.equal(h.writes.length,8);assert.ok(h.writes.every(u=>u.endsWith("/images")));
});
