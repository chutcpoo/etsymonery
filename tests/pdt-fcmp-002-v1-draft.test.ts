import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPdtFcmp002V1ManifestFrozen,
  PDT_FCMP_002_V1_AUTHORIZATION_TEXT,
  PDT_FCMP_002_V1_BUYER_FILES,
  PDT_FCMP_002_V1_CANDIDATE_FINGERPRINT,
  PDT_FCMP_002_V1_DRAFT,
  PDT_FCMP_002_V1_GALLERY,
  PDT_FCMP_002_V1_LISTING_FINGERPRINT,
  PDT_FCMP_002_V1_LISTING_IDENTITY
} from "../lib/pdt-fcmp-002-v1-manifest";
import { pdtFcmp002V1Plan } from "../lib/pdt-fcmp-002-v1-draft";

test("PDT-FCMP-002 V1 exact manifest is frozen", () => {
  assert.equal(assertPdtFcmp002V1ManifestFrozen(), true);
  assert.equal(PDT_FCMP_002_V1_DRAFT.productId, "PDT-FCMP-002");
  assert.equal(PDT_FCMP_002_V1_DRAFT.productVersion, "V1.0");
  assert.equal(PDT_FCMP_002_V1_LISTING_IDENTITY.priceUsd, 9.99);
  assert.equal(PDT_FCMP_002_V1_LISTING_IDENTITY.quantity, 999);
  assert.equal(PDT_FCMP_002_V1_LISTING_IDENTITY.taxonomy_id, 12476);
  assert.equal(PDT_FCMP_002_V1_LISTING_IDENTITY.tags.length, 13);
  assert.equal(PDT_FCMP_002_V1_GALLERY.length, 10);
  assert.equal(PDT_FCMP_002_V1_BUYER_FILES.length, 1);
  assert.match(PDT_FCMP_002_V1_LISTING_FINGERPRINT, /^[a-f0-9]{64}$/);
  assert.match(PDT_FCMP_002_V1_CANDIDATE_FINGERPRINT, /^[a-f0-9]{64}$/);
  assert.equal(
    PDT_FCMP_002_V1_AUTHORIZATION_TEXT,
    "AUTHORIZE PDT-FCMP-002-V1-ETSY-DRAFT-R01-20260920 EXACT SCOPE ONLY"
  );
});

test("PDT-FCMP-002 V1 plan is draft-only and performs zero writes", () => {
  const plan = pdtFcmp002V1Plan();
  assert.equal(plan.status, "PLAN_ONLY");
  assert.equal(plan.productId, "PDT-FCMP-002");
  assert.equal(plan.productVersion, "V1.0");
  assert.equal(plan.priceUsd, 9.99);
  assert.equal(plan.imageCount, 10);
  assert.equal(plan.buyerFileCount, 1);
  assert.equal(plan.publishAuthorized, false);
  assert.equal(plan.featureGateDefault, "OFF");
  assert.equal(plan.ETSY_WRITE_COUNT, 0);
});
