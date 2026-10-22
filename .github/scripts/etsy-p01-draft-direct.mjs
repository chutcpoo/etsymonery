/**
 * P01-only, GitHub Actions -> Etsy Open API v3 direct metadata Draft creator.
 * No Vercel endpoints. No Publish, PATCH, DELETE or upload operations.
 * Fail-closed after any ambiguous create outcome; never retry POST.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const API = 'https://api.etsy.com/v3';
const SHOP_ID = 23582741;
const SHOP_NAME = 'PoonthaiDigital';
const TITLE = 'Home Repair & Maintenance Tracker PDF | Repair to Warranty Log Kit | A4 & US Letter Printable';
const FP = /^[0-9a-f]{64}$/;
const STATES = Object.freeze(['draft','active','inactive','sold_out','expired']);
const TAGS = Object.freeze(['home maintenance','home repair log','repair tracker','warranty tracker',
  'homeowner planner','service visit log','repair expense log','contractor tracker','household binder',
  'home upkeep planner','appliance registry','printable house log','first home binder']);
const SOURCE_LOCK = 'docs/releases/P01_CANDIDATE_SOURCE_LOCK_2026-10-22.json';
const DRAFT_EVIDENCE = 'docs/releases/P01_EXACT_DRAFT_EVIDENCE_2026-10-22.json';
const VALID_WHEN_MADE = new Set(['made_to_order','2020_2026','2010_2019','2007_2009','before_2007','2000_2006']);

export function canonical(value) {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error('INVALID_CANONICAL_NUMBER');
    return Object.is(value,-0) ? 0 : value;
  }
  if (typeof value === 'string') return value.normalize('NFC').trim();
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b,'en'))
    .map(([key,val])=>[key,canonical(val)]));
  throw Error('INVALID_CANONICAL_VALUE');
}
export function fingerprint(payload,scope) {
  if (!['CANDIDATE','LISTING'].includes(scope)) throw Error('INVALID_FINGERPRINT_SCOPE');
  return createHash('sha256').update(JSON.stringify({schemaVersion:'candidate-fingerprint.v1',scope,
    payload:canonical(payload)}),'utf8').digest('hex');
}
export function loadEvidence(readJson = (path)=>JSON.parse(readFileSync(path,'utf8'))) {
  const source=readJson(SOURCE_LOCK), evidence=readJson(DRAFT_EVIDENCE);
  if (source.kind!=='P01_PROPOSED_CANDIDATE_SOURCE_LOCK' ||
      source.sourceRecord?.productId!=='P01' || source.sourceRecord?.etsyShopId!==SHOP_ID ||
      source.sourceRecord?.productVersion!=='1.2.1' || source.sourceRecord?.desiredState!=='draft' ||
      source.sourceRecord?.listingTitle!==TITLE || source.verifiedFileCount!==10 ||
      !Array.isArray(source.assetRecords) || source.assetRecords.length!==10 ||
      source.assetRecords.some(x=>!FP.test(x.sha256)||!Number.isSafeInteger(x.bytes)||x.bytes<=0) ||
      fingerprint(source.sourceRecord,'CANDIDATE')!==source.candidateFingerprint ||
      !FP.test(source.candidateFingerprint) || !FP.test(source.sourceRecord.qaReportSha256) ||
      evidence.product?.shop_id!==SHOP_ID || evidence.product?.version!=='1.2.1' ||
      evidence.listing?.title!==TITLE || evidence.listing?.price_usd!==3.9 ||
      JSON.stringify(evidence.listing?.tags)!==JSON.stringify(TAGS) ||
      evidence.source?.asset_set_sha256!==source.assetSetSha256 ||
      evidence.source?.qa_report_sha256!==source.sourceRecord.qaReportSha256 ||
      evidence.source?.files?.length!==10) throw Error('P01_CANONICAL_EVIDENCE_INCONSISTENT');
  const assetRows=[...source.assetRecords].sort((a,b)=>a.name.localeCompare(b.name,'en'));
  const actualAssetSha=createHash('sha256').update(JSON.stringify(assetRows),'utf8').digest('hex');
  if (actualAssetSha!==source.assetSetSha256) throw Error('P01_ASSET_SET_FINGERPRINT_MISMATCH');
  for (const a of assetRows) {
    const b=evidence.source.files.find(x=>x.name===a.name);
    if (!b || b.bytes!==a.bytes || b.sha256!==a.sha256) throw Error('P01_SOURCE_ASSET_MISMATCH');
  }
  return {source,evidence};
}
function moneyUsd(price) {
  if (price && typeof price==='object' && Number.isSafeInteger(price.amount) &&
    Number.isSafeInteger(price.divisor) && price.divisor>0 && price.currency_code==='USD') {
    return price.amount/price.divisor;
  }
  return null;
}
export function validateConfiguration(env, evidence) {
  const mode=env.P01_DIRECT_MODE;
  if (!['CHECK','CREATE_DRAFT'].includes(mode)) throw Error('INVALID_P01_DIRECT_MODE');
  const needed=['ETSY_API_KEY','ETSY_SHARED_SECRET','ETSY_OAUTH_REFRESH_TOKEN'];
  if (needed.some(k=>!env[k]||!env[k].trim())) throw Error('ETSY_DIRECT_SECRETS_REQUIRED');
  if (env.P01_APPROVED_SHOP_CURRENCY!=='USD') throw Error('SHOP_CURRENCY_NOT_APPROVED');
  if (mode==='CHECK') return {mode};
  if (env.P01_DIRECT_CONFIRMATION!=='CREATE_P01_DRAFT_ONLY') throw Error('EXPLICIT_DRAFT_ONLY_CONFIRMATION_REQUIRED');
  if (env.P01_SELLER_APPROVED_PRICE_USD!=='3.90') throw Error('SELLER_PRICE_APPROVAL_REQUIRED');
  if (env.P01_QC_APPROVED_SOURCE_FINGERPRINT!==evidence.source.candidateFingerprint ||
      env.P01_QC_APPROVED_REPORT_SHA256!==evidence.source.sourceRecord.qaReportSha256 ||
      env.P01_QC_REVIEWED!=='P01_V1_2_1_APPROVED') {
    throw Error('INDEPENDENT_QC_REVIEW_GATE_REQUIRED');
  }
  const taxonomy_id=Number(env.P01_APPROVED_TAXONOMY_ID);
  const quantity=Number(env.P01_APPROVED_QUANTITY);
  if (!Number.isSafeInteger(taxonomy_id)||taxonomy_id<1 ||
      !Number.isSafeInteger(quantity)||quantity<1 ||
      !['i_did','someone_else','collective'].includes(env.P01_APPROVED_WHO_MADE) ||
      !VALID_WHEN_MADE.has(env.P01_APPROVED_WHEN_MADE)) throw Error('LISTING_CATEGORY_OR_MAKER_UNAPPROVED');
  const description=env.P01_APPROVED_DESCRIPTION;
  if (typeof description!=='string'||description.trim().length<100||description.length>13000) throw Error('LISTING_DESCRIPTION_NOT_APPROVED');
  const listing={title:TITLE,description:description.trim(),priceUsd:3.9,
    tags:[...TAGS],quantity,taxonomy_id,who_made:env.P01_APPROVED_WHO_MADE,
    when_made:env.P01_APPROVED_WHEN_MADE,type:'download',state:'draft'};
  const actualListingFingerprint=fingerprint(listing,'LISTING');
  if (env.P01_APPROVED_LISTING_FINGERPRINT!==actualListingFingerprint) throw Error('EXACT_LISTING_FINGERPRINT_NOT_APPROVED');
  return {mode,listing,actualListingFingerprint};
}

async function responseJson(fetchImpl,pathname,{method='GET',headers={},body}={}) {
  const init={method,headers,redirect:'error',cache:'no-store'};
  if (body!==undefined) init.body=body;
  let response;
  try {response=await fetchImpl(API+pathname,init);}catch{throw Error('ETSY_NETWORK_UNCERTAIN_STOP_AND_RECONCILE');}
  let result;
  try {result=await response.json();}catch{throw Error('ETSY_RESPONSE_UNKNOWN_STOP_AND_RECONCILE');}
  if (!response.ok) throw Error('ETSY_HTTP_'+response.status+'_STOP_AND_RECONCILE');
  return result;
}
export async function oauthToken(fetchImpl,env) {
  const form=new URLSearchParams({grant_type:'refresh_token',client_id:env.ETSY_API_KEY,
    refresh_token:env.ETSY_OAUTH_REFRESH_TOKEN});
  const result=await responseJson(fetchImpl,'/public/oauth/token',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form});
  if (typeof result.access_token!=='string' || !/^\d+\./.test(result.access_token) ||
      (result.scope && !['listings_r','listings_w'].every(s=>result.scope.split(/\s+/).includes(s))))
    throw Error('ETSY_OAUTH_SCOPE_OR_TOKEN_MISSING');
  // Deliberately do not print, persist, or expose OAuth credentials.
  // The GitHub Environment owner must maintain the refresh token securely.
  return result.access_token;
}
async function scanListings(fetchImpl,headers) {
  const listings=[];
  for(const state of STATES){
    let total=null, seen=0;
    for(let page=0;page<10;page++){
      const out=await responseJson(fetchImpl,`/application/shops/${SHOP_ID}/listings?state=${state}&limit=100&offset=${page*100}`,{headers});
      if(!Array.isArray(out.results) || !Number.isSafeInteger(out.count) || out.count<0 || out.results.length>100)
        throw Error('ETSY_LISTING_SCAN_NOT_AUTHORITATIVE');
      if(total===null) total=out.count;
      if(total!==out.count) throw Error('ETSY_LISTING_COUNT_CHANGED_ABORT');
      if(out.results.some(x=>!Number.isSafeInteger(x.listing_id)||x.listing_id<=0||Number(x.shop_id)!==SHOP_ID||typeof x.title!=='string'))
        throw Error('ETSY_LISTING_SCAN_IDENTITY_ERROR');
      seen+=out.results.length;
      listings.push(...out.results);
      if(seen>=total) break;
      if(out.results.length<100) throw Error('ETSY_LISTING_SCAN_INCOMPLETE');
      if(page===9)throw Error('ETSY_LISTING_SCAN_TRUNCATED');
    }
  }
  return listings;
}
function sameTitle(a,b){return a.normalize('NFC').trim().toLowerCase()===b.normalize('NFC').trim().toLowerCase();}
function assertReadback(detail,listing,id) {
  if (Number(detail.listing_id)!==id || Number(detail.shop_id)!==SHOP_ID || detail.state!=='draft' ||
      !sameTitle(detail.title,listing.title) ||
      (detail.listing_type??detail.type)!=='download' ||
      Number(detail.taxonomy_id)!==listing.taxonomy_id ||
      detail.who_made!==listing.who_made || detail.when_made!==listing.when_made ||
      moneyUsd(detail.price)!==listing.priceUsd ||
      !Array.isArray(detail.tags) ||
      JSON.stringify(detail.tags.map(x=>String(x).toLowerCase()).sort())!==JSON.stringify([...listing.tags].sort()) ||
      typeof detail.description!=='string' || detail.description.trim()!==listing.description.trim())
    throw Error('ETSY_DRAFT_IDENTITY_NOT_VERIFIED_STOP_AND_RECONCILE');
}
function draftPayload(listing) {
  return new URLSearchParams({
    title:listing.title,description:listing.description,price:listing.priceUsd.toFixed(2),
    quantity:String(listing.quantity),taxonomy_id:String(listing.taxonomy_id),
    who_made:listing.who_made,when_made:listing.when_made,type:'download',
    tags:listing.tags.join(',')});
}
export async function runDirectDraft(env=process.env,fetchImpl=fetch,readEvidence) {
  // Load and verify immutable exact v1.2.1 evidence BEFORE any network call.
  const evidence=loadEvidence(readEvidence);
  const config=validateConfiguration(env,evidence);
  const token=await oauthToken(fetchImpl,env);
  const headers={'x-api-key':env.ETSY_API_KEY+':'+env.ETSY_SHARED_SECRET,Authorization:'Bearer '+token};
  const shop=await responseJson(fetchImpl,`/application/shops/${SHOP_ID}`,{headers});
  if(shop.shop_id!==SHOP_ID||shop.shop_name!==SHOP_NAME||shop.currency_code!=='USD')
    throw Error('ETSY_SHOP_ID_NAME_OR_CURRENCY_MISMATCH');
  const all=await scanListings(fetchImpl,headers);
  if(all.some(x=>sameTitle(x.title,TITLE)))throw Error('P01_ALREADY_LISTED__READ_ONLY_RECONCILIATION_REQUIRED');
  if(config.mode==='CHECK') return Object.freeze({status:'P01_READ_ONLY_READY',shopId:SHOP_ID,currency:'USD',
    existingListings:all.length,etsyListingWriteCount:0,sourceFingerprint:evidence.source.candidateFingerprint});
  // Important: this is the only Etsy Listing POST in the code. Never auto-retry it.
  const response=await responseJson(fetchImpl,`/application/shops/${SHOP_ID}/listings`,{
    method:'POST',headers:{...headers,'content-type':'application/x-www-form-urlencoded'},
    body:draftPayload(config.listing)});
  const id=Number(response.listing_id);
  if(!Number.isSafeInteger(id)||id<=0)throw Error('ETSY_DRAFT_RESULT_UNCERTAIN_STOP_AND_RECONCILE');
  const detail=await responseJson(fetchImpl,`/application/listings/${id}`,{headers});
  assertReadback(detail,config.listing,id);
  const after=await scanListings(fetchImpl,headers);
  if(after.filter(x=>x.listing_id===id&&x.state==='draft'&&sameTitle(x.title,TITLE)).length!==1)
    throw Error('ETSY_DRAFT_SCAN_READBACK_UNCERTAIN_STOP_AND_RECONCILE');
  return Object.freeze({status:'ETSY_P01_DRAFT_VERIFIED',listingId:id,shopId:SHOP_ID,
    state:'draft',currency:'USD',priceUsd:3.9,publishPerformed:false,assetsUploaded:false,
    listingFingerprint:config.actualListingFingerprint,sourceFingerprint:evidence.source.candidateFingerprint});
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  runDirectDraft().then(data=>{
    console.log('P01 result: '+data.status+'; shop '+data.shopId+(data.listingId?'; draft ID '+data.listingId:''));
    console.log('No publish and no asset uploads.');
  }).catch(e=>{console.error('P01 direct Etsy operator STOPPED: '+(e instanceof Error?e.message:'UNKNOWN'));process.exitCode=1;});
}