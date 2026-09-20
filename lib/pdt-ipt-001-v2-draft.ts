import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  executeReconciledWrite,
  ProviderAmbiguousResultError,
  type ProviderReceipt,
  type ReconciledWriteProvider
} from "./draft-upload-reconciliation";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import {
  EtsyDraftAssetProvider,
  type EtsyDraftAssetPayload
} from "./etsy-draft-asset-provider";
import {
  verifyEtsyReadBackIdentity,
  type EtsyReadBackObservation
} from "./etsy-readback-normalizer";
import { getEtsySellerStateSnapshot } from "./etsy-seller-state-reconciliation";
import {
  beginOperation,
  hashOperationRequest,
  MemoryOperationLedgerRepository,
  NeonOperationLedgerRepository,
  recordOperationResult,
  type OperationLedgerRecord,
  type OperationLedgerRepository
} from "./operation-ledger";
import {
  assertPdtIpt001V2ManifestFrozen,
  PDT_IPT_001_V2_AUTHORIZATION_TEXT,
  PDT_IPT_001_V2_BUYER_FILES,
  PDT_IPT_001_V2_CANDIDATE_FINGERPRINT,
  PDT_IPT_001_V2_DRAFT,
  PDT_IPT_001_V2_FROZEN_CANDIDATE_FINGERPRINT,
  PDT_IPT_001_V2_FROZEN_LISTING_FINGERPRINT,
  PDT_IPT_001_V2_GALLERY,
  PDT_IPT_001_V2_LISTING_FINGERPRINT,
  PDT_IPT_001_V2_LISTING_IDENTITY,
  PDT_IPT_001_V2_OPERATION_ID,
  type PdtIptV2Asset
} from "./pdt-ipt-001-v2-manifest";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const IMAGE_FIELDS = PDT_IPT_001_V2_GALLERY.map((asset) => ({
  field: "image" + String(asset.rank).padStart(2, "0"),
  asset
}));
const BUYER_FILE_FIELDS = PDT_IPT_001_V2_BUYER_FILES.map((asset) => ({
  field: "buyerFile" + String(asset.rank).padStart(2, "0"),
  asset
}));
const ASSET_FIELDS = Object.freeze([...IMAGE_FIELDS, ...BUYER_FILE_FIELDS]);
const EXECUTION_TEXT_FIELDS = Object.freeze([
  "authorizationText",
  "candidateFingerprint",
  "listingFingerprint",
  "protectedStateFingerprint",
  "productionCommit",
  "deploymentCommit",
  "requestHash"
]);
const ALLOWED_FORM_FIELDS = new Set([
  ...EXECUTION_TEXT_FIELDS,
  ...ASSET_FIELDS.map((item) => item.field)
]);

type Rec = Record<string, unknown>;

export type PdtIpt001V2Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  now?: () => string;
  verifyAsset?: (file: File, asset: PdtIptV2Asset) => Promise<boolean> | boolean;
};

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseJson(response: Response) {
  const body = await response.text();
  if (!body) return {};
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return {};
  }
}

function results(value: unknown) {
  return isRec(value) && Array.isArray(value.results)
    ? value.results.filter(isRec)
    : null;
}

function positiveId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && /^[1-9]\d*$/.test(value.trim())) {
    return value.trim();
  }
  return null;
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
  return process.env.ETSY_POST_RESET_V2_WRITES_ENABLED === "true";
}

function productionRuntime() {
  return process.env.VERCEL_ENV === "production";
}

function authorizationError(request: Request) {
  const expected = process.env.ETSY_POST_RESET_V2_WRITE_TOKEN?.trim() ?? "";
  if (!expected) {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: "PDT_IPT_V2_WRITE_TOKEN_NOT_CONFIGURED",
        ETSY_WRITE_COUNT: 0
      },
      { status: 503 }
    );
  }
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!supplied || !secureEqual(supplied, expected)) {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: "PDT_IPT_V2_WRITE_UNAUTHORIZED",
        ETSY_WRITE_COUNT: 0
      },
      { status: 401 }
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

function exactBaseline(counts: Record<string, number>, total: number) {
  return (
    total === 0 &&
    counts.active === 0 &&
    counts.inactive === 0 &&
    counts.sold_out === 0 &&
    counts.draft === 0 &&
    counts.expired === 0
  );
}

async function protectedState(runtime: PdtIpt001V2Runtime = {}) {
  assertPdtIpt001V2ManifestFrozen();
  const configuredShopId = Number(process.env.ETSY_SHOP_ID);
  if (configuredShopId !== PDT_IPT_001_V2_DRAFT.shopId) {
    throw new Error("PDT_IPT_V2_SHOP_ID_MISMATCH");
  }
  const fetchImpl = runtime.fetchImpl ?? fetch;
  const getAccessToken = runtime.getAccessToken ?? getValidEtsyAccessToken;
  const accessToken = await getAccessToken();
  const state = await getEtsySellerStateSnapshot({
    shopId: PDT_IPT_001_V2_DRAFT.shopId,
    accessToken,
    dependencies: { fetchImpl }
  });
  const snapshot = {
    operationId: PDT_IPT_001_V2_OPERATION_ID,
    candidateId: PDT_IPT_001_V2_DRAFT.candidateId,
    candidateFingerprint: PDT_IPT_001_V2_CANDIDATE_FINGERPRINT,
    listingFingerprint: PDT_IPT_001_V2_LISTING_FINGERPRINT,
    shopId: PDT_IPT_001_V2_DRAFT.shopId,
    stateCounts: state.counts,
    listingIds: state.listings.map((item) => item.listingId).sort((a, b) => a - b)
  };
  return {
    accessToken,
    state,
    snapshot,
    fingerprint: hashOperationRequest(snapshot),
    baselineMatches: exactBaseline(state.counts, state.total)
  };
}

export function pdtIpt001V2Plan() {
  assertPdtIpt001V2ManifestFrozen();
  return {
    status: "PLAN_ONLY",
    mode: "POST_RESET_V2_DRAFT_ONLY",
    productId: PDT_IPT_001_V2_DRAFT.productId,
    productVersion: PDT_IPT_001_V2_DRAFT.productVersion,
    operationId: PDT_IPT_001_V2_OPERATION_ID,
    candidateId: PDT_IPT_001_V2_DRAFT.candidateId,
    candidateFingerprint: PDT_IPT_001_V2_CANDIDATE_FINGERPRINT,
    listingFingerprint: PDT_IPT_001_V2_LISTING_FINGERPRINT,
    priceUsd: PDT_IPT_001_V2_LISTING_IDENTITY.priceUsd,
    imageCount: PDT_IPT_001_V2_GALLERY.length,
    buyerFileCount: PDT_IPT_001_V2_BUYER_FILES.length,
    publishAuthorized: false,
    featureGateDefault: "OFF",
    next: "FRESH_PROTECTED_STATE_VERIFICATION_THEN_FRESH_AUTHORIZATION",
    ETSY_WRITE_COUNT: 0
  };
}

export async function verifyPdtIpt001V2ProtectedState(
  runtime: PdtIpt001V2Runtime = {}
) {
  try {
    const value = await protectedState(runtime);
    return NextResponse.json(
      {
        status: value.baselineMatches
          ? "PROTECTED_STATE_MATCH"
          : "PROTECTED_STATE_MISMATCH",
        catalogState: value.baselineMatches ? "EMPTY_CATALOG" : "DRIFT_DETECTED",
        counts: value.state.counts,
        total: value.state.total,
        listingIds: value.snapshot.listingIds,
        protectedStateFingerprint: value.fingerprint,
        candidateFingerprint: PDT_IPT_001_V2_CANDIDATE_FINGERPRINT,
        listingFingerprint: PDT_IPT_001_V2_LISTING_FINGERPRINT,
        ETSY_WRITE_COUNT: 0
      },
      { status: value.baselineMatches ? 200 : 409 }
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

export function exactPdtIpt001V2AuthorizationContract(
  protectedStateFingerprint: string,
  productionCommit: string,
  deploymentCommit: string
) {
  return {
    authorizationId: PDT_IPT_001_V2_DRAFT.authorizationId,
    authorizationText: PDT_IPT_001_V2_AUTHORIZATION_TEXT,
    operationId: PDT_IPT_001_V2_OPERATION_ID,
    productId: PDT_IPT_001_V2_DRAFT.productId,
    productVersion: PDT_IPT_001_V2_DRAFT.productVersion,
    shopId: PDT_IPT_001_V2_DRAFT.shopId,
    candidateId: PDT_IPT_001_V2_DRAFT.candidateId,
    candidateFingerprint: PDT_IPT_001_V2_CANDIDATE_FINGERPRINT,
    listingFingerprint: PDT_IPT_001_V2_LISTING_FINGERPRINT,
    protectedStateFingerprint: protectedStateFingerprint.trim().toLowerCase(),
    productionCommit: productionCommit.trim().toLowerCase(),
    deploymentCommit: deploymentCommit.trim().toLowerCase(),
    priceUsd: PDT_IPT_001_V2_LISTING_IDENTITY.priceUsd,
    gallery: PDT_IPT_001_V2_GALLERY.map((asset) => ({
      rank: asset.rank,
      fileName: asset.fileName,
      sizeBytes: asset.sizeBytes,
      sha256: asset.sha256,
      driveId: asset.driveId,
      altText: asset.altText
    })),
    buyerFiles: PDT_IPT_001_V2_BUYER_FILES.map((asset) => ({
      rank: asset.rank,
      fileName: asset.fileName,
      sizeBytes: asset.sizeBytes,
      sha256: asset.sha256,
      driveId: asset.driveId
    })),
    publishAuthorized: false
  };
}

export function pdtIpt001V2AuthorizationRequestHash(
  protectedStateFingerprint: string,
  productionCommit: string,
  deploymentCommit: string
) {
  return hashOperationRequest(
    exactPdtIpt001V2AuthorizationContract(
      protectedStateFingerprint,
      productionCommit,
      deploymentCommit
    )
  );
}

async function verifyAssetFile(
  file: File,
  asset: PdtIptV2Asset,
  runtime: PdtIpt001V2Runtime
) {
  if (file.name.normalize("NFC").trim() !== asset.fileName) {
    throw new Error("PDT_IPT_V2_ASSET_FILENAME_MISMATCH_" + String(asset.rank));
  }
  if (file.size !== asset.sizeBytes) {
    throw new Error("PDT_IPT_V2_ASSET_SIZE_MISMATCH_" + String(asset.rank));
  }
  if (runtime.verifyAsset) {
    if (!(await runtime.verifyAsset(file, asset))) {
      throw new Error("PDT_IPT_V2_ASSET_SHA256_MISMATCH_" + String(asset.rank));
    }
    return;
  }
  const actual = createHash("sha256")
    .update(Buffer.from(await file.arrayBuffer()))
    .digest("hex");
  if (!secureEqual(actual, asset.sha256)) {
    throw new Error("PDT_IPT_V2_ASSET_SHA256_MISMATCH_" + String(asset.rank));
  }
}

async function parseExactAssets(
  form: FormData,
  runtime: PdtIpt001V2Runtime
) {
  for (const key of form.keys()) {
    if (!ALLOWED_FORM_FIELDS.has(key)) {
      throw new Error("PDT_IPT_V2_UNEXPECTED_FORM_FIELD_" + key);
    }
  }
  const files = new Map<string, File>();
  for (const item of ASSET_FIELDS) {
    const value = form.get(item.field);
    if (!(value instanceof File)) {
      throw new Error("PDT_IPT_V2_MISSING_ASSET_" + item.field);
    }
    await verifyAssetFile(value, item.asset, runtime);
    files.set(item.asset.sha256, value);
  }
  if (files.size !== 12) throw new Error("PDT_IPT_V2_ASSET_COUNT_MISMATCH");
  return files;
}

async function fetchListing(
  fetchImpl: typeof fetch,
  token: string,
  listingId: number
) {
  const response = await fetchImpl(
    "https://api.etsy.com/v3/application/listings/" + String(listingId),
    {
      method: "GET",
      headers: etsyApiHeaders(token),
      cache: "no-store"
    }
  );
  if (!response.ok) {
    throw new Error("PDT_IPT_V2_LISTING_READBACK_HTTP_" + String(response.status));
  }
  const value = await parseJson(response);
  if (!isRec(value)) throw new Error("PDT_IPT_V2_LISTING_READBACK_INVALID");
  return value;
}

class PdtIpt001V2DraftProvider implements ReconciledWriteProvider {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch
  ) {}

  private async exactDraftMatches() {
    const response = await this.fetchImpl(
      "https://api.etsy.com/v3/application/shops/" +
        String(PDT_IPT_001_V2_DRAFT.shopId) +
        "/listings?state=draft&limit=100",
      {
        method: "GET",
        headers: etsyApiHeaders(this.token),
        cache: "no-store"
      }
    );
    const payload = await parseJson(response);
    const list = results(payload);
    if (!response.ok || !list) {
      throw new Error("PDT_IPT_V2_DRAFT_LIST_READ_FAILED");
    }
    const matches: number[] = [];
    for (const row of list) {
      const id = Number(row.listing_id);
      if (!Number.isSafeInteger(id) || id <= 0) continue;
      const detail = await fetchListing(this.fetchImpl, this.token, id);
      const identity = verifyEtsyReadBackIdentity(
        PDT_IPT_001_V2_LISTING_FINGERPRINT,
        toObservation(detail)
      );
      if (identity.status === "MATCH" && detail.state === "draft") matches.push(id);
    }
    return matches;
  }

  async apply(): Promise<ProviderReceipt> {
    if ((await this.exactDraftMatches()).length !== 0) {
      throw new Error("PDT_IPT_V2_DRAFT_COLLISION");
    }
    const listing = PDT_IPT_001_V2_LISTING_IDENTITY;
    const body = new URLSearchParams({
      quantity: String(listing.quantity),
      title: listing.title,
      description: listing.description,
      price: listing.priceUsd.toFixed(2),
      who_made: listing.who_made,
      when_made: listing.when_made,
      taxonomy_id: String(listing.taxonomy_id),
      type: "download",
      tags: listing.tags.join(",")
    });
    let response: Response;
    try {
      response = await this.fetchImpl(
        "https://api.etsy.com/v3/application/shops/" +
          String(PDT_IPT_001_V2_DRAFT.shopId) +
          "/listings",
        {
          method: "POST",
          headers: {
            ...etsyApiHeaders(this.token),
            "content-type": "application/x-www-form-urlencoded"
          },
          body,
          cache: "no-store"
        }
      );
    } catch {
      throw new ProviderAmbiguousResultError();
    }
    if (response.status >= 500) throw new ProviderAmbiguousResultError();
    if (!response.ok) {
      throw new Error("PDT_IPT_V2_DRAFT_CREATE_REJECTED_" + String(response.status));
    }
    const payload = await parseJson(response);
    const id = isRec(payload) ? positiveId(payload.listing_id) : null;
    if (!id) throw new ProviderAmbiguousResultError();
    return {
      providerResourceId: id,
      kind: "CREATE_DRAFT",
      metadata: { state: "draft" }
    };
  }

  async reconcile(): Promise<ProviderReceipt | null> {
    const matches = await this.exactDraftMatches();
    if (matches.length !== 1) return null;
    return {
      providerResourceId: String(matches[0]),
      kind: "CREATE_DRAFT",
      metadata: { state: "draft", readBack: true }
    };
  }
}

async function uploadAsset(
  asset: PdtIptV2Asset,
  file: File,
  draftListingId: number,
  token: string,
  repository: OperationLedgerRepository,
  now: string,
  fetchImpl: typeof fetch
) {
  const payload: EtsyDraftAssetPayload = {
    operationKind: asset.kind,
    candidateId: PDT_IPT_001_V2_DRAFT.candidateId,
    candidateFingerprint: PDT_IPT_001_V2_CANDIDATE_FINGERPRINT,
    expectedListingFingerprint: PDT_IPT_001_V2_LISTING_FINGERPRINT,
    shopId: PDT_IPT_001_V2_DRAFT.shopId,
    draftListingId,
    assetSha256: asset.sha256,
    assetName: asset.fileName,
    rank: asset.rank,
    ...(asset.altText ? { altText: asset.altText } : {})
  };
  const provider = new EtsyDraftAssetProvider(token, payload, file, { fetchImpl });
  const result = await executeReconciledWrite(repository, provider, {
    operationId:
      PDT_IPT_001_V2_OPERATION_ID +
      ":" +
      asset.kind +
      ":" +
      String(asset.rank).padStart(2, "0"),
    kind: asset.kind,
    payload: { ...payload },
    now
  });
  if (result.status === "RECONCILIATION_REQUIRED") {
    throw new Error("PDT_IPT_V2_ASSET_RECONCILIATION_REQUIRED_" + String(asset.rank));
  }
  const receipt = result.receipt as ProviderReceipt;
  if (!(await provider.hasResource(receipt.providerResourceId))) {
    throw new Error("PDT_IPT_V2_ASSET_READBACK_MISMATCH_" + String(asset.rank));
  }
  return receipt;
}

async function verifyFinalPersistence(
  fetchImpl: typeof fetch,
  token: string,
  draftListingId: number
) {
  const listing = await fetchListing(fetchImpl, token, draftListingId);
  const identity = verifyEtsyReadBackIdentity(
    PDT_IPT_001_V2_LISTING_FINGERPRINT,
    toObservation(listing)
  );
  if (listing.state !== "draft" || identity.status !== "MATCH") {
    throw new Error("PDT_IPT_V2_FINAL_LISTING_IDENTITY_MISMATCH");
  }

  const [imagesResponse, filesResponse] = await Promise.all([
    fetchImpl(
      "https://api.etsy.com/v3/application/listings/" +
        String(draftListingId) +
        "/images",
      { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" }
    ),
    fetchImpl(
      "https://api.etsy.com/v3/application/shops/" +
        String(PDT_IPT_001_V2_DRAFT.shopId) +
        "/listings/" +
        String(draftListingId) +
        "/files",
      { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" }
    )
  ]);
  const images = results(await parseJson(imagesResponse));
  const files = results(await parseJson(filesResponse));
  if (!imagesResponse.ok || !images) {
    throw new Error("PDT_IPT_V2_FINAL_IMAGE_READBACK_FAILED");
  }
  if (!filesResponse.ok || !files) {
    throw new Error("PDT_IPT_V2_FINAL_FILE_READBACK_FAILED");
  }

  const orderedImages = [...images].sort(
    (a, b) => Number(a.rank) - Number(b.rank)
  );
  if (orderedImages.length !== PDT_IPT_001_V2_GALLERY.length) {
    throw new Error("PDT_IPT_V2_FINAL_GALLERY_COUNT_MISMATCH");
  }
  for (let index = 0; index < PDT_IPT_001_V2_GALLERY.length; index += 1) {
    const expected = PDT_IPT_001_V2_GALLERY[index];
    const actual = orderedImages[index];
    if (
      Number(actual.rank) !== expected.rank ||
      String(actual.alt_text ?? "").normalize("NFC").trim() !== expected.altText
    ) {
      throw new Error("PDT_IPT_V2_FINAL_GALLERY_ORDER_MISMATCH_" + String(expected.rank));
    }
    const width = Number(actual.full_width);
    const height = Number(actual.full_height);
    if (
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      (width !== 2000 || height !== 2000)
    ) {
      throw new Error("PDT_IPT_V2_FINAL_GALLERY_DIMENSION_MISMATCH_" + String(expected.rank));
    }
  }

  const orderedFiles = [...files].sort(
    (a, b) => Number(a.rank) - Number(b.rank)
  );
  if (orderedFiles.length !== PDT_IPT_001_V2_BUYER_FILES.length) {
    throw new Error("PDT_IPT_V2_FINAL_BUYER_FILE_COUNT_MISMATCH");
  }
  for (let index = 0; index < PDT_IPT_001_V2_BUYER_FILES.length; index += 1) {
    const expected = PDT_IPT_001_V2_BUYER_FILES[index];
    const actual = orderedFiles[index];
    if (
      Number(actual.rank) !== expected.rank ||
      String(actual.filename ?? "").normalize("NFC").trim() !== expected.fileName ||
      Number(actual.size_bytes) !== expected.sizeBytes
    ) {
      throw new Error("PDT_IPT_V2_FINAL_BUYER_FILE_MISMATCH_" + String(expected.rank));
    }
  }

  return {
    state: "draft",
    listingFingerprint: identity.actualFingerprint,
    imageCount: orderedImages.length,
    imageAltTextCount: orderedImages.filter(
      (row) => String(row.alt_text ?? "").trim().length > 0
    ).length,
    buyerFileCount: orderedFiles.length,
    publishPerformed: false
  };
}

function errorStatus(code: string, parentStarted: boolean) {
  if (parentStarted || code.includes("RECONCILIATION_REQUIRED")) return 202;
  if (code.includes("UNAUTHORIZED")) return 401;
  if (code.includes("NOT_CONFIGURED")) return 503;
  if (
    code.includes("INVALID") ||
    code.includes("MISMATCH") ||
    code.includes("UNEXPECTED") ||
    code.includes("MISSING")
  ) {
    return 400;
  }
  return 409;
}

function replayResponse(record: OperationLedgerRecord) {
  return NextResponse.json({
    status: "REPLAY",
    operationId: record.operationId,
    requestHash: record.requestHash,
    receipt: record.receipt,
    publishPerformed: false,
    ETSY_WRITE_COUNT: 0
  });
}

export async function handlePdtIpt001V2Post(
  request: Request,
  runtime: PdtIpt001V2Runtime = {}
) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    let value: unknown;
    try {
      value = await request.json();
    } catch {
      return NextResponse.json(
        { status: "BLOCKED_FAIL_CLOSED", error: "INVALID_JSON", ETSY_WRITE_COUNT: 0 },
        { status: 400 }
      );
    }
    if (!isRec(value) || value.action !== "verify_protected_state") {
      return NextResponse.json(
        {
          status: "BLOCKED_FAIL_CLOSED",
          error: "PDT_IPT_V2_READ_ONLY_ACTION_REQUIRED",
          ETSY_WRITE_COUNT: 0
        },
        { status: 400 }
      );
    }
    return verifyPdtIpt001V2ProtectedState(runtime);
  }

  if (!writesEnabled()) {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: "PDT_IPT_V2_WRITES_DISABLED",
        ETSY_WRITE_COUNT: 0
      },
      { status: 403 }
    );
  }
  if (!productionRuntime()) {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: "PDT_IPT_V2_PRODUCTION_RUNTIME_REQUIRED",
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
    assertPdtIpt001V2ManifestFrozen();
    const authorizationText = normalizedText(
      form.get("authorizationText"),
      "PDT_IPT_V2_AUTHORIZATION_TEXT_MISSING"
    );
    if (!secureEqual(authorizationText, PDT_IPT_001_V2_AUTHORIZATION_TEXT)) {
      throw new Error("PDT_IPT_V2_AUTHORIZATION_TEXT_INVALID");
    }
    const candidateFingerprint = normalizedText(
      form.get("candidateFingerprint"),
      "PDT_IPT_V2_CANDIDATE_FINGERPRINT_MISSING"
    ).toLowerCase();
    const listingFingerprint = normalizedText(
      form.get("listingFingerprint"),
      "PDT_IPT_V2_LISTING_FINGERPRINT_MISSING"
    ).toLowerCase();
    const protectedStateFingerprint = normalizedText(
      form.get("protectedStateFingerprint"),
      "PDT_IPT_V2_PROTECTED_STATE_FINGERPRINT_MISSING"
    ).toLowerCase();
    const productionCommit = normalizedText(
      form.get("productionCommit"),
      "PDT_IPT_V2_PRODUCTION_COMMIT_MISSING"
    ).toLowerCase();
    const deploymentCommit = normalizedText(
      form.get("deploymentCommit"),
      "PDT_IPT_V2_DEPLOYMENT_COMMIT_MISSING"
    ).toLowerCase();
    const suppliedRequestHash = normalizedText(
      form.get("requestHash"),
      "PDT_IPT_V2_REQUEST_HASH_MISSING"
    ).toLowerCase();

    if (
      candidateFingerprint !== PDT_IPT_001_V2_FROZEN_CANDIDATE_FINGERPRINT ||
      candidateFingerprint !== PDT_IPT_001_V2_CANDIDATE_FINGERPRINT
    ) {
      throw new Error("PDT_IPT_V2_CANDIDATE_FINGERPRINT_MISMATCH");
    }
    if (
      listingFingerprint !== PDT_IPT_001_V2_FROZEN_LISTING_FINGERPRINT ||
      listingFingerprint !== PDT_IPT_001_V2_LISTING_FINGERPRINT
    ) {
      throw new Error("PDT_IPT_V2_LISTING_FINGERPRINT_MISMATCH");
    }
    if (!SHA256.test(protectedStateFingerprint)) {
      throw new Error("PDT_IPT_V2_PROTECTED_STATE_FINGERPRINT_INVALID");
    }
    if (!SHA256.test(suppliedRequestHash)) {
      throw new Error("PDT_IPT_V2_REQUEST_HASH_INVALID");
    }
    const commit = runtimeCommit();
    if (
      !COMMIT_SHA.test(productionCommit) ||
      !COMMIT_SHA.test(deploymentCommit) ||
      !COMMIT_SHA.test(commit) ||
      productionCommit !== commit ||
      deploymentCommit !== commit
    ) {
      throw new Error("PDT_IPT_V2_GIT_VERCEL_COMMIT_MISMATCH");
    }

    const expectedRequestHash = pdtIpt001V2AuthorizationRequestHash(
      protectedStateFingerprint,
      productionCommit,
      deploymentCommit
    );
    if (!secureEqual(suppliedRequestHash, expectedRequestHash)) {
      throw new Error("PDT_IPT_V2_AUTHORIZATION_REQUEST_HASH_MISMATCH");
    }

    const files = await parseExactAssets(form, runtime);

    const existing = await repository.load(PDT_IPT_001_V2_OPERATION_ID);
    if (existing?.status === "SUCCEEDED") {
      if (!secureEqual(existing.requestHash, suppliedRequestHash)) {
        throw new Error("PDT_IPT_V2_OPERATION_ID_PAYLOAD_MISMATCH");
      }
      return replayResponse(existing);
    }
    if (existing) {
      throw new Error("PDT_IPT_V2_OPERATION_ALREADY_CLAIMED_DO_NOT_RETRY");
    }

    const getAccessToken = runtime.getAccessToken ?? getValidEtsyAccessToken;
    const state = await protectedState({
      ...runtime,
      fetchImpl: countedFetch,
      getAccessToken
    });
    if (!state.baselineMatches) {
      throw new Error("PDT_IPT_V2_NON_EMPTY_CATALOG_BLOCKED");
    }
    if (!secureEqual(state.fingerprint, protectedStateFingerprint)) {
      throw new Error("PDT_IPT_V2_PROTECTED_STATE_DRIFT");
    }

    const contract = exactPdtIpt001V2AuthorizationContract(
      protectedStateFingerprint,
      productionCommit,
      deploymentCommit
    );
    const begun = await beginOperation(
      repository,
      PDT_IPT_001_V2_OPERATION_ID,
      contract,
      now()
    );
    if (begun.status === "REPLAY") {
      if (
        begun.record.status === "SUCCEEDED" &&
        begun.record.requestHash === suppliedRequestHash
      ) {
        return replayResponse(begun.record);
      }
      throw new Error("PDT_IPT_V2_OPERATION_ALREADY_CLAIMED_DO_NOT_RETRY");
    }
    parentStarted = true;
    parentRequestHash = begun.record.requestHash;
    if (!secureEqual(parentRequestHash, suppliedRequestHash)) {
      throw new Error("PDT_IPT_V2_LEDGER_REQUEST_HASH_MISMATCH");
    }

    const token = state.accessToken;
    const draftProvider = new PdtIpt001V2DraftProvider(token, countedFetch);
    const draftResult = await executeReconciledWrite(repository, draftProvider, {
      operationId: PDT_IPT_001_V2_OPERATION_ID + ":CREATE_DRAFT",
      kind: "CREATE_DRAFT",
      payload: {
        candidateId: PDT_IPT_001_V2_DRAFT.candidateId,
        candidateFingerprint: PDT_IPT_001_V2_CANDIDATE_FINGERPRINT,
        listingFingerprint: PDT_IPT_001_V2_LISTING_FINGERPRINT,
        protectedStateFingerprint
      },
      now: now()
    });
    if (draftResult.status === "RECONCILIATION_REQUIRED") {
      throw new Error("PDT_IPT_V2_DRAFT_RECONCILIATION_REQUIRED");
    }
    const draftReceipt = draftResult.receipt as ProviderReceipt;
    const draftListingId = Number(draftReceipt.providerResourceId);
    if (!Number.isSafeInteger(draftListingId) || draftListingId <= 0) {
      throw new Error("PDT_IPT_V2_DRAFT_ID_INVALID");
    }

    const assetReceipts: ProviderReceipt[] = [];
    for (const asset of [...PDT_IPT_001_V2_GALLERY, ...PDT_IPT_001_V2_BUYER_FILES]) {
      const file = files.get(asset.sha256);
      if (!file) throw new Error("PDT_IPT_V2_STAGED_ASSET_MISSING");
      assetReceipts.push(
        await uploadAsset(
          asset,
          file,
          draftListingId,
          token,
          repository,
          now(),
          countedFetch
        )
      );
    }

    const verified = await verifyFinalPersistence(
      countedFetch,
      token,
      draftListingId
    );
    const done = await recordOperationResult(
      repository,
      PDT_IPT_001_V2_OPERATION_ID,
      parentRequestHash,
      "SUCCEEDED",
      now(),
      {
        receipt: {
          authorizationId: PDT_IPT_001_V2_DRAFT.authorizationId,
          authorizationText: PDT_IPT_001_V2_AUTHORIZATION_TEXT,
          candidateId: PDT_IPT_001_V2_DRAFT.candidateId,
          candidateFingerprint: PDT_IPT_001_V2_CANDIDATE_FINGERPRINT,
          listingFingerprint: PDT_IPT_001_V2_LISTING_FINGERPRINT,
          protectedStateFingerprint,
          productionCommit,
          deploymentCommit,
          draftListingId,
          assetReceiptCount: assetReceipts.length,
          verified,
          publishPerformed: false,
          ETSY_WRITE_COUNT: writeAttempts
        }
      }
    );

    return NextResponse.json({
      status: "DRAFT_CREATED_AND_PERSISTENCE_VERIFIED",
      mode: "POST_RESET_V2_DRAFT_ONLY",
      operationId: done.operationId,
      requestHash: done.requestHash,
      draftListingId,
      candidateId: PDT_IPT_001_V2_DRAFT.candidateId,
      candidateFingerprint: PDT_IPT_001_V2_CANDIDATE_FINGERPRINT,
      listingFingerprint: PDT_IPT_001_V2_LISTING_FINGERPRINT,
      imageCount: PDT_IPT_001_V2_GALLERY.length,
      buyerFileCount: PDT_IPT_001_V2_BUYER_FILES.length,
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
          PDT_IPT_001_V2_OPERATION_ID,
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
        operationId: PDT_IPT_001_V2_OPERATION_ID,
        publishPerformed: false,
        ETSY_WRITE_COUNT: writeAttempts
      },
      { status: errorStatus(code, parentStarted) }
    );
  }
}
