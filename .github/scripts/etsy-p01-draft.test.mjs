import test from 'node:test';
import assert from 'node:assert/strict';
import {validateP01DraftEnv, createP01Draft} from './etsy-p01-draft.mjs';
const sha = 'a'.repeat(64);
const env = {
  P01_DRAFT_CONFIRMATION:'CREATE_P01_DRAFT_ONLY',
  P01_DRAFT_DEPLOYMENT_SHA:'b'.repeat(40),
  P01_DRAFT_OPERATOR_TOKEN:'test-token-not-a-real-secret',
  P01_DRAFT_PRICE_APPROVED_USD:'3.90',
  P01_DRAFT_SHOP_CURRENCY_VERIFIED:'USD',
  P01_DRAFT_REQUEST_JSON: JSON.stringify({
    action:'CREATE_DRAFT', productId:'P01', shopId:23582741,
    operationId:'P01-DRAFT-TEST-0001',candidateId:'P01-1.2.1-TEST',
    candidateFingerprint:sha, expectedListingFingerprint:sha,
    listing:{title:'Home Repair & Maintenance Tracker PDF | Repair to Warranty Log Kit | A4 & US Letter Printable',
      description:'12 printable pages',priceUsd:3.9, tags:Array.from({length:13}, (_,i)=>'test tag '+i),
      type:'download',state:'draft',taxonomy_id:123, quantity:999,who_made:'i_did',when_made:'2020_2026'},
    qc:{state:'QC_PASSED',productTruthVerified:true,testerFingerprint:sha,independentFinalQcFingerprint:sha}
  })
};
const json=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
const baseResponses=(opts={})=>({
  '/api/etsy/release':{deployedEnvironment:'production',deployedCommitSha:env.P01_DRAFT_DEPLOYMENT_SHA,publishWritesEnabled:false},
  '/api/etsy/status':{oauthConnected:true,sellerWriteGrantReady:true,writeGates:{draftWritesEnabled:!opts.gateOff,publishWritesEnabled:false}},
  '/api/etsy/drafts':{genericDraftWritesEnabled:true},
  '/api/etsy/seller-state':{status:'PASS',shopId:23582741,listings:[]}
});
function mocked(opts={}) {
  const responses=baseResponses(opts), calls=[];
  const f=async (url, init)=>{
    const path=new URL(url).pathname;
    calls.push({path,method:init.method,body:init.body&&JSON.parse(init.body)});
    if(init.method==='POST' && path==='/api/etsy/drafts'){
      const req=JSON.parse(init.body);
      return json(req.action==='PREFLIGHT'?
        {status:'METADATA_VALID',productId:'P01',expectedListingFingerprint:sha,publishAuthorized:false}:
        {status:'APPLIED',productId:'P01',publishAuthorized:false,receipt:{providerResourceId:'4567890123'}});
    }
    if(path==='/api/etsy/seller-state' && calls.filter(x=>x.path===path).length===2) {
      return json({status:'PASS',shopId:23582741,listings:[{
        listingId:4567890123,shopId:23582741,state:'draft',title:JSON.parse(env.P01_DRAFT_REQUEST_JSON).listing.title
      }]});
    }
    return json(responses[path]);
  };
  return {f,calls};
}
test('valid draft metadata remains exactly P01-only',()=>{
  assert.equal(validateP01DraftEnv(env).shopId,23582741);
});
test('wrong product or shop rejected before any Etsy/Vercel call',async()=>{
  const r=JSON.parse(env.P01_DRAFT_REQUEST_JSON);r.shopId=123;
  const m=mocked();await assert.rejects(createP01Draft({...env,P01_DRAFT_REQUEST_JSON:JSON.stringify(r)},m.f),/MISMATCH/);
  assert.equal(m.calls.length,0);
});
test('without protected operator secret cannot call network',async()=>{
  const m=mocked();await assert.rejects(createP01Draft({...env,P01_DRAFT_OPERATOR_TOKEN:''},m.f),/SECRETS_REQUIRED/);
  assert.equal(m.calls.length,0);
});
test('shop currency or price unapproved cannot call network',async()=>{
  const m=mocked();await assert.rejects(createP01Draft({...env,P01_DRAFT_SHOP_CURRENCY_VERIFIED:'THB'},m.f),/NOT_APPROVED/);
  assert.equal(m.calls.length,0);
});
test('wrong confirmation cannot call network',async()=>{
  const m=mocked();await assert.rejects(createP01Draft({...env,P01_DRAFT_CONFIRMATION:'PUBLISH_EXACT_LISTING'},m.f),/CONFIRMATION_REQUIRED/);
  assert.equal(m.calls.length,0);
});
test('disabled Draft writes stop before POST',async()=>{
  const m=mocked({gateOff:true});await assert.rejects(createP01Draft(env,m.f),/DRAFT_GATE_NOT_READY/);
  assert.equal(m.calls.filter(x=>x.method==='POST').length,0);
});
test('exact title duplicate stops before POST',async()=>{
  const m=mocked(); const orig=m.f; const f=(url,init)=>
    new URL(url).pathname==='/api/etsy/seller-state'? json({status:'PASS',shopId:23582741,listings:[{listingId:55,title:JSON.parse(env.P01_DRAFT_REQUEST_JSON).listing.title}]}):orig(url,init);
  await assert.rejects(createP01Draft(env,f),/DUPLICATE/);
  assert.equal(m.calls.filter(x=>x.method==='POST').length,0);
});
test('creates exactly one Draft then readback and no Publish POST',async()=>{
  const m=mocked();const result=await createP01Draft(env,m.f);
  assert.deepEqual({status:result.status,listingId:result.listingId,assetsUploaded:result.assetsUploaded},
    {status:'DRAFT_READBACK_VERIFIED',listingId:4567890123,assetsUploaded:false});
  assert.deepEqual(m.calls.filter(x=>x.method==='POST').map(x=>[x.path,x.body.action]),
    [['/api/etsy/drafts','PREFLIGHT'],['/api/etsy/drafts','CREATE_DRAFT']]);
});
test('unexpected Etsy write response stops, never retries',async()=>{
  const m=mocked(); const f=async (url,init)=>{
    if(init.method==='POST'&&JSON.parse(init.body).action==='CREATE_DRAFT') return json({status:'RECONCILIATION_REQUIRED'});
    return m.f(url,init);
  };
  await assert.rejects(createP01Draft(env,f),/RESULT_UNCERTAIN/);
});
test('wrong production SHA stops before POST',async()=>{
  const m=mocked();const orig=m.f; const f=(url,init)=>new URL(url).pathname==='/api/etsy/release'?
    json({deployedEnvironment:'production',deployedCommitSha:'f'.repeat(40),publishWritesEnabled:false}):orig(url,init);
  await assert.rejects(createP01Draft(env,f),/DEPLOYMENT_NOT_APPROVED/);
  assert.equal(m.calls.filter(x=>x.method==='POST').length,0);
});