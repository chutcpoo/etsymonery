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
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "./etsy-readback-normalizer";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;
const ALLOWED_PATCH_KEYS = ["description", "priceUsd", "quantity", "tags", "taxonomyId", "title", "whenMade", "whoMade"] as const;
const PATCH_SCOPE = Object.freeze({
  title: "TITLE", description: "DESCRIPTION", priceUsd: "PRICE", tags: "TAGS", quantity: "QUANTITY",
  taxonomyId: "TAXONOMY", whoMade: "WHO_MADE", whenMade: "WHEN_MADE"
} as const);

type Patch = Partial<{
  title: string;
  description: string;
  priceUsd: number;
  tags: string[];
  quantity: number;
  taxonomyId: number;
  whoMade: string;
  whenMade: string;
}>;

export type GenericLiveListingUpdateInput = {
  operation: "UPDATE_ACTIVE_LISTING_METADATA";
  operationId: string;
  authorizationId: string;
  authorizationRequestSha256: string;
  productId: string;
  productVersion: string;
  shopId: string;
  listingId: string;
  candidateId: string;
  candidateFingerprint: string;
  buildId: string;
  buildFingerprint: string;
  acceptanceCriteriaId: string;
  acceptanceCriteriaSha256: string;
  protectedStateFingerprint: string;
  expectedBeforeListingFingerprint: string;
  expectedAfterListingFingerprint: string;
  qcStatus: "QC_PASSED";
  lifecycleState: "READY_TO_PUBLISH";
  scope: string[];
  patch: Patch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown) { return typeof value === "string" ? value.normalize("NFC").trim() : ""; }
function secureEqual(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function strings(value: unknown) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  const normalized = value.map((item) => item.normalize("NFC").trim());
  return normalized.every(Boolean) ? normalized : null;
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}
async function json(response: Response) {
  const body = await response.text();
  if (!body) return {};
  try { return JSON.parse(body) as unknown; } catch { return {}; }
}
function observation(value: Record<string, unknown>): EtsyReadBackObservation {
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
    state: "draft"
  };
}

const INPUT_KEYS = [
  "acceptanceCriteriaId", "acceptanceCriteriaSha256", "authorizationId", "authorizationRequestSha256",
  "buildFingerprint", "buildId", "candidateFingerprint", "candidateId", "expectedAfterListingFingerprint",
  "expectedBeforeListingFingerprint", "lifecycleState", "listingId", "operation", "operationId", "patch",
  "productId", "productVersion", "protectedStateFingerprint", "qcStatus", "scope", "shopId"
] as const;

export function parseGenericLiveListingUpdate(value: Record<string, unknown>): GenericLiveListingUpdateInput | null {
  if (!exactKeys(value, INPUT_KEYS)) return null;
  if (!isRecord(value.patch)) return null;
  const patchKeys = Object.keys(value.patch).sort();
  if (patchKeys.length < 1 || patchKeys.some((key) => !ALLOWED_PATCH_KEYS.includes(key as typeof ALLOWED_PATCH_KEYS[number]))) return null;
  const scope = strings(value.scope); if (!scope || scope.length < 1 || new Set(scope).size !== scope.length) return null;
  const expectedScope = patchKeys.map((key) => PATCH_SCOPE[key as keyof typeof PATCH_SCOPE]).sort();
  if (JSON.stringify([...scope].sort()) !== JSON.stringify(expectedScope)) return null;
  const patch: Patch = {};
  if ("title" in value.patch) { const v = text(value.patch.title); if (!v) return null; patch.title = v; }
  if ("description" in value.patch) { const v = text(value.patch.description); if (!v) return null; patch.description = v; }
  if ("tags" in value.patch) { const v = strings(value.patch.tags); if (!v || v.length > 13) return null; patch.tags = v; }
  if ("priceUsd" in value.patch) { const v = value.patch.priceUsd; if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null; patch.priceUsd = v; }
  if ("quantity" in value.patch) { const v = value.patch.quantity; if (!Number.isSafeInteger(v) || (v as number) < 0) return null; patch.quantity = v as number; }
  if ("taxonomyId" in value.patch) { const v = value.patch.taxonomyId; if (!Number.isSafeInteger(v) || (v as number) <= 0) return null; patch.taxonomyId = v as number; }
  if ("whoMade" in value.patch) { const v = text(value.patch.whoMade); if (!v) return null; patch.whoMade = v; }
  if ("whenMade" in value.patch) { const v = text(value.patch.whenMade); if (!v) return null; patch.whenMade = v; }

  const input = {
    operation: text(value.operation), operationId: text(value.operationId), authorizationId: text(value.authorizationId),
    authorizationRequestSha256: text(value.authorizationRequestSha256).toLowerCase(), productId: text(value.productId),
    productVersion: text(value.productVersion), shopId: text(value.shopId), listingId: text(value.listingId),
    candidateId: text(value.candidateId), candidateFingerprint: text(value.candidateFingerprint).toLowerCase(),
    buildId: text(value.buildId), buildFingerprint: text(value.buildFingerprint).toLowerCase(),
    acceptanceCriteriaId: text(value.acceptanceCriteriaId), acceptanceCriteriaSha256: text(value.acceptanceCriteriaSha256).toLowerCase(),
    protectedStateFingerprint: text(value.protectedStateFingerprint).toLowerCase(),
    expectedBeforeListingFingerprint: text(value.expectedBeforeListingFingerprint).toLowerCase(),
    expectedAfterListingFingerprint: text(value.expectedAfterListingFingerprint).toLowerCase(), qcStatus: text(value.qcStatus),
    lifecycleState: text(value.lifecycleState), scope, patch
  };
  const hashes = [input.authorizationRequestSha256, input.candidateFingerprint, input.buildFingerprint,
    input.acceptanceCriteriaSha256, input.protectedStateFingerprint, input.expectedBeforeListingFingerprint,
    input.expectedAfterListingFingerprint];
  if (input.operation !== "UPDATE_ACTIVE_LISTING_METADATA" || input.qcStatus !== "QC_PASSED" ||
      input.lifecycleState !== "READY_TO_PUBLISH" || hashes.some((hash) => !SHA256.test(hash)) ||
      !input.operationId || !input.authorizationId || !input.productId || !input.productVersion || !input.shopId ||
      !/^\d+$/.test(input.listingId) || !input.candidateId || !input.buildId || !input.acceptanceCriteriaId) return null;
  return input as GenericLiveListingUpdateInput;
}

function authorizationError(input: GenericLiveListingUpdateInput, request: Request) {
  if (process.env.PUBLISH_WRITES_ENABLED !== "true") return NextResponse.json({ error: "ETSY_GENERIC_UPDATE_WRITES_DISABLED" }, { status: 403 });
  const writeToken = process.env.ETSY_DRAFT_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!writeToken || !supplied || !secureEqual(writeToken, supplied)) return NextResponse.json({ error: "ETSY_GENERIC_UPDATE_UNAUTHORIZED" }, { status: 401 });
  const configuredShop = process.env.ETSY_SHOP_ID?.trim() ?? "";
  if (!configuredShop || configuredShop !== input.shopId) return NextResponse.json({ error: "ETSY_GENERIC_UPDATE_SHOP_MISMATCH" }, { status: 409 });
  const authorizationId = process.env.ETSY_GENERIC_UPDATE_AUTHORIZATION_ID?.trim() ?? "";
  const authorizationRequestSha = process.env.ETSY_GENERIC_UPDATE_AUTH_REQUEST_SHA256?.trim().toLowerCase() ?? "";
  const requestSha = process.env.ETSY_GENERIC_UPDATE_REQUEST_SHA256?.trim().toLowerCase() ?? "";
  const protectedState = process.env.ETSY_GENERIC_UPDATE_PROTECTED_STATE_SHA256?.trim().toLowerCase() ?? "";
  if (!authorizationId || !SHA256.test(authorizationRequestSha) || !SHA256.test(requestSha) || !SHA256.test(protectedState)) return NextResponse.json({ error: "ETSY_GENERIC_UPDATE_AUTH_NOT_CONFIGURED" }, { status: 503 });
  if (!secureEqual(authorizationId, input.authorizationId) || !secureEqual(authorizationRequestSha, input.authorizationRequestSha256) || !secureEqual(protectedState, input.protectedStateFingerprint)) return NextResponse.json({ error: "ETSY_GENERIC_UPDATE_AUTHORIZATION_MISMATCH" }, { status: 409 });
  const actualRequestHash = hashOperationRequest(input);
  if (!secureEqual(requestSha, actualRequestHash)) return NextResponse.json({ error: "ETSY_GENERIC_UPDATE_REQUEST_HASH_MISMATCH" }, { status: 409 });
  return null;
}

function receipt(input: GenericLiveListingUpdateInput, providerPatchCount: number, readBackStatusCode: number) {
  return {
    kind: input.operation, operationId: input.operationId, authorizationId: input.authorizationId,
    authorizationState: "CONSUMED", authorizationRequestSha256: input.authorizationRequestSha256,
    productId: input.productId, productVersion: input.productVersion, listingId: input.listingId, shopId: input.shopId,
    candidateId: input.candidateId, candidateFingerprint: input.candidateFingerprint, buildId: input.buildId,
    buildFingerprint: input.buildFingerprint, acceptanceCriteriaId: input.acceptanceCriteriaId,
    acceptanceCriteriaSha256: input.acceptanceCriteriaSha256, protectedStateFingerprint: input.protectedStateFingerprint,
    expectedBeforeListingFingerprint: input.expectedBeforeListingFingerprint,
    expectedAfterListingFingerprint: input.expectedAfterListingFingerprint,
    actualListingFingerprint: input.expectedAfterListingFingerprint, scope: input.scope,
    providerPatchCount, readBackStatusCode, state: "active"
  };
}
function success(status: "UPDATED_AND_VERIFIED" | "RECONCILED" | "REPLAY", record: OperationLedgerRecord) {
  return NextResponse.json({ status, operationId: record.operationId, requestHash: record.requestHash, ledgerStatus: record.status, receipt: record.receipt });
}

export type GenericLiveListingUpdateRuntime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  now?: () => string;
};

export async function handleGenericLiveListingUpdate(
  body: Record<string, unknown>, request: Request, runtime: GenericLiveListingUpdateRuntime = {}
) {
  const input = parseGenericLiveListingUpdate(body);
  if (!input) return NextResponse.json({ error: "ETSY_GENERIC_UPDATE_INVALID_CONTRACT" }, { status: 409 });
  const authError = authorizationError(input, request); if (authError) return authError;
  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  const now = runtime.now?.() ?? new Date().toISOString();
  let begun: Awaited<ReturnType<typeof beginOperation>>;
  try { begun = await beginOperation(repository, input.operationId, input, now); }
  catch (error) { const code = error instanceof Error ? error.message : "UNKNOWN"; return NextResponse.json({ error: code }, { status: code === "OPERATION_ID_PAYLOAD_MISMATCH" ? 409 : 500 }); }
  if (begun.status === "REPLAY" && begun.record.status === "SUCCEEDED" && begun.record.receipt) return success("REPLAY", begun.record);

  const fetchImpl = runtime.fetchImpl ?? fetch;
  const accessToken = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
  const readUrl = `https://api.etsy.com/v3/application/listings/${input.listingId}`;
  const patchUrl = `https://api.etsy.com/v3/application/shops/${input.shopId}/listings/${input.listingId}`;

  if (begun.status === "REPLAY") {
    const readBackResponse = await fetchImpl(readUrl, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" });
    const readBack = await json(readBackResponse);
    if (readBackResponse.ok && isRecord(readBack) && String(readBack.state ?? "").toLowerCase() === "active") {
      const identity = verifyEtsyReadBackIdentity(input.expectedAfterListingFingerprint, observation(readBack));
      if (identity.status === "MATCH") {
        const completed = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "SUCCEEDED", now, { receipt: receipt(input, 0, readBackResponse.status) });
        return success("RECONCILED", completed);
      }
    }
    return NextResponse.json({ error: "ETSY_GENERIC_UPDATE_ALREADY_CLAIMED", operationId: input.operationId, ledgerStatus: begun.record.status }, { status: 409 });
  }

  const beforeResponse = await fetchImpl(readUrl, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" });
  const before = await json(beforeResponse);
  if (!beforeResponse.ok || !isRecord(before)) {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "FAILED", now, { recoveryPoint: "PRE_READ_FAILED" });
    return NextResponse.json({ error: "ETSY_GENERIC_UPDATE_PREREAD_FAILED" }, { status: 502 });
  }
  if (String(before.state ?? "").toLowerCase() !== "active") {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "FAILED", now, { recoveryPoint: "TARGET_NOT_ACTIVE" });
    return NextResponse.json({ error: "ETSY_GENERIC_UPDATE_TARGET_NOT_ACTIVE" }, { status: 409 });
  }
  const afterAlready = verifyEtsyReadBackIdentity(input.expectedAfterListingFingerprint, observation(before));
  if (afterAlready.status === "MATCH") {
    const completed = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "SUCCEEDED", now, { receipt: receipt(input, 0, beforeResponse.status) });
    return success("RECONCILED", completed);
  }
  const beforeIdentity = verifyEtsyReadBackIdentity(input.expectedBeforeListingFingerprint, observation(before));
  if (beforeIdentity.status !== "MATCH") {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "FAILED", now, { recoveryPoint: "PRE_IDENTITY_MISMATCH" });
    return NextResponse.json({ error: "ETSY_GENERIC_UPDATE_PREIDENTITY_MISMATCH", actualListingFingerprint: beforeIdentity.actualFingerprint }, { status: 409 });
  }

  const patchBody = new URLSearchParams();
  if (input.patch.title !== undefined) patchBody.set("title", input.patch.title);
  if (input.patch.description !== undefined) patchBody.set("description", input.patch.description);
  if (input.patch.priceUsd !== undefined) patchBody.set("price", input.patch.priceUsd.toFixed(2));
  if (input.patch.tags !== undefined) patchBody.set("tags", input.patch.tags.join(","));
  if (input.patch.quantity !== undefined) patchBody.set("quantity", String(input.patch.quantity));
  if (input.patch.taxonomyId !== undefined) patchBody.set("taxonomy_id", String(input.patch.taxonomyId));
  if (input.patch.whoMade !== undefined) patchBody.set("who_made", input.patch.whoMade);
  if (input.patch.whenMade !== undefined) patchBody.set("when_made", input.patch.whenMade);

  let patchResponse: Response;
  try {
    patchResponse = await fetchImpl(patchUrl, {
      method: "PATCH",
      headers: { ...etsyApiHeaders(accessToken), "content-type": "application/x-www-form-urlencoded" },
      body: patchBody,
      cache: "no-store"
    });
  } catch {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", now, { recoveryPoint: "POST_PATCH_READ_BACK" });
    return NextResponse.json({ error: "ETSY_GENERIC_UPDATE_AMBIGUOUS", status: "RECONCILIATION_REQUIRED", providerPatchCount: 1 }, { status: 202 });
  }
  await json(patchResponse);
  if (!patchResponse.ok) {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "FAILED", now, { recoveryPoint: "PATCH_REJECTED" });
    return NextResponse.json({ error: "ETSY_GENERIC_UPDATE_REJECTED", statusCode: patchResponse.status }, { status: 502 });
  }

  const readBackResponse = await fetchImpl(readUrl, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" });
  const readBack = await json(readBackResponse);
  if (!readBackResponse.ok || !isRecord(readBack) || String(readBack.state ?? "").toLowerCase() !== "active") {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", now, { recoveryPoint: "POST_PATCH_READ_BACK" });
    return NextResponse.json({ error: "ETSY_GENERIC_UPDATE_READBACK_FAILED", status: "RECONCILIATION_REQUIRED", providerPatchCount: 1 }, { status: 202 });
  }
  const afterIdentity = verifyEtsyReadBackIdentity(input.expectedAfterListingFingerprint, observation(readBack));
  if (afterIdentity.status !== "MATCH") {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", now, { recoveryPoint: "POST_PATCH_IDENTITY_MISMATCH" });
    return NextResponse.json({ error: "ETSY_GENERIC_UPDATE_POSTIDENTITY_MISMATCH", status: "RECONCILIATION_REQUIRED", actualListingFingerprint: afterIdentity.actualFingerprint, providerPatchCount: 1 }, { status: 202 });
  }
  const completed = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "SUCCEEDED", now, { receipt: receipt(input, 1, readBackResponse.status) });
  return success("UPDATED_AND_VERIFIED", completed);
}
