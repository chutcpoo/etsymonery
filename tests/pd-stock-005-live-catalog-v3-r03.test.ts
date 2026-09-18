import assert from "node:assert/strict";
import test from "node:test";
import {
  exactPdStock005R03Body,
  handlePdStock005R03,
  PD_STOCK_005_R03,
  verifyPdStock005R03ProtectedState
} from "../lib/pd-stock-005-live-catalog-v3-r03";
import { hashOperationRequest, MemoryOperationLedgerRepository } from "../lib/operation-ledger";

const DESCRIPTION = `Track stock, waste, supplier follow-up and reorder needs without building a spreadsheet from scratch. This pre-filled 8-tab Inventory & Waste Tracker helps cafes, coffee shops, restaurants and small food businesses keep routine stock records in one place.

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
Etsy’s app does not currently download digital purchases. After checkout, sign in to Etsy.com using a mobile browser or computer, then go to Your account > Purchases and reviews > Download Files. A desktop or laptop is recommended for first-time spreadsheet setup.

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

const GALLERY=[[8580511217,1,2500,2000],[8532646756,2,2500,2000],[8580511355,3,2500,2000],[8580511435,4,2500,2000],[8532646976,5,2500,2000],[8532647054,6,2500,2000],[8580511641,7,2500,2000],[8532647190,8,2500,2000]];
const INITIAL=[
 {listing_file_id:1509497762118,rank:1,filename:"Inventory_Waste_A4.pdf",size_bytes:24247,filetype:"application/pdf"},
 {listing_file_id:1509497762234,rank:2,filename:"Inventory_Waste_US_Letter.pdf",size_bytes:23237,filetype:"application/pdf"},
 {listing_file_id:1509497762284,rank:3,filename:"Inventory_Waste_Quick_Start.pdf",size_bytes:4630,filetype:"application/pdf"},
 {listing_file_id:1510700238185,rank:4,filename:"Inventory_Waste_Read_Me_License.pdf",size_bytes:4242,filetype:"application/pdf"},
 {listing_file_id:1509980203922,rank:5,filename:"Inventory_Waste_Tracker.zip",size_bytes:16285,filetype:"application/zip"}
];

function core(over:Record<string,unknown>={}){
 return {
  listing_id:4561821192,state:"active",
  title:PD_STOCK_005_R03.current.title,
  tags:[...PD_STOCK_005_R03.current.tags],
  description:DESCRIPTION,price:{amount:890,divisor:100,currency_code:"USD"},quantity:999,
  shop_section_id:60023263,should_auto_renew:true,is_personalizable:false,is_customizable:false,
  who_made:"i_did",when_made:"2020_2026",listing_type:"download",taxonomy_id:12476,...over
 };
}
function provider(){
 let listing=core(), files=structuredClone(INITIAL), writes=0;
 const fetchImpl=(async(input:string|URL|Request,init?:RequestInit)=>{
  const url=String(input), method=init?.method??"GET";
  if(method==="DELETE"){
    writes++;
    const id=Number(url.split("/").at(-1));
    files=files.filter(x=>x.listing_file_id!==id).sort((a,b)=>a.rank-b.rank).map((x,i)=>({...x,rank:i+1}));
    return new Response(null,{status:204});
  }
  if(method==="POST"&&url.endsWith("/files")){
    writes++;
    const form=init?.body as FormData; const rank=Number(form.get("rank")); const name=String(form.get("name"));
    const target=PD_STOCK_005_R03.targets.find(x=>x.fileName===name); assert.ok(target);
    files=files.map(x=>x.rank>=rank?{...x,rank:x.rank+1}:x);
    const id=1600000000000+rank;
    files.push({listing_file_id:id,rank,filename:name,size_bytes:target.targetSizeBytes,filetype:target.mimeType});
    files.sort((a,b)=>a.rank-b.rank);
    return Response.json({listing_file_id:id,rank,filename:name,size_bytes:target.targetSizeBytes},{status:201});
  }
  if(method==="PATCH"){
    writes++;
    const body=init?.body as URLSearchParams;
    listing={...listing,title:String(body.get("title")),tags:String(body.get("tags")).split(",")};
    return Response.json(listing);
  }
  if(url.endsWith("/listings/4561821192")) return Response.json(listing);
  if(url.endsWith("/images")) return Response.json({results:GALLERY.map(([listing_image_id,rank,full_width,full_height])=>({listing_image_id,rank,full_width,full_height}))});
  if(url.endsWith("/properties")) return Response.json({results:[]});
  if(url.endsWith("/files")) return Response.json({count:files.length,results:structuredClone(files)});
  if(url.endsWith("/videos")) return Response.json({count:1,results:[{video_id:842820647,width:1920,height:1080,video_state:"active"}]});
  if(url.includes("/listings/batch/inventory")) return Response.json({results:[{listing_id:4561821192,inventory:{products:[{sku:"PD-STOCK-005"}]}}]});
  if(url.endsWith("/personalization")) return Response.json({personalization_questions:[]});
  return new Response("{}",{status:404});
 }) as typeof fetch;
 return {fetchImpl,writes:()=>writes,files:()=>files,listing:()=>listing};
}

test("R03 immutable identity and minimal two-file scope",()=>{
 assert.equal(PD_STOCK_005_R03.operationId,"PD-STOCK-005-LIVE-CATALOG-V3-R03-API-MINIMAL-001");
 assert.equal(PD_STOCK_005_R03.targets.length,2);
 assert.deepEqual(PD_STOCK_005_R03.targets.map(x=>[x.slot,x.currentListingFileId,x.targetSizeBytes]),[[3,1509497762284,6448],[5,1509980203922,62008]]);
});

test("read-only protected-state verifier performs zero writes",async()=>{
 process.env.ETSY_API_KEY="k";process.env.ETSY_SHARED_SECRET="s";
 const p=provider();
 const r=await verifyPdStock005R03ProtectedState({getAccessToken:async()=>"token",fetchImpl:p.fetchImpl});
 const x=await r.json();
 assert.equal(r.status,200); assert.equal(x.status,"PROTECTED_STATE_MATCH"); assert.equal(x.ETSY_WRITE_COUNT,0); assert.equal(p.writes(),0);
});

test("exact API minimal release uses DELETE+POST+DELETE+POST+PATCH and verifies target",async()=>{
 process.env.PUBLISH_WRITES_ENABLED="true"; process.env.ETSY_B01_WRITE_TOKEN="w"; process.env.ETSY_SHOP_ID="23582741";
 process.env.ETSY_API_KEY="k";process.env.ETSY_SHARED_SECRET="s";
 const auth="TEST-STOCK-R03-AUTH";
 const body=exactPdStock005R03Body(auth,PD_STOCK_005_R03.protectedStateFingerprint);
 const requestHash=hashOperationRequest(body);
 const p=provider(); const repo=new MemoryOperationLedgerRepository();
 const req=new Request("https://example.test",{method:"POST",headers:{"x-autodigitalpublisher-write-token":"w","content-type":"application/json"},body:JSON.stringify(body)});
 const r=await handlePdStock005R03(body,requestHash,req,{
  repository:repo,fetchImpl:p.fetchImpl,getAccessToken:async()=>"token",
  loadAsset:async t=>Buffer.alloc(t.targetSizeBytes,t.slot),verifyAsset:()=>true,
  now:()=>"2026-09-18T09:30:00.000Z"
 });
 const x=await r.json();
 assert.equal(r.status,200); assert.equal(x.status,"UPDATED_AND_VERIFIED"); assert.equal(x.ETSY_WRITE_COUNT,5); assert.equal(p.writes(),5);
 assert.equal(p.listing().title,PD_STOCK_005_R03.target.title);
 assert.deepEqual(p.listing().tags,[...PD_STOCK_005_R03.target.tags]);
 assert.deepEqual(p.files().map(f=>[f.rank,f.filename,f.size_bytes]),[
  [1,"Inventory_Waste_A4.pdf",24247],
  [2,"Inventory_Waste_US_Letter.pdf",23237],
  [3,"PD-STOCK-005_V1_Inventory_Waste_Quick_Start_B01.pdf",6448],
  [4,"Inventory_Waste_Read_Me_License.pdf",4242],
  [5,"PD-STOCK-005_V1_Inventory_Waste_Tracker_B03.zip",62008]
 ]);
});

test("wrong pre-state fails closed with zero writes",async()=>{
 process.env.PUBLISH_WRITES_ENABLED="true";process.env.ETSY_B01_WRITE_TOKEN="w";process.env.ETSY_SHOP_ID="23582741";
 const auth="TEST-STOCK-R03-AUTH"; const body=exactPdStock005R03Body(auth,PD_STOCK_005_R03.protectedStateFingerprint);
 const p=provider(); const original=p.fetchImpl;
 const fetchImpl=(async(input:string|URL|Request,init?:RequestInit)=>{
  const url=String(input); if((init?.method??"GET")==="GET"&&url.endsWith("/listings/4561821192")) return Response.json(core({title:"drift"}));
  return original(input,init);
 }) as typeof fetch;
 const req=new Request("https://example.test",{method:"POST",headers:{"x-autodigitalpublisher-write-token":"w","content-type":"application/json"},body:JSON.stringify(body)});
 const r=await handlePdStock005R03(body,hashOperationRequest(body),req,{repository:new MemoryOperationLedgerRepository(),fetchImpl,getAccessToken:async()=>"token",loadAsset:async t=>Buffer.alloc(t.targetSizeBytes),verifyAsset:()=>true});
 assert.equal(r.status,409); assert.equal(p.writes(),0);
});
