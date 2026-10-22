import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runDirectDraft,loadEvidence,fingerprint,validateConfiguration} from './etsy-p01-draft-direct.mjs';

const TITLE='Home Repair & Maintenance Tracker PDF | Repair to Warranty Log Kit | A4 & US Letter Printable';
const TAGS=['home maintenance','home repair log','repair tracker','warranty tracker','homeowner planner',
  'service visit log','repair expense log','contractor tracker','household binder','home upkeep planner',
  'appliance registry','printable house log','first home binder'];
const description='A focused twelve page printable repair log to track tasks, costs, providers, appliances and followup warranty claims. No physical product.';
function evidenceFixture(){
  const assetRecords=Array.from({length:10},(_,i)=>({bytes:500+i,name:'file'+i+'.pdf',sha256:'a'.repeat(64)}));
  assetRecords.sort((a,b)=>a.name.localeCompare(b.name,'en'));
  const assetSetSha256=createHash('sha256').update(JSON.stringify(assetRecords)).digest('hex');
  const sourceRecord={productId:'P01',etsyShopId:23582741,productVersion:'1.2.1',desiredState:'draft',listingTitle:TITLE,qaReportSha256:'b'.repeat(64)};
  const source={kind:'P01_PROPOSED_CANDIDATE_SOURCE_LOCK',sourceRecord,
    candidateFingerprint:fingerprint(sourceRecord,'CANDIDATE'),verifiedFileCount:10,assetRecords,assetSetSha256};
  const evidence={product:{shop_id:23582741,version:'1.2.1'},listing:{title:TITLE,price_usd:3.9,tags:TAGS},
    source:{files:assetRecords,qa_report_sha256:sourceRecord.qaReportSha256,asset_set_sha256:assetSetSha256}};
  const reader=(path)=>path.includes('CANDIDATE_SOURCE_LOCK')?source:evidence;
  return {source,evidence,reader};
}
const fake=evidenceFixture();
const goodListing={title:TITLE,description,priceUsd:3.9,tags:TAGS,quantity:999,taxonomy_id:123,
  who_made:'i_did',when_made:'2020_2026',type:'download',state:'draft'};
const goodEnv={P01_DIRECT_MODE:'CREATE_DRAFT',P01_DIRECT_CONFIRMATION:'CREATE_P01_DRAFT_ONLY',
  ETSY_API_KEY:'keystring',ETSY_SHARED_SECRET:'not-a-real-shared-secret',ETSY_OAUTH_REFRESH_TOKEN:'123.fake-refresh-token',
  P01_APPROVED_SHOP_CURRENCY:'USD',P01_SELLER_APPROVED_PRICE_USD:'3.90',
  P01_QC_APPROVED_SOURCE_FINGERPRINT:fake.source.candidateFingerprint,
  P01_QC_APPROVED_REPORT_SHA256:'b'.repeat(64),P01_QC_REVIEWED:'P01_V1_2_1_APPROVED',
  P01_APPROVED_TAXONOMY_ID:'123',P01_APPROVED_QUANTITY:'999',P01_APPROVED_WHO_MADE:'i_did',
  P01_APPROVED_WHEN_MADE:'2020_2026',P01_APPROVED_DESCRIPTION:description,
  P01_APPROVED_LISTING_FINGERPRINT:fingerprint(goodListing,'LISTING')};
const json=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
function mocked(opts={}){
  let created=false;const calls=[];
  const get=(url,init)=>{
    const u=new URL(url);const path=u.pathname;
    calls.push({path,method:init.method,body:init.body});
    if(path==='/v3/public/oauth/token')return json({access_token:'123.mock-token',scope:'listings_r listings_w'});
    if(path==='/v3/application/shops/23582741')return json({shop_id:23582741,shop_name:'PoonthaiDigital',currency_code:opts.currency||'USD'});
    if(path==='/v3/application/shops/23582741/listings'&&init.method==='GET'){
      const state=u.searchParams.get('state');
      let found=[];
      if(opts.duplicate && state==='draft')found=[{listing_id:1001,shop_id:23582741,title:TITLE,state:'draft'}];
      if(created&&state==='draft')found=[{listing_id:456789123,shop_id:23582741,title:TITLE,state:'draft'}];
      return json({count:found.length,results:found});
    }
    if(path==='/v3/application/shops/23582741/listings'&&init.method==='POST'){
      if(opts.ambiguous)throw Error('Network lost after Etsy POST');
      created=true;return json({listing_id:456789123});
    }
    if(path==='/v3/application/listings/456789123')return json({
      listing_id:456789123,shop_id:23582741,title:TITLE,state:opts.wrongState?'active':'draft',
      listing_type:'download',taxonomy_id:123,who_made:'i_did',when_made:'2020_2026',
      price:{amount:390,divisor:100,currency_code:'USD'},description,tags:TAGS
    });
    throw Error('Unexpected Etsy path '+path+' '+init.method);
  };
  return {fetchImpl:async(url,init)=>get(url,init),calls};
}
const postListings=m=>m.calls.filter(x=>x.method==='POST'&&x.path.endsWith('/listings'));
const exec=(env,m)=>runDirectDraft(env,m.fetchImpl,fake.reader);

test('source candidate / asset SHA-256 checked exactly',()=>{
  const v=loadEvidence(fake.reader);assert.equal(v.source.candidateFingerprint,fake.source.candidateFingerprint);
});
test('tampered canonical asset fails before network',()=>{
  const bad=evidenceFixture();bad.source.assetRecords[0].bytes+=1;
  assert.throws(()=>loadEvidence(bad.reader),/FINGERPRINT_MISMATCH|SOURCE_ASSET_MISMATCH/);
});
test('valid listing SHA matches approved payload',()=>{
  assert.equal(validateConfiguration(goodEnv,fake).actualListingFingerprint,goodEnv.P01_APPROVED_LISTING_FINGERPRINT);
});
test('CHECK mode does not mutate any listing',async()=>{
  const m=mocked(),r=await exec({...goodEnv,P01_DIRECT_MODE:'CHECK',P01_DIRECT_CONFIRMATION:''},m);
  assert.equal(r.status,'P01_READ_ONLY_READY');assert.equal(postListings(m).length,0);
});
test('CREATE_DRAFT once: direct Etsy POST, verified ID, never Publish',async()=>{
  const m=mocked();const r=await exec(goodEnv,m);
  assert.deepEqual([r.status,r.listingId,r.publishPerformed,r.assetsUploaded],
    ['ETSY_P01_DRAFT_VERIFIED',456789123,false,false]);
  assert.equal(postListings(m).length,1);
  assert.equal(m.calls.some(x=>/vercel|publish|release/.test(x.path)),false);
  assert.equal(m.calls.some(x=>x.method==='PATCH'||x.method==='DELETE'),false);
});
test('missing price approval blocks all network traffic',async()=>{
  const m=mocked();await assert.rejects(exec({...goodEnv,P01_SELLER_APPROVED_PRICE_USD:''},m),/SELLER_PRICE_APPROVAL/);assert.equal(m.calls.length,0);
});
test('missing independent QC approval blocks all network traffic',async()=>{
  const m=mocked();await assert.rejects(exec({...goodEnv,P01_QC_REVIEWED:''},m),/QC_REVIEW_GATE/);assert.equal(m.calls.length,0);
});
test('mismatched candidate fingerprint blocks all network traffic',async()=>{
  const m=mocked();await assert.rejects(exec({...goodEnv,P01_QC_APPROVED_SOURCE_FINGERPRINT:'d'.repeat(64)},m),/QC_REVIEW_GATE/);assert.equal(m.calls.length,0);
});
test('mismatched listing fingerprint blocks all network traffic',async()=>{
  const m=mocked();await assert.rejects(exec({...goodEnv,P01_APPROVED_LISTING_FINGERPRINT:'e'.repeat(64)},m),/LISTING_FINGERPRINT/);assert.equal(m.calls.length,0);
});
test('shop currency mismatch blocks listing POST',async()=>{
  const m=mocked({currency:'THB'});await assert.rejects(exec(goodEnv,m),/SHOP_ID_NAME_OR_CURRENCY/);assert.equal(postListings(m).length,0);
});
test('duplicate Draft blocks listing POST',async()=>{
  const m=mocked({duplicate:true});await assert.rejects(exec(goodEnv,m),/ALREADY_LISTED/);assert.equal(postListings(m).length,0);
});
test('ambiguous Etsy response stops after a single POST',async()=>{
  const m=mocked({ambiguous:true});await assert.rejects(exec(goodEnv,m),/STOP_AND_RECONCILE/);assert.equal(postListings(m).length,1);
});
test('unexpected active state on readback does not retry POST',async()=>{
  const m=mocked({wrongState:true});await assert.rejects(exec(goodEnv,m),/IDENTITY_NOT_VERIFIED/);assert.equal(postListings(m).length,1);
});
test('missing OAuth secret blocks before any network',async()=>{
  const m=mocked();await assert.rejects(exec({...goodEnv,ETSY_OAUTH_REFRESH_TOKEN:''},m),/SECRETS_REQUIRED/);assert.equal(m.calls.length,0);
});
test('wrong taxonomy blocks before any network',async()=>{
  const m=mocked();await assert.rejects(exec({...goodEnv,P01_APPROVED_TAXONOMY_ID:''},m),/CATEGORY_OR_MAKER_UNAPPROVED/);assert.equal(m.calls.length,0);
});
test('wrong create confirmation blocks before any network',async()=>{
  const m=mocked();await assert.rejects(exec({...goodEnv,P01_DIRECT_CONFIRMATION:'PUBLISH_EXACT_LISTING'},m),/EXPLICIT_DRAFT_ONLY/);assert.equal(m.calls.length,0);
});