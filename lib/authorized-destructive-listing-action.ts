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
const DEACTIVATED_STATES = new Set(["inactive", "edit"]);

type DestructiveOperation = "DEACTIVATE_ACTIVE_LISTING" | "DELETE_LISTING";
type DestructiveScope = "UNPUBLISH" | "DELETE_LISTING";

export type DestructiveListingActionInput = {
  operation: DestructiveOperation;
  operationId: string;
  confirmation: string;
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
  qcStatus: "QC_PASSED";
  lifecycleState: "READY_TO_PUBLISH";
  scope: [DestructiveScope];
};

const INPUT_KEYS = [
  "acceptanceCriteriaId", "acceptanceCriteriaSha256", "authorizationId", "authorizationRequestSha256",
  "buildFingerprint", "buildId", "candidateFingerprint", "candidateId", "confirmation",
  "expectedBeforeListingFingerprint", "lifecycleState", "listingId", "operation", "operationId",
  "productId", "productVersion", "protectedStateFingerprint", "qcStatus", "scope", "shopId"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown) { return typeof value === "string" ? value.normalize("NFC").trim() : ""; }
function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}
function secureEqual(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
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

export function parseDestructiveListingAction(value: Record<string, unknown>): DestructiveListingActionInput | null {
  if (!exactKeys(value, INPUT_KEYS)) return null;
  const operation = text(value.operation) as DestructiveOperation;
  const operationId = text(value.operationId);
  const confirmation = text(value.confirmation);
  const scope = Array.isArray(value.scope) && value.scope.length === 1 && typeof value.scope[0] === "string"
    ? [text(value.scope[0])] as [DestructiveScope]
    : null;
  if (!scope) return null;
  const expectedScope: DestructiveScope | null = operation === "DEACTIVATE_ACTIVE_LISTING"
    ? "UNPUBLISH"
    : operation === "DELETE_LISTING" ? "DELETE_LISTING" : null;
  if (!expectedScope || scope[0] !== expectedScope || !operationId || confirmation !== operationId) return null;

  const input = {
    operation, operationId, confirmation,
    authorizationId: text(value.authorizationId),
    authorizationRequestSha256: text(value.authorizationRequestSha256).toLowerCase(),
    productId: text(value.productId), productVersion: text(value.productVersion),
    shopId: text(value.shopId), listingId: text(value.listingId),
    candidateId: text(value.candidateId), candidateFingerprint: text(value.candidateFingerprint).toLowerCase(),
    buildId: text(value.buildId), buildFingerprint: text(value.buildFingerprint).toLowerCase(),
    acceptanceCriteriaId: text(value.acceptanceCriteriaId),
    acceptanceCriteriaSha256: text(value.acceptanceCriteriaSha256).toLowerCase(),
    protectedStateFingerprint: text(value.protectedStateFingerprint).toLowerCase(),
    expectedBeforeListingFingerprint: text(value.expectedBeforeListingFingerprint).toLowerCase(),
    qcStatus: text(value.qcStatus), lifecycleState: text(value.lifecycleState), scope
  };
  const hashes = [input.authorizationRequestSha256, input.candidateFingerprint, input.buildFingerprint,
    input.acceptanceCriteriaSha256, input.protectedStateFingerprint, input.expectedBeforeListingFingerprint];
  if (input.qcStatus !== "QC_PASSED" || input.lifecycleState !== "READY_TO_PUBLISH" ||
      hashes.some((hash) => !SHA256.test(hash)) || !input.authorizationId || !input.productId ||
      !input.productVersion || !input.shopId || !/^\d+$/.test(input.listingId) || !input.candidateId ||
      !input.buildId || !input.acceptanceCriteriaId) return null;
  return input as DestructiveListingActionInput;
}

function authorizationError(input: DestructiveListingActionInput, request: Request) {
  if (process.env.PUBLISH_WRITES_ENABLED !== "true" || process.env.ETSY_DESTRUCTIVE_WRITES_ENABLED !== "true") {
    return NextResponse.json({ error: "ETSY_DESTRUCTIVE_WRITES_DISABLED" }, { status: 403 });
  }
  const writeToken = process.env.ETSY_DRAFT_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!writeToken || !supplied || !secureEqual(writeToken, supplied)) {
    return NextResponse.json({ error: "ETSY_DESTRUCTIVE_UNAUTHORIZED" }, { status: 401 });
  }
  if ((process.env.ETSY_SHOP_ID?.trim() ?? "") !== input.shopId) {
    return NextResponse.json({ error: "ETSY_DESTRUCTIVE_SHOP_MISMATCH" }, { status: 409 });
  }
  const configuredOperation = process.env.ETSY_DESTRUCTIVE_OPERATION?.trim() ?? "";
  const authorizationId = process.env.ETSY_DESTRUCTIVE_AUTHORIZATION_ID?.trim() ?? "";
  const authorizationRequestSha = process.env.ETSY_DESTRUCTIVE_AUTH_REQUEST_SHA256?.trim().toLowerCase() ?? "";
  const requestSha = process.env.ETSY_DESTRUCTIVE_REQUEST_SHA256?.trim().toLowerCase() ?? "";
  const protectedState = process.env.ETSY_DESTRUCTIVE_PROTECTED_STATE_SHA256?.trim().toLowerCase() ?? "";
  if (!configuredOperation || !authorizationId || !SHA256.test(authorizationRequestSha) ||
      !SHA256.test(requestSha) || !SHA256.test(protectedState)) {
    return NextResponse.json({ error: "ETSY_DESTRUCTIVE_AUTH_NOT_CONFIGURED" }, { status: 503 });
  }
  if (configuredOperation !== input.operation || !secureEqual(authorizationId, input.authorizationId) ||
      !secureEqual(authorizationRequestSha, input.authorizationRequestSha256) ||
      !secureEqual(protectedState, input.protectedStateFingerprint)) {
    return NextResponse.json({ error: "ETSY_DESTRUCTIVE_AUTHORIZATION_MISMATCH" }, { status: 409 });
  }
  if (!secureEqual(requestSha, hashOperationRequest(input))) {
    return NextResponse.json({ error: "ETSY_DESTRUCTIVE_REQUEST_HASH_MISMATCH" }, { status: 409 });
  }
  return null;
}

function receipt(input: DestructiveListingActionInput, providerMutationCount: number, finalState: string) {
  return {
    kind: input.operation, operationId: input.operationId, authorizationId: input.authorizationId,
    authorizationState: "CONSUMED", authorizationRequestSha256: input.authorizationRequestSha256,
    productId: input.productId, productVersion: input.productVersion, shopId: input.shopId,
    listingId: input.listingId, candidateId: input.candidateId, candidateFingerprint: input.candidateFingerprint,
    buildId: input.buildId, buildFingerprint: input.buildFingerprint,
    acceptanceCriteriaId: input.acceptanceCriteriaId, acceptanceCriteriaSha256: input.acceptanceCriteriaSha256,
    protectedStateFingerprint: input.protectedStateFingerprint,
    expectedBeforeListingFingerprint: input.expectedBeforeListingFingerprint,
    scope: input.scope, providerMutationCount, finalState
  };
}
function success(status: "DEACTIVATED_AND_VERIFIED" | "DELETED_AND_VERIFIED" | "RECONCILED" | "REPLAY", record: OperationLedgerRecord) {
  return NextResponse.json({ status, operationId: record.operationId, requestHash: record.requestHash,
    ledgerStatus: record.status, receipt: record.receipt });
}

export type DestructiveListingActionRuntime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  now?: () => string;
};

async function verifyTargetIdentity(input: DestructiveListingActionInput, response: Response, body: unknown) {
  if (!response.ok || !isRecord(body)) return { match: false, actual: null as string | null };
  const identity = verifyEtsyReadBackIdentity(input.expectedBeforeListingFingerprint, observation(body));
  return { match: identity.status === "MATCH", actual: identity.actualFingerprint };
}

async function reconcileReadOnly(
  input: DestructiveListingActionInput, fetchImpl: typeof fetch, accessToken: string
) {
  const readUrl = `https://api.etsy.com/v3/application/listings/${input.listingId}`;
  let response: Response;
  try { response = await fetchImpl(readUrl, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" }); }
  catch { return { done: false, finalState: null, readFailed: true }; }
  const body = await json(response);
  if (input.operation === "DELETE_LISTING") {
    return response.status === 404 ? { done: true, finalState: "deleted" } : { done: false, finalState: null };
  }
  const identity = await verifyTargetIdentity(input, response, body);
  const state = isRecord(body) ? String(body.state ?? "").toLowerCase() : "";
  return identity.match && DEACTIVATED_STATES.has(state)
    ? { done: true, finalState: state }
    : { done: false, finalState: null };
}

export async function handleDestructiveListingAction(
  body: Record<string, unknown>, request: Request, runtime: DestructiveListingActionRuntime = {}
) {
  const input = parseDestructiveListingAction(body);
  if (!input) return NextResponse.json({ error: "ETSY_DESTRUCTIVE_INVALID_CONTRACT" }, { status: 409 });
  const authError = authorizationError(input, request); if (authError) return authError;
  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  const now = runtime.now?.() ?? new Date().toISOString();
  let begun: Awaited<ReturnType<typeof beginOperation>>;
  try { begun = await beginOperation(repository, input.operationId, input, now); }
  catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: code }, { status: code === "OPERATION_ID_PAYLOAD_MISMATCH" ? 409 : 500 });
  }
  if (begun.status === "REPLAY" && begun.record.status === "SUCCEEDED" && begun.record.receipt) {
    return success("REPLAY", begun.record);
  }

  const fetchImpl = runtime.fetchImpl ?? fetch;
  const accessToken = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
  if (begun.status === "REPLAY") {
    if (begun.record.status !== "RECONCILIATION_REQUIRED") {
      return NextResponse.json({ error: "ETSY_DESTRUCTIVE_ALREADY_CLAIMED", operationId: input.operationId,
        ledgerStatus: begun.record.status }, { status: 409 });
    }
    const reconciled = await reconcileReadOnly(input, fetchImpl, accessToken);
    if (reconciled.done && reconciled.finalState) {
      const completed = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "SUCCEEDED", now,
        { receipt: receipt(input, 0, reconciled.finalState) });
      return success("RECONCILED", completed);
    }
    return NextResponse.json({ error: "ETSY_DESTRUCTIVE_ALREADY_CLAIMED", operationId: input.operationId,
      ledgerStatus: begun.record.status }, { status: 409 });
  }

  const readUrl = `https://api.etsy.com/v3/application/listings/${input.listingId}`;
  let beforeResponse: Response;
  try { beforeResponse = await fetchImpl(readUrl, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" }); }
  catch {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "FAILED", now,
      { recoveryPoint: "PRE_READ_FAILED" });
    return NextResponse.json({ error: "ETSY_DESTRUCTIVE_PREREAD_FAILED" }, { status: 502 });
  }
  const before = await json(beforeResponse);
  if (!beforeResponse.ok || !isRecord(before)) {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "FAILED", now,
      { recoveryPoint: "PRE_READ_FAILED" });
    return NextResponse.json({ error: "ETSY_DESTRUCTIVE_PREREAD_FAILED" }, { status: 502 });
  }
  if (String(before.state ?? "").toLowerCase() !== "active") {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "FAILED", now,
      { recoveryPoint: "TARGET_NOT_ACTIVE" });
    return NextResponse.json({ error: "ETSY_DESTRUCTIVE_TARGET_NOT_ACTIVE" }, { status: 409 });
  }
  const identity = await verifyTargetIdentity(input, beforeResponse, before);
  if (!identity.match) {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "FAILED", now,
      { recoveryPoint: "PRE_IDENTITY_MISMATCH" });
    return NextResponse.json({ error: "ETSY_DESTRUCTIVE_PREIDENTITY_MISMATCH",
      actualListingFingerprint: identity.actual }, { status: 409 });
  }

  const mutationUrl = input.operation === "DELETE_LISTING"
    ? readUrl
    : `https://api.etsy.com/v3/application/shops/${input.shopId}/listings/${input.listingId}`;
  const mutationInit: RequestInit = input.operation === "DELETE_LISTING"
    ? { method: "DELETE", headers: etsyApiHeaders(accessToken), cache: "no-store" }
    : { method: "PATCH", headers: { ...etsyApiHeaders(accessToken), "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ state: "inactive" }), cache: "no-store" };

  let mutationResponse: Response | null = null;
  try { mutationResponse = await fetchImpl(mutationUrl, mutationInit); }
  catch { mutationResponse = null; }

  const ambiguous = mutationResponse === null || mutationResponse.status === 429 || mutationResponse.status >= 500;
  if (mutationResponse && !mutationResponse.ok && !ambiguous) {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "FAILED", now,
      { recoveryPoint: input.operation === "DELETE_LISTING" ? "DELETE_REJECTED" : "DEACTIVATE_REJECTED" });
    return NextResponse.json({ error: "ETSY_DESTRUCTIVE_REJECTED", statusCode: mutationResponse.status,
      authorizationState: "CONSUMED", providerMutationAttemptCount: 1, confirmedProviderMutationCount: 0 }, { status: 502 });
  }

  const reconciled = await reconcileReadOnly(input, fetchImpl, accessToken);
  if (reconciled.done && reconciled.finalState) {
    const completed = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "SUCCEEDED", now,
      { receipt: receipt(input, 1, reconciled.finalState) });
    return success(input.operation === "DELETE_LISTING" ? "DELETED_AND_VERIFIED" : "DEACTIVATED_AND_VERIFIED", completed);
  }

  await recordOperationResult(repository, input.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", now,
    { recoveryPoint: input.operation === "DELETE_LISTING" ? "POST_DELETE_READ_BACK" : "POST_DEACTIVATE_READ_BACK" });
  return NextResponse.json({ error: ambiguous ? "ETSY_DESTRUCTIVE_AMBIGUOUS" : "ETSY_DESTRUCTIVE_READBACK_FAILED",
    status: "RECONCILIATION_REQUIRED", authorizationState: "CONSUMED", providerMutationAttemptCount: 1, confirmedProviderMutationCount: null }, { status: 202 });
}
