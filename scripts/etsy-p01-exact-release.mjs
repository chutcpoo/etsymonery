// P01-only operator, using the existing gated /api/etsy/release adapter.
// No Etsy credentials are stored here; the Vercel server owns Etsy OAuth.
export const P01_SHOP_ID = 23582741;
export const P01_PRODUCT_ID = "P01";
export const P01_BUYER_FILES = Object.freeze([
  "Home_Maintenance_Starter_A4.pdf",
  "Home_Maintenance_Starter_US_Letter.pdf"
]);
export const P01_IMAGE_COUNT = 7;
const SHA256 = /^[a-f0-9]{64}$/;
const POSITIVE = /^[1-9]\d*$/;
const ENDPOINT = "https://publisher.poonthaidigital.com/api/etsy/release";
const STATE_ENDPOINT = "https://publisher.poonthaidigital.com/api/etsy/seller-state";

function required(value, code) {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
}
function positive(value, code) {
  const v = required(value, code);
  if (!POSITIVE.test(v) || !Number.isSafeInteger(Number(v))) throw new Error(code);
  return Number(v);
}
function sha(value, code) {
  const v = required(value, code);
  if (!SHA256.test(v)) throw new Error(code);
  return v;
}
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseConfig(env, mode) {
  if (mode !== "preflight" && mode !== "publish") throw new Error("INVALID_MODE");
  const config = {
    mode,
    listingId: positive(env.P01_DRAFT_LISTING_ID, "P01_DRAFT_LISTING_ID_REQUIRED"),
    candidateId: required(env.P01_CANDIDATE_ID, "P01_CANDIDATE_ID_REQUIRED"),
    candidateFingerprint: sha(env.P01_CANDIDATE_FINGERPRINT, "P01_CANDIDATE_FINGERPRINT_REQUIRED"),
    listingFingerprint: sha(env.P01_LISTING_FINGERPRINT, "P01_LISTING_FINGERPRINT_REQUIRED"),
    operatorToken: required(env.ETSY_DRAFT_WRITE_TOKEN, "ETSY_OPERATOR_TOKEN_REQUIRED")
  };
  if (mode === "publish") {
    if (env.P01_PUBLISH_CONFIRMATION !== "PUBLISH_P01_ONLY" ||
        env.P01_PUBLISH_ENABLE !== "YES_FOR_THIS_LISTING") {
      throw new Error("P01_EXPLICIT_PUBLISH_CONFIRMATION_REQUIRED");
    }
    config.approvedAssetSetSha256 = sha(
      env.P01_APPROVED_ASSET_SET_SHA256, "P01_ASSET_SET_APPROVAL_REQUIRED"
    );
    let grant;
    try { grant = JSON.parse(required(env.P01_RELEASE_AUTHORIZATION_JSON, "P01_AUTHORIZATION_REQUIRED")); }
    catch { throw new Error("INVALID_P01_AUTHORIZATION_JSON"); }
    if (!record(grant) || !record(grant.authorization) ||
        grant.schemaVersion !== "1.0.0" ||
        grant.shopId !== String(P01_SHOP_ID) ||
        grant.draftListingId !== String(config.listingId) ||
        grant.authorization.scope !== "PUBLISH" ||
        grant.authorization.state !== "ACTIVE" ||
        grant.authorization.channel !== "etsy" ||
        grant.authorization.candidateId !== config.candidateId ||
        grant.authorization.candidateFingerprint !== config.candidateFingerprint ||
        typeof grant.authorization.authorizationId !== "string" ||
        !grant.authorization.authorizationId.trim()) {
      throw new Error("P01_AUTHORIZATION_DOES_NOT_MATCH_APPROVED_DRAFT");
    }
    if (!Number.isFinite(Date.parse(grant.authorization.issuedAt)) ||
        Date.parse(grant.authorization.issuedAt) > Date.now() ||
        (grant.authorization.expiresAt &&
         (!Number.isFinite(Date.parse(grant.authorization.expiresAt)) ||
          Date.parse(grant.authorization.expiresAt) <= Date.now()))) {
      throw new Error("P01_AUTHORIZATION_NOT_CURRENT");
    }
    config.authorization = grant;
  }
  return config;
}

export function releaseRequest(config, action) {
  if (action !== "PREFLIGHT" && action !== "PUBLISH") throw new Error("INVALID_ACTION");
  if (action === "PUBLISH" && (!config.authorization || !config.approvedAssetSetSha256)) {
    throw new Error("PUBLISH_APPROVAL_NOT_PRESENT");
  }
  return {
    action,
    operationId: "P01-EXACT-RELEASE-" + config.listingId + "-" +
      config.listingFingerprint.slice(0, 16),
    productId: P01_PRODUCT_ID,
    candidateId: config.candidateId,
    candidateFingerprint: config.candidateFingerprint,
    expectedListingFingerprint: config.listingFingerprint,
    shopId: P01_SHOP_ID,
    draftListingId: config.listingId,
    expectedImageCount: P01_IMAGE_COUNT,
    expectedBuyerFileNames: [...P01_BUYER_FILES],
    ...(action === "PUBLISH" ? {authorization: config.authorization} : {})
  };
}

async function jsonResponse(response, code) {
  let json;
  try { json = await response.json(); } catch { throw new Error(code + "_INVALID_JSON"); }
  if (!response.ok) {
    // Do not print server response bodies or bearer/authorization contents.
    throw new Error(code + "_HTTP_" + response.status);
  }
  if (!record(json)) throw new Error(code + "_INVALID_RESPONSE");
  return json;
}

async function shopSnapshot(fetchImpl) {
  const snapshot = await jsonResponse(
    await fetchImpl(STATE_ENDPOINT, {method:"GET", cache:"no-store"}),
    "ETSY_SHOP_READ"
  );
  if (snapshot.status !== "PASS" || snapshot.mode !== "READ_ONLY" ||
      snapshot.shopId !== P01_SHOP_ID || !Array.isArray(snapshot.listings)) {
    throw new Error("ETSY_SHOP_IDENTITY_NOT_VERIFIED");
  }
  const map = new Map();
  for (const listing of snapshot.listings) {
    if (!record(listing) || !Number.isSafeInteger(listing.listingId) ||
        !["active","draft","inactive","sold_out","expired"].includes(listing.state) ||
        map.has(listing.listingId)) throw new Error("ETSY_SHOP_SNAPSHOT_INVALID");
    map.set(listing.listingId, listing.state);
  }
  return map;
}
function ensureBefore(snapshot, draftId) {
  if (snapshot.get(draftId) !== "draft") throw new Error("P01_TARGET_IS_NOT_DRAFT");
}
function ensureAfter(before, after, draftId) {
  if (after.get(draftId) !== "active") throw new Error("P01_PUBLISH_READBACK_NOT_ACTIVE");
  if (before.size !== after.size) throw new Error("NON_P01_SHOP_LISTING_COUNT_CHANGED");
  for (const [id, state] of before) {
    if (id !== draftId && after.get(id) !== state) {
      throw new Error("NON_P01_SHOP_LISTING_STATE_CHANGED");
    }
  }
}
function assertPreflight(data, config) {
  const actualNames = Array.isArray(data.buyerFileNames) ? [...data.buyerFileNames].sort() : [];
  if (data.status !== "READY_FOR_SELLER_REVIEW" ||
      data.mode !== "READ_ONLY" || data.ETSY_WRITE_COUNT !== 0 ||
      data.draftListingId !== config.listingId ||
      data.imageCount !== P01_IMAGE_COUNT ||
      JSON.stringify(actualNames) !== JSON.stringify([...P01_BUYER_FILES].sort()) ||
      !SHA256.test(data.assetSetSha256 ?? "")) {
    throw new Error("P01_RELEASE_PREFLIGHT_FAILED");
  }
}
async function release(fetchImpl, token, payload) {
  return jsonResponse(
    await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-autodigitalpublisher-write-token": token
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    }),
    "ETSY_EXACT_RELEASE"
  );
}

export async function executeP01Release(config, fetchImpl = fetch) {
  // Read first, before any publishing attempt.
  const before = await shopSnapshot(fetchImpl);
  ensureBefore(before, config.listingId);
  const preflight = await release(fetchImpl, config.operatorToken, releaseRequest(config,"PREFLIGHT"));
  assertPreflight(preflight, config);
  if (config.mode === "preflight") {
    return {status:"READY_FOR_SELLER_REVIEW", draftListingId:config.listingId,
      assetSetSha256:preflight.assetSetSha256, writeCount:0};
  }
  if (preflight.assetSetSha256 !== config.approvedAssetSetSha256) {
    throw new Error("P01_ASSETS_CHANGED_AFTER_APPROVAL");
  }
  const published = await release(
    fetchImpl, config.operatorToken, releaseRequest(config,"PUBLISH")
  );
  if (!["PUBLISHED","RECONCILED","REPLAY"].includes(published.status) ||
      Number(published.receipt?.listingId) !== config.listingId ||
      !["active","published"].includes(published.receipt?.state)) {
    throw new Error("P01_PUBLISH_RESULT_NOT_CONFIRMED");
  }
  // Independent read-back through the existing authenticated seller-state API.
  const after = await shopSnapshot(fetchImpl);
  ensureAfter(before, after, config.listingId);
  return {status:"PUBLISHED_VERIFIED", listingId:config.listingId,
    url:"https://www.etsy.com/listing/" + config.listingId,
    nonTargetStatesUnchanged:true};
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  (async () => {
    try {
      const mode = process.env.P01_RELEASE_MODE ?? "preflight";
      const result = await executeP01Release(parseConfig(process.env, mode));
      // Sanitized log: no access tokens, authorization JSON, or payloads.
      console.log(JSON.stringify(result));
    } catch (error) {
      console.error("P01_RELEASE_BLOCKED:", error instanceof Error ? error.message : "UNKNOWN");
      process.exitCode = 1;
    }
  })();
}
