import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PDT_CQE_008_FRESH_V2 as M } from "../lib/pdt-cqe-008-fresh-v2";
import { POST as createPost } from "../app/api/internal/etsy/post-reset-v2/pdt-cqe-008/fresh-v2-r01/route";
import { POST as assetsPost } from "../app/api/internal/etsy/post-reset-v2/pdt-cqe-008/fresh-v2-assets-r01/route";

const createSource = readFileSync("app/api/internal/etsy/post-reset-v2/pdt-cqe-008/fresh-v2-r01/route.ts", "utf8");
const assetsSource = readFileSync("app/api/internal/etsy/post-reset-v2/pdt-cqe-008/fresh-v2-assets-r01/route.ts", "utf8");
const middlewareSource = readFileSync("middleware.ts", "utf8");

test("Fresh v2 manifest matches canonical Product 08 listing facts", () => {
  assert.equal(M.productId, "PDT-CQE-008");
  assert.equal(M.execution, "FRESH v2.0");
  assert.equal(M.listing.title, "Cleaning Quote & Estimate Calculator Spreadsheet for Cleaning Businesses");
  assert.equal(M.listing.priceUsd, 11.9);
  assert.equal(M.listing.taxonomyId, 12478);
  assert.equal(M.listing.tags.length, 13);
  for (const tag of M.listing.tags) assert.ok(tag.length <= 20, tag);
  for (const sheet of ["01_Start_Here","02_Business_Setup","03_Service_Catalog","04_Quote_Builder","05_Quote_Review","06_Client_Estimate","07_Quote_Log"]) {
    assert.match(M.listing.description, new RegExp(sheet));
  }
  assert.match(M.listing.description, /Google Sheets compatibility is not claimed unless separately tested and approved/);
  assert.doesNotMatch(M.listing.description, /Apple Numbers/i);
  assert.doesNotMatch(M.listing.description, /commercial facility/i);
  assert.equal(M.buyerZip.filename, "PDT-CQE-008 Buyer Package FRESH v2.0 FINAL.zip");
  assert.equal(M.buyerZip.bytes, 49650);
  assert.equal(M.buyerZip.sha256, "b4d71a2f6acae6df41d851837caf5b82db46e7f58052741de12b3115d9a04180");
  assert.equal(M.images.length, 10);
  assert.deepEqual(M.images.map(x => x.rank), [1,2,3,4,5,6,7,8,9,10]);
  assert.ok(M.images.every(x => x.altText.length > 0));
  assert.deepEqual(M.images.map(x => x.sha256), [
    "4c3fa4f9e103411a02083c0e15e819e1e4f58f18d34c273c66f587db348474aa",
    "91c2e44f7b117d0bbef5d7a1c85eb225ae59efd35dd89ab84a32e505b57f62a5",
    "d1fca1bb1aa7c2087d17b0e8e1fec9e0ad5a62ee23ffb2be45071d577c591518",
    "8dedde3ff79a139bea05244928204a096d5b5de7ba786a858336e4d84ecfa4ed",
    "f26ef5a48ff6b98273d812b4cab24f0f98e92122f33629ef1d965955fb36a801",
    "ec8a34745fe052e2bd9261bcc75da1f6dafd424ec1dea333d9edbfb81608cb02",
    "aa9423e54849bf99e777768fdd9576dcdbc185f508f2b2000730a246f063a041",
    "56124b4aea83d2e321c8c4a3658083f1a991af992519cd71095f421d9ec46103",
    "5961de9294591eb4e29b54116fbc226f16a176d28bb52aaa26b59152ca865172",
    "a975ec6c4125aa41fde0283c3618344e4d51b625e7d7b82c8ec8aca11abe222c"
  ]);
  assert.equal(M.video.filename, "PDT-CQE-008_Listing_Video_FRESH_v2.0.mp4");
  assert.equal(M.video.bytes, 512925);
  assert.equal(M.video.sha256, "33f43511ab9aa68c09e87f1e12cf0f85c5d5a883fff73e247e5bcbcf544c7d3e");
  assert.equal(M.publishAuthorized, false);
  assert.equal(M.activateAuthorized, false);
  assert.equal(M.expectedFinalState, "draft");
});

test("exact routes are scoped, commit-bound, and publish locked", () => {
  for (const source of [createSource, assetsSource]) {
    assert.match(source, /PDT_CQE_008_EXACT_WRITE_GATE_DISABLED/);
    assert.match(source, /PUBLISH_GATE_MUST_REMAIN_LOCKED/);
    assert.match(source, /ETSY_DRAFT_WRITE_TOKEN/);
    assert.match(source, /OWNER_AUTHORIZATION_SCOPE_INVALID/);
    assert.match(source, /GIT_VERCEL_COMMIT_MISMATCH/);
    assert.match(source, /listings_r/);
    assert.match(source, /listings_w/);
    assert.doesNotMatch(source, /state\s*:\s*["']active["']/);
  }
  assert.match(createSource, /PRE_CREATE_UNEXPECTED_DRAFT_OR_TOTAL/);
  assert.match(createSource, /POST_CREATE_SELLER_STATE_MISMATCH/);
  assert.match(assetsSource, /IMAGE_SEQUENCE_RECONCILIATION_REQUIRED/);
  assert.match(assetsSource, /alt_text/);
  assert.match(assetsSource, /BUYER_FILES_RECONCILIATION_REQUIRED/);
  assert.match(middlewareSource, /pdt-cqe-008\/fresh-v2-r01/);
  assert.match(middlewareSource, /pdt-cqe-008\/fresh-v2-assets-r01/);
});

test("both write routes fail closed before any network call when exact gate is off", async () => {
  const before = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    gate: process.env.PDT_CQE_008_FRESH_V2_WRITE_ENABLED,
    publish: process.env.PUBLISH_WRITES_ENABLED
  };
  process.env.VERCEL_ENV = "production";
  process.env.PDT_CQE_008_FRESH_V2_WRITE_ENABLED = "false";
  process.env.PUBLISH_WRITES_ENABLED = "false";
  try {
    const createResponse = await createPost(new Request("https://example.test/api", { method:"POST", body:"{}", headers:{"content-type":"application/json"} }) as never);
    const createBody = await createResponse.json();
    assert.equal(createResponse.status, 409);
    assert.equal(createBody.error, "PDT_CQE_008_EXACT_WRITE_GATE_DISABLED");
    assert.equal(createBody.ETSY_WRITE_COUNT, 0);

    const assetsResponse = await assetsPost(new Request("https://example.test/api", { method:"POST", body:"{}", headers:{"content-type":"application/json"} }) as never);
    const assetsBody = await assetsResponse.json();
    assert.equal(assetsResponse.status, 409);
    assert.equal(assetsBody.error, "PDT_CQE_008_EXACT_WRITE_GATE_DISABLED");
    assert.equal(assetsBody.ETSY_WRITE_COUNT, 0);
  } finally {
    if (before.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = before.VERCEL_ENV;
    if (before.gate === undefined) delete process.env.PDT_CQE_008_FRESH_V2_WRITE_ENABLED; else process.env.PDT_CQE_008_FRESH_V2_WRITE_ENABLED = before.gate;
    if (before.publish === undefined) delete process.env.PUBLISH_WRITES_ENABLED; else process.env.PUBLISH_WRITES_ENABLED = before.publish;
  }
});
