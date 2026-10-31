import assert from "node:assert/strict";
import test from "node:test";
import { createListingFingerprint } from "../lib/candidate-fingerprint";
import { readBackEtsyDraftAssets } from "../lib/etsy-full-draft-readback";
import type { FullDraftRequest } from "../lib/etsy-full-draft-contract";

const listing = {
  title: "Approved Listing", description: "Example", priceUsd: 2,
  quantity: 1, tags: Array.from({length: 13}, (_, i) => "tag " + (i + 1)),
  taxonomy_id: 123, who_made: "i_did", when_made: "2020_2026",
  type: "download", state: "draft"
};
const data = {
  draftListingId: 111, shopId: 23582741,
  expectedListingFingerprint: createListingFingerprint(listing)
} as FullDraftRequest;
const core = {
  listing_id: 111, shop_id: 23582741, state: "draft", title: listing.title,
  description: listing.description, price: {amount: 200, divisor: 100},
  quantity: listing.quantity, tags: listing.tags, taxonomy_id: listing.taxonomy_id,
  listing_type: listing.type, who_made: listing.who_made, when_made: listing.when_made
};
function fixture(options: {core?: Record<string, unknown>; images?: unknown; files?: unknown} = {}) {
  const calls: string[] = [];
  const fetchImpl = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    assert.equal(init?.method, "GET");
    const url = String(input);
    calls.push(url);
    const body = url.endsWith("/images") ? options.images ?? {results: [{rank: 1, listing_image_id: 44}]} :
      url.endsWith("/files") ? options.files ?? {results: [{rank: 1, listing_file_id: 33, filename: "buyer.zip", size_bytes: 333}]} :
      options.core ?? core;
    return Response.json(body);
  };
  return {calls, deps: {
    fetchImpl: fetchImpl as typeof fetch,
    getToken: async (_scopes: readonly string[]) => "MOCK_ACCESS_TOKEN",
    getHeaders: (_token: string) => ({"x-api-key": "MOCK_NOT_LIVE"})
  }};
}
test("GET-only readback uses three endpoints and actual canonical listing fingerprint", async () => {
  const previous = process.env.ETSY_SHOP_ID;
  process.env.ETSY_SHOP_ID = "23582741";
  try {
    const x = fixture();
    const result = await readBackEtsyDraftAssets(data, x.deps);
    assert.equal(result.listingIdentity, "MATCH");
    assert.equal(result.images[0].resourceId, "44");
    assert.equal(result.buyerFiles[0].sizeBytes, 333);
    assert.equal(x.calls.length, 3);
  } finally {
    if (previous === undefined) delete process.env.ETSY_SHOP_ID;
    else process.env.ETSY_SHOP_ID = previous;
  }
});
test("modified listing title fails canonical identity matching", async () => {
  const previous = process.env.ETSY_SHOP_ID;
  process.env.ETSY_SHOP_ID = "23582741";
  try {
    const x = fixture({core: {...core, title: "Modified title"}});
    const result = await readBackEtsyDraftAssets(data, x.deps);
    assert.equal(result.listingIdentity, "IDENTITY_MISMATCH");
  } finally {
    if (previous === undefined) delete process.env.ETSY_SHOP_ID;
    else process.env.ETSY_SHOP_ID = previous;
  }
});
test("incorrect shop pin is rejected before remote GET", async () => {
  const previous = process.env.ETSY_SHOP_ID;
  process.env.ETSY_SHOP_ID = "999";
  try {
    const x = fixture();
    await assert.rejects(readBackEtsyDraftAssets(data, x.deps), /ETSY_SHOP_ID_MISMATCH/);
    assert.deepEqual(x.calls, []);
  } finally {
    if (previous === undefined) delete process.env.ETSY_SHOP_ID;
    else process.env.ETSY_SHOP_ID = previous;
  }
});
