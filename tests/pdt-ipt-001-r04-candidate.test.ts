import assert from "node:assert/strict";
import test from "node:test";
import { createListingFingerprint } from "../lib/candidate-fingerprint";
import {
  PDT_IPT_001_R04_DRAFT,
  PDT_IPT_001_R04_DRAFT_ASSETS,
  PDT_IPT_001_R04_LISTING_FINGERPRINT
} from "../lib/pdt-ipt-001-r04-draft";

test("DAY03 R04 is the exact title-only repair candidate", () => {
  assert.equal(
    PDT_IPT_001_R04_DRAFT.candidateId,
    "ETSY-LISTING-CANDIDATE-PDT-IPT-001-V1-20260919-R04"
  );
  assert.equal(
    PDT_IPT_001_R04_DRAFT.candidateFingerprint,
    "37c0dab257ad2e90f456ddedefd7a22df5fa922db1df510b2d8581d7079a1562"
  );
  assert.equal(
    PDT_IPT_001_R04_DRAFT.listingFingerprint,
    "0659c764fa3fe6f0372399c0b2dd38ce363bc5ebb91b75bb23311f87a41f2055"
  );
  assert.equal(
    PDT_IPT_001_R04_DRAFT.title,
    "Invoice & Payment Tracker Spreadsheet | Excel Small Business Invoice Tracker with Payments, Aging and Dashboard"
  );
  assert.equal((PDT_IPT_001_R04_DRAFT.title.match(/&/g) ?? []).length, 1);
  assert.equal([...PDT_IPT_001_R04_DRAFT.title].length, 111);
  assert.equal(PDT_IPT_001_R04_DRAFT_ASSETS.length, 12);
  assert.equal(PDT_IPT_001_R04_DRAFT.gallery.length, 10);
  assert.equal(PDT_IPT_001_R04_DRAFT.buyerFile.sha256, "5ba3ec9bd23630f086145633557021e273ba0a7b61ed9db2c97a233a3e94c8c4");
  assert.equal(PDT_IPT_001_R04_DRAFT.video.sha256, "5899c51bf70a201b8267ea64aa24378cbefd9e91aa9467abbf154eb74815830c");
});

test("DAY03 R04 listing fingerprint recomputes exactly from immutable listing identity", () => {
  const actual = createListingFingerprint({
    title: PDT_IPT_001_R04_DRAFT.title,
    description: PDT_IPT_001_R04_DRAFT.description,
    priceUsd: PDT_IPT_001_R04_DRAFT.priceUsd,
    tags: [...PDT_IPT_001_R04_DRAFT.tags],
    quantity: PDT_IPT_001_R04_DRAFT.quantity,
    who_made: PDT_IPT_001_R04_DRAFT.whoMade,
    when_made: PDT_IPT_001_R04_DRAFT.whenMade,
    taxonomy_id: PDT_IPT_001_R04_DRAFT.taxonomyId,
    type: "download",
    state: "draft"
  });
  assert.equal(actual, PDT_IPT_001_R04_LISTING_FINGERPRINT);
  assert.equal(actual, PDT_IPT_001_R04_DRAFT.listingFingerprint);
});

test("DAY03 R04 preserves R03 product artifact identities", () => {
  assert.deepEqual(
    PDT_IPT_001_R04_DRAFT.gallery.map((asset) => asset.sha256),
    [
      "4b6f8ea1f7af1c6e44bf5290ef8ffd01a37f7a632c4f192703ae6dab0bc0a94a",
      "2759a32d7c7074ea4ad46e422482af80139c07947b0165054fd1ecfddf6cbe7b",
      "ec6e6ecfa5fc4f9886a63f93d6ddd792649d2111452fc4837457361617b0ebe6",
      "bd950cfdfa8b353fcf875f5d50b3c57c5adc16498d3dbbdd7dd222efa28e3e96",
      "89cbf7a2e51d500e30be5b1f0e328f1f6adbb636d1477b1b21939160b1941f4d",
      "bc8720fd3da8a756781fd3fb39b56c74127075a7a99cf3b6a6a94bdea4c43465",
      "2042318613643839408bf4d4f45d3bc995e3e9ea3889d81fb31676b6dcf2e60a",
      "f11460175a130706e2028f739c34d1c98f5c7ec11042560fb0d069b3c7f71a95",
      "d7e5a16d0a0ac0e740bcdb6c8f87197da633ec21250f931e9db943453475492b",
      "0c72b9e1b57b3c82c0e1df1ababc96381a46b7df3840ce202fa9b8b7b1750c4a"
    ]
  );
});
