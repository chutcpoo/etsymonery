import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import {
  hashOperationRequest,
  beginOperation,
  NeonOperationLedgerRepository,
  recordOperationResult,
  type OperationLedgerRepository
} from "./operation-ledger";
import {
  verifyEtsyReadBackIdentity,
  type EtsyReadBackObservation
} from "./etsy-readback-normalizer";
import {
  PDT_IPT_001_R04_DRAFT,
  PDT_IPT_001_R04_LISTING_FINGERPRINT
} from "./pdt-ipt-001-r04-draft";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const AUTHORIZATION_ID =
  /^PDT-IPT-001-R04-DRAFT-RECOVERY-R01-AUTH-20260919-[0-9]{2}$/;

const PARENT_OPERATION_ID = "PDT-IPT-001-R04-DRAFT-001";
const PARENT_REQUEST_HASH =
  "c42321fa9e1add9f2325ed5b48e3eaacea6bfe2db47f563a58ebe2925e29c646";
const PARENT_RECOVERY_POINT = "PDT_IPT_R04_FINAL_SKU_MISMATCH";
const FAILED_AUTHORIZATION_ID =
  "PDT-IPT-001-R04-DRAFT-AUTH-20260919-01";
const TARGET_LISTING_ID = 4578391569;
const RECOVERY_SCOPE_SHA256 =
  "78c4cbaa56d05599e5222bf2262e276535e278dc8ad62442ca4920c0bd68651b";

type Rec = Record<string, unknown>;
type Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  now?: () => string;
};

type InventoryState = {
  direct: Rec;
  batch: Rec;
  directSku: string;
  batchSku: string;
  productId: string;
};

type RecoveryState = {
  listing: Rec;
  images: Rec[];
  files: Rec[];
  videos: Rec[];
  inventory: InventoryState;
  draftTitleCollisionIds: number[];
};

export const PDT_IPT_001_R04_DRAFT_RECOVERY_R01 = Object.freeze({
  operation: "REPAIR_EXISTING_DRAFT_SKU_ONLY",
  operationId: "PDT-IPT-001-R04-DRAFT-RECOVERY-R01-001",
  recoveryId: "PDT-IPT-001-R04-DRAFT-RECOVERY-R01",
  parentOperationId: PARENT_OPERATION_ID,
  failedAuthorizationId: FAILED_AUTHORIZATION_ID,
  productId: PDT_IPT_001_R04_DRAFT.productId,
  productVersion: PDT_IPT_001_R04_DRAFT.productVersion,
  shopId: PDT_IPT_001_R04_DRAFT.shopId,
  listingId: TARGET_LISTING_ID,
  candidateId: PDT_IPT_001_R04_DRAFT.candidateId,
  candidateFingerprint: PDT_IPT_001_R04_DRAFT.candidateFingerprint,
  listingFingerprint: PDT_IPT_001_R04_LISTING_FINGERPRINT,
  recoveryScopeSha256: RECOVERY_SCOPE_SHA256,
  requiredSku: PDT_IPT_001_R04_DRAFT.sku,
  scope: "EXISTING_DRAFT_INVENTORY_SKU_ONLY",
  publishAuthorized: false
} as const);

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function results(value: unknown) {
  return isRec(value) && Array.isArray(value.results)
    ? value.results.filter(isRec)
    : null;
}

async function json(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function positiveId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && /^[1-9]\d*$/.test(value.trim())) {
    return value.trim();
  }
  return "";
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function observation(value: Rec): EtsyReadBackObservation {
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

function moneyDecimal(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (isRec(value)) {
    const amount = Number(value.amount);
    const divisor = Number(value.divisor);
    if (Number.isFinite(amount) && Number.isFinite(divisor) && divisor > 0) {
      return amount / divisor;
    }
  }
  throw new Error("PDT_IPT_R04_RECOVERY_R01_PRICE_INVALID");
}

function arrayOrEmpty(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function currentCommit() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? "";
}

function configuredForWrites() {
  return (
    process.env.PUBLISH_WRITES_ENABLED === "true" &&
    process.env.ETSY_DRAFT_WRITES_ENABLED === "true"
  );
}

function authError(request: Request) {
  const expected = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!expected) {
    return NextResponse.json(
      { error: "PDT_IPT_R04_RECOVERY_R01_WRITE_TOKEN_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0 },
      { status: 503 }
    );
  }
  if (!supplied || !secureEqual(supplied, expected)) {
    return NextResponse.json(
      { error: "PDT_IPT_R04_RECOVERY_R01_UNAUTHORIZED", ETSY_WRITE_COUNT: 0 },
      { status: 401 }
    );
  }
  return null;
}

async function readInventoryDirect(
  fetchImpl: typeof fetch,
  token: string
) {
  const response = await fetchImpl(
    `https://api.etsy.com/v3/application/listings/${TARGET_LISTING_ID}/inventory`,
    { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" }
  );
  const value = await json(response);
  if (!response.ok || !isRec(value)) {
    throw new Error(`PDT_IPT_R04_RECOVERY_R01_INVENTORY_DIRECT_READ_FAILED:${response.status}`);
  }
  return value;
}

async function readInventoryBatch(
  fetchImpl: typeof fetch,
  token: string
) {
  const response = await fetchImpl(
    `https://api.etsy.com/v3/application/listings/batch/inventory?listing_ids=${TARGET_LISTING_ID}`,
    { method: "GET", headers: etsyApiHeaders(token), cache: "no-store" }
  );
  const value = await json(response);
  const rows = results(value);
  if (!response.ok || !rows || rows.length !== 1) {
    throw new Error(`PDT_IPT_R04_RECOVERY_R01_INVENTORY_BATCH_READ_FAILED:${response.status}`);
  }
  const row = rows[0];
  if (Number(row.listing_id) !== TARGET_LISTING_ID || !isRec(row.inventory)) {
    throw new Error("PDT_IPT_R04_RECOVERY_R01_INVENTORY_BATCH_IDENTITY_MISMATCH");
  }
  return row.inventory;
}

function inventorySku(inventory: Rec) {
  const products = arrayOrEmpty(inventory.products).filter(isRec);
  if (products.length !== 1) {
    throw new Error("PDT_IPT_R04_RECOVERY_R01_SINGLE_PRODUCT_EXPECTED");
  }
  return {
    sku: typeof products[0].sku === "string" ? products[0].sku.trim() : "",
    productId: positiveId(products[0].product_id)
  };
}

async function readRecoveryState(fetchImpl: typeof fetch, token: string): Promise<RecoveryState> {
  const base = "https://api.etsy.com/v3/application";
  const [listingResponse, imagesResponse, filesResponse, videosResponse, direct, batch, draftsResponse] =
    await Promise.all([
      fetchImpl(`${base}/listings/${TARGET_LISTING_ID}`, {
        method: "GET",
        headers: etsyApiHeaders(token),
        cache: "no-store"
      }),
      fetchImpl(`${base}/listings/${TARGET_LISTING_ID}/images`, {
        method: "GET",
        headers: etsyApiHeaders(token),
        cache: "no-store"
      }),
      fetchImpl(`${base}/shops/${PDT_IPT_001_R04_DRAFT.shopId}/listings/${TARGET_LISTING_ID}/files`, {
        method: "GET",
        headers: etsyApiHeaders(token),
        cache: "no-store"
      }),
      fetchImpl(`${base}/listings/${TARGET_LISTING_ID}/videos`, {
        method: "GET",
        headers: etsyApiHeaders(token),
        cache: "no-store"
      }),
      readInventoryDirect(fetchImpl, token),
      readInventoryBatch(fetchImpl, token),
      fetchImpl(`${base}/shops/${PDT_IPT_001_R04_DRAFT.shopId}/listings?state=draft&limit=100`, {
        method: "GET",
        headers: etsyApiHeaders(token),
        cache: "no-store"
      })
    ]);

  const listing = await json(listingResponse);
  const images = results(await json(imagesResponse));
  const files = results(await json(filesResponse));
  const videos = results(await json(videosResponse));
  const drafts = results(await json(draftsResponse));

  if (!listingResponse.ok || !isRec(listing)) {
    throw new Error("PDT_IPT_R04_RECOVERY_R01_LISTING_READ_FAILED");
  }
  if (!imagesResponse.ok || !images) {
    throw new Error("PDT_IPT_R04_RECOVERY_R01_IMAGES_READ_FAILED");
  }
  if (!filesResponse.ok || !files) {
    throw new Error("PDT_IPT_R04_RECOVERY_R01_FILES_READ_FAILED");
  }
  if (!videosResponse.ok || !videos) {
    throw new Error("PDT_IPT_R04_RECOVERY_R01_VIDEOS_READ_FAILED");
  }
  if (!draftsResponse.ok || !drafts) {
    throw new Error("PDT_IPT_R04_RECOVERY_R01_DRAFT_LIST_READ_FAILED");
  }

  const directSku = inventorySku(direct);
  const batchSku = inventorySku(batch);
  const title = PDT_IPT_001_R04_DRAFT.title.normalize("NFC").trim();
  const draftTitleCollisionIds = drafts
    .filter((row) => String(row.title ?? "").normalize("NFC").trim() === title)
    .map((row) => Number(row.listing_id))
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .sort((a, b) => a - b);

  return {
    listing,
    images,
    files,
    videos,
    inventory: {
      direct,
      batch,
      directSku: directSku.sku,
      batchSku: batchSku.sku,
      productId: directSku.productId || batchSku.productId
    },
    draftTitleCollisionIds
  };
}

function orderedImages(state: RecoveryState) {
  return [...state.images].sort((a, b) => Number(a.rank) - Number(b.rank));
}

function exactPackageMatches(state: RecoveryState, requiredSku: string) {
  const listingIdentity = verifyEtsyReadBackIdentity(
    PDT_IPT_001_R04_LISTING_FINGERPRINT,
    observation(state.listing)
  );
  if (
    listingIdentity.status !== "MATCH" ||
    Number(state.listing.listing_id) !== TARGET_LISTING_ID ||
    Number(state.listing.shop_id) !== Number(PDT_IPT_001_R04_DRAFT.shopId) ||
    state.listing.state !== "draft" ||
    state.listing.is_supply !== false ||
    state.listing.should_auto_renew !== true
  ) {
    return false;
  }

  const images = orderedImages(state);
  if (images.length !== PDT_IPT_001_R04_DRAFT.gallery.length) return false;
  for (let index = 0; index < PDT_IPT_001_R04_DRAFT.gallery.length; index += 1) {
    const expected = PDT_IPT_001_R04_DRAFT.gallery[index];
    const actual = images[index];
    if (
      Number(actual.rank) !== expected.rank ||
      String(actual.alt_text ?? "").normalize("NFC").trim() !== expected.altText
    ) {
      return false;
    }
  }

  if (
    state.files.length !== 1 ||
    String(state.files[0].filename ?? "").normalize("NFC").trim() !==
      PDT_IPT_001_R04_DRAFT.buyerFile.fileName ||
    Number(state.files[0].size_bytes) !== PDT_IPT_001_R04_DRAFT.buyerFile.sizeBytes
  ) {
    return false;
  }

  if (
    state.videos.length !== 1 ||
    Number(state.videos[0].width) !== PDT_IPT_001_R04_DRAFT.video.width ||
    Number(state.videos[0].height) !== PDT_IPT_001_R04_DRAFT.video.height
  ) {
    return false;
  }

  if (
    state.draftTitleCollisionIds.length !== 1 ||
    state.draftTitleCollisionIds[0] !== TARGET_LISTING_ID
  ) {
    return false;
  }

  return (
    state.inventory.directSku === requiredSku &&
    state.inventory.batchSku === requiredSku
  );
}

function protectedSnapshot(state: RecoveryState, parentStatus: string, parentRecoveryPoint: string | null) {
  const identity = verifyEtsyReadBackIdentity(
    PDT_IPT_001_R04_LISTING_FINGERPRINT,
    observation(state.listing)
  );
  const directProducts = arrayOrEmpty(state.inventory.direct.products).filter(isRec);
  const product = directProducts[0] ?? {};
  const offerings = arrayOrEmpty(product.offerings).filter(isRec);
  const offering = offerings[0] ?? {};
  return {
    operationId: PDT_IPT_001_R04_DRAFT_RECOVERY_R01.operationId,
    recoveryId: PDT_IPT_001_R04_DRAFT_RECOVERY_R01.recoveryId,
    recoveryScopeSha256: RECOVERY_SCOPE_SHA256,
    parentOperationId: PARENT_OPERATION_ID,
    parentRequestHash: PARENT_REQUEST_HASH,
    parentStatus,
    parentRecoveryPoint,
    listingId: TARGET_LISTING_ID,
    candidateFingerprint: PDT_IPT_001_R04_DRAFT.candidateFingerprint,
    listingFingerprint: identity.actualFingerprint,
    listingState: String(state.listing.state ?? ""),
    title: String(state.listing.title ?? "").normalize("NFC").trim(),
    quantity: Number(state.listing.quantity),
    shouldAutoRenew: state.listing.should_auto_renew,
    gallery: orderedImages(state).map((row) => ({
      id: Number(row.listing_image_id),
      rank: Number(row.rank),
      altText: String(row.alt_text ?? "").normalize("NFC").trim()
    })),
    files: state.files.map((row) => ({
      id: Number(row.listing_file_id),
      rank: Number(row.rank),
      filename: String(row.filename ?? "").normalize("NFC").trim(),
      sizeBytes: Number(row.size_bytes)
    })),
    videos: state.videos.map((row) => ({
      id: Number(row.video_id),
      width: Number(row.width),
      height: Number(row.height),
      state: String(row.video_state ?? "")
    })),
    inventory: {
      productId: state.inventory.productId,
      directSku: state.inventory.directSku,
      batchSku: state.inventory.batchSku,
      propertyValueCount: arrayOrEmpty(product.property_values).length,
      offeringCount: offerings.length,
      offering: {
        price: moneyDecimal(offering.price),
        quantity: Number(offering.quantity),
        isEnabled: offering.is_enabled !== false,
        readinessStateId: Number(offering.readiness_state_id) || null
      },
      priceOnProperty: arrayOrEmpty(state.inventory.direct.price_on_property),
      quantityOnProperty: arrayOrEmpty(state.inventory.direct.quantity_on_property),
      skuOnProperty: arrayOrEmpty(state.inventory.direct.sku_on_property),
      readinessStateOnProperty: arrayOrEmpty(state.inventory.direct.readiness_state_on_property)
    },
    draftTitleCollisionIds: state.draftTitleCollisionIds
  };
}

async function parentRecoveryMatches(repository: OperationLedgerRepository) {
  const parent = await repository.load(PARENT_OPERATION_ID);
  return Boolean(
    parent &&
      parent.requestHash === PARENT_REQUEST_HASH &&
      parent.status === "RECONCILIATION_REQUIRED" &&
      parent.recoveryPoint === PARENT_RECOVERY_POINT
  );
}

function exactBeforeMatches(state: RecoveryState) {
  const directProducts = arrayOrEmpty(state.inventory.direct.products).filter(isRec);
  if (directProducts.length !== 1) return false;
  const product = directProducts[0];
  const propertyValues = arrayOrEmpty(product.property_values);
  const offerings = arrayOrEmpty(product.offerings).filter(isRec);
  if (propertyValues.length !== 0 || offerings.length !== 1) return false;
  const offering = offerings[0];
  let price = Number.NaN;
  try {
    price = moneyDecimal(offering.price);
  } catch {
    return false;
  }
  return (
    exactPackageMatches(
      {
        ...state,
        inventory: { ...state.inventory, directSku: "", batchSku: "" }
      },
      ""
    ) &&
    state.inventory.directSku === "" &&
    state.inventory.batchSku === "" &&
    Number(offering.quantity) === PDT_IPT_001_R04_DRAFT.quantity &&
    Math.abs(price - PDT_IPT_001_R04_DRAFT.priceUsd) <= 0.005
  );
}

export async function verifyPdtIpt001R04RecoveryR01ProtectedState(
  runtime: Runtime = {}
) {
  try {
    const repository = runtime.repository ?? new NeonOperationLedgerRepository();
    if (!(await parentRecoveryMatches(repository))) {
      return NextResponse.json(
        {
          status: "PROTECTED_STATE_MISMATCH",
          reason: "PARENT_RECONCILIATION_MISMATCH",
          operationId: PDT_IPT_001_R04_DRAFT_RECOVERY_R01.operationId,
          ETSY_WRITE_COUNT: 0
        },
        { status: 409 }
      );
    }

    const fetchImpl = runtime.fetchImpl ?? fetch;
    const token = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
    const state = await readRecoveryState(fetchImpl, token);
    const parent = await repository.load(PARENT_OPERATION_ID);
    const snapshot = protectedSnapshot(
      state,
      parent?.status ?? "",
      parent?.recoveryPoint ?? null
    );
    const fingerprint = hashOperationRequest(snapshot);
    const match = exactBeforeMatches(state);

    return NextResponse.json(
      {
        status: match ? "PROTECTED_STATE_MATCH" : "PROTECTED_STATE_MISMATCH",
        operationId: PDT_IPT_001_R04_DRAFT_RECOVERY_R01.operationId,
        recoveryId: PDT_IPT_001_R04_DRAFT_RECOVERY_R01.recoveryId,
        listingId: TARGET_LISTING_ID,
        candidateFingerprint: PDT_IPT_001_R04_DRAFT.candidateFingerprint,
        listingFingerprint: PDT_IPT_001_R04_LISTING_FINGERPRINT,
        recoveryScopeSha256: RECOVERY_SCOPE_SHA256,
        protectedStateFingerprint: fingerprint,
        currentSkuDirect: state.inventory.directSku,
        currentSkuBatch: state.inventory.batchSku,
        requiredSku: PDT_IPT_001_R04_DRAFT.sku,
        publishAuthorized: false,
        ETSY_WRITE_COUNT: 0
      },
      { status: match ? 200 : 409 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "PROTECTED_STATE_BLOCKED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        operationId: PDT_IPT_001_R04_DRAFT_RECOVERY_R01.operationId,
        ETSY_WRITE_COUNT: 0
      },
      { status: 409 }
    );
  }
}

export function exactPdtIpt001R04RecoveryR01Body(
  authorizationId: string,
  protectedStateFingerprint: string,
  productionCommit: string
) {
  return {
    operation: PDT_IPT_001_R04_DRAFT_RECOVERY_R01.operation,
    operationId: PDT_IPT_001_R04_DRAFT_RECOVERY_R01.operationId,
    recoveryId: PDT_IPT_001_R04_DRAFT_RECOVERY_R01.recoveryId,
    authorizationId: authorizationId.normalize("NFC").trim(),
    parentOperationId: PARENT_OPERATION_ID,
    failedAuthorizationId: FAILED_AUTHORIZATION_ID,
    recoveryScopeSha256: RECOVERY_SCOPE_SHA256,
    protectedStateFingerprint: protectedStateFingerprint.trim().toLowerCase(),
    productionCommit: productionCommit.trim().toLowerCase(),
    productId: PDT_IPT_001_R04_DRAFT.productId,
    productVersion: PDT_IPT_001_R04_DRAFT.productVersion,
    shopId: PDT_IPT_001_R04_DRAFT.shopId,
    listingId: String(TARGET_LISTING_ID),
    candidateId: PDT_IPT_001_R04_DRAFT.candidateId,
    candidateFingerprint: PDT_IPT_001_R04_DRAFT.candidateFingerprint,
    listingFingerprint: PDT_IPT_001_R04_LISTING_FINGERPRINT,
    scope: PDT_IPT_001_R04_DRAFT_RECOVERY_R01.scope,
    requiredSku: PDT_IPT_001_R04_DRAFT.sku,
    createDraftAllowed: false,
    otherFieldMutationAllowed: false,
    publishAuthorized: false
  };
}

export function pdtIpt001R04RecoveryR01AuthorizationRequestHash(
  authorizationId: string,
  protectedStateFingerprint: string,
  productionCommit: string
) {
  return hashOperationRequest(
    exactPdtIpt001R04RecoveryR01Body(
      authorizationId,
      protectedStateFingerprint,
      productionCommit
    )
  );
}

function buildSkuOnlyInventoryBody(inventory: Rec) {
  const products = arrayOrEmpty(inventory.products).filter(isRec);
  if (products.length !== 1) {
    throw new Error("PDT_IPT_R04_RECOVERY_R01_SINGLE_PRODUCT_EXPECTED");
  }
  const product = products[0];
  const propertyValues = arrayOrEmpty(product.property_values);
  const offerings = arrayOrEmpty(product.offerings).filter(isRec);
  if (propertyValues.length !== 0) {
    throw new Error("PDT_IPT_R04_RECOVERY_R01_UNEXPECTED_VARIATIONS");
  }
  if (offerings.length !== 1) {
    throw new Error("PDT_IPT_R04_RECOVERY_R01_SINGLE_OFFERING_EXPECTED");
  }
  const offering = offerings[0];
  const price = moneyDecimal(offering.price);
  const quantity = Number(offering.quantity);
  if (
    quantity !== PDT_IPT_001_R04_DRAFT.quantity ||
    Math.abs(price - PDT_IPT_001_R04_DRAFT.priceUsd) > 0.005
  ) {
    throw new Error("PDT_IPT_R04_RECOVERY_R01_INVENTORY_BASELINE_MISMATCH");
  }
  return {
    products: [
      {
        sku: PDT_IPT_001_R04_DRAFT.sku,
        property_values: [],
        offerings: [
          {
            price,
            quantity,
            is_enabled: offering.is_enabled !== false,
            ...(Number.isSafeInteger(Number(offering.readiness_state_id)) &&
            Number(offering.readiness_state_id) > 0
              ? { readiness_state_id: Number(offering.readiness_state_id) }
              : {})
          }
        ]
      }
    ],
    price_on_property: arrayOrEmpty(inventory.price_on_property),
    quantity_on_property: arrayOrEmpty(inventory.quantity_on_property),
    sku_on_property: arrayOrEmpty(inventory.sku_on_property),
    readiness_state_on_property: arrayOrEmpty(inventory.readiness_state_on_property)
  };
}

function errorStatus(code: string) {
  if (code.includes("UNAUTHORIZED")) return 401;
  if (code.includes("NOT_CONFIGURED")) return 503;
  if (code.includes("RECONCILIATION_REQUIRED")) return 202;
  return 409;
}

export async function handlePdtIpt001R04RecoveryR01(
  body: ReturnType<typeof exactPdtIpt001R04RecoveryR01Body>,
  authorizationRequestHash: string,
  request: Request,
  runtime: Runtime = {}
) {
  const writeAuth = authError(request);
  if (writeAuth) return writeAuth;

  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  try {
    if (!configuredForWrites()) {
      throw new Error("PDT_IPT_R04_RECOVERY_R01_WRITES_DISABLED");
    }
    if (process.env.ETSY_SHOP_ID?.trim() !== PDT_IPT_001_R04_DRAFT.shopId) {
      throw new Error("PDT_IPT_R04_RECOVERY_R01_SHOP_ID_MISMATCH");
    }
    if (!AUTHORIZATION_ID.test(body.authorizationId)) {
      throw new Error("PDT_IPT_R04_RECOVERY_R01_AUTHORIZATION_ID_INVALID");
    }
    if (!SHA256.test(body.protectedStateFingerprint)) {
      throw new Error("PDT_IPT_R04_RECOVERY_R01_PROTECTED_STATE_FINGERPRINT_INVALID");
    }
    if (!SHA256.test(authorizationRequestHash)) {
      throw new Error("PDT_IPT_R04_RECOVERY_R01_AUTHORIZATION_REQUEST_HASH_INVALID");
    }
    if (!COMMIT_SHA.test(body.productionCommit) || body.productionCommit !== currentCommit()) {
      throw new Error("PDT_IPT_R04_RECOVERY_R01_PRODUCTION_COMMIT_MISMATCH");
    }

    const exactBody = exactPdtIpt001R04RecoveryR01Body(
      body.authorizationId,
      body.protectedStateFingerprint,
      body.productionCommit
    );
    const requestHash = hashOperationRequest(body);
    if (
      requestHash !== hashOperationRequest(exactBody) ||
      !secureEqual(requestHash, authorizationRequestHash)
    ) {
      throw new Error("PDT_IPT_R04_RECOVERY_R01_AUTHORIZATION_CONTRACT_MISMATCH");
    }

    const existing = await repository.load(
      PDT_IPT_001_R04_DRAFT_RECOVERY_R01.operationId
    );
    if (existing?.status === "SUCCEEDED") {
      return NextResponse.json({
        status: "REPLAY",
        operationId: existing.operationId,
        requestHash: existing.requestHash,
        receipt: existing.receipt,
        publishPerformed: false,
        ETSY_WRITE_COUNT: 0
      });
    }
    if (existing) {
      throw new Error("PDT_IPT_R04_RECOVERY_R01_ALREADY_CLAIMED_DO_NOT_RETRY");
    }
    if (!(await parentRecoveryMatches(repository))) {
      throw new Error("PDT_IPT_R04_RECOVERY_R01_PARENT_RECONCILIATION_MISMATCH");
    }

    const fetchImpl = runtime.fetchImpl ?? fetch;
    const token = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
    const before = await readRecoveryState(fetchImpl, token);
    if (!exactBeforeMatches(before)) {
      throw new Error("PDT_IPT_R04_RECOVERY_R01_PRESTATE_MISMATCH");
    }
    const parent = await repository.load(PARENT_OPERATION_ID);
    const currentProtectedFingerprint = hashOperationRequest(
      protectedSnapshot(
        before,
        parent?.status ?? "",
        parent?.recoveryPoint ?? null
      )
    );
    if (!secureEqual(currentProtectedFingerprint, body.protectedStateFingerprint)) {
      throw new Error("PDT_IPT_R04_RECOVERY_R01_PROTECTED_STATE_DRIFT");
    }

    const updateBody = buildSkuOnlyInventoryBody(before.inventory.direct);
    const now = runtime.now?.() ?? new Date().toISOString();
    const begun = await beginOperation(
      repository,
      PDT_IPT_001_R04_DRAFT_RECOVERY_R01.operationId,
      body,
      now
    );
    if (begun.status !== "STARTED") {
      throw new Error("PDT_IPT_R04_RECOVERY_R01_ALREADY_CLAIMED_DO_NOT_RETRY");
    }

    let update: Response;
    try {
      update = await fetchImpl(
        `https://api.etsy.com/v3/application/listings/${TARGET_LISTING_ID}/inventory`,
        {
          method: "PUT",
          headers: {
            ...etsyApiHeaders(token),
            "content-type": "application/json"
          },
          body: JSON.stringify(updateBody),
          cache: "no-store"
        }
      );
    } catch {
      await recordOperationResult(
        repository,
        begun.record.operationId,
        begun.record.requestHash,
        "RECONCILIATION_REQUIRED",
        runtime.now?.() ?? new Date().toISOString(),
        {
          recoveryPoint: "SKU_ONLY_WRITE_RESPONSE_AMBIGUOUS",
          receipt: {
            listingId: TARGET_LISTING_ID,
            requiredSku: PDT_IPT_001_R04_DRAFT.sku,
            publishPerformed: false,
            ETSY_WRITE_ATTEMPT_COUNT: 1,
            ETSY_WRITE_COUNT: 0,
            ETSY_WRITE_COUNT_STATUS: "UNRESOLVED_REQUIRES_RECONCILIATION"
          }
        }
      );
      throw new Error("PDT_IPT_R04_RECOVERY_R01_RECONCILIATION_REQUIRED");
    }

    if (!update.ok) {
      const ambiguous = update.status >= 500;
      await recordOperationResult(
        repository,
        begun.record.operationId,
        begun.record.requestHash,
        ambiguous ? "RECONCILIATION_REQUIRED" : "FAILED",
        runtime.now?.() ?? new Date().toISOString(),
        {
          recoveryPoint: `SKU_ONLY_WRITE_HTTP_${update.status}`,
          receipt: {
            listingId: TARGET_LISTING_ID,
            requiredSku: PDT_IPT_001_R04_DRAFT.sku,
            providerStatus: update.status,
            publishPerformed: false,
            ETSY_WRITE_ATTEMPT_COUNT: 1,
            ETSY_WRITE_COUNT: 0,
            ETSY_WRITE_COUNT_STATUS: ambiguous
              ? "UNRESOLVED_REQUIRES_RECONCILIATION"
              : "PROVIDER_REJECTED"
          }
        }
      );
      if (ambiguous) {
        throw new Error("PDT_IPT_R04_RECOVERY_R01_RECONCILIATION_REQUIRED");
      }
      throw new Error(`PDT_IPT_R04_RECOVERY_R01_WRITE_REJECTED_${update.status}`);
    }

    let after: RecoveryState;
    try {
      after = await readRecoveryState(fetchImpl, token);
    } catch {
      await recordOperationResult(
        repository,
        begun.record.operationId,
        begun.record.requestHash,
        "RECONCILIATION_REQUIRED",
        runtime.now?.() ?? new Date().toISOString(),
        {
          recoveryPoint: "SKU_ONLY_POSTWRITE_READBACK_FAILED",
          receipt: {
            listingId: TARGET_LISTING_ID,
            requiredSku: PDT_IPT_001_R04_DRAFT.sku,
            providerStatus: update.status,
            publishPerformed: false,
            ETSY_WRITE_ATTEMPT_COUNT: 1,
            ETSY_WRITE_COUNT: 0,
            ETSY_WRITE_COUNT_STATUS: "UNRESOLVED_REQUIRES_RECONCILIATION"
          }
        }
      );
      throw new Error("PDT_IPT_R04_RECOVERY_R01_RECONCILIATION_REQUIRED");
    }

    const directMatch =
      after.inventory.directSku === PDT_IPT_001_R04_DRAFT.sku;
    const batchMatch =
      after.inventory.batchSku === PDT_IPT_001_R04_DRAFT.sku;
    const packageMatch = exactPackageMatches(
      after,
      PDT_IPT_001_R04_DRAFT.sku
    );

    if (!directMatch || !batchMatch || !packageMatch) {
      const mutationConfirmed = directMatch || batchMatch;
      await recordOperationResult(
        repository,
        begun.record.operationId,
        begun.record.requestHash,
        "RECONCILIATION_REQUIRED",
        runtime.now?.() ?? new Date().toISOString(),
        {
          recoveryPoint: "SKU_ONLY_POSTWRITE_PERSISTENCE_MISMATCH",
          receipt: {
            listingId: TARGET_LISTING_ID,
            directSku: after.inventory.directSku,
            batchSku: after.inventory.batchSku,
            packageMatch,
            publishPerformed: false,
            ETSY_WRITE_ATTEMPT_COUNT: 1,
            ETSY_WRITE_COUNT: mutationConfirmed ? 1 : 0,
            ETSY_WRITE_COUNT_STATUS: mutationConfirmed
              ? "CONFIRMED"
              : "UNRESOLVED_REQUIRES_RECONCILIATION"
          }
        }
      );
      throw new Error("PDT_IPT_R04_RECOVERY_R01_RECONCILIATION_REQUIRED");
    }

    const done = await recordOperationResult(
      repository,
      begun.record.operationId,
      begun.record.requestHash,
      "SUCCEEDED",
      runtime.now?.() ?? new Date().toISOString(),
      {
        recoveryPoint: "SKU_ONLY_RECOVERY_VERIFIED",
        receipt: {
          authorizationId: body.authorizationId,
          parentOperationId: PARENT_OPERATION_ID,
          failedAuthorizationId: FAILED_AUTHORIZATION_ID,
          recoveryScopeSha256: RECOVERY_SCOPE_SHA256,
          listingId: TARGET_LISTING_ID,
          candidateFingerprint: PDT_IPT_001_R04_DRAFT.candidateFingerprint,
          listingFingerprint: PDT_IPT_001_R04_LISTING_FINGERPRINT,
          protectedStateFingerprint: body.protectedStateFingerprint,
          productionCommit: body.productionCommit,
          requiredSku: PDT_IPT_001_R04_DRAFT.sku,
          directSku: after.inventory.directSku,
          batchSku: after.inventory.batchSku,
          providerStatus: update.status,
          publishPerformed: false,
          ETSY_WRITE_ATTEMPT_COUNT: 1,
          ETSY_WRITE_COUNT: 1,
          ETSY_WRITE_COUNT_STATUS: "CONFIRMED"
        }
      }
    );

    return NextResponse.json({
      status: "UPDATED_AND_VERIFIED",
      mode: "WRITE_ONCE_EXISTING_DRAFT_SKU_ONLY",
      operationId: done.operationId,
      requestHash: done.requestHash,
      listingId: TARGET_LISTING_ID,
      requiredSku: PDT_IPT_001_R04_DRAFT.sku,
      directSku: after.inventory.directSku,
      batchSku: after.inventory.batchSku,
      publishPerformed: false,
      ETSY_WRITE_ATTEMPT_COUNT: 1,
      ETSY_WRITE_COUNT: 1,
      ETSY_WRITE_COUNT_STATUS: "CONFIRMED"
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json(
      {
        status: code.includes("RECONCILIATION_REQUIRED")
          ? "RECONCILIATION_REQUIRED"
          : "BLOCKED_FAIL_CLOSED",
        error: code,
        operationId: PDT_IPT_001_R04_DRAFT_RECOVERY_R01.operationId,
        listingId: TARGET_LISTING_ID,
        publishPerformed: false,
        ETSY_WRITE_COUNT: 0
      },
      { status: errorStatus(code) }
    );
  }
}

export async function verifyPdtIpt001R04RecoveryR01PostRelease(
  runtime: Runtime = {}
) {
  try {
    const fetchImpl = runtime.fetchImpl ?? fetch;
    const token = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
    const state = await readRecoveryState(fetchImpl, token);
    const packageMatch = exactPackageMatches(
      state,
      PDT_IPT_001_R04_DRAFT.sku
    );
    return NextResponse.json(
      {
        status: packageMatch ? "PERSISTENCE_PASS" : "PERSISTENCE_FAIL",
        operationId: PDT_IPT_001_R04_DRAFT_RECOVERY_R01.operationId,
        listingId: TARGET_LISTING_ID,
        candidateFingerprint: PDT_IPT_001_R04_DRAFT.candidateFingerprint,
        listingFingerprint: PDT_IPT_001_R04_LISTING_FINGERPRINT,
        recoveryScopeSha256: RECOVERY_SCOPE_SHA256,
        directSku: state.inventory.directSku,
        batchSku: state.inventory.batchSku,
        requiredSku: PDT_IPT_001_R04_DRAFT.sku,
        galleryCount: state.images.length,
        buyerFileCount: state.files.length,
        videoCount: state.videos.length,
        publishPerformed: false,
        ETSY_WRITE_COUNT: 0
      },
      { status: packageMatch ? 200 : 409 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "PERSISTENCE_BLOCKED",
        error: error instanceof Error ? error.message : "UNKNOWN",
        operationId: PDT_IPT_001_R04_DRAFT_RECOVERY_R01.operationId,
        listingId: TARGET_LISTING_ID,
        publishPerformed: false,
        ETSY_WRITE_COUNT: 0
      },
      { status: 409 }
    );
  }
}
