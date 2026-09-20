import { createHash } from "node:crypto";

export const POST_RESET_EPOCH = "2026-09-20" as const;

export const POST_RESET_PLATFORM_STATE = {
  status: "READY_FOR_NEW_PRODUCTS",
  catalogState: "EMPTY_CATALOG",
  liveCatalogCount: 0,
  legacyProductsLoaded: 0,
  legacyWritesEnabled: false,
  writeState: "LOCKED",
  resetDate: POST_RESET_EPOCH,
  requiresFreshProtectedState: true,
  requiresFreshExactAuthorization: true,
  ETSY_WRITE_COUNT: 0
} as const;

export type NewProductManifest = {
  productId: string;
  version: string;
  productName: string;
  canonicalDriveFileId: string;
  buyerFiles: string[];
  galleryFiles: string[];
  title: string;
  description: string;
  tags: string[];
  priceUsd: number;
  productTruthVerified: boolean;
  testerPass: boolean;
  finalQcPass: boolean;
};

export type PreparedProductCandidate = {
  status: "PREPARED";
  catalogEpoch: typeof POST_RESET_EPOCH;
  productId: string;
  version: string;
  candidateId: string;
  candidateFingerprint: string;
  releaseState: "FRESH_PROTECTED_STATE_REQUIRED";
  listingId: null;
  publishAuthorized: false;
  EtsyWriteCount: 0;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown) {
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(str).filter(Boolean) : [];
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b, "en"))
        .map(([key, child]) => [key, stable(child)])
    );
  }
  return value;
}

export function validateNewProductManifest(value: unknown):
  | { ok: true; manifest: NewProductManifest }
  | { ok: false; errors: string[] } {
  if (!isRecord(value)) return { ok: false, errors: ["INVALID_BODY"] };

  const errors: string[] = [];
  const productId = str(value.productId);
  const version = str(value.version);
  const productName = str(value.productName);
  const canonicalDriveFileId = str(value.canonicalDriveFileId);
  const buyerFiles = stringArray(value.buyerFiles);
  const galleryFiles = stringArray(value.galleryFiles);
  const title = str(value.title);
  const description = str(value.description);
  const tags = stringArray(value.tags);
  const priceUsd = typeof value.priceUsd === "number" ? value.priceUsd : Number.NaN;

  if (!productId || !/^[A-Z0-9][A-Z0-9._-]*$/.test(productId)) errors.push("INVALID_PRODUCT_ID");
  if (!version) errors.push("MISSING_VERSION");
  if (!productName) errors.push("MISSING_PRODUCT_NAME");
  if (!canonicalDriveFileId) errors.push("MISSING_CANONICAL_DRIVE_FILE_ID");
  if (!buyerFiles.length) errors.push("BUYER_FILES_REQUIRED");
  if (!galleryFiles.length) errors.push("GALLERY_FILES_REQUIRED");
  if (!title) errors.push("MISSING_TITLE");
  if (!description) errors.push("MISSING_DESCRIPTION");
  if (tags.length !== 13) errors.push("ETSY_TAG_COUNT_MUST_BE_13");
  if (new Set(tags.map((tag) => tag.toLowerCase())).size !== tags.length) errors.push("ETSY_TAGS_MUST_BE_UNIQUE");
  if (tags.some((tag) => tag.length > 20)) errors.push("ETSY_TAG_TOO_LONG");
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) errors.push("INVALID_PRICE");
  if (value.productTruthVerified !== true) errors.push("PRODUCT_TRUTH_NOT_VERIFIED");
  if (value.testerPass !== true) errors.push("TESTER_NOT_PASSED");
  if (value.finalQcPass !== true) errors.push("FINAL_QC_NOT_PASSED");
  if ("listingId" in value && value.listingId != null) errors.push("PREEXISTING_LISTING_ID_NOT_ALLOWED");
  if ("authorizationId" in value && str(value.authorizationId)) errors.push("STALE_AUTHORIZATION_NOT_ALLOWED");

  if (errors.length) return { ok: false, errors: [...new Set(errors)].sort() };

  return {
    ok: true,
    manifest: {
      productId,
      version,
      productName,
      canonicalDriveFileId,
      buyerFiles,
      galleryFiles,
      title,
      description,
      tags,
      priceUsd,
      productTruthVerified: true,
      testerPass: true,
      finalQcPass: true
    }
  };
}

export function prepareNewProductCandidate(manifest: NewProductManifest): PreparedProductCandidate {
  const canonical = JSON.stringify(stable({ epoch: POST_RESET_EPOCH, manifest }));
  const candidateFingerprint = createHash("sha256").update(canonical).digest("hex");
  return {
    status: "PREPARED",
    catalogEpoch: POST_RESET_EPOCH,
    productId: manifest.productId,
    version: manifest.version,
    candidateId: `POSTRESET-${manifest.productId}-${manifest.version}-${candidateFingerprint.slice(0, 12)}`,
    candidateFingerprint,
    releaseState: "FRESH_PROTECTED_STATE_REQUIRED",
    listingId: null,
    publishAuthorized: false,
    EtsyWriteCount: 0
  };
}
