/**
 * Exact Etsy release executor; GitHub holds no buyer files or OAuth tokens.
 * The Vercel API performs server-side QC, readback and idempotent mutation.
 */
import { pathToFileURL } from 'node:url';
const URL = 'https://publisher.poonthaidigital.com/api/etsy/release';
const SHA = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const POSITIVE_ID = /^[1-9]\d*$/;

const P01_SHOP_ID = '23582741';
const P01_BUYER_FILES = Object.freeze([
  'Home_Maintenance_Starter_A4.pdf',
  'Home_Maintenance_Starter_US_Letter.pdf'
]);
function canonicalNames(names) {
  if (!Array.isArray(names) || names.some(name => typeof name !== 'string' || !name.trim())) {
    return null;
  }
  return JSON.stringify(names.map(name => name.normalize('NFC').trim()).sort());
}
/** Fail closed on P01-only scope before contacting Vercel/Etsy. */
export function verifyP01ReleaseScope(request) {
  if (request.productId !== 'P01') return true;
  if (String(request.shopId) !== P01_SHOP_ID ||
      request.expectedImageCount !== 7 ||
      canonicalNames(request.expectedBuyerFileNames) !== canonicalNames(P01_BUYER_FILES) ||
      request.authorization?.schemaVersion !== '1.0.0' ||
      request.authorization?.authorization?.channel !== 'etsy') {
    throw new Error('P01_EXACT_SHOP_OR_ASSET_SCOPE_MISMATCH');
  }
  return true;
}


export function validateExactRelease(env) {
  const required = ['RELEASE_PRODUCT_ID', 'RELEASE_LISTING_ID', 'APPROVED_DEPLOYMENT_SHA',
    'ETSY_RELEASE_OPERATOR_TOKEN', 'ETSY_RELEASE_REQUEST_JSON', 'ETSY_RELEASE_ASSET_SET_SHA256'];
  for (const key of required) {
    if (!env[key] || !String(env[key]).trim()) throw new Error('MISSING_REQUIRED_' + key);
  }
  if (env.RELEASE_CONFIRMATION !== 'PUBLISH_EXACT_LISTING') throw new Error('EXPLICIT_RELEASE_CONFIRMATION_REQUIRED');
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(env.RELEASE_PRODUCT_ID)) throw new Error('INVALID_PRODUCT_ID');
  if (!POSITIVE_ID.test(env.RELEASE_LISTING_ID)) throw new Error('INVALID_LISTING_ID');
  if (!GIT_SHA.test(env.APPROVED_DEPLOYMENT_SHA)) throw new Error('INVALID_APPROVED_COMMIT');
  if (!SHA.test(env.ETSY_RELEASE_ASSET_SET_SHA256)) throw new Error('INVALID_APPROVED_ASSET_SET_HASH');
  let request;
  try { request = JSON.parse(env.ETSY_RELEASE_REQUEST_JSON); }
  catch { throw new Error('INVALID_RELEASE_REQUEST_JSON'); }
  const grant = request?.authorization?.authorization;
  if (request?.action !== 'PUBLISH' || request?.productId !== env.RELEASE_PRODUCT_ID ||
    String(request?.draftListingId) !== env.RELEASE_LISTING_ID ||
    !POSITIVE_ID.test(String(request?.shopId)) ||
    !SHA.test(request?.candidateFingerprint ?? '') ||
    !SHA.test(request?.expectedListingFingerprint ?? '') ||
    !Array.isArray(request?.expectedBuyerFileNames) || request.expectedBuyerFileNames.length < 1 ||
    !Number.isSafeInteger(request?.expectedImageCount) || request.expectedImageCount < 1 ||
    typeof request?.operationId !== 'string' || !request.operationId.trim() ||
    grant?.scope !== 'PUBLISH' || grant?.state !== 'ACTIVE' ||
    grant?.candidateId !== request.candidateId ||
    grant?.candidateFingerprint !== request.candidateFingerprint ||
    String(request?.authorization?.shopId) !== String(request.shopId) ||
    String(request?.authorization?.draftListingId) !== String(request.draftListingId)) {
    throw new Error('EXACT_PUBLISH_AUTHORIZATION_OR_IDENTITY_MISMATCH');
  }
  verifyP01ReleaseScope(request);
  return Object.freeze({ ...request });
}

async function getJson(fetchImpl, url, init, label) {
  const response = await fetchImpl(url, init);
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(label + '_INVALID_RESPONSE'); }
  if (!response.ok) throw new Error(label + '_HTTP_' + response.status + ':' +
    String(payload?.error ?? payload?.status ?? 'FAILED').slice(0, 80));
  return payload;
}

export async function releaseExactListing(env = process.env, fetchImpl = fetch) {
  const frozen = validateExactRelease(env);
  const state = await getJson(fetchImpl, URL, { method: 'GET', redirect: 'error' }, 'RELEASE_STATE');
  if (state.deployedEnvironment !== 'production' ||
    state.deployedCommitSha !== env.APPROVED_DEPLOYMENT_SHA) throw new Error('VERCEL_DEPLOYMENT_COMMIT_MISMATCH');
  if (state.publishWritesEnabled !== true) throw new Error('VERCEL_PUBLISH_GATE_DISABLED');
  const headers = {
    'content-type': 'application/json',
    'x-autodigitalpublisher-write-token': env.ETSY_RELEASE_OPERATOR_TOKEN
  };
  const preflight = await getJson(fetchImpl, URL, {
    method: 'POST', headers, body: JSON.stringify({ ...frozen, action: 'PREFLIGHT' }), redirect: 'error'
  }, 'PREFLIGHT');
  if (preflight.status !== 'READY_FOR_SELLER_REVIEW' ||
    preflight.draftListingId !== frozen.draftListingId ||
    preflight.assetSetSha256 !== env.ETSY_RELEASE_ASSET_SET_SHA256 ||
    preflight.imageCount !== frozen.expectedImageCount ||
    canonicalNames(preflight.buyerFileNames) !== canonicalNames(frozen.expectedBuyerFileNames) ||
    preflight.publishAuthorized !== false) throw new Error('PREFLIGHT_IDENTITY_OR_ASSET_SET_MISMATCH');
  const result = await getJson(fetchImpl, URL, {
    method: 'POST', headers, body: JSON.stringify(frozen), redirect: 'error'
  }, 'PUBLISH');
  if (!['PUBLISHED', 'RECONCILED', 'REPLAY'].includes(result.status) ||
    String(result?.receipt?.listingId) !== String(frozen.draftListingId) ||
    !['active', 'published'].includes(String(result?.receipt?.state))) {
    throw new Error('PUBLISH_NOT_VERIFIED_IN_ETSY_READBACK');
  }
  return Object.freeze({
    status: result.status, listingId: String(result.receipt.listingId),
    url: 'https://www.etsy.com/listing/' + result.receipt.listingId,
    operationId: frozen.operationId
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  releaseExactListing().then(result => {
    console.log('Verified Etsy release: ' + result.status + ', Listing ID: ' + result.listingId);
    console.log('Etsy listing: ' + result.url);
  }).catch(error => {
    console.error('Etsy release stopped: ' + (error instanceof Error ? error.message : 'UNKNOWN_ERROR'));
    process.exitCode = 1;
  });
}
