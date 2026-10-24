import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fingerprint } from './etsy-p01-draft-direct.mjs';

const data=(path)=>JSON.parse(readFileSync(path,'utf8'));
const taxonomy=data('docs/releases/P01_ETSY_TAXONOMY_LIVE_2026-10-23.json');
const metadata=data('docs/releases/P01_LISTING_METADATA_CANDIDATE_2026-10-23.json');
const qc=data('docs/releases/P01_TECHNICAL_REVERIFICATION_2026-10-23.json');
const source=data('docs/releases/P01_CANDIDATE_SOURCE_LOCK_2026-10-22.json');
const gates=data('docs/releases/P01_AUTOMATION_SECURITY_QC_GATES_2026-10-23.json');

test('real Etsy Seller Taxonomy and Properties GET evidence pins the proposed leaf node',()=>{
  assert.equal(taxonomy.shopId,23582741);
  assert.equal(taxonomy.auth?.xApiKeyUsed,true);
  assert.equal(taxonomy.auth?.liveTaxonomyGetStatus,200);
  assert.equal(taxonomy.auth?.livePropertiesGetStatus,200);
  assert.equal(taxonomy.auth?.listingMutationPerformed,false);
  const id=taxonomy.sellerTaxonomy?.recommendation?.taxonomy_id;
  const match=taxonomy.sellerTaxonomy.candidates.find(x=>x.taxonomy_id===id);
  assert.ok(match,'recommended taxonomy ID must originate from verified provider nodes');
  assert.equal(match.leaf,true);
  assert.equal(match.propertiesGetHttp,200);
  assert.equal(metadata.listing.taxonomy_id,id);
});

test('P01 proposed LISTING fingerprint recomputes exactly using canonical creator',()=>{
  assert.equal(metadata.productId,'P01');
  assert.equal(metadata.productVersion,'1.2.1');
  assert.equal(metadata.sourceFingerprint,source.candidateFingerprint);
  assert.equal(qc.sourceFingerprint,source.candidateFingerprint);
  assert.equal(gates.source.candidateFingerprint,source.candidateFingerprint);
  assert.equal(fingerprint(metadata.listing,'LISTING'),metadata.proposedListingFingerprint);
  assert.equal(metadata.listing.type,'download');
  assert.equal(metadata.listing.state,'draft');
  assert.equal(metadata.listing.tags.length,13);
  assert.equal(new Set(metadata.listing.tags).size,13);
  assert.ok(metadata.listing.tags.every(x=>x.length<=20));
});

test('Product technical QC is pinned while independent human QC and release remain CLOSED',()=>{
  assert.equal(qc.technicalGate,'PASS');
  assert.equal(qc.assetCount,10);
  assert.equal(qc.allTenAssetsMatch,true);
  assert.equal(qc.zipCrcPass,true);
  assert.equal(qc.zipSha256,source.sourceRecord.sellerReviewZipSha256);
  assert.equal(qc.assetSetSha256,source.assetSetSha256);
  assert.equal(gates.independentFinalQC.status,'AWAITING_INDEPENDENT_HUMAN_SIGNATURE');
  assert.equal(gates.releaseDecision,'HOLD');
  assert.equal(metadata.expectedListingFingerprint,null);
  assert.equal(gates.listing.expectedListingFingerprint,null);
  assert.equal(gates.mergeAuthorized,false);
  assert.equal(gates.draftAuthorized,false);
  assert.equal(gates.publishAuthorized,false);
});
