import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BYTE_HASH_NOT_AVAILABLE_FROM_PROVIDER,
  NOT_AVAILABLE_FROM_CURRENT_ETSY_API_PATH,
  SHA256_NOT_AVAILABLE_FROM_PROVIDER,
  getEtsyListingDetailEvidence
} from "../lib/etsy-listing-detail";

const routePath = new URL(
  "../app/api/etsy/listings/[listingId]/detail/route.ts",
  import.meta.url
);

test("listing-detail route exposes GET only and contains no Etsy write method", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /export async function GET\(/);
  assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)\(/);
  assert.doesNotMatch(source, /method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
});

test("listing-detail provider client makes GET requests only and preserves provider order", async () => {
  const calls: Array<{ url: string; method: string | undefined }> = [];
  const json = (value: unknown) =>
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" }
    });

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method });
    if (url.endsWith("/images")) {
      return json({
        count: 2,
        results: [
          { listing_image_id: 22, rank: 2, url_fullxfull: "https://img/second" },
          { listing_image_id: 11, rank: 1, url_fullxfull: "https://img/first" }
        ]
      });
    }
    if (url.endsWith("/properties")) {
      return json({
        count: 1,
        results: [{ property_id: 42, value_ids: [7], values: ["Blue"] }]
      });
    }
    if (url.endsWith("/files")) {
      return json({
        count: 1,
        results: [{ listing_file_id: 90, listing_id: 4561819638, rank: 1, filename: "buyer.zip", size_bytes: 123 }]
      });
    }
    if (url.endsWith("/seller-taxonomy/nodes")) {
      return json({
        count: 1,
        results: [{ id: 1, name: "Root", children: [{ id: 99, name: "Templates", children: [] }] }]
      });
    }
    return json({
      listing_id: 4561819638,
      shop_id: 23582741,
      state: "active",
      title: "Restaurant Daily Operations Checklist",
      description: "Provider description",
      price: { amount: 990, divisor: 100, currency_code: "USD" },
      taxonomy_id: 99,
      who_made: "i_did",
      when_made: "2020_2026",
      listing_type: "download",
      quantity: 999,
      tags: ["restaurant checklist"]
    });
  };

  const evidence = await getEtsyListingDetailEvidence({
    listingId: 4561819638,
    shopId: 23582741,
    headers: { authorization: "Bearer test-only" },
    fetchImpl
  });

  assert.equal(evidence.status, "PASS");
  assert.equal(evidence.ETSY_WRITE_COUNT, 0);
  assert.ok(evidence.gallery);
  assert.ok(evidence.digitalBuyerFiles);
  assert.ok(evidence.offerDiscount);
  assert.ok(calls.length >= 5);
  assert.ok(calls.every((call) => call.method === "GET"));
  assert.deepEqual(
    evidence.gallery.images.map((image) => image.listing_image_id),
    [22, 11],
    "provider order must not be inferred or re-sorted from rank"
  );
  assert.deepEqual(
    evidence.gallery.images.map((image) => image.provider_position),
    [1, 2]
  );
  assert.equal(evidence.gallery.byteHashEvidence, BYTE_HASH_NOT_AVAILABLE_FROM_PROVIDER);
  assert.equal(evidence.digitalBuyerFiles.sha256Evidence, SHA256_NOT_AVAILABLE_FROM_PROVIDER);
  assert.equal(evidence.offerDiscount.status, NOT_AVAILABLE_FROM_CURRENT_ETSY_API_PATH);
});
