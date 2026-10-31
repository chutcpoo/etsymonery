import assert from "node:assert/strict";
import test from "node:test";
import {GET} from "../app/api/platform/status/route";
import {ETSY_CHANNEL_INDEX} from "../lib/catalog-channel-index";

test("platform status distinguishes historic registry IDs from live Etsy counts", async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json() as Record<string, unknown>;
  assert.equal(result.status, "READY_FOR_NEW_PRODUCTS");
  assert.equal(result.catalogState, "LIVE_STATUS_UNVERIFIED");
  assert.equal(result.liveCatalogVerification, "NOT_TESTED");
  assert.equal(result.liveCatalogCount, null);
  assert.equal(result.registeredLiveListings, null);
  assert.equal(result.registryListingCount, ETSY_CHANNEL_INDEX.length);
  assert.equal(result.registryAuthority, "IDENTIFIER_PROJECTION_ONLY");
  assert.equal(result.liveSellerStateEndpoint, "/api/etsy/seller-state");
  assert.equal(result.ETSY_WRITE_COUNT, 0);
  assert.equal(result.legacyWritesEnabled, false);
});
