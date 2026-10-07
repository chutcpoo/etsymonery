import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("app/api/internal/etsy/post-reset-v2/pdt-04-15-draft-assets-r01/route.ts", "utf8");

test("PDT 04-15 draft asset operation is exact-scope and fail-closed", () => {
  assert.match(source, /PDT-04-15-DRAFT-RECONCILE-ASSETS-R01-20261007/);
  assert.match(source, /AUTHORIZE_ETSY_DRAFT_UPDATE_PRODUCTS_04_15_KEEP_DRAFT_NO_PUBLISH/);
  assert.match(source, /EXACT_OPERATION_AUTHORIZATION_INVALID/);
  assert.match(source, /TARGET_NOT_DRAFT/);
  assert.match(source, /PROTECTED_LISTING_DRIFT_/);
  assert.match(source, /PLAN_BUILD_GATE_BLOCKED/);
  const middleware = readFileSync("middleware.ts", "utf8");
  assert.match(middleware, /POST_RESET_V2_PDT_04_15_DRAFT_ASSETS_R01_ROUTE/);
  assert.match(middleware, /pdt-04-15-draft-assets-r01/);
});

test("operation never requests Etsy active state", () => {
  assert.doesNotMatch(source, /state\s*:\s*["']active["']/);
  assert.doesNotMatch(source, /state=active/);
  assert.match(source, /noPublishEnforced:true/);
});

test("operation uses ZIP-only buyer delivery and exact image sequence", () => {
  assert.match(source, /BUYER_FILES_ALREADY_PRESENT_RECONCILIATION_REQUIRED/);
  assert.match(source, /IMAGE_SEQUENCE_RECONCILIATION_REQUIRED/);
  assert.match(source, /ZIP_READBACK_MISMATCH/);
  assert.match(source, /VIDEO_READBACK_MISSING/);
});
