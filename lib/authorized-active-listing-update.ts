import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { etsyApiHeaders } from "./etsy";
import {
  beginOperation,
  hashOperationRequest,
  NeonOperationLedgerRepository,
  recordOperationResult,
  type OperationLedgerRecord,
  type OperationLedgerRepository
} from "./operation-ledger";
import {
  verifyEtsyReadBackIdentity,
  type EtsyReadBackObservation
} from "./etsy-readback-normalizer";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;

export const B01_ACTIVE_UPDATE = Object.freeze({
  operation: "UPDATE_ACTIVE_LISTING",
  operationId: "B01-UPDATE-001",
  buildId: "ETSY-RESET-V1-PDT-BOBA-001-BUILD-20260906-B01",
  shopId: "23582741",
  listingId: "4560696421",
  channel: "etsy"
} as const);

type ActiveListingPatch = {
  title: string;
  description: string;
  priceUsd: number;
  tags: string[];
  quantity: number;
  whoMade: string;
  whenMade: string;
  taxonomyId: number;
};

type ActiveUpdateInput = typeof B01_ACTIVE_UPDATE & {
  buildFreezeSha256: string;
  acceptanceCriteriaSha256: string;
  candidateFingerprint: string;
  expectedBeforeListingFingerprint: string;
  expectedAfterListingFingerprint: string;
  patch: ActiveListingPatch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function bodyString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  const normalized = value.map((item) => item.normalize("NFC").trim());
  return normalized.every(Boolean) ? normalized : null;
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

function toObservation(value: Record<string, unknown>): EtsyReadBackObservation {
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

function validateWriteAuthorization(request: Request) {
  const expected = process.env.ETSY_DRAFT_WRITE_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_AUTH_NOT_CONFIGURED" }, { status: 503 });
  }
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!supplied || !secureEqual(supplied, expected)) {
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_UNAUTHORIZED" }, { status: 401 });
  }
  return null;
}

function parseInput(body: Record<string, unknown>): ActiveUpdateInput | null {
  const patch = isRecord(body.patch) ? body.patch : null;
  const tags = patch ? normalizeStringArray(patch.tags) : null;
  if (!patch || !tags) return null;

  const input = {
    operation: bodyString(body, "operation"),
    operationId: bodyString(body, "operationId"),
    buildId: bodyString(body, "buildId"),
    buildFreezeSha256: bodyString(body, "buildFreezeSha256").toLowerCase(),
    acceptanceCriteriaSha256: bodyString(body, "acceptanceCriteriaSha256").toLowerCase(),
    candidateFingerprint: bodyString(body, "candidateFingerprint").toLowerCase(),
    expectedBeforeListingFingerprint: bodyString(body, "expectedBeforeListingFingerprint").toLowerCase(),
    expectedAfterListingFingerprint: bodyString(body, "expectedAfterListingFingerprint").toLowerCase(),
    shopId: bodyString(body, "shopId"),
    listingId: bodyString(body, "listingId"),
    channel: bodyString(body, "channel"),
    patch: {
      title: typeof patch.title === "string" ? patch.title.normalize("NFC").trim() : "",
      description: typeof patch.description === "string" ? patch.description.normalize("NFC").trim() : "",
      priceUsd: typeof patch.priceUsd === "number" ? patch.priceUsd : Number.NaN,
      tags,
      quantity: typeof patch.quantity === "number" ? patch.quantity : Number.NaN,
      whoMade: typeof patch.whoMade === "string" ? patch.whoMade.normalize("NFC").trim() : "",
      whenMade: typeof patch.whenMade === "string" ? patch.whenMade.normalize("NFC").trim() : "",
      taxonomyId: typeof patch.taxonomyId === "number" ? patch.taxonomyId : Number.NaN
    }
  };

  const exactTopLevelFields = [
    "acceptanceCriteriaSha256", "buildFreezeSha256", "buildId", "candidateFingerprint",
    "channel", "expectedAfterListingFingerprint", "expectedBeforeListingFingerprint", "listingId",
    "operation", "operationId", "patch", "shopId"
  ];
  const exactPatchFields = [
    "description", "priceUsd", "quantity", "tags", "taxonomyId", "title", "whenMade", "whoMade"
  ];
  if (
    JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(exactTopLevelFields) ||
    JSON.stringify(Object.keys(patch).sort()) !== JSON.stringify(exactPatchFields)
  ) return null;

  if (
    input.operation !== B01_ACTIVE_UPDATE.operation ||
    input.operationId !== B01_ACTIVE_UPDATE.operationId ||
    input.buildId !== B01_ACTIVE_UPDATE.buildId ||
    input.shopId !== B01_ACTIVE_UPDATE.shopId ||
    input.listingId !== B01_ACTIVE_UPDATE.listingId ||
    input.channel !== B01_ACTIVE_UPDATE.channel ||
    !SHA256.test(input.buildFreezeSha256) ||
    !SHA256.test(input.acceptanceCriteriaSha256) ||
    !SHA256.test(input.candidateFingerprint) ||
    !SHA256.test(input.expectedBeforeListingFingerprint) ||
    !SHA256.test(input.expectedAfterListingFingerprint) ||
    !input.patch.title ||
    !input.patch.description ||
    typeof input.patch.priceUsd !== "number" ||
    !Number.isFinite(input.patch.priceUsd) ||
    input.patch.priceUsd < 0 ||
    !Number.isSafeInteger(input.patch.quantity) ||
    input.patch.quantity < 0 ||
    !input.patch.whoMade ||
    !input.patch.whenMade ||
    !Number.isSafeInteger(input.patch.taxonomyId) ||
    input.patch.taxonomyId <= 0
  ) return null;

  return input as ActiveUpdateInput;
}

function receipt(input: ActiveUpdateInput, updateStatusCode: number | null, readBackStatusCode: number) {
  return {
    operation: input.operation,
    operationId: input.operationId,
    buildId: input.buildId,
    buildFreezeSha256: input.buildFreezeSha256,
    acceptanceCriteriaSha256: input.acceptanceCriteriaSha256,
    candidateFingerprint: input.candidateFingerprint,
    expectedBeforeListingFingerprint: input.expectedBeforeListingFingerprint,
    expectedAfterListingFingerprint: input.expectedAfterListingFingerprint,
    actualListingFingerprint: input.expectedAfterListingFingerprint,
    shopId: input.shopId,
    listingId: input.listingId,
    channel: input.channel,
    state: "active",
    providerPatchCount: updateStatusCode === null ? 0 : 1,
    providerReceipt: { updateStatusCode, readBackStatusCode }
  };
}

function successResponse(status: "UPDATED_AND_VERIFIED" | "RECONCILED" | "REPLAY", record: OperationLedgerRecord) {
  return NextResponse.json({
    operation: B01_ACTIVE_UPDATE.operation,
    status,
    operationId: record.operationId,
    requestHash: record.requestHash,
    ledgerStatus: record.status,
    receipt: record.receipt
  });
}

export type AuthorizedActiveUpdateRuntime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  now?: () => string;
};

export async function handleAuthorizedActiveListingUpdate(
  body: Record<string, unknown>,
  request: Request,
  runtime: AuthorizedActiveUpdateRuntime = {}
) {
  if (process.env.PUBLISH_WRITES_ENABLED !== "true") {
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_WRITES_DISABLED" }, { status: 403 });
  }
  const authError = validateWriteAuthorization(request);
  if (authError) return authError;

  const input = parseInput(body);
  if (!input) {
    return NextResponse.json({ error: "B01_ACTIVE_UPDATE_AUTHORIZATION_MISMATCH" }, { status: 409 });
  }
  const configuredShopId = process.env.ETSY_SHOP_ID?.trim() ?? "";
  if (configuredShopId !== B01_ACTIVE_UPDATE.shopId) {
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_SHOP_MISMATCH" }, { status: 409 });
  }

  const authorizedRequestHash = process.env.ETSY_ACTIVE_UPDATE_B01_REQUEST_SHA256?.trim().toLowerCase() ?? "";
  if (!SHA256.test(authorizedRequestHash)) {
    return NextResponse.json({ error: "B01_ACTIVE_UPDATE_AUTH_NOT_CONFIGURED" }, { status: 503 });
  }
  const requestHash = hashOperationRequest(input);
  if (!secureEqual(requestHash, authorizedRequestHash)) {
    return NextResponse.json({ error: "B01_ACTIVE_UPDATE_REQUEST_HASH_MISMATCH" }, { status: 409 });
  }

  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  const now = runtime.now?.() ?? new Date().toISOString();
  let begun: Awaited<ReturnType<typeof beginOperation>>;
  try {
    begun = await beginOperation(repository, input.operationId, input, now);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json(
      { error: code, operationId: input.operationId },
      { status: code === "OPERATION_ID_PAYLOAD_MISMATCH" ? 409 : 500 }
    );
  }

  if (begun.status === "REPLAY" && begun.record.status === "SUCCEEDED" && begun.record.receipt) {
    return successResponse("REPLAY", begun.record);
  }

  const fetchImpl = runtime.fetchImpl ?? fetch;
  const getAccessToken = runtime.getAccessToken ?? getValidEtsyAccessToken;
  const accessToken = await getAccessToken();
  const readUrl = `https://api.etsy.com/v3/application/listings/${input.listingId}`;
  const patchUrl = `https://api.etsy.com/v3/application/shops/${input.shopId}/listings/${input.listingId}`;

  if (begun.status === "REPLAY") {
    const readBackResponse = await fetchImpl(readUrl, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" });
    const readBack = await parseJson(readBackResponse);
    if (readBackResponse.ok && isRecord(readBack) && String(readBack.state ?? "").toLowerCase() === "active") {
      const identity = verifyEtsyReadBackIdentity(input.expectedAfterListingFingerprint, { ...toObservation(readBack), state: "draft" });
      if (identity.status === "MATCH") {
        const completed = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "SUCCEEDED", now, {
          receipt: receipt(input, null, readBackResponse.status)
        });
        return successResponse("RECONCILED", completed);
      }
    }
    return NextResponse.json({
      error: "B01_ACTIVE_UPDATE_ALREADY_CLAIMED",
      operationId: input.operationId,
      requestHash: begun.record.requestHash,
      ledgerStatus: begun.record.status,
      providerPatchCount: 0
    }, { status: 409 });
  }

  const beforeResponse = await fetchImpl(readUrl, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" });
  const before = await parseJson(beforeResponse);
  if (!beforeResponse.ok || !isRecord(before)) {
    const failed = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "FAILED", now, { recoveryPoint: "PRE_READ_FAILED" });
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_PREREAD_FAILED", operationId: input.operationId, requestHash: failed.requestHash, ledgerStatus: failed.status }, { status: 502 });
  }
  if (String(before.state ?? "").toLowerCase() !== "active") {
    const failed = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "FAILED", now, { recoveryPoint: "TARGET_NOT_ACTIVE" });
    return NextResponse.json({ error: "ETSY_TARGET_NOT_ACTIVE", operationId: input.operationId, requestHash: failed.requestHash, ledgerStatus: failed.status }, { status: 409 });
  }

  const beforeObservation = { ...toObservation(before), state: "draft" };
  const alreadyApplied = verifyEtsyReadBackIdentity(input.expectedAfterListingFingerprint, beforeObservation);
  if (alreadyApplied.status === "MATCH") {
    const completed = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "SUCCEEDED", now, {
      receipt: receipt(input, null, beforeResponse.status)
    });
    return successResponse("RECONCILED", completed);
  }

  const beforeIdentity = verifyEtsyReadBackIdentity(input.expectedBeforeListingFingerprint, beforeObservation);
  if (beforeIdentity.status !== "MATCH") {
    const failed = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "FAILED", now, { recoveryPoint: "PRE_IDENTITY_MISMATCH" });
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_PREIDENTITY_MISMATCH", operationId: input.operationId, requestHash: failed.requestHash, ledgerStatus: failed.status }, { status: 409 });
  }

  const patchBody = new URLSearchParams({
    title: input.patch.title,
    description: input.patch.description,
    price: input.patch.priceUsd.toFixed(2),
    quantity: String(input.patch.quantity),
    taxonomy_id: String(input.patch.taxonomyId),
    who_made: input.patch.whoMade,
    when_made: input.patch.whenMade,
    type: "download",
    tags: input.patch.tags.join(",")
  });

  let updateResponse: Response;
  try {
    updateResponse = await fetchImpl(patchUrl, {
      method: "PATCH",
      headers: { ...etsyApiHeaders(accessToken), "content-type": "application/x-www-form-urlencoded" },
      body: patchBody,
      cache: "no-store"
    });
  } catch {
    const pending = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", now, { recoveryPoint: "POST_PATCH_READ_BACK" });
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_AMBIGUOUS", operationId: input.operationId, requestHash: pending.requestHash, ledgerStatus: pending.status, providerPatchCount: 1 }, { status: 202 });
  }
  await parseJson(updateResponse);
  if (!updateResponse.ok) {
    const failed = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "FAILED", now, { recoveryPoint: "PATCH_REJECTED" });
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_REJECTED", statusCode: updateResponse.status, operationId: input.operationId, requestHash: failed.requestHash, ledgerStatus: failed.status, providerPatchCount: 1 }, { status: 502 });
  }

  const afterResponse = await fetchImpl(readUrl, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" });
  const after = await parseJson(afterResponse);
  if (!afterResponse.ok || !isRecord(after) || String(after.state ?? "").toLowerCase() !== "active") {
    const pending = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", now, { recoveryPoint: "POST_PATCH_READ_BACK" });
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_POSTREAD_UNCONFIRMED", operationId: input.operationId, requestHash: pending.requestHash, ledgerStatus: pending.status, providerPatchCount: 1 }, { status: 202 });
  }

  const afterIdentity = verifyEtsyReadBackIdentity(input.expectedAfterListingFingerprint, { ...toObservation(after), state: "draft" });
  if (afterIdentity.status !== "MATCH") {
    const pending = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", now, { recoveryPoint: "POST_IDENTITY_MISMATCH" });
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_POSTIDENTITY_MISMATCH", operationId: input.operationId, requestHash: pending.requestHash, ledgerStatus: pending.status, providerPatchCount: 1 }, { status: 202 });
  }

  const completed = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "SUCCEEDED", now, {
    receipt: receipt(input, updateResponse.status, afterResponse.status)
  });
  return successResponse("UPDATED_AND_VERIFIED", completed);
}
