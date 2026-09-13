import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createListingFingerprint } from "./candidate-fingerprint";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import {
  verifyEtsyReadBackIdentity,
  type EtsyReadBackObservation
} from "./etsy-readback-normalizer";
import {
  beginOperation,
  hashOperationRequest,
  NeonOperationLedgerRepository,
  recordOperationResult,
  type OperationLedgerRecord,
  type OperationLedgerRepository
} from "./operation-ledger";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;
const REQUEST_HASH_ENV = "ETSY_PDT_HBOP_001_B01_REQUEST_SHA256";
const EXPECTED_BEFORE_ENV = "ETSY_PDT_HBOP_001_B01_EXPECTED_BEFORE_LISTING_SHA256";
const EXPECTED_AFTER_ENV = "ETSY_PDT_HBOP_001_B01_EXPECTED_AFTER_LISTING_SHA256";

export const PDT_HBOP_001_B01 = Object.freeze({
  operation: "UPDATE_ACTIVE_LISTING_TITLE_TAGS_ONLY",
  operationId: "PDT-HBOP-001-B01-TITLE-TAGS-001",
  productId: "PDT-HBOP-001",
  shopId: "23582741",
  listingId: "4566738686",
  candidateId: "ETSY-KEYWORD-REPAIR-PDT-HBOP-001-V1-2026-09-13-A",
  candidateFingerprint: "4721c625cc41e5da25f800aa988e6516c1006150b10bc81cd2f62ad3f3f18103",
  buildId: "ETSY-KEYWORD-REPAIR-PDT-HBOP-001-BUILD-20260913-B01",
  buildFingerprint: "afc643261deeca6dfac62fc69ad385855616408517bcb7166886b35e9ff95675",
  buildFreezeSha256: "9bb6204890546aeca43ac0946cd8dfac31691057adaadcd5cc941a442fa02078",
  acceptanceCriteriaId: "ETSY-AC-PDT-HBOP-001-KEYWORD-REPAIR-B01-V1",
  acceptanceCriteriaSha256: "d2db7efb24d4de1a9948e31de13559324f016256a63dbf6ff719cb3e80b1b4c1",
  title: "Home Bakery Order Tracker & Production Schedule Planner | Excel Operations Template",
  tags: [
    "production schedule",
    "order tracker",
    "bakery spreadsheet",
    "production planner",
    "baking schedule",
    "cottage bakery",
    "batch prep log",
    "delivery tracker",
    "home bakery planner",
    "ingredient planner",
    "pickup planner",
    "bakery dashboard",
    "order management"
  ] as readonly string[]
} as const);

type RecordValue = Record<string, unknown>;
type ExactBody = ReturnType<typeof exactPdtHbop001B01Body>;

export type PdtHbop001B01Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  now?: () => string;
};

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function exactKeys(value: RecordValue, expected: readonly string[]) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function sameExactValue(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length &&
      expected.every((value, index) => sameExactValue(actual[index], value));
  }
  if (isRecord(expected)) {
    return isRecord(actual) && exactKeys(actual, Object.keys(expected)) &&
      Object.entries(expected).every(([key, value]) => sameExactValue(actual[key], value));
  }
  return actual === expected;
}

function counts(providerPatchCount: 0 | 1) {
  return { providerPatchCount, ETSY_WRITE_COUNT: providerPatchCount } as const;
}

export function exactPdtHbop001B01Body() {
  return {
    operation: PDT_HBOP_001_B01.operation,
    operationId: PDT_HBOP_001_B01.operationId,
    productId: PDT_HBOP_001_B01.productId,
    shopId: PDT_HBOP_001_B01.shopId,
    listingId: PDT_HBOP_001_B01.listingId,
    candidateId: PDT_HBOP_001_B01.candidateId,
    candidateFingerprint: PDT_HBOP_001_B01.candidateFingerprint,
    buildId: PDT_HBOP_001_B01.buildId,
    buildFingerprint: PDT_HBOP_001_B01.buildFingerprint,
    buildFreezeSha256: PDT_HBOP_001_B01.buildFreezeSha256,
    acceptanceCriteriaId: PDT_HBOP_001_B01.acceptanceCriteriaId,
    acceptanceCriteriaSha256: PDT_HBOP_001_B01.acceptanceCriteriaSha256,
    patch: {
      title: PDT_HBOP_001_B01.title,
      tags: [...PDT_HBOP_001_B01.tags]
    }
  };
}

function exactBody(body: RecordValue): body is ExactBody {
  const expected = exactPdtHbop001B01Body();
  if (!exactKeys(body, Object.keys(expected)) || !isRecord(body.patch)) return false;
  if (!exactKeys(body.patch, ["title", "tags"])) return false;
  if (!Array.isArray(body.patch.tags) || !body.patch.tags.every((tag) => typeof tag === "string")) return false;
  return sameExactValue(body, expected);
}

function immutableContractIsValid() {
  const tags = PDT_HBOP_001_B01.tags;
  const hashes = [
    PDT_HBOP_001_B01.candidateFingerprint,
    PDT_HBOP_001_B01.buildFingerprint,
    PDT_HBOP_001_B01.buildFreezeSha256,
    PDT_HBOP_001_B01.acceptanceCriteriaSha256
  ];
  return hashes.every((hash) => SHA256.test(hash)) &&
    tags.length === 13 &&
    new Set(tags).size === tags.length &&
    tags.every((tag) => tag.length > 0 && tag.length <= 20) &&
    PDT_HBOP_001_B01.title.length > 0;
}

function toObservation(listing: RecordValue): EtsyReadBackObservation {
  return {
    title: listing.title,
    description: listing.description,
    price: listing.price as EtsyReadBackObservation["price"],
    tags: listing.tags,
    quantity: listing.quantity,
    who_made: listing.who_made,
    when_made: listing.when_made,
    taxonomy_id: listing.taxonomy_id,
    type: listing.listing_type ?? listing.type,
    state: listing.state
  };
}

function listingEnvelopeMatches(listing: RecordValue) {
  return String(listing.listing_id) === PDT_HBOP_001_B01.listingId &&
    String(listing.shop_id) === PDT_HBOP_001_B01.shopId &&
    String(listing.state).toLowerCase() === "active";
}

function isUsdPrice(value: unknown) {
  return isRecord(value) && value.currency_code === "USD";
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}

function sanitizeProviderError(value: unknown) {
  if (!isRecord(value)) return {};
  const safe: Record<string, string | number | boolean> = {};
  for (const key of ["error", "code", "message", "error_code", "error_message"] as const) {
    const field = value[key];
    if (typeof field === "string") safe[key] = field.slice(0, 500);
    else if (typeof field === "number" || typeof field === "boolean") safe[key] = field;
  }
  return safe;
}

function successResponse(status: "UPDATED_AND_VERIFIED" | "RECONCILED" | "REPLAY", record: OperationLedgerRecord, providerPatchCount: 0 | 1) {
  return NextResponse.json({
    status,
    mode: "WRITE_ONCE",
    operationId: record.operationId,
    requestHash: record.requestHash,
    ledgerStatus: record.status,
    ...counts(providerPatchCount),
    receipt: record.receipt
  });
}

function readConfiguration() {
  const requestHash = process.env[REQUEST_HASH_ENV]?.trim().toLowerCase() ?? "";
  const expectedBefore = process.env[EXPECTED_BEFORE_ENV]?.trim().toLowerCase() ?? "";
  const expectedAfter = process.env[EXPECTED_AFTER_ENV]?.trim().toLowerCase() ?? "";
  if (![requestHash, expectedBefore, expectedAfter].every((value) => SHA256.test(value))) return null;
  return { requestHash, expectedBefore, expectedAfter };
}

function validateWriteAuthorization(request: Request) {
  const expected = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!expected) return NextResponse.json({ error: "PDT_HBOP_001_B01_WRITE_AUTH_NOT_CONFIGURED", ...counts(0) }, { status: 503 });
  if (!supplied || !secureEqual(supplied, expected)) {
    return NextResponse.json({ error: "PDT_HBOP_001_B01_UNAUTHORIZED", ...counts(0) }, { status: 401 });
  }
  return null;
}

export async function handlePdtHbop001B01TitleTags(
  body: RecordValue,
  request: Request,
  runtime: PdtHbop001B01Runtime = {}
) {
  if (process.env.PUBLISH_WRITES_ENABLED !== "true") {
    return NextResponse.json({ error: "PDT_HBOP_001_B01_WRITES_DISABLED", ...counts(0) }, { status: 403 });
  }
  const authError = validateWriteAuthorization(request);
  if (authError) return authError;
  if (!immutableContractIsValid()) {
    return NextResponse.json({ error: "PDT_HBOP_001_B01_INTERNAL_CONTRACT_INVALID", ...counts(0) }, { status: 500 });
  }
  if (!exactBody(body)) {
    return NextResponse.json({ error: "PDT_HBOP_001_B01_IMMUTABLE_IDENTITY_MISMATCH", ...counts(0) }, { status: 409 });
  }
  if (process.env.ETSY_SHOP_ID?.trim() !== PDT_HBOP_001_B01.shopId) {
    return NextResponse.json({ error: "PDT_HBOP_001_B01_SHOP_MISMATCH", ...counts(0) }, { status: 409 });
  }

  const configuration = readConfiguration();
  if (!configuration) {
    return NextResponse.json({ error: "PDT_HBOP_001_B01_PRODUCTION_AUTH_NOT_CONFIGURED", ...counts(0) }, { status: 503 });
  }
  const actualRequestHash = hashOperationRequest(body);
  if (!secureEqual(actualRequestHash, configuration.requestHash)) {
    return NextResponse.json({ error: "PDT_HBOP_001_B01_REQUEST_HASH_MISMATCH", ...counts(0) }, { status: 409 });
  }

  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  let existing: OperationLedgerRecord | null;
  try {
    existing = await repository.load(PDT_HBOP_001_B01.operationId);
  } catch {
    return NextResponse.json({ error: "PDT_HBOP_001_B01_LEDGER_UNAVAILABLE", ...counts(0) }, { status: 503 });
  }
  if (existing && existing.requestHash !== actualRequestHash) {
    return NextResponse.json({ error: "OPERATION_ID_PAYLOAD_MISMATCH", ...counts(0) }, { status: 409 });
  }
  if (existing?.status === "SUCCEEDED") return successResponse("REPLAY", existing, 0);

  const fetchImpl = runtime.fetchImpl ?? fetch;
  let accessToken: string;
  try {
    accessToken = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
  } catch {
    return NextResponse.json({ error: "PDT_HBOP_001_B01_ETSY_AUTH_FAILED", ...counts(0) }, { status: 502 });
  }
  const readUrl = `https://api.etsy.com/v3/application/listings/${PDT_HBOP_001_B01.listingId}`;
  const patchUrl = `https://api.etsy.com/v3/application/shops/${PDT_HBOP_001_B01.shopId}/listings/${PDT_HBOP_001_B01.listingId}`;
  const readListing = async () => {
    const response = await fetchImpl(readUrl, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" });
    const value = await parseJson(response);
    if (!response.ok || !isRecord(value)) throw new Error("READ_FAILED");
    return { response, listing: value };
  };

  let before: Awaited<ReturnType<typeof readListing>>;
  try {
    before = await readListing();
  } catch {
    return NextResponse.json({ error: "PDT_HBOP_001_B01_PREREAD_FAILED", ...counts(0) }, { status: 502 });
  }
  if (!listingEnvelopeMatches(before.listing) || !isUsdPrice(before.listing.price)) {
    return NextResponse.json({ error: "PDT_HBOP_001_B01_PRECONDITION_MISMATCH", ...counts(0) }, { status: 409 });
  }

  let afterIdentity: ReturnType<typeof verifyEtsyReadBackIdentity>;
  let beforeIdentity: ReturnType<typeof verifyEtsyReadBackIdentity>;
  try {
    const observation = toObservation(before.listing);
    afterIdentity = verifyEtsyReadBackIdentity(configuration.expectedAfter, observation);
    beforeIdentity = verifyEtsyReadBackIdentity(configuration.expectedBefore, observation);
  } catch {
    return NextResponse.json({ error: "PDT_HBOP_001_B01_PREREAD_INVALID", ...counts(0) }, { status: 409 });
  }

  const now = runtime.now?.() ?? new Date().toISOString();
  if (afterIdentity.status === "MATCH") {
    if (existing) {
      const completed = await recordOperationResult(repository, existing.operationId, existing.requestHash, "SUCCEEDED", now, {
        receipt: { ...(existing.receipt ?? {}), reconciled: true, ...counts(0), actualListingFingerprint: afterIdentity.actualFingerprint }
      });
      return successResponse("RECONCILED", completed, 0);
    }
    const begun = await beginOperation(repository, PDT_HBOP_001_B01.operationId, body, now);
    if (begun.status === "REPLAY") {
      return NextResponse.json({ error: "PDT_HBOP_001_B01_ALREADY_CLAIMED", ...counts(0) }, { status: 409 });
    }
    const completed = await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "SUCCEEDED", now, {
      receipt: { reconciled: true, ...counts(0), actualListingFingerprint: afterIdentity.actualFingerprint }
    });
    return successResponse("RECONCILED", completed, 0);
  }

  if (existing) {
    return NextResponse.json({ error: "PDT_HBOP_001_B01_ALREADY_CLAIMED", ledgerStatus: existing.status, ...counts(0) }, { status: 409 });
  }
  if (beforeIdentity.status !== "MATCH") {
    return NextResponse.json({
      error: "PDT_HBOP_001_B01_PREIDENTITY_MISMATCH",
      actualListingFingerprint: beforeIdentity.actualFingerprint,
      ...counts(0)
    }, { status: 409 });
  }

  const derivedExpectedAfter = createListingFingerprint({
    ...beforeIdentity.normalized,
    title: PDT_HBOP_001_B01.title,
    tags: [...PDT_HBOP_001_B01.tags]
  });
  if (!secureEqual(derivedExpectedAfter, configuration.expectedAfter)) {
    return NextResponse.json({ error: "PDT_HBOP_001_B01_EXPECTED_AFTER_CONFIG_MISMATCH", ...counts(0) }, { status: 409 });
  }

  let begun: Awaited<ReturnType<typeof beginOperation>>;
  try {
    begun = await beginOperation(repository, PDT_HBOP_001_B01.operationId, body, now);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PDT_HBOP_001_B01_LEDGER_ERROR", ...counts(0) }, { status: 409 });
  }
  if (begun.status === "REPLAY") {
    return NextResponse.json({ error: "PDT_HBOP_001_B01_ALREADY_CLAIMED", ledgerStatus: begun.record.status, ...counts(0) }, { status: 409 });
  }

  // Etsy requires protected listing fields on some update paths. Source every one from
  // the fresh, fingerprint-verified preread; caller input can only contain title/tags.
  const normalized = beforeIdentity.normalized;
  const patchBody = new URLSearchParams({
    title: PDT_HBOP_001_B01.title,
    description: String(before.listing.description),
    price: normalized.priceUsd.toFixed(2),
    quantity: String(before.listing.quantity),
    taxonomy_id: String(before.listing.taxonomy_id),
    who_made: String(before.listing.who_made),
    when_made: String(before.listing.when_made),
    type: String(before.listing.listing_type ?? before.listing.type),
    tags: PDT_HBOP_001_B01.tags.join(",")
  });

  let patchResponse: Response | null = null;
  let providerBody: unknown = {};
  try {
    patchResponse = await fetchImpl(patchUrl, {
      method: "PATCH",
      headers: { ...etsyApiHeaders(accessToken), "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: patchBody,
      cache: "no-store"
    });
    providerBody = await parseJson(patchResponse);
  } catch {
    // An exception after dispatch is ambiguous; the mandatory fresh readback below decides it.
  }

  let after: Awaited<ReturnType<typeof readListing>> | null = null;
  try { after = await readListing(); } catch { after = null; }
  if (after && listingEnvelopeMatches(after.listing)) {
    try {
      const verified = verifyEtsyReadBackIdentity(configuration.expectedAfter, toObservation(after.listing));
      if (verified.status === "MATCH") {
        const completed = await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "SUCCEEDED", runtime.now?.() ?? new Date().toISOString(), {
          receipt: {
            ...counts(1),
            updateStatusCode: patchResponse?.status ?? null,
            readBackStatusCode: after.response.status,
            expectedBeforeListingFingerprint: configuration.expectedBefore,
            expectedAfterListingFingerprint: configuration.expectedAfter,
            actualListingFingerprint: verified.actualFingerprint,
            verified: { title: "PASS", tagsExactOrdered13: "PASS", protectedFields: "PASS" }
          }
        });
        return successResponse(patchResponse?.ok ? "UPDATED_AND_VERIFIED" : "RECONCILED", completed, 1);
      }
    } catch {
      // Fall through to fail-closed reconciliation handling.
    }
  }

  if (patchResponse && !patchResponse.ok && patchResponse.status < 500) {
    const providerError = sanitizeProviderError(providerBody);
    await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "FAILED", runtime.now?.() ?? new Date().toISOString(), {
      recoveryPoint: "PATCH_REJECTED",
      receipt: { ...counts(1), updateStatusCode: patchResponse.status, providerError }
    });
    return NextResponse.json({ error: "PDT_HBOP_001_B01_PATCH_REJECTED", statusCode: patchResponse.status, providerError, ...counts(1) }, { status: 502 });
  }

  const pending = await recordOperationResult(repository, begun.record.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", runtime.now?.() ?? new Date().toISOString(), {
    recoveryPoint: "POST_PATCH_READBACK",
    receipt: { ...counts(1), updateStatusCode: patchResponse?.status ?? null }
  });
  return NextResponse.json({
    status: "RECONCILIATION_REQUIRED",
    operationId: pending.operationId,
    requestHash: pending.requestHash,
    ledgerStatus: pending.status,
    recoveryPoint: pending.recoveryPoint,
    ...counts(1)
  }, { status: 202 });
}
