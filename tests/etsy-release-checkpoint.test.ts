import assert from "node:assert/strict";
import test from "node:test";
import { createListingFingerprint } from "../lib/candidate-fingerprint";
import {
  createEtsyReleaseCheckpointHandler, parseReleaseRequest
} from "../lib/etsy-release-checkpoint";

const SHOP_ID = 23582741, LISTING_ID = 1234567890;
const FP = "a".repeat(64);
const listing = {
  listing_id: LISTING_ID, shop_id: SHOP_ID, state: "draft", listing_type: "download",
  title: "Home Planner", description: "Printable home maintenance kit",
  price: {amount:550, divisor:100}, quantity: 999, tags: ["home planner"],
  taxonomy_id:12476, who_made:"i_did", when_made:"2020_2026"
};
const LF = createListingFingerprint({
  title:listing.title,description:listing.description,priceUsd:5.5,
  tags:listing.tags,quantity:listing.quantity,taxonomy_id:listing.taxonomy_id,
  who_made:listing.who_made,when_made:listing.when_made,type:"download",state:"draft"
});
function body(action: "PREFLIGHT" | "PUBLISH" = "PREFLIGHT") {
  return {
    action, operationId:"PUBLISH-TEST", productId:"PDT-NEW-017",
    candidateId:"CAND-17",candidateFingerprint:FP,expectedListingFingerprint:LF,
    shopId: SHOP_ID, draftListingId:LISTING_ID,
    expectedImageCount:1, expectedBuyerFileNames:["buyer.pdf"]
  };
}
function req(action: "PREFLIGHT" | "PUBLISH", token?: string) {
  return new Request("https://preview.example/api/etsy/release",{
    method:"POST",headers:{"content-type":"application/json",
      ...(token?{"x-autodigitalpublisher-write-token":token}:{})},
    body:JSON.stringify(body(action))
  });
}
function backend() {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url=String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.endsWith(`/listings/${LISTING_ID}`)) return Response.json(listing);
    if (url.endsWith(`/listings/${LISTING_ID}/images`)) {
      return Response.json({count:1,results:[{listing_image_id:81,rank:1}]});
    }
    if (url.endsWith(`/listings/${LISTING_ID}/files`)) {
      return Response.json({count:1,results:[{listing_file_id:92,filename:"buyer.pdf"}]});
    }
    throw new Error("UNEXPECTED_ETSY_REQUEST");
  };
  return { calls, fetchImpl };
}
test("release request validates buyer files and required image count",()=>{
  assert.equal(parseReleaseRequest(body()).expectedBuyerFileNames[0],"buyer.pdf");
  assert.throws(()=>parseReleaseRequest({
    ...body(), expectedBuyerFileNames:[]
  }), /INVALID_EXPECTED_BUYER_FILES/);
});
test("preflight requires operator token and cannot touch Etsy when missing",async()=>{
  const backup=process.env.ETSY_DRAFT_WRITE_TOKEN;
  process.env.ETSY_DRAFT_WRITE_TOKEN="test-token";
  try {
    const b=backend();
    const response=await createEtsyReleaseCheckpointHandler({
      fetchImpl:b.fetchImpl,getAccessToken:async()=> "123.token"
    })(req("PREFLIGHT"));
    assert.equal(response.status,401);
    assert.equal(b.calls.length,0);
  }finally{
    if (backup===undefined) delete process.env.ETSY_DRAFT_WRITE_TOKEN;
    else process.env.ETSY_DRAFT_WRITE_TOKEN=backup;
  }
});
test("release preflight reads Etsy assets without publishing",async()=>{
  const backup=process.env.ETSY_DRAFT_WRITE_TOKEN;
  const backupKey=process.env.ETSY_API_KEY;
  const backupSecret=process.env.ETSY_SHARED_SECRET;
  process.env.ETSY_DRAFT_WRITE_TOKEN="test-token";
  process.env.ETSY_API_KEY="api-key-fixture";
  process.env.ETSY_SHARED_SECRET="api-secret-fixture";
  try{
    const b=backend();let publish=0;
    const result=await createEtsyReleaseCheckpointHandler({
      fetchImpl:b.fetchImpl,getAccessToken:async()=> "123.token",
      publish:async()=>{publish++;return Response.json({});}
    })(req("PREFLIGHT","test-token"));
    const value=await result.json();
    assert.equal(result.status,200);
    assert.equal(value.status,"READY_FOR_SELLER_REVIEW");
    assert.equal(value.ETSY_WRITE_COUNT,0);
    assert.equal(value.imageCount,1);
    assert.deepEqual(value.buyerFileNames,["buyer.pdf"]);
    assert.match(value.assetSetSha256,/^[a-f0-9]{64}$/);
    assert.ok(b.calls.length===3&&b.calls.every(x=>x.startsWith("GET ")));
    assert.equal(publish,0);
  }finally{
    if(backup===undefined)delete process.env.ETSY_DRAFT_WRITE_TOKEN;
    else process.env.ETSY_DRAFT_WRITE_TOKEN=backup;
    if(backupKey===undefined)delete process.env.ETSY_API_KEY;
    else process.env.ETSY_API_KEY=backupKey;
    if(backupSecret===undefined)delete process.env.ETSY_SHARED_SECRET;
    else process.env.ETSY_SHARED_SECRET=backupSecret;
  }
});
test("release PUBLISH is blocked before Etsy read with Preview flags closed",async()=>{
  const old={
    token:process.env.ETSY_DRAFT_WRITE_TOKEN,
    flag:process.env.PUBLISH_WRITES_ENABLED,
    exact:process.env.ETSY_EXACT_PUBLISH_WRITES_ENABLED
  };
  process.env.ETSY_DRAFT_WRITE_TOKEN="test-token";
  process.env.PUBLISH_WRITES_ENABLED="false";
  process.env.ETSY_EXACT_PUBLISH_WRITES_ENABLED="false";
  try{
    const b=backend();let publish=0;
    const result=await createEtsyReleaseCheckpointHandler({
      fetchImpl:b.fetchImpl,getAccessToken:async()=> "123.token",
      publish:async()=>{publish++;return Response.json({});}
    })(req("PUBLISH","test-token"));
    assert.equal(result.status,403);
    assert.equal((await result.json()).error,"PUBLISH_WRITES_DISABLED");
    assert.equal(publish,0);
    assert.equal(b.calls.length,0);
  }finally{
    for(const [key,value] of [
      ["ETSY_DRAFT_WRITE_TOKEN",old.token],["PUBLISH_WRITES_ENABLED",old.flag],
      ["ETSY_EXACT_PUBLISH_WRITES_ENABLED",old.exact]
    ]as const){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
