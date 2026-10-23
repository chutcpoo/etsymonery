/**
 * ChatGPT designs and generates the buyer artifacts; this module validates
 * only a declared package/metadata contract for the downstream publisher.
 *
 * Input fields, including seller-origin statements, are untrusted assertions.
 * Success NEVER means actual bytes, visual quality, IP rights, Etsy approval,
 * or a live Etsy Draft have been independently verified.
 *
 * Etsy Help Center, checked 2026-10-21:
 * https://help.etsy.com/hc/en-us/articles/115015628347
 */
export const DIGITAL_HANDOFF_QC_VERSION = "1.0.0" as const;
export const ETSY_BUYER_FILE_COUNT_LIMIT = 5 as const;
// Conservative decimal-byte limit for Etsy's documented "20MB" per file.
export const ETSY_BUYER_FILE_MAX_BYTES = 20_000_000 as const;
export const ETSY_BUYER_FILENAME_MAX_LENGTH = 70 as const;
const FILE_TYPES = new Set([
  "bmp", "doc", "gif", "jpeg", "jpg", "mobi", "mov", "mp3",
  "mpeg", "pdf", "png", "psp", "rtf", "stl", "txt", "zip",
  "epub", "ibook"
]);
const SHA256 = /^[a-f0-9]{64}$/;
const PRODUCT_ID = /^[A-Z0-9][A-Z0-9._-]*$/;
const GALLERY_IMAGE = /\.(?:jpg|jpeg|png)$/i;
const FILE_BASE = /^[a-zA-Z0-9._-]+$/;

export function buyerFilenameIssue(filename: unknown): string | null {
  if (typeof filename !== "string" || !filename.length ||
      filename !== filename.normalize("NFC").trim()) return "BUYER_FILE_NAME_INVALID";
  if (filename.length > ETSY_BUYER_FILENAME_MAX_LENGTH) return "BUYER_FILE_NAME_EXCEEDS_ETSY_70_CHARS";
  if (!FILE_BASE.test(filename) || filename === "." || filename === ".." ||
      filename.startsWith(".")) return "BUYER_FILE_NAME_UNSUPPORTED_CHARACTERS";
  const dot = filename.lastIndexOf(".");
  const extension = dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
  if (!FILE_TYPES.has(extension)) return "BUYER_FILE_TYPE_NOT_SUPPORTED_BY_ETSY";
  // The buyer-facing name must remain stable across internal product revisions.
  // Internal manifests and working files may use version suffixes; buyer files may not.
  const stem = filename.slice(0, dot);
  if (/(?:^|[._-])v\d+(?:[._-]\d+)*$/i.test(stem)) {
    return "BUYER_FILE_NAME_VERSION_SUFFIX_NOT_ALLOWED";
  }
  return null;
}

export type ChatGptDigitalHandoff = {
  schemaVersion: typeof DIGITAL_HANDOFF_QC_VERSION;
  origin: "CHATGPT_PRODUCED";
  productId: string;
  deliveryType: "INSTANT_DOWNLOAD";
  listing: {
    title: string;
    description: string;
    sellerOriginalDesignAsserted: boolean;
    aiUsed: boolean;
    aiDisclosureText?: string;
  };
  buyerFiles: Array<{ filename: string; expectedBytes: number; sha256: string }>;
  gallery: Array<{ filename: string; expectedBytes: number; sha256: string }>;
  buyerInstructions: string;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function sizeOk(n: unknown, maximum: number): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= maximum;
}
function nonEmpty(v: unknown) {
  return typeof v === "string" && Boolean(v.trim());
}
const noWrites = {
  mode: "READ_ONLY" as const,
  actualBuyerFileBytesVerified: false,
  galleryImageContentVerified: false,
  independentFinalQcVerified: false,
  currentEtsyPolicyApprovalGuaranteed: false,
  etsyDraftReadbackVerified: false,
  buyerDownloadTested: false,
  publishAuthorized: false,
  ETSY_WRITE_COUNT: 0 as const
};

export function inspectChatGptHandoff(input: unknown) {
  const issues: string[] = [];
  const src = object(input);
  if (!src) return { status: "BLOCKED" as const, issues: ["INVALID_HANDOFF"], ...noWrites };

  if (src.schemaVersion !== DIGITAL_HANDOFF_QC_VERSION ||
      src.origin !== "CHATGPT_PRODUCED") issues.push("INVALID_HANDOFF_SCHEMA_OR_ORIGIN");
  if (typeof src.productId !== "string" || !PRODUCT_ID.test(src.productId)) {
    issues.push("PRODUCT_ID_INVALID");
  }
  if (src.deliveryType !== "INSTANT_DOWNLOAD") issues.push("DELIVERY_TYPE_UNSUPPORTED");

  const listing = object(src.listing);
  if (!listing || !nonEmpty(listing.title) ||
      (listing.title as string).length > 140) issues.push("ETSY_TITLE_INVALID");
  if (!listing || !nonEmpty(listing.description)) issues.push("ETSY_DESCRIPTION_REQUIRED");
  if (!listing || listing.sellerOriginalDesignAsserted !== true) {
    issues.push("SELLER_ORIGINAL_DESIGN_ATTESTATION_REQUIRED");
  }
  if (!listing || typeof listing.aiUsed !== "boolean") issues.push("AI_USAGE_DECLARATION_REQUIRED");
  if (listing?.aiUsed === true) {
    const disclosure = listing.aiDisclosureText;
    if (!nonEmpty(disclosure) ||
        !/\bAI\b|artificial intelligence|chatgpt/i.test(String(disclosure)) ||
        !nonEmpty(listing.description) ||
        !String(listing.description).toLowerCase().includes(String(disclosure).trim().toLowerCase())) {
      issues.push("AI_USE_MUST_BE_DISCLOSED_IN_LISTING_DESCRIPTION");
    }
  }
  if (!nonEmpty(src.buyerInstructions)) issues.push("BUYER_INSTRUCTIONS_REQUIRED");

  const files = src.buyerFiles;
  if (!Array.isArray(files) || files.length < 1 || files.length > ETSY_BUYER_FILE_COUNT_LIMIT) {
    issues.push("ETSY_BUYER_FILE_COUNT_INVALID");
  } else {
    const names = new Set<string>();
    for (const entry of files) {
      const item = object(entry);
      if (!item) { issues.push("INVALID_BUYER_FILE_ENTRY"); continue; }
      const nameProblem = buyerFilenameIssue(item.filename);
      if (nameProblem) issues.push(nameProblem);
      if (typeof item.filename === "string") {
        const key = item.filename.normalize("NFC").toLowerCase();
        if (names.has(key)) issues.push("DUPLICATE_BUYER_FILE_NAME");
        names.add(key);
      }
      if (!sizeOk(item.expectedBytes, ETSY_BUYER_FILE_MAX_BYTES)) {
        issues.push("BUYER_FILE_SIZE_INVALID_OR_TOO_LARGE");
      }
      if (typeof item.sha256 !== "string" || !SHA256.test(item.sha256)) {
        issues.push("BUYER_FILE_SHA256_REQUIRED");
      }
    }
  }

  const gallery = src.gallery;
  if (!Array.isArray(gallery) || gallery.length < 1 || gallery.length > 10) {
    issues.push("GALLERY_COUNT_INVALID");
  } else {
    const names = new Set<string>();
    for (const entry of gallery) {
      const item = object(entry);
      if (!item || !nonEmpty(item.filename) ||
          !GALLERY_IMAGE.test(String(item.filename)) ||
          /[/\\\r\n]/.test(String(item.filename)) ||
          String(item.filename).length > 150) {
        issues.push("GALLERY_FILENAME_OR_TYPE_INVALID");
        continue;
      }
      const key = String(item.filename).normalize("NFC").toLowerCase();
      if (names.has(key)) issues.push("DUPLICATE_GALLERY_FILENAME");
      names.add(key);
      if (!sizeOk(item.expectedBytes, ETSY_BUYER_FILE_MAX_BYTES)) {
        issues.push("GALLERY_SIZE_INVALID");
      }
      if (typeof item.sha256 !== "string" || !SHA256.test(item.sha256)) {
        issues.push("GALLERY_SHA256_REQUIRED");
      }
    }
  }

  return {
    status: issues.length ? "BLOCKED" as const : "METADATA_REVIEW_REQUIRED" as const,
    issues: [...new Set(issues)],
    productId: typeof src.productId === "string" ? src.productId : null,
    declaredBuyerFileCount: Array.isArray(files) ? files.length : null,
    declaredGalleryCount: Array.isArray(gallery) ? gallery.length : null,
    next: "VERIFY_ACTUAL_CHATGPT_FILE_BYTES_AND_INDEPENDENT_QC_THEN_ETSY_DRAFT_READBACK" as const,
    ...noWrites
  };
}
