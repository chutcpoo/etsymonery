import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExactRelease, releaseExactListing } from './etsy-release.mjs';

const productId = 'P01';
const draftListingId = 1234567890;
const fp = 'a'.repeat(64), lp = 'b'.repeat(64), assetFp = 'c'.repeat(64);
const commit = 'd'.repeat(40);
const request = {
  action: 'PUBLISH', operationId: 'P01-EXACT-PUBLISH-20261021', productId,
  candidateId: 'P01-V1.2.1', candidateFingerprint: fp, expectedListingFingerprint: lp,
  shopId: 23582741, draftListingId, expectedImageCount: 7,
  expectedBuyerFileNames: ['Home_Maintenance_Starter_A4.pdf', 'Home_Maintenance_Starter_US_Letter.pdf'],
  authorization: {
    shopId: '23582741', draftListingId: String(draftListingId),
    authorization: { scope: 'PUBLISH', state: 'ACTIVE', authorizationId: 'exact-release-approved',
      candidateId: 'P01-V1.2.1', candidateFingerprint: fp }
  }
};
const env = {
  RELEASE_PRODUCT_ID: productId,
  RELEASE_LISTING_ID: String(draftListingId), APPROVED_DEPLOYMENT_SHA: commit,
  RELEASE_CONFIRMATION: 'PUBLISH_EXACT_LISTING', ETSY_RELEASE_OPERATOR_TOKEN: 'fixture-token',
  ETSY_RELEASE_REQUEST_JSON: JSON.stringify(request), ETSY_RELEASE_ASSET_SET_SHA256: assetFp
};
function mock(options = {}) {
  const calls = [];
  const fetchFn = async (_url, init) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ method, action: body?.action });
    if (method === 'GET') return Response.json({ publishWritesEnabled: options.gate ?? true,
      deployedCommitSha: options.commit ?? commit, deployedEnvironment: 'production' });
    if (body?.action === 'PREFLIGHT') return Response.json({ status: 'READY_FOR_SELLER_REVIEW',
      draftListingId, imageCount: 7, publishAuthorized: false,
      assetSetSha256: options.assetSetSha256 ?? assetFp });
    if (body?.action === 'PUBLISH') return Response.json({ status: 'PUBLISHED',
      receipt: { listingId: options.listingId ?? String(draftListingId), state: 'active' } });
    throw Error('Unexpected request');
  };
  return { calls, fetchFn };
}
test('exact listing metadata validates before any network call', () => {
  assert.equal(validateExactRelease(env).productId, 'P01');
  assert.throws(() => validateExactRelease({...env,RELEASE_CONFIRMATION:'no'}), /EXPLICIT_RELEASE_CONFIRMATION_REQUIRED/);
  assert.throws(() => validateExactRelease({...env,RELEASE_LISTING_ID:'987'}), /EXACT_PUBLISH_AUTHORIZATION_OR_IDENTITY_MISMATCH/);
  assert.throws(() => validateExactRelease({...env,ETSY_RELEASE_REQUEST_JSON:'oops'}), /INVALID_RELEASE_REQUEST_JSON/);
  assert.throws(() => validateExactRelease({...env,ETSY_RELEASE_REQUEST_JSON:JSON.stringify({...request,authorization:{}})}), /EXACT_PUBLISH_AUTHORIZATION_OR_IDENTITY_MISMATCH/);
});
test('release performs read-only preflight then exactly one authorized publish', async () => {
  const m=mock(); const r=await releaseExactListing(env,m.fetchFn);
  assert.equal(r.status,'PUBLISHED');assert.equal(r.listingId,String(draftListingId));
  assert.deepEqual(m.calls,[{method:'GET',action:undefined},{method:'POST',action:'PREFLIGHT'},
    {method:'POST',action:'PUBLISH'}]);
});
test('disabled production gate stops before any POST', async () => {
  const m=mock({gate:false});
  await assert.rejects(()=>releaseExactListing(env,m.fetchFn),/VERCEL_PUBLISH_GATE_DISABLED/);
  assert.equal(m.calls.length,1);
});
test('stale Vercel commit stops before any POST', async () => {
  const m=mock({commit:'e'.repeat(40)});
  await assert.rejects(()=>releaseExactListing(env,m.fetchFn),/VERCEL_DEPLOYMENT_COMMIT_MISMATCH/);
  assert.equal(m.calls.length,1);
});
test('unexpected Etsy image/file inventory stops before publish', async () => {
  const m=mock({assetSetSha256:'f'.repeat(64)});
  await assert.rejects(()=>releaseExactListing(env,m.fetchFn),/PREFLIGHT_IDENTITY_OR_ASSET_SET_MISMATCH/);
  assert.deepEqual(m.calls.map(x=>x.action),[undefined,'PREFLIGHT']);
});
test('different Etsy listing ID is never declared published', async () => {
  const m=mock({listingId:'111'});
  await assert.rejects(()=>releaseExactListing(env,m.fetchFn),/PUBLISH_NOT_VERIFIED_IN_ETSY_READBACK/);
});
