/**
 * Manually approved, P01-only Etsy Draft metadata runner.
 * GitHub does not hold buyer assets or OAuth tokens. Vercel enforces seller OAuth,
 * exact server-side QC pins, approved creation plan, and an idempotent operation ledger.
 * There is no Publish or asset-upload operation in this runner.
 */
import { pathToFileURL } from 'node:url';

const BASE = 'https://publisher.poonthaidigital.com';
const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const SHOP_ID = 23582741;
const TITLE = 'Home Repair & Maintenance Tracker PDF | Repair to Warranty Log Kit | A4 & US Letter Printable';

export function validateP01DraftEnv(env) {
  if (env.P01_DRAFT_CONFIRMATION !== 'CREATE_P01_DRAFT_ONLY') {
    throw new Error('P01_DRAFT_EXPLICIT_CONFIRMATION_REQUIRED');
  }
  if (!COMMIT.test(env.P01_DRAFT_DEPLOYMENT_SHA ?? '')) {
    throw new Error('P01_DRAFT_APPROVED_DEPLOYMENT_SHA_REQUIRED');
  }
  if (env.P01_DRAFT_PRICE_APPROVED_USD !== '3.90' ||
      env.P01_DRAFT_SHOP_CURRENCY_VERIFIED !== 'USD') {
    throw new Error('P01_PRICE_OR_SHOP_CURRENCY_NOT_APPROVED');
  }
  if (!env.P01_DRAFT_OPERATOR_TOKEN || !env.P01_DRAFT_REQUEST_JSON) {
    throw new Error('P01_DRAFT_PROTECTED_ENVIRONMENT_SECRETS_REQUIRED');
  }
  let request;
  try { request = JSON.parse(env.P01_DRAFT_REQUEST_JSON); }
  catch { throw new Error('P01_DRAFT_REQUEST_INVALID_JSON'); }
  const listing = request?.listing;
  const qc = request?.qc;
  if (request?.action !== 'CREATE_DRAFT' || request?.productId !== 'P01' ||
    request?.shopId !== SHOP_ID ||
    !/^P01-DRAFT-[A-Za-z0-9-]{5,80}$/.test(request?.operationId ?? '') ||
    typeof request?.candidateId !== 'string' || !request.candidateId.trim() ||
    !SHA.test(request?.candidateFingerprint ?? '') ||
    !SHA.test(request?.expectedListingFingerprint ?? '') ||
    !listing || listing.title !== TITLE || listing.priceUsd !== 3.9 ||
    listing.state !== 'draft' || listing.type !== 'download' ||
    typeof listing.description !== 'string' || !listing.description.trim() ||
    !Array.isArray(listing.tags) || listing.tags.length !== 13 ||
    listing.tags.some(t => typeof t !== 'string' || !t.trim() || t.length > 20) ||
    new Set(listing.tags.map(t => t.normalize('NFC').trim().toLowerCase())).size !== 13 ||
    !Number.isSafeInteger(listing.taxonomy_id) || listing.taxonomy_id <= 0 ||
    !Number.isSafeInteger(listing.quantity) || listing.quantity < 1 ||
    !['i_did','someone_else','collective'].includes(listing.who_made) ||
    typeof listing.when_made !== 'string' || !listing.when_made ||
    qc?.state !== 'QC_PASSED' || qc.productTruthVerified !== true ||
    qc.testerFingerprint !== request.candidateFingerprint ||
    qc.independentFinalQcFingerprint !== request.candidateFingerprint) {
    throw new Error('P01_EXACT_DRAFT_REQUEST_MISMATCH');
  }
  return Object.freeze(request);
}

async function readJson(fetchImpl, path, init, operation) {
  let response;
  try { response = await fetchImpl(BASE + path, { redirect:'error', cache:'no-store', ...init }); }
  catch { throw new Error(operation + '_TRANSPORT_ERROR_STOP_AND_RECONCILE'); }
  let data;
  try { data = await response.json(); }
  catch { throw new Error(operation + '_INVALID_RESPONSE_STOP_AND_RECONCILE'); }
  if (!response.ok) {
    // Do not echo arbitrary returned payloads that could contain sensitive data.
    throw new Error(operation + '_HTTP_' + response.status + '_STOP_AND_RECONCILE');
  }
  return data;
}

function checkSeller(snapshot, request, allowedListingId = null) {
  if (snapshot?.status !== 'PASS' || snapshot.shopId !== SHOP_ID ||
      !Array.isArray(snapshot.listings)) throw new Error('ETSY_SHOP_READBACK_NOT_VERIFIED');
  for (const item of snapshot.listings) {
    if (item.title === request.listing.title &&
        (allowedListingId === null || item.listingId !== allowedListingId)) {
      throw new Error('P01_DUPLICATE_TITLE_EXISTS_STOP');
    }
  }
}

export async function createP01Draft(env = process.env, fetchImpl = fetch) {
  const input = validateP01DraftEnv(env);
  const deployment = await readJson(fetchImpl, '/api/etsy/release', {method:'GET'}, 'DEPLOYMENT');
  if (deployment.deployedEnvironment !== 'production' ||
      deployment.deployedCommitSha !== env.P01_DRAFT_DEPLOYMENT_SHA ||
      deployment.publishWritesEnabled !== false) throw new Error('DEPLOYMENT_NOT_APPROVED_OR_PUBLISH_UNLOCKED');
  const status = await readJson(fetchImpl, '/api/etsy/status', {method:'GET'}, 'ETSY_STATUS');
  if (status.oauthConnected !== true || status.sellerWriteGrantReady !== true ||
      status.writeGates?.draftWritesEnabled !== true ||
      status.writeGates?.publishWritesEnabled !== false) throw new Error('ETSY_DRAFT_GATE_NOT_READY');
  const draftConfig = await readJson(fetchImpl, '/api/etsy/drafts', {method:'GET'}, 'DRAFT_CONFIG');
  if (draftConfig.genericDraftWritesEnabled !== true) throw new Error('ETSY_P01_GENERIC_DRAFT_GATE_DISABLED');
  const before = await readJson(fetchImpl, '/api/etsy/seller-state', {method:'GET'}, 'SELLER_STATE_BEFORE');
  checkSeller(before, input);
  const headers = {
    'content-type':'application/json',
    'x-autodigitalpublisher-write-token':env.P01_DRAFT_OPERATOR_TOKEN
  };
  const preflight = await readJson(fetchImpl, '/api/etsy/drafts', {
    method:'POST', headers, body:JSON.stringify({...input, action:'PREFLIGHT'})
  }, 'METADATA_PREFLIGHT');
  if (preflight.status !== 'METADATA_VALID' ||
      preflight.expectedListingFingerprint !== input.expectedListingFingerprint ||
      preflight.productId !== 'P01' || preflight.publishAuthorized !== false) {
    throw new Error('METADATA_PREFLIGHT_MISMATCH');
  }
  // PREFLIGHT is syntax-only. Only Vercel's CREATE_DRAFT handler enforces
  // independently verified QC pins, exact product allowance, plan and ledger.
  const applied = await readJson(fetchImpl, '/api/etsy/drafts', {
    method:'POST', headers, body:JSON.stringify(input)
  }, 'CREATE_DRAFT');
  if (!['APPLIED','REPLAY'].includes(applied.status) ||
      applied.productId !== 'P01' || applied.publishAuthorized !== false ||
      !Number.isSafeInteger(Number(applied.receipt?.providerResourceId)) ||
      Number(applied.receipt.providerResourceId) <= 0) {
    throw new Error('DRAFT_CREATE_RESULT_UNCERTAIN_STOP_AND_RECONCILE');
  }
  const listingId = Number(applied.receipt.providerResourceId);
  const after = await readJson(fetchImpl, '/api/etsy/seller-state', {method:'GET'}, 'SELLER_STATE_AFTER');
  checkSeller(after, input, listingId);
  const match = after.listings.filter(x => x.listingId === listingId &&
      x.shopId === SHOP_ID && x.state === 'draft' && x.title === TITLE);
  if (match.length !== 1) throw new Error('P01_ETSY_DRAFT_READBACK_NOT_VERIFIED_STOP');
  return Object.freeze({status:'DRAFT_READBACK_VERIFIED',listingId, state:'draft', productId:'P01',
    operationId:input.operationId, publishPerformed:false, assetsUploaded:false});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createP01Draft().then(result => {
    console.log('P01 Etsy DRAFT verified; Listing ID: ' + result.listingId);
    console.log('Assets still require separately authorized upload and readback. No publish.');
  }).catch(error => {
    console.error('P01 Draft runner stopped: ' + (error instanceof Error ? error.message : 'UNKNOWN'));
    process.exitCode = 1;
  });
}