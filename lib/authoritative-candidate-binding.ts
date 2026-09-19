import { createListingFingerprint } from "./candidate-fingerprint";
import type { AuthoritativeArtifactIdentity, AuthoritativeCandidateBinding } from "./types";

const SHA256 = /^[a-f0-9]{64}$/;

function clean(value: unknown) {
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}

function validArtifact(value: AuthoritativeArtifactIdentity | undefined) {
  if (!value) return false;
  return Boolean(clean(value.driveId) && SHA256.test(clean(value.sha256).toLowerCase()));
}

function duplicate(values: string[]) {
  return new Set(values).size !== values.length;
}

export function validateAuthoritativeCandidateBinding(
  binding: AuthoritativeCandidateBinding,
  input: {
    productId: string;
    listingIdentity: Record<string, unknown>;
    buyerFileNames: string[];
  }
) {
  const errors: string[] = [];
  const productId = clean(input.productId);
  const candidateFingerprint = clean(binding.candidateFingerprint).toLowerCase();
  const listingFingerprint = clean(binding.listingFingerprint).toLowerCase();

  if (binding.schemaVersion !== "1.0.0") errors.push("AUTHORITATIVE_CANDIDATE_SCHEMA_INVALID");
  if (!clean(binding.candidateId)) errors.push("AUTHORITATIVE_CANDIDATE_ID_REQUIRED");
  if (clean(binding.productId) !== productId) errors.push("AUTHORITATIVE_CANDIDATE_PRODUCT_MISMATCH");
  if (!SHA256.test(candidateFingerprint)) errors.push("AUTHORITATIVE_CANDIDATE_FINGERPRINT_INVALID");
  if (!SHA256.test(listingFingerprint)) errors.push("AUTHORITATIVE_LISTING_FINGERPRINT_INVALID");

  if (clean(binding.testerPassFingerprint).toLowerCase() !== candidateFingerprint) {
    errors.push("AUTHORITATIVE_TESTER_FINGERPRINT_MISMATCH");
  }
  if (clean(binding.finalQcPassFingerprint).toLowerCase() !== candidateFingerprint) {
    errors.push("AUTHORITATIVE_FINAL_QC_FINGERPRINT_MISMATCH");
  }

  const actualListingFingerprint = createListingFingerprint(input.listingIdentity);
  if (listingFingerprint !== actualListingFingerprint) {
    errors.push("AUTHORITATIVE_LISTING_FINGERPRINT_MISMATCH");
  }

  if (!validArtifact(binding.buyerWorkbook)) {
    errors.push("AUTHORITATIVE_BUYER_WORKBOOK_IDENTITY_INVALID");
  } else if (
    clean(binding.buyerWorkbook.fileName) &&
    !input.buyerFileNames.map(clean).includes(clean(binding.buyerWorkbook.fileName))
  ) {
    errors.push("AUTHORITATIVE_BUYER_FILENAME_MISMATCH");
  }

  if (!Array.isArray(binding.gallery) || binding.gallery.length === 0) {
    errors.push("AUTHORITATIVE_GALLERY_REQUIRED");
  } else {
    if (binding.gallery.some((item) => !validArtifact(item))) {
      errors.push("AUTHORITATIVE_GALLERY_IDENTITY_INVALID");
    }
    const driveIds = binding.gallery.map((item) => clean(item.driveId));
    const hashes = binding.gallery.map((item) => clean(item.sha256).toLowerCase());
    if (duplicate(driveIds) || duplicate(hashes)) errors.push("AUTHORITATIVE_GALLERY_DUPLICATE_IDENTITY");
  }

  if (!validArtifact(binding.video)) errors.push("AUTHORITATIVE_VIDEO_IDENTITY_INVALID");
  if (!binding.listingSettings || Object.keys(binding.listingSettings).length === 0) {
    errors.push("AUTHORITATIVE_LISTING_SETTINGS_REQUIRED");
  }

  return {
    pass: errors.length === 0,
    errors,
    candidateId: clean(binding.candidateId),
    candidateFingerprint,
    listingFingerprint,
    authoritativeCandidate: structuredClone(binding)
  };
}
