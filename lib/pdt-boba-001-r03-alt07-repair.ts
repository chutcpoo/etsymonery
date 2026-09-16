import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import {
  beginOperation,
  hashOperationRequest,
  MemoryOperationLedgerRepository,
  NeonOperationLedgerRepository,
  recordOperationResult,
  type OperationLedgerRepository
} from "./operation-ledger";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;

export const PDT_BOBA_001_R03_ALT07_REPAIR = Object.freeze({
  operation: "SET_ALT_TEXT_IMAGE_07_ONLY",
  operationId: "PDT-BOBA-001-R03-ALT07-REPAIR-001",
  productId: "PDT-BOBA-001",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4560696421",
  imageId: "8529888870",
  imageRank: 7,
  expectedWrongAltText:
    "Boba Shop Operations Toolkit overview showing the exact nine workbook tabs: Start Here, Opening, Closing, Prep Log, Cleaning, Stock & Waste, Cash & Handoff, Blank Checklist and Setup Assistant.",
  targetAltText:
    "Boba shop spreadsheet and printable formats showing a real editable Excel workbook preview beside the A4 printable PDF cover, with US Letter PDF also included.",
  scope: "ALT_TEXT_IMAGE_07_ONLY"
} as const);

type RecordValue = Record<string, unknown>;
type ReadState = {
  listing: RecordValue;
  images: RecordValue[];
  files: RecordValue[];
  statuses: Record<string, number>;
};

export type PdtBoba001R03Alt07Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  now?: () => string;
};

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedResults(value: unknown) {
  return isRecord(value) && Array.isArray(value.results) ? value.results.filter(isRecord) : null;
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanHeaders(token: string) {
  const headers = etsyApiHeaders(token);
  delete headers["content-type"];
  return headers;
}

function imageIdentity(image: RecordValue) {
  return {
    listingImageId: String(image.listing_image_id ?? ""),
    rank: Number(image.rank),
    fullWidth: Number(image.full_width),
    fullHeight: Number(image.full_height),
    altText: typeof image.alt_text === "string" ? image.alt_text : ""
  };
}

function fileIdentity(file: RecordValue) {
  return {
    listingFileId: String(file.listing_file_id ?? ""),
    rank: Number(file.rank),
    filename: typeof file.filename === "string" ? file.filename : "",
    sizeBytes: Number(file.size_bytes),
    filetype: typeof file.filetype === "string" ? file.filetype : ""
  };
}

function protectedSnapshot(state: ReadState) {
  const listing = state.listing;
  const price = isRecord(listing.price) ? listing.price : {};
  return {
    shopId: String(listing.shop_id ?? ""),
    listingId: String(listing.listing_id ?? PDT_BOBA_001_R03_ALT07_REPAIR.listingId),
    state: String(listing.state ?? "").toLowerCase(),
    title: typeof listing.title === "string" ? listing.title : "",
    description: typeof listing.description === "string" ? listing.description : "",
    price: {
      amount: Number(price.amount),
      divisor: Number(price.divisor),
      currencyCode: typeof price.currency_code === "string" ? price.currency_code : ""
    },
    quantity: Number(listing.quantity),
    taxonomyId: Number(listing.taxonomy_id),
    whoMade: typeof listing.who_made === "string" ? listing.who_made : "",
    whenMade: typeof listing.when_made === "string" ? listing.when_made : "",
    listingType: String(listing.listing_type ?? listing.type ?? ""),
    tags: Array.isArray(listing.tags) ? listing.tags.map(String) : [],
    images: [...state.images].sort((a, b) => Number(a.rank) - Number(b.rank)).map(imageIdentity),
    files: [...state.files].sort((a, b) => Number(a.rank) - Number(b.rank)).map(fileIdentity)
  };
}

export function protectedStateFingerprint(state: ReadState) {
  return hashOperationRequest(protectedSnapshot(state) as unknown as Record<string, unknown>);
}

function exactTargetImage(state: ReadState) {
  if (state.images.length !== 9) return null;
  const images = [...state.images].sort((a, b) => Number(a.rank) - Number(b.rank));
  const target = images[PDT_BOBA_001_R03_ALT07_REPAIR.imageRank - 1];
  if (!target) return null;
  if (String(target.listing_image_id ?? "") !== PDT_BOBA_001_R03_ALT07_REPAIR.imageId) return null;
  if (Number(target.rank) !== PDT_BOBA_001_R03_ALT07_REPAIR.imageRank) return null;
  const altText = typeof target.alt_text === "string" ? target.alt_text : "";
  if (altText !== PDT_BOBA_001_R03_ALT07_REPAIR.expectedWrongAltText && altText !== PDT_BOBA_001_R03_ALT07_REPAIR.targetAltText) return null;
  return { target, altText };
}

function targetListingMatches(state: ReadState) {
  return String(state.listing.shop_id ?? "") === PDT_BOBA_001_R03_ALT07_REPAIR.shopId &&
    String(state.listing.state ?? "").toLowerCase() === "active" &&
    exactTargetImage(state) !== null;
}

async function readState(accessToken: string, fetchImpl: typeof fetch): Promise<ReadState> {
  const base = "https://api.etsy.com/v3/application";
  const listingId = PDT_BOBA_001_R03_ALT07_REPAIR.listingId;
  const shopId = PDT_BOBA_001_R03_ALT07_REPAIR.shopId;
  const endpoints = {
    listing: `${base}/listings/${listingId}`,
    images: `${base}/listings/${listingId}/images`,
    files: `${base}/shops/${shopId}/listings/${listingId}/files`
  };
  const entries = await Promise.all(Object.entries(endpoints).map(async ([name, url]) => {
    const response = await fetchImpl(url, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" });
    return { name, response, value: await parseJson(response) };
  }));
  const by = Object.fromEntries(entries.map((entry) => [entry.name, entry])) as Record<string, { response: Response; value: unknown }>;
  if (!by.listing.response.ok || !by.images.response.ok || !by.files.response.ok || !isRecord(by.listing.value)) {
    throw new Error("PDT_BOBA_R03_ALT07_READBACK_FAILED");
  }
  const images = normalizedResults(by.images.value);
  const files = normalizedResults(by.files.value);
  if (!images || !files) throw new Error("PDT_BOBA_R03_ALT07_READBACK_INVALID");
  return {
    listing: by.listing.value,
    images,
    files,
    statuses: Object.fromEntries(entries.map((entry) => [entry.name, entry.response.status]))
  };
}

export function exactPdtBoba001R03Alt07AuthorizationHash(authorizationId: string, protectedStateSha256: string) {
  return hashOperationRequest({
    authorizationId: authorizationId.normalize("NFC").trim(),
    operationId: PDT_BOBA_001_R03_ALT07_REPAIR.operationId,
    productId: PDT_BOBA_001_R03_ALT07_REPAIR.productId,
    listingId: PDT_BOBA_001_R03_ALT07_REPAIR.listingId,
    imageId: PDT_BOBA_001_R03_ALT07_REPAIR.imageId,
    imageRank: PDT_BOBA_001_R03_ALT07_REPAIR.imageRank,
    scope: PDT_BOBA_001_R03_ALT07_REPAIR.scope,
    targetAltText: PDT_BOBA_001_R03_ALT07_REPAIR.targetAltText,
    protectedStateFingerprint: protectedStateSha256.toLowerCase()
  });
}

export function exactPdtBoba001R03Alt07Body(authorizationId: string, protectedStateSha256: string) {
  return {
    operation: PDT_BOBA_001_R03_ALT07_REPAIR.operation,
    operationId: PDT_BOBA_001_R03_ALT07_REPAIR.operationId,
    authorizationId: authorizationId.normalize("NFC").trim(),
    productId: PDT_BOBA_001_R03_ALT07_REPAIR.productId,
    productVersion: PDT_BOBA_001_R03_ALT07_REPAIR.productVersion,
    shopId: PDT_BOBA_001_R03_ALT07_REPAIR.shopId,
    listingId: PDT_BOBA_001_R03_ALT07_REPAIR.listingId,
    imageId: PDT_BOBA_001_R03_ALT07_REPAIR.imageId,
    imageRank: PDT_BOBA_001_R03_ALT07_REPAIR.imageRank,
    scope: PDT_BOBA_001_R03_ALT07_REPAIR.scope,
    targetAltText: PDT_BOBA_001_R03_ALT07_REPAIR.targetAltText,
    protectedStateFingerprint: protectedStateSha256.toLowerCase()
  };
}

function authorizationError(request: Request) {
  if (process.env.PUBLISH_WRITES_ENABLED !== "true") {
    return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_WRITES_DISABLED", providerWriteCount: 0 }, { status: 403 });
  }
  const expected = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!expected) return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_AUTH_NOT_CONFIGURED", providerWriteCount: 0 }, { status: 503 });
  if (!supplied || !secureEqual(expected, supplied)) return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_UNAUTHORIZED", providerWriteCount: 0 }, { status: 401 });
  if ((process.env.ETSY_SHOP_ID?.trim() ?? "") !== PDT_BOBA_001_R03_ALT07_REPAIR.shopId) {
    return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_SHOP_MISMATCH", providerWriteCount: 0 }, { status: 409 });
  }
  return null;
}

export async function verifyPdtBoba001R03Alt07ProtectedState(runtime: PdtBoba001R03Alt07Runtime = {}) {
  const fetchImpl = runtime.fetchImpl ?? fetch;
  const accessToken = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
  let state: ReadState;
  try { state = await readState(accessToken, fetchImpl); }
  catch { return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_PROTECTED_STATE_READ_FAILED", ETSY_WRITE_COUNT: 0 }, { status: 502 }); }
  const target = exactTargetImage(state);
  if (!targetListingMatches(state) || !target) {
    return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_PROTECTED_STATE_MISMATCH", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  }
  return NextResponse.json({
    status: "PROTECTED_STATE_MATCH",
    operationId: PDT_BOBA_001_R03_ALT07_REPAIR.operationId,
    listingId: PDT_BOBA_001_R03_ALT07_REPAIR.listingId,
    imageId: PDT_BOBA_001_R03_ALT07_REPAIR.imageId,
    imageRank: PDT_BOBA_001_R03_ALT07_REPAIR.imageRank,
    currentAltText: target.altText,
    targetAltText: PDT_BOBA_001_R03_ALT07_REPAIR.targetAltText,
    protectedStateFingerprint: protectedStateFingerprint(state),
    alreadyRepaired: target.altText === PDT_BOBA_001_R03_ALT07_REPAIR.targetAltText,
    ETSY_WRITE_COUNT: 0,
    readBackStatus: state.statuses
  });
}

export async function handlePdtBoba001R03Alt07Repair(
  authorizationId: string,
  protectedStateSha256: string,
  authorizationRequestHash: string,
  request: Request,
  runtime: PdtBoba001R03Alt07Runtime = {}
) {
  const auth = authorizationError(request);
  if (auth) return auth;
  const authorization = authorizationId.normalize("NFC").trim();
  const protectedSha = protectedStateSha256.toLowerCase().trim();
  const requestHash = authorizationRequestHash.toLowerCase().trim();
  if (!authorization || !SHA256.test(protectedSha) || !SHA256.test(requestHash)) {
    return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_EXACT_AUTHORIZATION_BINDING_REQUIRED", providerWriteCount: 0 }, { status: 409 });
  }
  const expectedAuthorizationHash = exactPdtBoba001R03Alt07AuthorizationHash(authorization, protectedSha);
  if (!secureEqual(expectedAuthorizationHash, requestHash)) {
    return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_AUTHORIZATION_REQUEST_HASH_MISMATCH", providerWriteCount: 0 }, { status: 409 });
  }

  const body = exactPdtBoba001R03Alt07Body(authorization, protectedSha);
  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  const existing = await repository.load(PDT_BOBA_001_R03_ALT07_REPAIR.operationId);
  const exactRequestHash = hashOperationRequest(body);
  if (existing) {
    if (existing.requestHash !== exactRequestHash) return NextResponse.json({ error: "OPERATION_ID_PAYLOAD_MISMATCH", providerWriteCount: 0 }, { status: 409 });
    if (existing.status === "SUCCEEDED") return NextResponse.json({ status: "REPLAY", mode: "WRITE_ONCE", operationId: existing.operationId, requestHash: existing.requestHash, ledgerStatus: existing.status, providerWriteCount: 0, receipt: existing.receipt });
    return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_ALREADY_CLAIMED", ledgerStatus: existing.status, providerWriteCount: 0 }, { status: 409 });
  }

  const fetchImpl = runtime.fetchImpl ?? fetch;
  const accessToken = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
  let before: ReadState;
  try { before = await readState(accessToken, fetchImpl); }
  catch { return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_PREREAD_FAILED", providerWriteCount: 0 }, { status: 502 }); }
  const targetBefore = exactTargetImage(before);
  if (!targetListingMatches(before) || !targetBefore) {
    return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_PREIDENTITY_MISMATCH", providerWriteCount: 0 }, { status: 409 });
  }
  const freshProtectedFingerprint = protectedStateFingerprint(before);
  if (!secureEqual(freshProtectedFingerprint, protectedSha)) {
    return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_PROTECTED_STATE_MISMATCH", actualProtectedStateFingerprint: freshProtectedFingerprint, providerWriteCount: 0 }, { status: 409 });
  }
  if (targetBefore.altText === PDT_BOBA_001_R03_ALT07_REPAIR.targetAltText) {
    const now = runtime.now?.() ?? new Date().toISOString();
    const begun = await beginOperation(repository, PDT_BOBA_001_R03_ALT07_REPAIR.operationId, body, now);
    const done = await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "SUCCEEDED", now, {
      receipt: { providerWriteCount: 0, authorizationId: authorization, authorizationState: "CONSUMED", reconciled: true, imageId: PDT_BOBA_001_R03_ALT07_REPAIR.imageId, altText: PDT_BOBA_001_R03_ALT07_REPAIR.targetAltText }
    });
    return NextResponse.json({ status: "RECONCILED", mode: "WRITE_ONCE", operationId: done.operationId, requestHash: done.requestHash, ledgerStatus: done.status, providerWriteCount: 0, receipt: done.receipt });
  }

  const now = runtime.now?.() ?? new Date().toISOString();
  let begun: Awaited<ReturnType<typeof beginOperation>>;
  try { begun = await beginOperation(repository, PDT_BOBA_001_R03_ALT07_REPAIR.operationId, body, now); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "OPERATION_LEDGER_ERROR", providerWriteCount: 0 }, { status: 409 }); }
  if (begun.status === "REPLAY") return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_ALREADY_CLAIMED", providerWriteCount: 0 }, { status: 409 });

  const url = `https://api.etsy.com/v3/application/shops/${PDT_BOBA_001_R03_ALT07_REPAIR.shopId}/listings/${PDT_BOBA_001_R03_ALT07_REPAIR.listingId}/images`;
  const form = new FormData();
  form.append("listing_image_id", PDT_BOBA_001_R03_ALT07_REPAIR.imageId);
  form.append("rank", String(PDT_BOBA_001_R03_ALT07_REPAIR.imageRank));
  form.append("overwrite", "true");
  form.append("alt_text", PDT_BOBA_001_R03_ALT07_REPAIR.targetAltText);

  let providerWriteCount = 1;
  let writeResponse: Response;
  try {
    writeResponse = await fetchImpl(url, { method: "POST", headers: cleanHeaders(accessToken), body: form, cache: "no-store" });
  } catch {
    await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "ALT07_WRITE_AMBIGUOUS", receipt: { providerWriteCount } });
    return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_WRITE_AMBIGUOUS_DO_NOT_RETRY", providerWriteCount }, { status: 202 });
  }
  const writeValue = await parseJson(writeResponse);
  if (!writeResponse.ok) {
    const ledgerStatus = writeResponse.status >= 500 ? "RECONCILIATION_REQUIRED" : "FAILED";
    await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, ledgerStatus, runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "ALT07_WRITE_REJECTED", receipt: { providerWriteCount, statusCode: writeResponse.status } });
    return NextResponse.json({ error: ledgerStatus === "RECONCILIATION_REQUIRED" ? "PDT_BOBA_R03_ALT07_WRITE_AMBIGUOUS_DO_NOT_RETRY" : "PDT_BOBA_R03_ALT07_WRITE_REJECTED", statusCode: writeResponse.status, providerWriteCount }, { status: ledgerStatus === "RECONCILIATION_REQUIRED" ? 202 : 502 });
  }
  if (!isRecord(writeValue) || String(writeValue.listing_image_id ?? "") !== PDT_BOBA_001_R03_ALT07_REPAIR.imageId) {
    await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "ALT07_WRITE_RECEIPT_MISMATCH", receipt: { providerWriteCount } });
    return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_WRITE_RECEIPT_AMBIGUOUS_DO_NOT_RETRY", providerWriteCount }, { status: 202 });
  }

  let after: ReadState;
  try { after = await readState(accessToken, fetchImpl); }
  catch {
    await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "ALT07_FINAL_READBACK_FAILED", receipt: { providerWriteCount } });
    return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_FINAL_READBACK_FAILED_DO_NOT_RETRY", providerWriteCount }, { status: 202 });
  }

  const beforeSnapshot = protectedSnapshot(before);
  const afterSnapshot = protectedSnapshot(after);
  const beforeImages = beforeSnapshot.images.map((image) => ({ ...image, altText: image.listingImageId === PDT_BOBA_001_R03_ALT07_REPAIR.imageId ? PDT_BOBA_001_R03_ALT07_REPAIR.targetAltText : image.altText }));
  const expectedAfter = { ...beforeSnapshot, images: beforeImages };
  if (hashOperationRequest(expectedAfter as unknown as Record<string, unknown>) !== hashOperationRequest(afterSnapshot as unknown as Record<string, unknown>)) {
    await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), { recoveryPoint: "ALT07_FINAL_READBACK_MISMATCH", receipt: { providerWriteCount, readBackStatus: after.statuses } });
    return NextResponse.json({ error: "PDT_BOBA_R03_ALT07_FINAL_READBACK_MISMATCH_DO_NOT_RETRY", providerWriteCount }, { status: 202 });
  }

  const done = await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "SUCCEEDED", runtime.now?.() ?? new Date().toISOString(), {
    receipt: {
      providerWriteCount,
      authorizationId: authorization,
      authorizationState: "CONSUMED",
      productId: PDT_BOBA_001_R03_ALT07_REPAIR.productId,
      listingId: PDT_BOBA_001_R03_ALT07_REPAIR.listingId,
      imageId: PDT_BOBA_001_R03_ALT07_REPAIR.imageId,
      imageRank: PDT_BOBA_001_R03_ALT07_REPAIR.imageRank,
      scope: PDT_BOBA_001_R03_ALT07_REPAIR.scope,
      altText: PDT_BOBA_001_R03_ALT07_REPAIR.targetAltText,
      verified: { alt07: "PASS", allOtherImageMetadata: "PRESERVED", listingMetadata: "PRESERVED", buyerFiles: "PRESERVED" },
      readBackStatus: after.statuses
    }
  });
  return NextResponse.json({ status: "UPDATED_AND_VERIFIED", mode: "WRITE_ONCE", operationId: done.operationId, requestHash: done.requestHash, ledgerStatus: done.status, providerWriteCount, receipt: done.receipt });
}

export { MemoryOperationLedgerRepository };
