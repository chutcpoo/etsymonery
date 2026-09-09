import assert from "node:assert/strict";
import test from "node:test";
import { exactPdRest003A02Body, handlePdRest003A02TitleTagsImage1, PD_REST_003_A02 } from "../lib/pd-rest-003-a02-title-tags-image1";
import { hashOperationRequest, MemoryOperationLedgerRepository } from "../lib/operation-ledger";

const oldTags=["restaurant checklist","daily operations","opening checklist","closing checklist","restaurant excel","google sheets food","food service tool","kitchen checklist","manager checklist","shift handoff","prep log","printable checklist","digital download"];
const description="Make restaurant shifts easier to prepare, run and hand off with this pre-filled, editable 8-tab daily operations checklist toolkit for Excel, Google Sheets and print.\n\nQUICK FACTS\n• 1 ZIP containing the editable XLSX workbook + 4 PDFs\n• Workbook: 8 editable tabs\n• PDFs: A4, US Letter, Quick Start, and Read Me/License\n• Pre-filled operational tasks you can customize\n• Instant digital download — no physical item\n\nWORKBOOK TABS\nStart Here | Opening | Pre-Service | Closing | Prep & Temp | Cleaning | Handoff | Blank Checklist\n\nWHAT THIS HELPS YOU DO\n• Organize opening, pre-service and closing routines\n• Record prep and temperature checks in one place\n• Keep cleaning and shift handoff tasks visible\n• Assign responsibility, timing, status and notes\n• Print clean A4 or US Letter copies for the floor or kitchen\n\nHOW TO USE\nDownload and unzip the ZIP file first. Open the included XLSX workbook in Microsoft Excel, or upload it to Google Drive and open it with Google Sheets. Review the Start Here tab, replace sample tasks and limits with your approved procedures, then test the full workflow before daily use.\n\nIMPORTANT DOWNLOAD NOTE\nEtsy’s app does not currently download digital purchases. After checkout, sign in to Etsy.com using a mobile browser or computer, then go to Your account &gt; Purchases and reviews &gt; Download Files. A desktop or laptop is recommended for first-time spreadsheet setup.\n\nPLEASE NOTE\n• PDF files are print-ready and are not text-editable.\n• This is an operational planning tool, not HACCP, food-safety, legal, HR, tax, or regulatory advice.\n• Temperature limits, cleaning routines and operating procedures must be verified by the buyer for their equipment, menu and location.\n\nLICENSE\nSingle-business internal-use license. You may edit and print the files and share working copies with staff inside the purchasing business. You may not resell, redistribute, sublicense, upload publicly, or give the source files to another business.\n\nCREATION DISCLOSURE\nThis original digital toolkit was designed by PoonthaiDigital with AI-assisted drafting and visual support, then manually edited, tested, and quality-checked.\n\nNeed help after purchase? Message PoonthaiDigital through Etsy with the filename, device or app used, and a screenshot.";
const baseListing={listing_id:4561819638,shop_id:23582741,state:"active",title:"Restaurant Daily Operations Checklist | Excel, Google Sheets, PDF",description,price:{amount:990,divisor:100,currency_code:"USD"},taxonomy_id:12476,quantity:998,who_made:"i_did",when_made:"2020_2026",listing_type:"download",tags:oldTags};
const protectedImages=[[8488103428,2],[8488103480,3],[8488103438,4],[8536001153,5],[8536001075,6],[8488103510,7],[8536001073,8],[8488103512,9]].map(([id,rank])=>({listing_image_id:id,rank,full_width:2000,full_height:2000}));
const oldImages=[{listing_image_id:8488103494,rank:1,full_width:2000,full_height:2000},...protectedImages];
const files=[
 {listing_file_id:1509497122622,rank:1,filename:"Restaurant_Operations_A4.pdf",size_bytes:20782,filetype:"application/pdf"},
 {listing_file_id:1509497122824,rank:2,filename:"Restaurant_Operations_US_Letter.pdf",size_bytes:20228,filetype:"application/pdf"},
 {listing_file_id:1509497122832,rank:3,filename:"Restaurant_Read_Me_License.pdf",size_bytes:4219,filetype:"application/pdf"},
 {listing_file_id:1511184698189,rank:4,filename:"Restaurant_Operations.zip",size_bytes:15018,filetype:"application/zip"},
 {listing_file_id:1512037381313,rank:5,filename:"Restaurant_Quick_Start.pdf",size_bytes:31217,filetype:"application/pdf"}
];
function enable(){process.env.PUBLISH_WRITES_ENABLED="true";process.env.ETSY_B01_WRITE_TOKEN="test-write-token";process.env.ETSY_SHOP_ID=PD_REST_003_A02.shopId;process.env.ETSY_API_KEY="k";process.env.ETSY_SHARED_SECRET="s";}
function request(){return new Request("https://example.test/internal",{method:"POST",headers:{"x-autodigitalpublisher-write-token":"test-write-token"}});}
function jsonResults(results:unknown[]){return Response.json({count:results.length,results});}

function backend(options:{protectedImageMutation?:boolean}={}){
 let phase=0; const calls:Array<{url:string;method:string;body?:BodyInit|null}>=[]; const newId=999001;
 const fetchImpl=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input),method=String(init?.method??"GET");calls.push({url,method,body:init?.body});
  if(method==="POST"&&url.endsWith("/images")){phase=1;return Response.json({listing_image_id:newId,rank:1},{status:201});}
  if(method==="PATCH"){phase=2;return Response.json({ok:true});}
  if(url.endsWith("/images")){let pi=protectedImages;if(options.protectedImageMutation&&phase>=1)pi=[{...protectedImages[0],listing_image_id:1},...protectedImages.slice(1)];return jsonResults(phase===0?oldImages:[{listing_image_id:newId,rank:1,full_width:3000,full_height:3000},...pi]);}
  if(url.endsWith("/properties"))return jsonResults([]);
  if(url.endsWith("/files"))return jsonResults(files);
  const listing=phase>=2?{...baseListing,title:PD_REST_003_A02.title,tags:[...PD_REST_003_A02.tags]}:baseListing;return Response.json(listing);
 };
 return {fetchImpl,calls};
}
const runtimeBase=()=>({repository:new MemoryOperationLedgerRepository(),getAccessToken:async()=>"token",loadAsset:async()=>Buffer.from("test"),verifyAsset:()=>true,clearAsset:async()=>{},now:()=>"2026-09-09T03:00:00.000Z"});

test("canonical operation request hash exactly matches frozen one-shot record",()=>{assert.equal(hashOperationRequest(exactPdRest003A02Body()),PD_REST_003_A02.requestSha256);});

test("authorization and payload mismatch fail before Etsy access",async()=>{enable();let calls=0;const rt={...runtimeBase(),getAccessToken:async()=>{calls++;return"token";}};const noAuth=await handlePdRest003A02TitleTagsImage1(exactPdRest003A02Body(),new Request("https://x"),rt);assert.equal(noAuth.status,401);const bad={...exactPdRest003A02Body(),listingId:"1"};const mismatch=await handlePdRest003A02TitleTagsImage1(bad,request(),rt);assert.equal(mismatch.status,409);assert.equal(calls,0);});

test("exact authorized operation performs one image overwrite POST then title/tags-only PATCH and verifies protected state",async()=>{enable();const b=backend();const response=await handlePdRest003A02TitleTagsImage1(exactPdRest003A02Body(),request(),{...runtimeBase(),fetchImpl:b.fetchImpl});assert.equal(response.status,200);const out=await response.json();assert.equal(out.status,"UPDATED_AND_VERIFIED");assert.equal(out.providerWriteCount,2);const writes=b.calls.filter(c=>c.method!=="GET");assert.deepEqual(writes.map(c=>c.method),["POST","PATCH"]);const form=writes[0].body as FormData;assert.equal(form.get("rank"),"1");assert.equal(form.get("overwrite"),"true");const image=form.get("image") as File;assert.equal(image.name,PD_REST_003_A02.image.fileName);const patch=writes[1].body as URLSearchParams;assert.deepEqual([...patch.keys()],["title","tags"]);assert.equal(patch.get("title"),PD_REST_003_A02.title);assert.deepEqual(patch.get("tags")?.split(","),PD_REST_003_A02.tags);});

test("protected Images #2-#9 mutation stops before title/tags PATCH",async()=>{enable();const b=backend({protectedImageMutation:true});const response=await handlePdRest003A02TitleTagsImage1(exactPdRest003A02Body(),request(),{...runtimeBase(),fetchImpl:b.fetchImpl});assert.equal(response.status,202);assert.equal(b.calls.filter(c=>c.method==="POST").length,1);assert.equal(b.calls.filter(c=>c.method==="PATCH").length,0);});

test("one-shot replay after success never sends provider write again",async()=>{enable();const b=backend();const repository=new MemoryOperationLedgerRepository();const rt={...runtimeBase(),repository,fetchImpl:b.fetchImpl};assert.equal((await handlePdRest003A02TitleTagsImage1(exactPdRest003A02Body(),request(),rt)).status,200);const writes=b.calls.filter(c=>c.method!=="GET").length;const replay=await handlePdRest003A02TitleTagsImage1(exactPdRest003A02Body(),request(),rt);assert.equal(replay.status,200);assert.equal((await replay.json()).status,"REPLAY");assert.equal(b.calls.filter(c=>c.method!=="GET").length,writes);});
