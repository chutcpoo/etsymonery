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
import { handlePdtFcmp002V1Post, pdtFcmp002V1Plan } from "../lib/pdt-fcmp-002-v1-draft";

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


test("Gate14 FCMP marker does not bypass token authentication", async () => {
  const oldEnv = {
    enabled: process.env.ETSY_POST_RESET_V2_WRITES_ENABLED,
    token: process.env.ETSY_POST_RESET_V2_WRITE_TOKEN,
    vercelEnv: process.env.VERCEL_ENV,
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE
  };
  try {
    delete process.env.ETSY_POST_RESET_V2_WRITES_ENABLED;
    delete process.env.ETSY_POST_RESET_V2_WRITE_TOKEN;
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_MESSAGE = "[GATE14_FCMP_EXECUTE] exact one-time draft";
    const response = await handlePdtFcmp002V1Post(
      new Request("https://example.test/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-autodigitalpublisher-write-token": "wrong-token"
        },
        body: JSON.stringify({ action: "not_allowed" })
      })
    );
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 401);
    assert.equal(payload.error, "PDT_FCMP_V1_WRITE_UNAUTHORIZED");
    assert.equal(payload.ETSY_WRITE_COUNT, 0);
  } finally {
    if (oldEnv.enabled === undefined) delete process.env.ETSY_POST_RESET_V2_WRITES_ENABLED;
    else process.env.ETSY_POST_RESET_V2_WRITES_ENABLED = oldEnv.enabled;
    if (oldEnv.token === undefined) delete process.env.ETSY_POST_RESET_V2_WRITE_TOKEN;
    else process.env.ETSY_POST_RESET_V2_WRITE_TOKEN = oldEnv.token;
    if (oldEnv.vercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = oldEnv.vercelEnv;
    if (oldEnv.commitMessage === undefined) delete process.env.VERCEL_GIT_COMMIT_MESSAGE;
    else process.env.VERCEL_GIT_COMMIT_MESSAGE = oldEnv.commitMessage;
  }
});

test("exact single-use authorization token is recognized without performing a write", async () => {
  const oldEnv = {
    enabled: process.env.ETSY_POST_RESET_V2_WRITES_ENABLED,
    token: process.env.ETSY_POST_RESET_V2_WRITE_TOKEN,
    vercelEnv: process.env.VERCEL_ENV,
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE
  };
  try {
    delete process.env.ETSY_POST_RESET_V2_WRITES_ENABLED;
    delete process.env.ETSY_POST_RESET_V2_WRITE_TOKEN;
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_MESSAGE = "[GATE14_FCMP_EXECUTE] exact one-time draft";
    const response = await handlePdtFcmp002V1Post(
      new Request("https://example.test/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-autodigitalpublisher-write-token": PDT_FCMP_002_V1_AUTHORIZATION_TEXT
        },
        body: JSON.stringify({ action: "not_allowed" })
      })
    );
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 400);
    assert.equal(payload.error, "PDT_FCMP_V1_READ_ONLY_ACTION_REQUIRED");
    assert.equal(payload.ETSY_WRITE_COUNT, 0);
  } finally {
    if (oldEnv.enabled === undefined) delete process.env.ETSY_POST_RESET_V2_WRITES_ENABLED;
    else process.env.ETSY_POST_RESET_V2_WRITES_ENABLED = oldEnv.enabled;
    if (oldEnv.token === undefined) delete process.env.ETSY_POST_RESET_V2_WRITE_TOKEN;
    else process.env.ETSY_POST_RESET_V2_WRITE_TOKEN = oldEnv.token;
    if (oldEnv.vercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = oldEnv.vercelEnv;
    if (oldEnv.commitMessage === undefined) delete process.env.VERCEL_GIT_COMMIT_MESSAGE;
    else process.env.VERCEL_GIT_COMMIT_MESSAGE = oldEnv.commitMessage;
  }
});
