import assert from "node:assert/strict";
import test from "node:test";
import {
  P01_SHOP_ID, P01_BUYER_FILES, parseConfig, releaseRequest, executeP01Release
} from "../scripts/etsy-p01-exact-release.mjs";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHOP_LISTINGS = [
  {listingId:11111,state:"active"},
  {listingId:22222,state:"draft"}
];
function approval() {
  return {
    schemaVersion: "1.0.0", shopId:String(P01_SHOP_ID), draftListingId:"22222",
    authorization:{
      authorizationId:"EXACT-P01-APPROVAL-1",
      candidateId:"P01-CANDIDATE-V121",candidateFingerprint:SHA_A,
      scope:"PUBLISH",state:"ACTIVE",channel:"etsy",
      issuedAt:"2026-01-01T00:00:00.000Z",expiresAt:"2030-01-01T00:00:00.000Z"
    }
  };
}
function environment(overrides={}) {
  return {
    P01_DRAFT_LISTING_ID:"22222",
    P01_CANDIDATE_ID:"P01-CANDIDATE-V121",
    P01_CANDIDATE_FINGERPRINT:SHA_A,
    P01_LISTING_FINGERPRINT:SHA_B,
    ETSY_DRAFT_WRITE_TOKEN:"fixture-only-token",
    P01_PUBLISH_ENABLE:"YES_FOR_THIS_LISTING",
    P01_PUBLISH_CONFIRMATION:"PUBLISH_P01_ONLY",
    P01_APPROVED_ASSET_SET_SHA256:SHA_A,
    P01_RELEASE_AUTHORIZATION_JSON:JSON.stringify(approval()),
    ...overrides
  };
}
function mockApi({assetHash=SHA_A,changedOther=false,buyerFiles=[...P01_BUYER_FILES]}={}) {
  let published=false; const calls=[];
  async function fetchImpl(input, init={}) {
    const url=String(input);
    calls.push({url,method:init.method||"GET"});
    if(url.endsWith("/api/etsy/seller-state")) {
      return Response.json({
        status:"PASS",mode:"READ_ONLY",shopId:P01_SHOP_ID,
        listings: SHOP_LISTINGS.map(x=>({
          ...x,state:published && x.listingId===22222?"active":
            published && changedOther && x.listingId===11111?"inactive":x.state
        }))
      });
    }
    if(url.endsWith("/api/etsy/release")&&init.method==="POST") {
      assert.equal(init.headers["x-autodigitalpublisher-write-token"],"fixture-only-token");
      const body=JSON.parse(init.body);
      assert.equal(body.productId,"P01");
      assert.equal(body.draftListingId,22222);
      if (body.action==="PREFLIGHT") {
        return Response.json({
          status:"READY_FOR_SELLER_REVIEW",mode:"READ_ONLY",ETSY_WRITE_COUNT:0,
          draftListingId:22222,imageCount:7,buyerFileNames:buyerFiles,
          assetSetSha256:assetHash
        });
      }
      assert.equal(body.action,"PUBLISH");
      published=true;
      return Response.json({
        status:"PUBLISHED",receipt:{listingId:"22222",state:"active"}
      });
    }
    throw new Error("UNEXPECTED_MOCK_URL");
  }
  return {fetchImpl,calls,getPublished:()=>published};
}
test("P01 preflight requires operator and exact product pins",()=>{
  assert.throws(()=>parseConfig(environment({ETSY_DRAFT_WRITE_TOKEN:""}),"preflight"),/ETSY_OPERATOR_TOKEN_REQUIRED/);
  assert.throws(()=>parseConfig(environment({P01_CANDIDATE_FINGERPRINT:"bad"}),"preflight"),/P01_CANDIDATE_FINGERPRINT_REQUIRED/);
  assert.throws(()=>parseConfig(environment({P01_DRAFT_LISTING_ID:"-1"}),"preflight"),/P01_DRAFT_LISTING_ID_REQUIRED/);
});
test("P01 publish requires explicit confirmation and exact scoped authorization",()=>{
  assert.throws(()=>parseConfig(environment({P01_PUBLISH_ENABLE:"false"}),"publish"),/CONFIRMATION_REQUIRED/);
  assert.throws(()=>parseConfig(environment({P01_PUBLISH_CONFIRMATION:"other"}),"publish"),/CONFIRMATION_REQUIRED/);
  assert.throws(()=>parseConfig(environment({P01_APPROVED_ASSET_SET_SHA256:""}),"publish"),/ASSET_SET_APPROVAL_REQUIRED/);
  const bad=approval();bad.authorization.candidateId="DIFFERENT";
  assert.throws(()=>parseConfig(environment({P01_RELEASE_AUTHORIZATION_JSON:JSON.stringify(bad)}),"publish"),/AUTHORIZATION_DOES_NOT_MATCH/);
});
test("build release request always pins P01 and exact buyer filenames",()=>{
  const cfg=parseConfig(environment(),"preflight");
  const request=releaseRequest(cfg,"PREFLIGHT");
  assert.equal(request.productId,"P01");
  assert.equal(request.shopId,P01_SHOP_ID);
  assert.equal(request.expectedImageCount,7);
  assert.deepEqual(request.expectedBuyerFileNames,P01_BUYER_FILES);
  assert.equal(request.authorization,undefined);
  assert.throws(()=>releaseRequest(cfg,"PUBLISH"),/PUBLISH_APPROVAL_NOT_PRESENT/);
});
test("read-only preflight never invokes PUBLISH",async()=>{
  const api=mockApi();
  const result=await executeP01Release(parseConfig(environment(),"preflight"),api.fetchImpl);
  assert.equal(result.status,"READY_FOR_SELLER_REVIEW");
  assert.equal(result.assetSetSha256,SHA_A);
  assert.equal(result.writeCount,0);
  assert.equal(api.getPublished(),false);
  assert.equal(api.calls.filter(x=>x.method==="POST").length,1);
});
test("different asset-set SHA stops before any Etsy write",async()=>{
  const api=mockApi({assetHash:SHA_B});
  await assert.rejects(()=>executeP01Release(parseConfig(environment(),"publish"),api.fetchImpl),/P01_ASSETS_CHANGED_AFTER_APPROVAL/);
  assert.equal(api.getPublished(),false);
  assert.equal(api.calls.filter(x=>x.method==="POST").length,1);
});
test("missing buyer file stops before publish",async()=>{
  const api=mockApi({buyerFiles:[P01_BUYER_FILES[0]]});
  await assert.rejects(()=>executeP01Release(parseConfig(environment(),"publish"),api.fetchImpl),/P01_RELEASE_PREFLIGHT_FAILED/);
  assert.equal(api.getPublished(),false);
});
test("approved P01 publish is read back; other listing remains unchanged",async()=>{
  const api=mockApi();
  const result=await executeP01Release(parseConfig(environment(),"publish"),api.fetchImpl);
  assert.equal(result.status,"PUBLISHED_VERIFIED");
  assert.equal(result.listingId,22222);
  assert.equal(result.nonTargetStatesUnchanged,true);
  assert.equal(api.calls.filter(x=>x.method==="POST").length,2);
});
test("unrelated listing state drift is not reported as safe success",async()=>{
  const api=mockApi({changedOther:true});
  await assert.rejects(()=>executeP01Release(parseConfig(environment(),"publish"),api.fetchImpl),/NON_P01_SHOP_LISTING_STATE_CHANGED/);
});
