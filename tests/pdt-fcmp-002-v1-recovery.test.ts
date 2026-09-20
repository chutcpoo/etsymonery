import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPdtFcmp002V1RecoveryManifestFrozen,
  PDT_FCMP_002_V1_DRAFT_LISTING_ID,
  PDT_FCMP_002_V1_EXPECTED_GALLERY_IMAGE_IDS,
  PDT_FCMP_002_V1_RECOVERY,
  PDT_FCMP_002_V1_RECOVERY_AUTHORIZATION_TEXT,
  PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
  PDT_FCMP_002_V1_RECOVERY_FILE,
  PDT_FCMP_002_V1_RECOVERY_FROZEN_CANDIDATE_FINGERPRINT
} from "../lib/pdt-fcmp-002-v1-recovery-manifest";
import { pdtFcmp002V1RecoveryPlan } from "../lib/pdt-fcmp-002-v1-recovery";

test("PDT-FCMP-002 recovery manifest is exact and Etsy filename compliant", () => {
  assert.equal(assertPdtFcmp002V1RecoveryManifestFrozen(), true);
  assert.equal(PDT_FCMP_002_V1_DRAFT_LISTING_ID, 4579068925);
  assert.equal(PDT_FCMP_002_V1_EXPECTED_GALLERY_IMAGE_IDS.length, 10);
  assert.equal(PDT_FCMP_002_V1_RECOVERY_FILE.fileName.length, 56);
  assert.match(PDT_FCMP_002_V1_RECOVERY_FILE.fileName, /^[A-Za-z0-9._-]+$/);
  assert.ok(PDT_FCMP_002_V1_RECOVERY_FILE.fileName.length <= 70);
  assert.equal(PDT_FCMP_002_V1_RECOVERY_FILE.sizeBytes, 18603);
  assert.equal(
    PDT_FCMP_002_V1_RECOVERY_FILE.sha256,
    "4e26be518f70a41607017d4de93d71f6c3158725bfde6e344abf8731b2c6ab03"
  );
  assert.equal(
    PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
    PDT_FCMP_002_V1_RECOVERY_FROZEN_CANDIDATE_FINGERPRINT
  );
});

test("PDT-FCMP-002 recovery plan is file-only and publish-disabled", () => {
  const plan = pdtFcmp002V1RecoveryPlan();
  assert.equal(plan.status, "PLAN_ONLY");
  assert.equal(plan.mode, "RECOVERY_UPLOAD_FILE_ONLY");
  assert.equal(plan.draftListingId, 4579068925);
  assert.equal(plan.buyerFileName, PDT_FCMP_002_V1_RECOVERY_FILE.fileName);
  assert.equal(plan.buyerFileNameLength, 56);
  assert.equal(plan.createDraftAuthorized, false);
  assert.equal(plan.publishAuthorized, false);
  assert.equal(plan.featureGateDefault, "OFF");
  assert.equal(plan.ETSY_WRITE_COUNT, 0);
  assert.equal(PDT_FCMP_002_V1_RECOVERY.publishAuthorized, false);
  assert.equal(
    PDT_FCMP_002_V1_RECOVERY_AUTHORIZATION_TEXT,
    "AUTHORIZE PDT-FCMP-002-V1-ETSY-DRAFT-RECOVERY-R01-20260920 EXACT SCOPE ONLY"
  );
});
