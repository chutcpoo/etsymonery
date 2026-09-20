import { createCandidateFingerprint } from "./candidate-fingerprint";
import {
  PDT_FCMP_002_V1_CANDIDATE_FINGERPRINT,
  PDT_FCMP_002_V1_GALLERY,
  PDT_FCMP_002_V1_LISTING_FINGERPRINT,
  PDT_FCMP_002_V1_LISTING_IDENTITY
} from "./pdt-fcmp-002-v1-manifest";

export const PDT_FCMP_002_V1_RECOVERY_OPERATION_ID =
  "PDT-FCMP-002-V1-ETSY-DRAFT-RECOVERY-R01" as const;
export const PDT_FCMP_002_V1_RECOVERY_AUTHORIZATION_ID =
  "PDT-FCMP-002-V1-ETSY-DRAFT-RECOVERY-R01-AUTH-20260920-01" as const;
export const PDT_FCMP_002_V1_RECOVERY_AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-FCMP-002-V1-ETSY-DRAFT-RECOVERY-R01-20260920 EXACT SCOPE ONLY" as const;
export const PDT_FCMP_002_V1_RECOVERY_CANDIDATE_ID =
  "ETSY-LISTING-CANDIDATE-PDT-FCMP-002-V1-RECOVERY-20260920-R01" as const;

export const PDT_FCMP_002_V1_DRAFT_LISTING_ID = 4579068925 as const;
export const PDT_FCMP_002_V1_LIVE_LISTING_ID = 4578945050 as const;

export const PDT_FCMP_002_V1_RECOVERY_FILE = Object.freeze({
  kind: "UPLOAD_FILE_ONLY",
  rank: 1,
  fileName: "PDT-FCMP-002_Recipe_Cost_Menu_Pricing_Calculator_V1.xlsx",
  supersedesDeliveryFileName:
    "PoonthaiDigital_Restaurant_Recipe_Cost_Menu_Pricing_Calculator_PDT-FCMP-002_V1.xlsx",
  sizeBytes: 18603,
  sha256: "4e26be518f70a41607017d4de93d71f6c3158725bfde6e344abf8731b2c6ab03",
  driveId: "1xxdF1OMBYmy36IebpzSz6QFSJMGl_6pZ",
  mimeType:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
} as const);

export const PDT_FCMP_002_V1_EXPECTED_GALLERY_IMAGE_IDS = Object.freeze([
  8551809678,
  8551809826,
  8551809992,
  8599679141,
  8599679297,
  8551810370,
  8599679521,
  8599679715,
  8551810810,
  8551810950
] as const);

const RECOVERY_PAYLOAD = Object.freeze({
  candidateId: PDT_FCMP_002_V1_RECOVERY_CANDIDATE_ID,
  operationId: PDT_FCMP_002_V1_RECOVERY_OPERATION_ID,
  productId: "PDT-FCMP-002",
  productVersion: "V1.0",
  draftListingId: PDT_FCMP_002_V1_DRAFT_LISTING_ID,
  baseCandidateFingerprint: PDT_FCMP_002_V1_CANDIDATE_FINGERPRINT,
  baseListingFingerprint: PDT_FCMP_002_V1_LISTING_FINGERPRINT,
  repair: {
    kind: PDT_FCMP_002_V1_RECOVERY_FILE.kind,
    file: {
      rank: PDT_FCMP_002_V1_RECOVERY_FILE.rank,
      fileName: PDT_FCMP_002_V1_RECOVERY_FILE.fileName,
      sizeBytes: PDT_FCMP_002_V1_RECOVERY_FILE.sizeBytes,
      sha256: PDT_FCMP_002_V1_RECOVERY_FILE.sha256,
      driveId: PDT_FCMP_002_V1_RECOVERY_FILE.driveId,
      mimeType: PDT_FCMP_002_V1_RECOVERY_FILE.mimeType
    },
    expectedGalleryImageIds: [...PDT_FCMP_002_V1_EXPECTED_GALLERY_IMAGE_IDS]
  },
  publishAuthorized: false
});

export const PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT =
  createCandidateFingerprint(RECOVERY_PAYLOAD);

export const PDT_FCMP_002_V1_RECOVERY_FROZEN_CANDIDATE_FINGERPRINT =
  "cffe7d00620d3a57bd1c8f4f460afc2257671e5a39e8e74209a8cc123e1740cc" as const;

export const PDT_FCMP_002_V1_RECOVERY = Object.freeze({
  operationId: PDT_FCMP_002_V1_RECOVERY_OPERATION_ID,
  authorizationId: PDT_FCMP_002_V1_RECOVERY_AUTHORIZATION_ID,
  authorizationText: PDT_FCMP_002_V1_RECOVERY_AUTHORIZATION_TEXT,
  productId: "PDT-FCMP-002",
  productVersion: "V1.0",
  shopId: 23582741,
  draftListingId: PDT_FCMP_002_V1_DRAFT_LISTING_ID,
  liveListingId: PDT_FCMP_002_V1_LIVE_LISTING_ID,
  candidateId: PDT_FCMP_002_V1_RECOVERY_CANDIDATE_ID,
  candidateFingerprint: PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
  baseCandidateFingerprint: PDT_FCMP_002_V1_CANDIDATE_FINGERPRINT,
  listingFingerprint: PDT_FCMP_002_V1_LISTING_FINGERPRINT,
  listing: PDT_FCMP_002_V1_LISTING_IDENTITY,
  expectedGallery: PDT_FCMP_002_V1_GALLERY,
  expectedGalleryImageIds: PDT_FCMP_002_V1_EXPECTED_GALLERY_IMAGE_IDS,
  buyerFile: PDT_FCMP_002_V1_RECOVERY_FILE,
  publishAuthorized: false
});

export function assertPdtFcmp002V1RecoveryManifestFrozen() {
  if (
    PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT !==
    PDT_FCMP_002_V1_RECOVERY_FROZEN_CANDIDATE_FINGERPRINT
  ) {
    throw new Error("PDT_FCMP_V1_RECOVERY_CANDIDATE_FINGERPRINT_DRIFT");
  }
  if (PDT_FCMP_002_V1_RECOVERY_FILE.fileName.length > 70) {
    throw new Error("PDT_FCMP_V1_RECOVERY_FILENAME_TOO_LONG");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(PDT_FCMP_002_V1_RECOVERY_FILE.fileName)) {
    throw new Error("PDT_FCMP_V1_RECOVERY_FILENAME_INVALID");
  }
  if (PDT_FCMP_002_V1_EXPECTED_GALLERY_IMAGE_IDS.length !== 10) {
    throw new Error("PDT_FCMP_V1_RECOVERY_GALLERY_BASELINE_DRIFT");
  }
  return true;
}
