import assert from "node:assert/strict";
import test from "node:test";
import {
  exactPdRest003A01Body,
  handlePdRest003A01TitleTags,
  PD_REST_003_A01,
  verifyPdRest003A01ProtectedState
} from "../lib/pd-rest-003-a01-title-tags";
import { hashOperationRequest, MemoryOperationLedgerRepository } from "../lib/operation-ledger";

const OLD_DESCRIPTION = `Make restaurant shifts easier to prepare, run and hand off with this pre-filled, editable 8-tab daily operations checklist toolkit for Excel, Google Sheets and print.

QUICK FACTS
• 1 ZIP containing the editable XLSX workbook + 4 PDFs
• Workbook: 8 editable tabs
• PDFs: A4, US Letter, Quick Start, and Read Me/License
• Pre-filled operational tasks you can customize
• Instant digital download — no physical item

WORKBOOK TABS
Start Here | Opening | Pre-Service | Closing | Prep & Temp | Cleaning | Handoff | Blank Checklist

WHAT THIS HELPS YOU DO
• Organize opening, pre-service and closing routines
• Record prep and temperature checks in one place
• Keep cleaning and shift handoff tasks visible
• Assign responsibility, timing, status and notes
• Print clean A4 or US Letter copies for the floor or kitchen

HOW TO USE
Download and unzip the ZIP file first. Open the included XLSX workbook in Microsoft Excel, or upload it to Google Drive and open it with Google Sheets. Review the Start Here tab, replace sample tasks and limits with your approved procedures, then test the full workflow before daily use.

IMPORTANT DOWNLOAD NOTE
Etsy’s app does not currently download digital purchases. After checkout, sign in to Etsy.com using a mobile browser or computer, then go to Your account > Purchases and reviews > Download Files. A desktop or laptop is recommended for first-time spreadsheet setup.

PLEASE NOTE
• PDF files are print-ready and are not text-editable.
• This is an operational planning tool, not HACCP, food-safety, legal, HR, tax, or regulatory advice.
• Temperature limits, cleaning routines and operating procedures must be verified by the buyer for their equipment, menu and location.

LICENSE
Single-business internal-use license. You may edit and print the files and share working copies with staff inside the purchasing business. You may not resell, redistribute, sublicense, upload publicly, or give the source files to another business.

CREATION DISCLOSURE
This original digital toolkit was designed by PoonthaiDigital with AI-assisted drafting and visual support, then manually edited, tested, and quality-checked.

Need help after purchase? Message PoonthaiDigital through Etsy with the filename, device or app used, and a screenshot.`;

const OLD_TAGS = ["restaurant checklist","opening checklist","closing checklist","restaurant manager","daily operations","manager checklist","kitchen checklist","shift checklist","restaurant excel","restaurant template","shift handoff","restaurant forms","food service"];
const TARGET_TAGS = ["restaurant checklist","restaurant opening","restaurant closing","daily operations","restaurant manager","manager checklist","opening checklist","closing checklist","shift handoff","kitchen checklist","restaurant excel","restaurant forms","food temp log"];
const IMAGES = [[8496992722,1,3000,3000],[8488103428,2,2000,2000],[8488103480,3,2000,2000],[8488103438,4,2000,2000],[8536001153,5,2000,2000],[8536001075,6,2000,2000],[8488103510,7,2000,2000],[8536001073,8,2000,2000],[8488103512,9,2000,2000]];
const FILES = [[1509497122622,1,"Restaurant_Operations_A4.pdf",20782,"application/pdf"],[1509497122824,2,"Restaurant_Operations_US_Letter.pdf",20228,"application/pdf"],[1509497122832,3,"Restaurant_Read_Me_License.pdf",4219,"application/pdf"],[1511184698189,4,"Restaurant_Operations.zip",15018,"application/zip"],[1512037381313,5,"Restaurant_Quick_Start.pdf",31217,"application/pdf"]];

const prior = { writes: process.env.PUBLISH_WRITES_ENABLED, token: process.env.ETSY_B01_WRITE_TOKEN, shop: process.env.ETSY_SHOP_ID, auth: process.env.ETSY_PD_REST_003_A01_AUTHORIZATION_ID, sha: process.env.ETSY_PD_REST_003_A01_REQUEST_SHA256, key: process.env.ETSY_API_KEY, secret: process.env.ETSY_SHARED_SECRET };
function restore(){ const names={writes:"PUBLISH_WRITES_ENABLED",token:"ETSY_B01_WRITE_TOKEN",shop:"ETSY_SHOP_ID",auth:"ETSY_PD_REST_003_A01_AUTHORIZATION_ID",sha:"ETSY_PD_REST_003_A01_REQUEST_SHA256",key:"ETSY_API_KEY",secret:"ETSY_SHARED_SECRET"} as const; for(const [k,v] of Object.entries(prior)){const n=names[k as keyof typeof names]; if(v===undefined) delete process.env[n]; else process.env[n]=v;} }
test.afterEach(restore);
function response(value:unknown,status=200){return new Response(JSON.stringify(value),{status});}
function request(token?:string){return new Request("https://x",{method:"POST",headers:token?{"x-autodigitalpublisher-write-token":token}:{}});}
function configure(){process.env.PUBLISH_WRITES_ENABLED="true";process.env.ETSY_B01_WRITE_TOKEN="secret";process.env.ETSY_SHOP_ID=PD_REST_003_A01.shopId;process.env.ETSY_PD_REST_003_A01_AUTHORIZATION_ID="AUTH-REST-A01";process.env.ETSY_API_KEY="key";process.env.ETSY_SHARED_SECRET="secret";const body=exactPdRest003A01Body("AUTH-REST-A01");process.env.ETSY_PD_REST_003_A01_REQUEST_SHA256=hashOperationRequest(body);return body;}
function listing(target=false){return {listing_id:4561819638,shop_id:23582741,state:"active",title:target?PD_REST_003_A01.title:"Restaurant Opening & Closing Checklist | Daily Operations Template",description:OLD_DESCRIPTION,price:{amount:990,divisor:100,currency_code:"USD"},taxonomy_id:12476,quantity:998,who_made:"i_did",when_made:"2020_2026",listing_type:"download",tags:target?[...TARGET_TAGS]:[...OLD_TAGS]};}
function images(){return IMAGES.map(([listing_image_id,rank,full_width,full_height])=>({listing_image_id,rank,full_width,full_height}));}
function files(){return FILES.map(([listing_file_id,rank,filename,size_bytes,filetype])=>({listing_file_id,rank,filename,size_bytes,filetype}));}
function stateFetch(methods:string[], targetRef:{value:boolean}, patchBodies:string[]=[]){return async(url:URL|RequestInfo,init?:RequestInit)=>{const method=String(init?.method??"GET");methods.push(method);const u=String(url);if(method==="PATCH"){patchBodies.push(String(init?.body??""));targetRef.value=true;return response({ok:true});}if(u.endsWith("/images"))return response({results:images()});if(u.endsWith("/properties"))return response({results:[]});if(u.endsWith("/files"))return response({results:files()});if(u.endsWith("/listings/4561819638"))return response(listing(targetRef.value));return response({},404);};}

test("exact immutable contract is title-tags only and ordered",()=>{const body=exactPdRest003A01Body("AUTH-REST-A01");assert.equal(body.candidateFingerprint,"ff711a57a61d2a9d289400380d5a5c0f4120e9dab08f90553f0bb00958f6a1e7");assert.equal(body.buildFingerprint,"635dafc06cc7daf4b1a531bfa6ff26a72d67eeac728325d682c93e75f20a4bfd");assert.equal(body.acceptanceCriteriaSha256,"250d115f35bbb13546ee9ccf5213c8ba24c8fd710c295088bf230315517eaa3f");assert.equal(body.protectedStateBaselineSha256,"13f6c3584b6a054276d0419f489f0c40056cf3798d01706ea498cf94221b8555");assert.deepEqual(Object.keys(body.patch),["title","tags"]);assert.deepEqual(body.patch.tags,TARGET_TAGS);assert.equal(body.patch.tags.length,13);});

test("request hash mismatch fails before Etsy access",async()=>{const body=configure();process.env.ETSY_PD_REST_003_A01_REQUEST_SHA256="f".repeat(64);let calls=0;const result=await handlePdRest003A01TitleTags(body,request("secret"),{getAccessToken:async()=>{calls++;return"x";},repository:new MemoryOperationLedgerRepository()});assert.equal(result.status,409);assert.equal(calls,0);});

test("zero-write verification uses four GETs and exact baseline",async()=>{process.env.ETSY_API_KEY="key";process.env.ETSY_SHARED_SECRET="secret";const methods:string[]=[];const target={value:false};const result=await verifyPdRest003A01ProtectedState({getAccessToken:async()=>"token",fetchImpl:stateFetch(methods,target)});const out=await result.json();assert.equal(result.status,200);assert.equal(out.status,"PROTECTED_STATE_MATCH");assert.equal(out.ETSY_WRITE_COUNT,0);assert.equal(out.protectedStateBaselineSha256,"13f6c3584b6a054276d0419f489f0c40056cf3798d01706ea498cf94221b8555");assert.deepEqual(methods,["GET","GET","GET","GET"]);});

test("protected mismatch fails closed with zero PATCH",async()=>{const body=configure();const methods:string[]=[];const target={value:false};const fetchImpl=async(url:URL|RequestInfo,init?:RequestInit)=>{const r=await stateFetch(methods,target)(url,init);if(String(url).endsWith("/listings/4561819638")&&String(init?.method??"GET")==="GET"){const bad=listing(false);bad.quantity=997;return response(bad);}return r;};const result=await handlePdRest003A01TitleTags(body,request("secret"),{getAccessToken:async()=>"token",fetchImpl,repository:new MemoryOperationLedgerRepository()});assert.equal(result.status,409);assert.equal(methods.filter(x=>x==="PATCH").length,0);});

test("one-shot sends exactly one PATCH with title and tags then verifies all protected fields",async()=>{const body=configure();const methods:string[]=[];const target={value:false};const patchBodies:string[]=[];const repo=new MemoryOperationLedgerRepository();const result=await handlePdRest003A01TitleTags(body,request("secret"),{getAccessToken:async()=>"token",fetchImpl:stateFetch(methods,target,patchBodies),repository:repo});const out=await result.json();assert.equal(result.status,200);assert.equal(out.status,"UPDATED_AND_VERIFIED");assert.equal(out.providerPatchCount,1);assert.equal(out.receipt.verified.title,"PASS");assert.equal(out.receipt.verified.tagsExactOrdered13,"PASS");assert.equal(out.receipt.verified.protectedState,"PASS");assert.equal(methods.filter(x=>x==="PATCH").length,1);const form=new URLSearchParams(patchBodies[0]);assert.deepEqual([...form.keys()],["title","tags"]);assert.equal(form.get("title"),PD_REST_003_A01.title);assert.equal(form.get("tags"),TARGET_TAGS.join(","));});

test("successful replay performs no additional provider PATCH",async()=>{const body=configure();const methods:string[]=[];const target={value:false};const repo=new MemoryOperationLedgerRepository();const fetchImpl=stateFetch(methods,target);const first=await handlePdRest003A01TitleTags(body,request("secret"),{getAccessToken:async()=>"token",fetchImpl,repository:repo});assert.equal(first.status,200);const patchCount=methods.filter(x=>x==="PATCH").length;const second=await handlePdRest003A01TitleTags(body,request("secret"),{getAccessToken:async()=>"token",fetchImpl,repository:repo});const out=await second.json();assert.equal(out.status,"REPLAY");assert.equal(methods.filter(x=>x==="PATCH").length,patchCount);});
