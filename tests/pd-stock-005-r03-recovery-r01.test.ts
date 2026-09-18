import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  exactPdStock005R03RecoveryR01Body,
  handlePdStock005R03RecoveryR01,
  PD_STOCK_005_R03_RECOVERY_R01,
  verifyPdStock005R03RecoveryR01PostRelease,
  verifyPdStock005R03RecoveryR01ProtectedState
} from "../lib/pd-stock-005-r03-recovery-r01";
import { hashOperationRequest, MemoryOperationLedgerRepository } from "../lib/operation-ledger";

const DESCRIPTION=`Track stock, waste, supplier follow-up and reorder needs without building a spreadsheet from scratch. This pre-filled 8-tab Inventory & Waste Tracker helps cafes, coffee shops, restaurants and small food businesses keep routine stock records in one place.

QUICK FACTS
• 1 ZIP containing the editable XLSX workbook + 4 PDFs
• Workbook: 8 editable tabs
• PDFs: A4 (8 pages), US Letter (8 pages), Quick Start, and Read Me/License
• Pre-filled examples and built-in formulas you can customize
• Use with Microsoft Excel, Google Sheets, or printed records
• Instant digital download — no physical item

WORKBOOK TABS
Start Here | Item Master | Daily Count | Waste Log | Reorder Plan | Suppliers | Weekly Summary | Blank Tracker

WHAT THIS HELPS YOU DO
• Set item names, SKUs, units, par levels, reorder levels, costs and suppliers
• Record opening stock, received quantities, usage, waste and physical closing counts
• Compare calculated closing stock with physical counts and review variance
• Record waste reasons and calculate waste cost
• Prepare a reorder review with suggested quantities and estimated costs
• Keep supplier contacts, ordering routines and follow-up status together
• Summarize weekly stock movement, waste and reorder activity
• Create custom records with the blank tracker

HOW TO USE
Download and unzip the ZIP file first. Open the included XLSX workbook in Microsoft Excel and begin with Start Here. Replace the sample data in Item Master with your own items, units, costs, stock levels and suppliers. Enter daily counts and waste consistently, then review calculated results before making an order decision.

For Google Sheets, upload the XLSX file to Google Drive and open it with Google Sheets. Check formulas and formatting after import before using it in daily operations.

IMPORTANT DOWNLOAD NOTE
Etsy’s app does not currently download digital purchases. After checkout, sign in to Etsy.com using a mobile browser or computer, then go to Your account &gt; Purchases and reviews &gt; Download Files. A desktop or laptop is recommended for first-time spreadsheet setup.

PLEASE NOTE
• PDF files are print-ready and are not text-editable.
• Formula results depend on the accuracy of the quantities and costs you enter.
• Review all calculated quantities before placing supplier orders.
• This is an operational planning tool, not accounting, tax, purchasing, legal, HR, or food-safety advice.
• Adapt the tracker to your procedures and local requirements.

LICENSE
Single-business internal-use license. You may edit and print the files and share working copies with staff inside one business. Resale, redistribution, sharing outside that business, sublicensing, uploading to template libraries, or claiming the files as your own is prohibited.

AI DISCLOSURE
AI-assisted tools were used during parts of the production workflow. The workbook structure, formulas, content, examples, printable files and listing information were reviewed and edited by PoonthaiDigital.

Need help after purchase? Message PoonthaiDigital through Etsy with the filename, device or app used, and a screenshot so I can assist quickly.`;

const GALLERY=[
 [8580511217,1,2500,2000,"Restaurant and cafe inventory and waste tracker hero showing a real Excel workbook Start Here preview with count, waste and reorder workflow and eight workbook tabs."],
 [8532646756,2,2500,2000,"Inventory tracker gallery image listing the eight workbook tabs—Start Here, Item Master, Daily Count, Waste Log, Reorder Plan, Suppliers, Weekly Summary and Blank Tracker—beside a real workbook preview."],
 [8580511355,3,2500,2000,"Real Daily Count worksheet preview showing opening, received, used, waste, calculated closing, physical closing and variance fields for inventory review."],
 [8580511435,4,2500,2000,"Real Waste Log worksheet preview showing quantity wasted, reason, unit cost, waste cost and recorded-by fields for restaurant and cafe inventory tracking."],
 [8532646976,5,2500,2000,"Real Reorder Plan worksheet preview showing current stock, reorder level, suggested order quantity, unit cost, estimated cost and order status fields."],
 [8532647054,6,2500,2000,"Real Item Master and Suppliers worksheet previews showing par and reorder settings, primary supplier details, lead time and supplier status fields."],
 [8580511641,7,2500,2000,"Real Weekly Summary worksheet preview showing stock value, purchases, usage value, waste cost, waste percentage and items reordered for manager review."],
 [8532647190,8,2500,2000,"Digital download overview showing a real Excel workbook preview and A4 printable PDF cover, with A4 and US Letter PDFs, Quick Start, and Read Me plus License files included."]
];
const INITIAL=[
 {listing_file_id:1509497762118,rank:1,filename:"Inventory_Waste_A4.pdf",size_bytes:24247,filetype:"application/pdf"},
 {listing_file_id:1509497762234,rank:2,filename:"Inventory_Waste_US_Letter.pdf",size_bytes:23237,filetype:"application/pdf"},
 {listing_file_id:1515946927296,rank:3,filename:"PD-STOCK-005_V1_Inventory_Waste_Quick_Start_B01.pdf",size_bytes:6448,filetype:"application/pdf"},
 {listing_file_id:1510700238185,rank:4,filename:"Inventory_Waste_Read_Me_License.pdf",size_bytes:4242,filetype:"application/pdf"},
 {listing_file_id:1509980203922,rank:5,filename:"Inventory_Waste_Tracker.zip",size_bytes:16285,filetype:"application/zip"}
];

function core(over:Record<string,unknown>={}){
 return {
  listing_id:4561821192,shop_id:23582741,state:"active",
  title:PD_STOCK_005_R03_RECOVERY_R01.current.title,
  tags:[...PD_STOCK_005_R03_RECOVERY_R01.current.tags],
  description:DESCRIPTION,price:{amount:890,divisor:100,currency_code:"USD"},quantity:999,
  shop_section_id:60023263,should_auto_renew:true,is_personalizable:false,is_customizable:false,
  who_made:"i_did",when_made:"2020_2026",listing_type:"download",taxonomy_id:12476,...over
 };
}
function provider(options:{rejectDelete?:boolean}={}){
 let listing:Record<string,unknown>=core(),files=structuredClone(INITIAL),writes=0,attempts=0;
 const fetchImpl=(async(input:string|URL|Request,init?:RequestInit)=>{
  const url=String(input),method=init?.method??"GET";
  if(method==="DELETE"){
    attempts++;
    if(options.rejectDelete)return new Response("rejected",{status:500});
    writes++;
    const id=Number(url.split("/").at(-1));files=files.filter(x=>x.listing_file_id!==id);
    return new Response(null,{status:204});
  }
  if(method==="POST"&&url.endsWith("/files")){
    attempts++;writes++;
    const form=init?.body as FormData;const name=String(form.get("name"));
    assert.equal(name,PD_STOCK_005_R03_RECOVERY_R01.target.zip.fileName);
    files.push({listing_file_id:1611111111111,rank:5,filename:name,size_bytes:62008,filetype:"application/zip"});
    files.sort((a,b)=>a.rank-b.rank);
    return Response.json({listing_file_id:1611111111111},{status:201});
  }
  if(method==="PATCH"){
    attempts++;writes++;
    const body=init?.body as URLSearchParams;
    listing={...listing,title:String(body.get("title")),tags:String(body.get("tags")).split(",")};
    return Response.json(listing);
  }
  if(url.endsWith("/listings/4561821192"))return Response.json(listing);
  if(url.endsWith("/images"))return Response.json({results:GALLERY.map(([listing_image_id,rank,full_width,full_height,alt_text])=>({listing_image_id,rank,full_width,full_height,alt_text}))});
  if(url.endsWith("/properties"))return Response.json({results:[]});
  if(url.endsWith("/files"))return Response.json({results:structuredClone(files)});
  if(url.endsWith("/videos"))return Response.json({results:[{video_id:842820647,width:1920,height:1080,video_state:"active"}]});
  if(url.includes("/listings/batch/inventory"))return Response.json({results:[{listing_id:4561821192,inventory:{products:[{sku:"PD-STOCK-005"}]}}]});
  if(url.endsWith("/personalization"))return Response.json({personalization_questions:[]});
  return new Response("{}",{status:404});
 }) as typeof fetch;
 return{fetchImpl,writes:()=>writes,attempts:()=>attempts,files:()=>files,listing:()=>listing};
}

test("Recovery R01 identity and scope protect the new Quick Start",()=>{
 assert.equal(PD_STOCK_005_R03_RECOVERY_R01.operationId,"PD-STOCK-005-LIVE-CATALOG-V3-R03-RECOVERY-R01-001");
 assert.equal(PD_STOCK_005_R03_RECOVERY_R01.target.zip.currentListingFileId,1509980203922);
 assert.equal(PD_STOCK_005_R03_RECOVERY_R01.target.zip.targetSizeBytes,62008);
 const body=exactPdStock005R03RecoveryR01Body("AUTH",PD_STOCK_005_R03_RECOVERY_R01.protectedStateFingerprint);
 assert.equal(body.protectedQuickStartListingFileId,1515946927296);
});

test("Recovery protected-state verifier is read-only and matches partial baseline",async()=>{
 process.env.ETSY_API_KEY="k";process.env.ETSY_SHARED_SECRET="s";
 const p=provider();
 const r=await verifyPdStock005R03RecoveryR01ProtectedState({getAccessToken:async()=>"token",fetchImpl:p.fetchImpl});
 const x=await r.json();
 assert.equal(r.status,200);assert.equal(x.status,"PROTECTED_STATE_MATCH");assert.equal(x.ETSY_WRITE_COUNT,0);assert.equal(p.writes(),0);
});

test("Recovery performs delete ZIP, upload exact ZIP, then patch title/tags only",async()=>{
 process.env.PUBLISH_WRITES_ENABLED="true";process.env.ETSY_B01_WRITE_TOKEN="w";process.env.ETSY_SHOP_ID="23582741";
 process.env.ETSY_API_KEY="k";process.env.ETSY_SHARED_SECRET="s";
 const auth="RECOVERY-AUTH";
 const body=exactPdStock005R03RecoveryR01Body(auth,PD_STOCK_005_R03_RECOVERY_R01.protectedStateFingerprint);
 const requestHash=hashOperationRequest(body),p=provider(),repo=new MemoryOperationLedgerRepository();
 const req=new Request("https://example.test",{method:"POST",headers:{"x-autodigitalpublisher-write-token":"w"}});
 const r=await handlePdStock005R03RecoveryR01(body,requestHash,req,{
  repository:repo,fetchImpl:p.fetchImpl,getAccessToken:async()=>"token",
  loadAsset:async()=>Buffer.alloc(62008),verifyAsset:()=>true,now:()=>"2026-09-18T14:45:00.000Z"
 });
 const x=await r.json();
 assert.equal(r.status,200);assert.equal(x.status,"UPDATED_AND_VERIFIED");assert.equal(x.ETSY_WRITE_COUNT,3);
 assert.equal(p.writes(),3);assert.equal(p.attempts(),3);
 assert.equal(p.listing().title,PD_STOCK_005_R03_RECOVERY_R01.target.title);
 assert.deepEqual(p.listing().tags,[...PD_STOCK_005_R03_RECOVERY_R01.target.tags]);
 assert.deepEqual(p.files().map(f=>[f.listing_file_id,f.rank,f.filename,f.size_bytes]),[
  [1509497762118,1,"Inventory_Waste_A4.pdf",24247],
  [1509497762234,2,"Inventory_Waste_US_Letter.pdf",23237],
  [1515946927296,3,"PD-STOCK-005_V1_Inventory_Waste_Quick_Start_B01.pdf",6448],
  [1510700238185,4,"Inventory_Waste_Read_Me_License.pdf",4242],
  [1611111111111,5,"PD-STOCK-005_V1_Inventory_Waste_Tracker_B03.zip",62008]
 ]);
});

test("delete rejection fails closed without attempting upload or metadata patch",async()=>{
 process.env.PUBLISH_WRITES_ENABLED="true";process.env.ETSY_B01_WRITE_TOKEN="w";process.env.ETSY_SHOP_ID="23582741";
 const body=exactPdStock005R03RecoveryR01Body("AUTH",PD_STOCK_005_R03_RECOVERY_R01.protectedStateFingerprint);
 const p=provider({rejectDelete:true});
 const req=new Request("https://example.test",{method:"POST",headers:{"x-autodigitalpublisher-write-token":"w"}});
 const r=await handlePdStock005R03RecoveryR01(body,hashOperationRequest(body),req,{
  repository:new MemoryOperationLedgerRepository(),fetchImpl:p.fetchImpl,getAccessToken:async()=>"token",
  loadAsset:async()=>Buffer.alloc(62008),verifyAsset:()=>true,now:()=>"2026-09-18T14:45:00.000Z"
 });
 const x=await r.json();
 assert.equal(r.status,502);assert.equal(x.ETSY_WRITE_COUNT,0);assert.equal(p.writes(),0);assert.equal(p.attempts(),1);
});

test("unexpected Quick Start drift blocks recovery before any write",async()=>{
 process.env.PUBLISH_WRITES_ENABLED="true";process.env.ETSY_B01_WRITE_TOKEN="w";process.env.ETSY_SHOP_ID="23582741";
 const body=exactPdStock005R03RecoveryR01Body("AUTH",PD_STOCK_005_R03_RECOVERY_R01.protectedStateFingerprint);
 const p=provider(),base=p.fetchImpl;
 const fetchImpl=(async(input:string|URL|Request,init?:RequestInit)=>{
  const url=String(input);
  if((init?.method??"GET")==="GET"&&url.endsWith("/files")){
   const drift=structuredClone(INITIAL);drift[2]={...drift[2],listing_file_id:999};
   return Response.json({results:drift});
  }
  return base(input,init);
 }) as typeof fetch;
 const req=new Request("https://example.test",{method:"POST",headers:{"x-autodigitalpublisher-write-token":"w"}});
 const r=await handlePdStock005R03RecoveryR01(body,hashOperationRequest(body),req,{
  repository:new MemoryOperationLedgerRepository(),fetchImpl,getAccessToken:async()=>"token",
  loadAsset:async()=>Buffer.alloc(62008),verifyAsset:()=>true
 });
 assert.equal(r.status,409);assert.equal(p.writes(),0);
});


test("Recovery post-release QC is fresh read-only and verifies exact final package including Alt Text",async()=>{
 process.env.PUBLISH_WRITES_ENABLED="true";process.env.ETSY_B01_WRITE_TOKEN="w";process.env.ETSY_SHOP_ID="23582741";
 const auth="RECOVERY-AUTH-POST-QC";
 const body=exactPdStock005R03RecoveryR01Body(auth,PD_STOCK_005_R03_RECOVERY_R01.protectedStateFingerprint);
 const p=provider(),repo=new MemoryOperationLedgerRepository();
 const req=new Request("https://example.test",{method:"POST",headers:{"x-autodigitalpublisher-write-token":"w"}});
 const release=await handlePdStock005R03RecoveryR01(body,hashOperationRequest(body),req,{
  repository:repo,fetchImpl:p.fetchImpl,getAccessToken:async()=>"token",
  loadAsset:async()=>Buffer.alloc(62008),verifyAsset:()=>true,now:()=>"2026-09-18T15:10:00.000Z"
 });
 assert.equal(release.status,200);
 const writesBefore=p.writes();
 const qc=await verifyPdStock005R03RecoveryR01PostRelease({getAccessToken:async()=>"token",fetchImpl:p.fetchImpl});
 const x=await qc.json();
 assert.equal(qc.status,200);
 assert.equal(x.status,"POST_RELEASE_QC_PASS");
 assert.equal(x.ETSY_WRITE_COUNT,0);
 assert.equal(x.verified.gallery8OrderAltTextExact,"PASS");
 assert.equal(x.verified.videoExact,"PASS");
 assert.equal(x.verified.oldZipAbsent,"PASS");
 assert.equal(p.writes(),writesBefore);
});

test("Recovery protected-state verifier fails closed on Alt Text drift with zero writes",async()=>{
 const p=provider(),base=p.fetchImpl;
 const fetchImpl=(async(input:string|URL|Request,init?:RequestInit)=>{
  const url=String(input);
  if((init?.method??"GET")==="GET"&&url.endsWith("/images")){
   const rows=GALLERY.map(([listing_image_id,rank,full_width,full_height,alt_text],index)=>({listing_image_id,rank,full_width,full_height,alt_text:index===0?"DRIFT":alt_text}));
   return Response.json({results:rows});
  }
  return base(input,init);
 }) as typeof fetch;
 const r=await verifyPdStock005R03RecoveryR01ProtectedState({getAccessToken:async()=>"token",fetchImpl});
 const x=await r.json();
 assert.equal(r.status,409);
 assert.equal(x.status,"PROTECTED_STATE_MISMATCH");
 assert.equal(x.ETSY_WRITE_COUNT,0);
 assert.equal(p.writes(),0);
});

test("Recovery workflow has exact private ZIP staging marker and post-release QC gate",()=>{
 const workflow=readFileSync(".github/workflows/execute-authorized-etsy-operation.yml","utf8");
 assert.match(workflow,/stage_stock_r03_recovery_zip/);
 assert.match(workflow,/RECOVERY_ASSET_STAGED/);
 assert.match(workflow,/PD-STOCK-005-LIVE-CATALOG-V3-R03-RECOVERY-R01-001/);
 assert.match(workflow,/const carrierOperationId = "PD-STOCK-005-LIVE-CATALOG-V3-R03-API-MINIMAL-001"/);
 assert.match(workflow,/sha256: "c62011b1cbd09e3a4de910e0a9fe86e01d5a688dd05f1e2df16c0f8f536fd8ed"/);
 assert.match(workflow,/size: 62008/);
 assert.match(workflow,/payload\.status !== "ASSET_CHUNK_STAGED"/);
 assert.match(workflow,/payload\.ETSY_WRITE_COUNT !== 0/);
 assert.match(workflow,/post_release_qc/);
 assert.match(workflow,/POST_RELEASE_QC_PASS/);
 assert.doesNotMatch(workflow,/PD_STOCK_005_R03_RECOVERY_ZIP_URL/);
});
