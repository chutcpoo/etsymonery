import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  MemoryOperationLedgerRepository,
  NeonOperationLedgerRepository,
  beginOperation,
  hashOperationRequest,
  recordOperationResult,
  type OperationLedgerRepository
} from "./operation-ledger";
import { executeReconciledWrite } from "./draft-upload-reconciliation";
import {
  EtsyDraftAssetProvider,
  type EtsyDraftAssetPayload
} from "./etsy-draft-asset-provider";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { getEtsySellerStateSnapshot } from "./etsy-seller-state-reconciliation";
import {
  verifyEtsyReadBackIdentity,
  type EtsyReadBackObservation
} from "./etsy-readback-normalizer";
import {
  assertPdtFcmp002V1RecoveryManifestFrozen,
  PDT_FCMP_002_V1_RECOVERY,
  PDT_FCMP_002_V1_RECOVERY_AUTHORIZATION_TEXT,
  PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
  PDT_FCMP_002_V1_RECOVERY_FILE,
  PDT_FCMP_002_V1_RECOVERY_FROZEN_CANDIDATE_FINGERPRINT,
  PDT_FCMP_002_V1_RECOVERY_OPERATION_ID
} from "./pdt-fcmp-002-v1-recovery-manifest";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const RECOVERY_R01_ONE_TIME_TOKEN_SHA256 = "80af7c0de6b64086bcee68681473186e84eb7c69ee6412eca9f2e9e5491d9687";
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const ALLOWED_FIELDS = new Set([
  "authorizationText",
  "recoveryCandidateFingerprint",
  "listingFingerprint",
  "protectedStateFingerprint",
  "productionCommit",
  "deploymentCommit",
  "requestHash",
  "buyerFile01"
]);

type Rec = Record<string, unknown>;

export type PdtFcmp002V1RecoveryRuntime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  now?: () => string;
};

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizedText(value: FormDataEntryValue | null, code: string) {
  if (typeof value !== "string") throw new Error(code);
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function runtimeCommit() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? "";
}

function writesEnabled() {
  return (
    process.env.ETSY_POST_RESET_V2_RECOVERY_WRITES_ENABLED === "true" ||
    (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").includes("[GATE_FCMP_RECOVERY_EXECUTE]")
  );
}

function productionRuntime() {
  return process.env.VERCEL_ENV === "production";
}

function authorizationError(request: Request) {
  const expected =
    process.env.ETSY_POST_RESET_V2_RECOVERY_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  const envMatch = Boolean(expected && supplied && secureEqual(supplied, expected));
  const suppliedHash = supplied
    ? createHash("sha256").update(supplied, "utf8").digest("hex")
    : "";
  const oneTimeMatch = Boolean(
    suppliedHash &&
      secureEqual(suppliedHash, RECOVERY_R01_ONE_TIME_TOKEN_SHA256)
  );
  if (!envMatch && !oneTimeMatch) {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: supplied
          ? "PDT_FCMP_V1_RECOVERY_WRITE_UNAUTHORIZED"
          : "PDT_FCMP_V1_RECOVERY_WRITE_TOKEN_NOT_CONFIGURED",
        ETSY_WRITE_COUNT: 0
      },
      { status: supplied ? 401 : 503 }
    );
  }
  return null;
}

function toObservation(value: Rec): EtsyReadBackObservation {
  return {
    title: value.title,
    description: value.description,
    price: value.price as EtsyReadBackObservation["price"],
    tags: value.tags,
    quantity: value.quantity,
    who_made: value.who_made,
    when_made: value.when_made,
    taxonomy_id: value.taxonomy_id,
    type: value.listing_type ?? value.type ?? "download",
    state: value.state
  };
}

async function fetchRecord(
  fetchImpl: typeof fetch,
  token: string,
  url: string,
  code: string
) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: etsyApiHeaders(token),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(code + "_HTTP_" + String(response.status));
  const value = await parseJson(response);
  if (!isRec(value)) throw new Error(code + "_INVALID");
  return value;
}

function resultRecords(value: Rec, code: string) {
  if (!Array.isArray(value.results)) throw new Error(code);
  return value.results.filter(isRec);
}

function numberField(row: Rec, key: string) {
  const value = row[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function stringField(row: Rec, key: string) {
  const value = row[key];
  return typeof value === "string" ? value.normalize("NFC").trim() : null;
}

function exactGallery(results: Rec[]) {
  if (results.length !== 10) return false;
  const ordered = [...results].sort(
    (a, b) => (numberField(a, "rank") ?? 0) - (numberField(b, "rank") ?? 0)
  );
  return ordered.every((row, index) => {
    const expectedId = PDT_FCMP_002_V1_RECOVERY.expectedGalleryImageIds[index];
    const expected = PDT_FCMP_002_V1_RECOVERY.expectedGallery[index];
    return (
      numberField(row, "listing_image_id") === expectedId &&
      numberField(row, "rank") === expected.rank &&
      stringField(row, "alt_text") === (expected.altText ?? "")
    );
  });
}

async function readProtectedState(
  runtime: PdtFcmp002V1RecoveryRuntime = {}
) {
  assertPdtFcmp002V1RecoveryManifestFrozen();
  const configuredShopId = Number(process.env.ETSY_SHOP_ID);
  if (configuredShopId !== PDT_FCMP_002_V1_RECOVERY.shopId) {
    throw new Error("PDT_FCMP_V1_RECOVERY_SHOP_ID_MISMATCH");
  }
  const fetchImpl = runtime.fetchImpl ?? fetch;
  const getAccessToken = runtime.getAccessToken ?? getValidEtsyAccessToken;
  const accessToken = await getAccessToken();
  const sellerState = await getEtsySellerStateSnapshot({
    shopId: PDT_FCMP_002_V1_RECOVERY.shopId,
    accessToken,
    dependencies: { fetchImpl }
  });

  const listing = await fetchRecord(
    fetchImpl,
    accessToken,
    "https://api.etsy.com/v3/application/listings/" +
      String(PDT_FCMP_002_V1_RECOVERY.draftListingId),
    "PDT_FCMP_V1_RECOVERY_DRAFT"
  );
  const identity = verifyEtsyReadBackIdentity(
    PDT_FCMP_002_V1_RECOVERY.listingFingerprint,
    toObservation(listing)
  );
  const imagePayload = await fetchRecord(
    fetchImpl,
    accessToken,
    "https://api.etsy.com/v3/application/listings/" +
      String(PDT_FCMP_002_V1_RECOVERY.draftListingId) +
      "/images",
    "PDT_FCMP_V1_RECOVERY_IMAGES"
  );
  const filePayload = await fetchRecord(
    fetchImpl,
    accessToken,
    "https://api.etsy.com/v3/application/shops/" +
      String(PDT_FCMP_002_V1_RECOVERY.shopId) +
      "/listings/" +
      String(PDT_FCMP_002_V1_RECOVERY.draftListingId) +
      "/files",
    "PDT_FCMP_V1_RECOVERY_FILES"
  );
  const images = resultRecords(
    imagePayload,
    "PDT_FCMP_V1_RECOVERY_IMAGES_INVALID"
  );
  const files = resultRecords(
    filePayload,
    "PDT_FCMP_V1_RECOVERY_FILES_INVALID"
  );

  const live = sellerState.listings.find(
    (item) => item.listingId === PDT_FCMP_002_V1_RECOVERY.liveListingId
  );
  const draft = sellerState.listings.find(
    (item) => item.listingId === PDT_FCMP_002_V1_RECOVERY.draftListingId
  );

  const baselineMatches =
    sellerState.total === 2 &&
    sellerState.counts.active === 1 &&
    sellerState.counts.draft === 1 &&
    sellerState.counts.inactive === 0 &&
    sellerState.counts.sold_out === 0 &&
    sellerState.counts.expired === 0 &&
    live?.state === "active" &&
    live?.title ===
      "Invoice Payment Tracker Excel | Accounts Receivable Aging & Follow-Up Spreadsheet for Small Business" &&
    draft?.state === "draft" &&
    draft?.title === PDT_FCMP_002_V1_RECOVERY.listing.title &&
    identity.status === "MATCH" &&
    listing.state === "draft" &&
    exactGallery(images) &&
    files.length === 0;

  const imageIds = [...images]
    .sort((a, b) => (numberField(a, "rank") ?? 0) - (numberField(b, "rank") ?? 0))
    .map((row) => numberField(row, "listing_image_id"));

  const snapshot = {
    operationId: PDT_FCMP_002_V1_RECOVERY_OPERATION_ID,
    candidateId: PDT_FCMP_002_V1_RECOVERY.candidateId,
    recoveryCandidateFingerprint:
      PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
    listingFingerprint: PDT_FCMP_002_V1_RECOVERY.listingFingerprint,
    shopId: PDT_FCMP_002_V1_RECOVERY.shopId,
    liveListingId: PDT_FCMP_002_V1_RECOVERY.liveListingId,
    draftListingId: PDT_FCMP_002_V1_RECOVERY.draftListingId,
    stateCounts: sellerState.counts,
    listingIds: sellerState.listings
      .map((item) => item.listingId)
      .sort((a, b) => a - b),
    imageIds,
    fileIds: files
      .map((row) => numberField(row, "listing_file_id"))
      .filter((value): value is number => value != null)
  };

  return {
    accessToken,
    sellerState,
    listing,
    images,
    files,
    snapshot,
    fingerprint: hashOperationRequest(snapshot),
    baselineMatches
  };
}

export function pdtFcmp002V1RecoveryPlan() {
  assertPdtFcmp002V1RecoveryManifestFrozen();
  return {
    status: "PLAN_ONLY",
    mode: "RECOVERY_UPLOAD_FILE_ONLY",
    productId: PDT_FCMP_002_V1_RECOVERY.productId,
    productVersion: PDT_FCMP_002_V1_RECOVERY.productVersion,
    operationId: PDT_FCMP_002_V1_RECOVERY_OPERATION_ID,
    candidateId: PDT_FCMP_002_V1_RECOVERY.candidateId,
    recoveryCandidateFingerprint:
      PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
    listingFingerprint: PDT_FCMP_002_V1_RECOVERY.listingFingerprint,
    draftListingId: PDT_FCMP_002_V1_RECOVERY.draftListingId,
    buyerFileName: PDT_FCMP_002_V1_RECOVERY_FILE.fileName,
    buyerFileNameLength: PDT_FCMP_002_V1_RECOVERY_FILE.fileName.length,
    buyerFileSizeBytes: PDT_FCMP_002_V1_RECOVERY_FILE.sizeBytes,
    buyerFileSha256: PDT_FCMP_002_V1_RECOVERY_FILE.sha256,
    createDraftAuthorized: false,
    publishAuthorized: false,
    featureGateDefault: "OFF",
    ETSY_WRITE_COUNT: 0
  };
}

export async function verifyPdtFcmp002V1RecoveryProtectedState(
  runtime: PdtFcmp002V1RecoveryRuntime = {}
) {
  try {
    const state = await readProtectedState(runtime);
    const commit = runtimeCommit();
    return NextResponse.json(
      {
        status: state.baselineMatches
          ? "PROTECTED_STATE_MATCH"
          : "PROTECTED_STATE_MISMATCH",
        counts: state.sellerState.counts,
        total: state.sellerState.total,
        listingIds: state.snapshot.listingIds,
        draftListingId: PDT_FCMP_002_V1_RECOVERY.draftListingId,
        imageCount: state.images.length,
        buyerFileCount: state.files.length,
        protectedStateFingerprint: state.fingerprint,
        recoveryCandidateFingerprint:
          PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
        listingFingerprint: PDT_FCMP_002_V1_RECOVERY.listingFingerprint,
        productionCommit: commit,
        deploymentCommit: commit,
        authorizationRequestHash:
          COMMIT_SHA.test(commit)
            ? pdtFcmp002V1RecoveryAuthorizationRequestHash(
                state.fingerprint,
                commit,
                commit
              )
            : null,
        ETSY_WRITE_COUNT: 0
      },
      { status: state.baselineMatches ? 200 : 409 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "PROTECTED_STATE_BLOCKED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        ETSY_WRITE_COUNT: 0
      },
      { status: 409 }
    );
  }
}

export function exactPdtFcmp002V1RecoveryAuthorizationContract(
  protectedStateFingerprint: string,
  productionCommit: string,
  deploymentCommit: string
) {
  return {
    authorizationId: PDT_FCMP_002_V1_RECOVERY.authorizationId,
    authorizationText: PDT_FCMP_002_V1_RECOVERY_AUTHORIZATION_TEXT,
    operationId: PDT_FCMP_002_V1_RECOVERY_OPERATION_ID,
    productId: PDT_FCMP_002_V1_RECOVERY.productId,
    productVersion: PDT_FCMP_002_V1_RECOVERY.productVersion,
    shopId: PDT_FCMP_002_V1_RECOVERY.shopId,
    draftListingId: PDT_FCMP_002_V1_RECOVERY.draftListingId,
    candidateId: PDT_FCMP_002_V1_RECOVERY.candidateId,
    recoveryCandidateFingerprint:
      PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
    listingFingerprint: PDT_FCMP_002_V1_RECOVERY.listingFingerprint,
    protectedStateFingerprint: protectedStateFingerprint.trim().toLowerCase(),
    productionCommit: productionCommit.trim().toLowerCase(),
    deploymentCommit: deploymentCommit.trim().toLowerCase(),
    repair: {
      kind: "UPLOAD_FILE_ONLY",
      fileName: PDT_FCMP_002_V1_RECOVERY_FILE.fileName,
      sizeBytes: PDT_FCMP_002_V1_RECOVERY_FILE.sizeBytes,
      sha256: PDT_FCMP_002_V1_RECOVERY_FILE.sha256,
      rank: PDT_FCMP_002_V1_RECOVERY_FILE.rank
    },
    createDraftAuthorized: false,
    publishAuthorized: false
  };
}

export function pdtFcmp002V1RecoveryAuthorizationRequestHash(
  protectedStateFingerprint: string,
  productionCommit: string,
  deploymentCommit: string
) {
  return hashOperationRequest(
    exactPdtFcmp002V1RecoveryAuthorizationContract(
      protectedStateFingerprint,
      productionCommit,
      deploymentCommit
    )
  );
}

async function verifyRecoveryFile(file: File) {
  if (file.name.normalize("NFC").trim() !== PDT_FCMP_002_V1_RECOVERY_FILE.fileName) {
    throw new Error("PDT_FCMP_V1_RECOVERY_FILENAME_MISMATCH");
  }
  if (file.size !== PDT_FCMP_002_V1_RECOVERY_FILE.sizeBytes) {
    throw new Error("PDT_FCMP_V1_RECOVERY_FILE_SIZE_MISMATCH");
  }
  const actual = createHash("sha256")
    .update(Buffer.from(await file.arrayBuffer()))
    .digest("hex");
  if (!secureEqual(actual, PDT_FCMP_002_V1_RECOVERY_FILE.sha256)) {
    throw new Error("PDT_FCMP_V1_RECOVERY_FILE_SHA256_MISMATCH");
  }
}

async function verifyFinalPersistence(
  fetchImpl: typeof fetch,
  token: string
) {
  const listing = await fetchRecord(
    fetchImpl,
    token,
    "https://api.etsy.com/v3/application/listings/" +
      String(PDT_FCMP_002_V1_RECOVERY.draftListingId),
    "PDT_FCMP_V1_RECOVERY_FINAL_DRAFT"
  );
  const identity = verifyEtsyReadBackIdentity(
    PDT_FCMP_002_V1_RECOVERY.listingFingerprint,
    toObservation(listing)
  );
  if (identity.status !== "MATCH" || listing.state !== "draft") {
    throw new Error("PDT_FCMP_V1_RECOVERY_FINAL_LISTING_MISMATCH");
  }

  const imagePayload = await fetchRecord(
    fetchImpl,
    token,
    "https://api.etsy.com/v3/application/listings/" +
      String(PDT_FCMP_002_V1_RECOVERY.draftListingId) +
      "/images",
    "PDT_FCMP_V1_RECOVERY_FINAL_IMAGES"
  );
  const images = resultRecords(
    imagePayload,
    "PDT_FCMP_V1_RECOVERY_FINAL_IMAGES_INVALID"
  );
  if (!exactGallery(images)) {
    throw new Error("PDT_FCMP_V1_RECOVERY_FINAL_GALLERY_MISMATCH");
  }

  const filePayload = await fetchRecord(
    fetchImpl,
    token,
    "https://api.etsy.com/v3/application/shops/" +
      String(PDT_FCMP_002_V1_RECOVERY.shopId) +
      "/listings/" +
      String(PDT_FCMP_002_V1_RECOVERY.draftListingId) +
      "/files",
    "PDT_FCMP_V1_RECOVERY_FINAL_FILES"
  );
  const files = resultRecords(
    filePayload,
    "PDT_FCMP_V1_RECOVERY_FINAL_FILES_INVALID"
  );
  if (files.length !== 1) {
    throw new Error("PDT_FCMP_V1_RECOVERY_FINAL_FILE_COUNT_MISMATCH");
  }
  const file = files[0];
  if (
    stringField(file, "filename") !== PDT_FCMP_002_V1_RECOVERY_FILE.fileName ||
    numberField(file, "rank") !== 1 ||
    numberField(file, "size_bytes") !== PDT_FCMP_002_V1_RECOVERY_FILE.sizeBytes
  ) {
    throw new Error("PDT_FCMP_V1_RECOVERY_FINAL_FILE_METADATA_MISMATCH");
  }

  const seller = await getEtsySellerStateSnapshot({
    shopId: PDT_FCMP_002_V1_RECOVERY.shopId,
    accessToken: token,
    dependencies: { fetchImpl }
  });
  if (
    seller.total !== 2 ||
    seller.counts.active !== 1 ||
    seller.counts.draft !== 1 ||
    seller.counts.inactive !== 0 ||
    seller.counts.sold_out !== 0 ||
    seller.counts.expired !== 0
  ) {
    throw new Error("PDT_FCMP_V1_RECOVERY_FINAL_SELLER_STATE_MISMATCH");
  }

  return {
    state: "draft",
    listingFingerprint: identity.actualFingerprint,
    imageCount: images.length,
    buyerFileCount: files.length,
    buyerFileName: stringField(file, "filename"),
    buyerFileSizeBytes: numberField(file, "size_bytes"),
    publishPerformed: false
  };
}

function errorStatus(code: string, parentStarted: boolean) {
  if (parentStarted) return 202;
  if (code.includes("UNAUTHORIZED")) return 401;
  if (code.includes("DISABLED") || code.includes("PRODUCTION_RUNTIME")) return 403;
  if (code.includes("PROTECTED_STATE")) return 409;
  return 400;
}

export async function handlePdtFcmp002V1RecoveryPost(
  request: Request,
  runtime: PdtFcmp002V1RecoveryRuntime = {}
) {
  if (!writesEnabled()) {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: "PDT_FCMP_V1_RECOVERY_WRITES_DISABLED",
        ETSY_WRITE_COUNT: 0
      },
      { status: 403 }
    );
  }
  if (!productionRuntime()) {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: "PDT_FCMP_V1_RECOVERY_PRODUCTION_RUNTIME_REQUIRED",
        ETSY_WRITE_COUNT: 0
      },
      { status: 403 }
    );
  }
  const authError = authorizationError(request);
  if (authError) return authError;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: "INVALID_MULTIPART_FORM_DATA",
        ETSY_WRITE_COUNT: 0
      },
      { status: 400 }
    );
  }

  let writeAttempts = 0;
  let parentStarted = false;
  let parentRequestHash = "";
  const baseFetch = runtime.fetchImpl ?? fetch;
  const countedFetch: typeof fetch = async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = new URL(String(input));
    if (
      url.hostname === "api.etsy.com" &&
      !["GET", "HEAD", "OPTIONS"].includes(method)
    ) {
      writeAttempts += 1;
    }
    return baseFetch(input, init);
  };
  const repository =
    runtime.repository ??
    (process.env.NODE_ENV === "test"
      ? new MemoryOperationLedgerRepository()
      : new NeonOperationLedgerRepository());
  const now = runtime.now ?? (() => new Date().toISOString());

  try {
    assertPdtFcmp002V1RecoveryManifestFrozen();
    for (const key of form.keys()) {
      if (!ALLOWED_FIELDS.has(key)) {
        throw new Error("PDT_FCMP_V1_RECOVERY_UNEXPECTED_FORM_FIELD_" + key);
      }
    }

    const authorizationText = normalizedText(
      form.get("authorizationText"),
      "PDT_FCMP_V1_RECOVERY_AUTHORIZATION_TEXT_MISSING"
    );
    if (
      !secureEqual(
        authorizationText,
        PDT_FCMP_002_V1_RECOVERY_AUTHORIZATION_TEXT
      )
    ) {
      throw new Error("PDT_FCMP_V1_RECOVERY_AUTHORIZATION_TEXT_INVALID");
    }

    const recoveryCandidateFingerprint = normalizedText(
      form.get("recoveryCandidateFingerprint"),
      "PDT_FCMP_V1_RECOVERY_CANDIDATE_FINGERPRINT_MISSING"
    ).toLowerCase();
    const listingFingerprint = normalizedText(
      form.get("listingFingerprint"),
      "PDT_FCMP_V1_RECOVERY_LISTING_FINGERPRINT_MISSING"
    ).toLowerCase();
    const protectedStateFingerprint = normalizedText(
      form.get("protectedStateFingerprint"),
      "PDT_FCMP_V1_RECOVERY_PROTECTED_STATE_FINGERPRINT_MISSING"
    ).toLowerCase();
    const productionCommit = normalizedText(
      form.get("productionCommit"),
      "PDT_FCMP_V1_RECOVERY_PRODUCTION_COMMIT_MISSING"
    ).toLowerCase();
    const deploymentCommit = normalizedText(
      form.get("deploymentCommit"),
      "PDT_FCMP_V1_RECOVERY_DEPLOYMENT_COMMIT_MISSING"
    ).toLowerCase();
    const suppliedRequestHash = normalizedText(
      form.get("requestHash"),
      "PDT_FCMP_V1_RECOVERY_REQUEST_HASH_MISSING"
    ).toLowerCase();

    if (
      recoveryCandidateFingerprint !==
        PDT_FCMP_002_V1_RECOVERY_FROZEN_CANDIDATE_FINGERPRINT ||
      recoveryCandidateFingerprint !==
        PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT
    ) {
      throw new Error("PDT_FCMP_V1_RECOVERY_CANDIDATE_FINGERPRINT_MISMATCH");
    }
    if (listingFingerprint !== PDT_FCMP_002_V1_RECOVERY.listingFingerprint) {
      throw new Error("PDT_FCMP_V1_RECOVERY_LISTING_FINGERPRINT_MISMATCH");
    }
    if (!SHA256.test(protectedStateFingerprint)) {
      throw new Error("PDT_FCMP_V1_RECOVERY_PROTECTED_STATE_FINGERPRINT_INVALID");
    }
    if (!SHA256.test(suppliedRequestHash)) {
      throw new Error("PDT_FCMP_V1_RECOVERY_REQUEST_HASH_INVALID");
    }

    const commit = runtimeCommit();
    if (
      !COMMIT_SHA.test(productionCommit) ||
      !COMMIT_SHA.test(deploymentCommit) ||
      !COMMIT_SHA.test(commit) ||
      productionCommit !== commit ||
      deploymentCommit !== commit
    ) {
      throw new Error("PDT_FCMP_V1_RECOVERY_GIT_VERCEL_COMMIT_MISMATCH");
    }

    const expectedRequestHash = pdtFcmp002V1RecoveryAuthorizationRequestHash(
      protectedStateFingerprint,
      productionCommit,
      deploymentCommit
    );
    if (!secureEqual(suppliedRequestHash, expectedRequestHash)) {
      throw new Error("PDT_FCMP_V1_RECOVERY_AUTHORIZATION_REQUEST_HASH_MISMATCH");
    }

    const file = form.get("buyerFile01");
    if (!(file instanceof File)) {
      throw new Error("PDT_FCMP_V1_RECOVERY_BUYER_FILE_MISSING");
    }
    await verifyRecoveryFile(file);

    const existing = await repository.load(PDT_FCMP_002_V1_RECOVERY_OPERATION_ID);
    if (existing) {
      throw new Error("PDT_FCMP_V1_RECOVERY_OPERATION_ALREADY_CLAIMED_DO_NOT_RETRY");
    }

    const state = await readProtectedState({
      ...runtime,
      fetchImpl: countedFetch
    });
    if (!state.baselineMatches) {
      throw new Error("PDT_FCMP_V1_RECOVERY_PROTECTED_STATE_MISMATCH");
    }
    if (!secureEqual(state.fingerprint, protectedStateFingerprint)) {
      throw new Error("PDT_FCMP_V1_RECOVERY_PROTECTED_STATE_DRIFT");
    }

    const contract = exactPdtFcmp002V1RecoveryAuthorizationContract(
      protectedStateFingerprint,
      productionCommit,
      deploymentCommit
    );
    const begun = await beginOperation(
      repository,
      PDT_FCMP_002_V1_RECOVERY_OPERATION_ID,
      contract,
      now()
    );
    if (begun.status === "REPLAY") {
      throw new Error("PDT_FCMP_V1_RECOVERY_OPERATION_ALREADY_CLAIMED_DO_NOT_RETRY");
    }
    parentStarted = true;
    parentRequestHash = begun.record.requestHash;
    if (!secureEqual(parentRequestHash, suppliedRequestHash)) {
      throw new Error("PDT_FCMP_V1_RECOVERY_LEDGER_REQUEST_HASH_MISMATCH");
    }

    const payload: EtsyDraftAssetPayload = {
      operationKind: "UPLOAD_FILE",
      candidateId: PDT_FCMP_002_V1_RECOVERY.candidateId,
      candidateFingerprint: PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
      expectedListingFingerprint: PDT_FCMP_002_V1_RECOVERY.listingFingerprint,
      shopId: PDT_FCMP_002_V1_RECOVERY.shopId,
      draftListingId: PDT_FCMP_002_V1_RECOVERY.draftListingId,
      assetSha256: PDT_FCMP_002_V1_RECOVERY_FILE.sha256,
      assetName: PDT_FCMP_002_V1_RECOVERY_FILE.fileName,
      rank: 1
    };
    const provider = new EtsyDraftAssetProvider(
      state.accessToken,
      payload,
      file,
      { fetchImpl: countedFetch }
    );
    const result = await executeReconciledWrite(repository, provider, {
      operationId: PDT_FCMP_002_V1_RECOVERY_OPERATION_ID + ":UPLOAD_FILE",
      kind: "UPLOAD_FILE",
      payload: {
        draftListingId: PDT_FCMP_002_V1_RECOVERY.draftListingId,
        recoveryCandidateFingerprint:
          PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
        listingFingerprint: PDT_FCMP_002_V1_RECOVERY.listingFingerprint,
        protectedStateFingerprint,
        fileName: PDT_FCMP_002_V1_RECOVERY_FILE.fileName,
        fileSha256: PDT_FCMP_002_V1_RECOVERY_FILE.sha256
      },
      now: now()
    });
    if (result.status === "RECONCILIATION_REQUIRED") {
      throw new Error("PDT_FCMP_V1_RECOVERY_FILE_RECONCILIATION_REQUIRED");
    }

    const verified = await verifyFinalPersistence(
      countedFetch,
      state.accessToken
    );
    const done = await recordOperationResult(
      repository,
      PDT_FCMP_002_V1_RECOVERY_OPERATION_ID,
      parentRequestHash,
      "SUCCEEDED",
      now(),
      {
        receipt: {
          authorizationId: PDT_FCMP_002_V1_RECOVERY.authorizationId,
          authorizationText: PDT_FCMP_002_V1_RECOVERY.authorizationText,
          draftListingId: PDT_FCMP_002_V1_RECOVERY.draftListingId,
          recoveryCandidateFingerprint:
            PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
          listingFingerprint: PDT_FCMP_002_V1_RECOVERY.listingFingerprint,
          protectedStateFingerprint,
          productionCommit,
          deploymentCommit,
          verified,
          publishPerformed: false,
          ETSY_WRITE_COUNT: writeAttempts
        }
      }
    );

    return NextResponse.json({
      status: "RECOVERY_FILE_UPLOADED_AND_PERSISTENCE_VERIFIED",
      mode: "RECOVERY_UPLOAD_FILE_ONLY",
      operationId: done.operationId,
      requestHash: done.requestHash,
      draftListingId: PDT_FCMP_002_V1_RECOVERY.draftListingId,
      recoveryCandidateFingerprint:
        PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
      listingFingerprint: PDT_FCMP_002_V1_RECOVERY.listingFingerprint,
      verified,
      publishPerformed: false,
      ETSY_WRITE_COUNT: writeAttempts
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (parentStarted && parentRequestHash) {
      try {
        await recordOperationResult(
          repository,
          PDT_FCMP_002_V1_RECOVERY_OPERATION_ID,
          parentRequestHash,
          "RECONCILIATION_REQUIRED",
          now(),
          {
            recoveryPoint: code,
            receipt: {
              publishPerformed: false,
              ETSY_WRITE_COUNT: writeAttempts
            }
          }
        );
      } catch {
        // Preserve the original fail-closed error.
      }
    }
    return NextResponse.json(
      {
        status: parentStarted
          ? "RECONCILIATION_REQUIRED"
          : "BLOCKED_FAIL_CLOSED",
        error: code,
        operationId: PDT_FCMP_002_V1_RECOVERY_OPERATION_ID,
        publishPerformed: false,
        ETSY_WRITE_COUNT: writeAttempts
      },
      { status: errorStatus(code, parentStarted) }
    );
  }
}
