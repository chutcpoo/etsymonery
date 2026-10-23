import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/etsy-p01-draft-create.yml", "utf8");

test("P01 Draft operator routes GitHub Actions straight to Etsy", () => {
  assert.match(workflow, /node \.github\/scripts\/etsy-p01-draft-direct\.mjs/);
  assert.doesNotMatch(workflow, /node \.github\/scripts\/etsy-p01-draft\.mjs(?:\s|$)/);
  assert.doesNotMatch(workflow, /publisher\.poonthaidigital\.com|vercel\.app|P01_DRAFT_DEPLOYMENT_SHA/);
});

test("P01 protected operator is manual, exact and main-only", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+schedule:/m);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: etsy-p01-draft/);
  assert.match(workflow, /group: etsy-p01-draft-create/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /confirmation/);
  assert.match(workflow, /CREATE_P01_DRAFT_ONLY/);
  assert.match(workflow, /P01_DIRECT_MODE:/);
  assert.match(workflow, /P01_DIRECT_CONFIRMATION:/);
  assert.match(workflow, /P01_DIRECT_SOURCE_FINGERPRINT:/);
  assert.match(workflow, /P01_SOURCE_FINGERPRINT_MISMATCH_STOP/);
  assert.match(workflow, /P01_QC_APPROVED_SOURCE_FINGERPRINT:/);
  assert.match(workflow, /P01_QC_REVIEWED:/);
});

test("P01 private API credentials and refresh token use Environment secrets, not inputs", () => {
  assert.match(workflow, /\$\{\{ secrets\.P01_ETSY_API_KEY \}\}/);
  assert.match(workflow, /\$\{\{ secrets\.P01_ETSY_SHARED_SECRET \}\}/);
  assert.match(workflow, /\$\{\{ secrets\.P01_ETSY_OAUTH_REFRESH_TOKEN \}\}/);
  assert.doesNotMatch(workflow, /^\s+default:.*(refresh_token|access_token|shared_secret)/im);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /persist-credentials: false/);
});

test("P01 Draft runner has no automatic publish or buyer-file uploads", () => {
  const script = readFileSync(".github/scripts/etsy-p01-draft-direct.mjs", "utf8");
  assert.match(script, /P01_DIRECT_MODE/);
  assert.match(script, /if\(config\.mode==='CHECK'\)/);
  assert.match(script, /ETSY_DRAFT_IDENTITY_NOT_VERIFIED_STOP_AND_RECONCILE/);
  assert.doesNotMatch(script, /\/api\/etsy\/release|PUBLISH_EXACT_LISTING/);
});
