import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import C from '../config/n04-art-release.json';
import { auth,categoryMatches,assetFor,validateListing,validateReceipts,handleN04 } from '../lib/n04-art-release';
const secret='n04-test-only-not-a-real-credential-123456';
function listing(){return {listing_id:123,shop_id:C.shopId,title:C.title,description:C.description,taxonomy_id:999,price:{amount:349,divisor:100,currency_code:'USD'},who_made:C.whoMade,when_made:C.whenMade,listing_type:'download',tags:C.tags,state:'draft'}}
test('operator authentication and expiry fail closed',()=>{
  const now=Date.parse('2026-10-25T00:00:00Z');
  assert.throws(()=>auth(new Request('https://example.test'),secret,now),/OPERATOR_REQUIRED/);
  assert.throws(()=>auth(new Request('https://example.test',{headers:{'x-n04-operator':secret}}),secret,Date.parse('2026-10-27T00:00:00Z')),/EXPIRED/);
  auth(new Request('https://example.test',{headers:{'x-n04-operator':secret}}),secret,now);
});
test('category requires the complete exact Etsy seller path',()=>{
 const tree=[{name:'Books, Movies & Music',children:[{name:'Books',children:[{id:999,name:'Coloring Books'}]}]},{name:'Craft Supplies',children:[{id:1000,name:'Coloring Books'}]}];
 assert.deepEqual(categoryMatches(tree).map(x=>x.id),[999]);
});
test('a different shop, title, price or taxonomy cannot be touched',()=>{
 validateListing(listing(),123,999);
 for(const override of [{shop_id:1},{title:'Another product'},{taxonomy_id:1},{price:{amount:999,divisor:100,currency_code:'USD'}}])assert.throws(()=>validateListing({...listing(),...override},123,999),/IDENTITY_MISMATCH/);
});
test('Etsy HTML-encoded apostrophes preserve exact approved copy',()=>{
 const row={...listing(),description:C.description.replace(/'/g,'&#39;')};validateListing(row,123,999);
 assert.throws(()=>validateListing({...row,description:row.description+' altered'},123,999),/IDENTITY_MISMATCH/);
});
test('unapproved or altered binary is rejected before provider upload',()=>{
 assert.throws(()=>assetFor('not-approved.pdf',new Uint8Array()),/NOT_APPROVED/);
 assert.throws(()=>assetFor(C.assets[0].name,new Uint8Array([1,2,3])),/HASH_MISMATCH/);
});
test('publication requires all fifteen signed source receipts and prevents duplicates',()=>{
 const receipts=C.assets.map((a,i)=>{const p={listingId:123,name:a.name,kind:a.kind,rank:a.rank,sha256:a.sha256,resourceId:i+1};return {...p,signature:createHmac('sha256',secret).update(JSON.stringify(p)).digest('hex')}});
 validateReceipts(receipts,123,secret);
 assert.throws(()=>validateReceipts(receipts.slice(1),123,secret),/ALL_ASSET_RECEIPTS/);
 assert.throws(()=>validateReceipts([{...receipts[0],resourceId:999},...receipts.slice(1)],123,secret),/RECEIPT_INVALID/);
 assert.throws(()=>validateReceipts([receipts[0],receipts[0],...receipts.slice(2)],123,secret),/RECEIPT_INVALID/);
});
test('unauthenticated mutation never gets an OAuth token or calls Etsy',async()=>{
 const old=process.env.N04_ART_RELEASE_OPERATOR_TOKEN;process.env.N04_ART_RELEASE_OPERATOR_TOKEN=secret;
 let calls=0;
 try{
 const r=await handleN04(new Request('https://example.test',{method:'POST',body:'{}'}),{token:async()=>{calls++;return 'unused'},headers:()=>({}),fetchImpl:async()=>{calls++;throw Error('must not fetch')}});
 assert.equal(r.status,409);assert.equal(calls,0);assert.equal((await r.json()).ETSY_WRITE_COUNT,0);
 }finally{if(old===undefined)delete process.env.N04_ART_RELEASE_OPERATOR_TOKEN;else process.env.N04_ART_RELEASE_OPERATOR_TOKEN=old;}
});
