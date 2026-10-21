import assert from "node:assert/strict";
import test from "node:test";
import { createListingFingerprint } from "../lib/candidate-fingerprint";
import {
  createGenericDraftPostHandler, parseGenericDraftRequest
} from "../lib/etsy-generic-draft-create";

const fp = "a".repeat(64);
const listing = {
  title: "Home Maintenance Planner Printable PDF",
  description: "Practical household home maintenance printable kit, digital only.",
  tags: [
    "home maintenance", "household planner", "maintenance log", "home organizer",
    "house binder", "home repair log", "warranty tracker", "repair planner",
    "property planner", "printable planner", "appliance register", "repair expenses",
    "home upkeep"
  ],
  priceUsd: 5.5, quantity: 999, taxonomy_id: 12476,
  who_made: "i_did", when_made: "2020_2026", type: "download", state: "draft"
};
const lf = createListingFingerprint(listing);
function data(action: "PREFLIGHT" | "CREATE_DRAFT" = "PREFLIGHT") {
  return {
    action, operationId: "EXACT-DRAFT-17", shopId: 23582741,
    productId: "PDT-NEW-017", candidateId: "CAND-17",
    candidateFingerprint: fp, expectedListingFingerprint: lf, listing,
    qc: {
      state: "QC_PASSED", productTruthVerified: true,
      testerFingerprint: fp, independentFinalQcFingerprint: fp
    }
  };
}
function req(body: Record<string, unknown>, token?: string) {
  return new Request("https://preview.example/api/etsy/drafts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-autodigitalpublisher-write-token": token } : {})
    },
    body: JSON.stringify(body)
  });
}
const names = [
  "ETSY_DRAFT_WRITE_TOKEN", "ETSY_DRAFT_WRITES_ENABLED",
  "ETSY_GENERIC_DRAFT_WRITES_ENABLED", "ETSY_GENERIC_DRAFT_APPROVED_PRODUCT_ID",
  "ETSY_GENERIC_DRAFT_APPROVED_CANDIDATE_FINGERPRINT",
  "ETSY_GENERIC_DRAFT_APPROVED_LISTING_FINGERPRINT", "ETSY_SHOP_ID"
];

test("validates 13 tags and creates exact listing fingerprint", () => {
  assert.equal(parseGenericDraftRequest(data()).expectedListingFingerprint, lf);
  assert.throws(() => parseGenericDraftRequest({
    ...data(), listing: { ...listing, priceUsd: 99 }
  }), /LISTING_FINGERPRINT_MISMATCH/);
  assert.throws(() => parseGenericDraftRequest({
    ...data(), listing: { ...listing, tags: ["only one"] }
  }), /INVALID_DRAFT_TAGS/);
});

test("read-only PREPARE validates metadata without calling Etsy", async () => {
  const previous = Object.fromEntries(names.map(n => [n,process.env[n]]));
  try {
    process.env.ETSY_DRAFT_WRITE_TOKEN = "fixture-token";
    process.env.ETSY_GENERIC_DRAFT_WRITES_ENABLED = "false";
    let calls = 0;
    const handler = createGenericDraftPostHandler({
      getAccessToken: async () => { calls++; return "123.token"; },
      fetchImpl: async () => { calls++; throw new Error("NO_ETSY_IN_PREFLIGHT"); }
    });
    const response = await handler(req(data(), "fixture-token"));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, "METADATA_VALID");
    assert.equal(body.independentQcEvidenceVerified, false);
    assert.equal(body.ETSY_WRITE_COUNT, 0);
    assert.equal(calls, 0);
  } finally {
    for (const n of names) {
      if (previous[n] === undefined) delete process.env[n];
      else process.env[n] = previous[n];
    }
  }
});

test("locked Preview cannot create Draft or invoke OAuth", async () => {
  const previous = Object.fromEntries(names.map(n=>[n,process.env[n]]));
  try {
    process.env.ETSY_DRAFT_WRITE_TOKEN = "fixture-token";
    process.env.ETSY_DRAFT_WRITES_ENABLED = "false";
    process.env.ETSY_GENERIC_DRAFT_WRITES_ENABLED = "false";
    let called = false;
    const response = await createGenericDraftPostHandler({
      getAccessToken: async () => { called = true; return "123.token"; }
    })(req(data("CREATE_DRAFT"), "fixture-token"));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "ETSY_GENERIC_DRAFT_WRITES_DISABLED");
    assert.equal(called, false);
  } finally {
    for (const n of names) {
      if (previous[n] === undefined) delete process.env[n];
      else process.env[n] = previous[n];
    }
  }
});

test("per-operation metadata route refuses missing QC identity", async () => {
  assert.throws(() => parseGenericDraftRequest({
    ...data(), qc: {
      ...data().qc, independentFinalQcFingerprint: "b".repeat(64)
    }
  }), /QC_CURRENT_FINGERPRINT_NOT_PASSED/);
});
