import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import {
  beginOperation,
  NeonOperationLedgerRepository,
  recordOperationResult,
  type OperationLedgerRecord,
  type OperationLedgerRepository
} from "./operation-ledger";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";

export const PD_STOCK_005_B01 = Object.freeze({
  operation: "UPDATE_ACTIVE_LISTING_TITLE_TAGS_ONLY",
  operationId: "PD-STOCK-005-B01-TITLE-TAGS-001",
  authorizationId: "PTQC-PD-STOCK-005-AUTH-20260908-B01-01",
  productId: "PD-STOCK-005",
  productVersion: "V1",
  shopId: "23582741",
  listingId: "4561821192",
  candidateId: "ETSY-DISCOVERY-FIX-PD-STOCK-005-V1-2026-09-08-B",
  candidateFingerprint: "ce86c67091e5ecf612d056056b558c2301a64e057517b78e6628b0eca5115fdb",
  buildId: "ETSY-DISCOVERY-FIX-PD-STOCK-005-BUILD-20260908-B01",
  buildFingerprint: "19ce5029beafbdf049d4867ec2dd5d29332ea3128c38437293f3c812c6a54f37",
  acceptanceCriteriaVersion: "PD-STOCK-005-DISCOVERY-FIX-AC-V2",
  acceptanceCriteriaSha256: "6a4cc10bf89370c6629113af1907d3ba0be735312eb4bc235f03220ffc433375",
  protectedFieldSnapshotSha256: "f4c57e5d3cfa427dedec022a3c3dcfd77bedc56e0198d3c56bbff4aeeb72bd60",
  title: "Restaurant & Cafe Inventory Tracker | Stock, Waste, Reorder & Supplier Spreadsheet",
  tags: [
    "restaurant inventory",
    "cafe stock tracker",
    "kitchen inventory",
    "food waste tracker",
    "reorder spreadsheet",
    "supplier tracker",
    "par level sheet",
    "stock count sheet",
    "stock control",
    "inventory excel",
    "google sheets stock",
    "waste cost log",
    "food stocktake"
  ] as readonly string[],
  preservedTaxonomyId: 12476
} as const);

const TOP_LEVEL_FIELDS = [
  "acceptanceCriteriaSha256", "acceptanceCriteriaVersion", "authorizationId", "buildFingerprint",
  "buildId", "candidateFingerprint", "candidateId", "listingId", "operation", "operationId",
  "patch", "productId", "productVersion", "protectedFieldSnapshotSha256", "shopId"
];
const PATCH_FIELDS = ["tags", "title"];

type ExactInput = {
  operation: string; operationId: string; authorizationId: string; productId: string; productVersion: string;
  shopId: string; listingId: string; candidateId: string; candidateFingerprint: string; buildId: string;
  buildFingerprint: string; acceptanceCriteriaVersion: string; acceptanceCriteriaSha256: string;
  protectedFieldSnapshotSha256: string; patch: { title: string; tags: string[] };
};

export type PdStock005B01Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  now?: () => string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function exactKeys(value: Record<string, unknown>, expected: string[]) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected);
}

function exactInput(body: Record<string, unknown>): ExactInput | null {
  if (!exactKeys(body, TOP_LEVEL_FIELDS) || !isRecord(body.patch) || !exactKeys(body.patch, PATCH_FIELDS)) return null;
  if (!Array.isArray(body.patch.tags) || !body.patch.tags.every((tag) => typeof tag === "string")) return null;
  const input = body as unknown as ExactInput;
  const scalarChecks: Array<[string, string]> = [
    [input.operation, PD_STOCK_005_B01.operation],
    [input.operationId, PD_STOCK_005_B01.operationId],
    [input.authorizationId, PD_STOCK_005_B01.authorizationId],
    [input.productId, PD_STOCK_005_B01.productId],
    [input.productVersion, PD_STOCK_005_B01.productVersion],
    [input.shopId, PD_STOCK_005_B01.shopId],
    [input.listingId, PD_STOCK_005_B01.listingId],
    [input.candidateId, PD_STOCK_005_B01.candidateId],
    [input.candidateFingerprint, PD_STOCK_005_B01.candidateFingerprint],
    [input.buildId, PD_STOCK_005_B01.buildId],
    [input.buildFingerprint, PD_STOCK_005_B01.buildFingerprint],
    [input.acceptanceCriteriaVersion, PD_STOCK_005_B01.acceptanceCriteriaVersion],
    [input.acceptanceCriteriaSha256, PD_STOCK_005_B01.acceptanceCriteriaSha256],
    [input.protectedFieldSnapshotSha256, PD_STOCK_005_B01.protectedFieldSnapshotSha256],
    [input.patch.title, PD_STOCK_005_B01.title]
  ];
  if (scalarChecks.some(([actual, expected]) => actual !== expected)) return null;
  if (JSON.stringify(input.patch.tags) !== JSON.stringify(PD_STOCK_005_B01.tags)) return null;
  return input;
}

function validateWriteAuthorization(request: Request) {
  const expected = process.env.ETSY_DRAFT_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!expected) return NextResponse.json({ error: "PD_STOCK_005_B01_AUTH_NOT_CONFIGURED" }, { status: 503 });
  if (!supplied || !secureEqual(supplied, expected)) {
    return NextResponse.json({ error: "PD_STOCK_005_B01_UNAUTHORIZED" }, { status: 401 });
  }
  return null;
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}

function tagsMatch(value: unknown) {
  return Array.isArray(value) && JSON.stringify(value) === JSON.stringify(PD_STOCK_005_B01.tags);
}

function targetApplied(listing: Record<string, unknown>) {
  return listing.title === PD_STOCK_005_B01.title && tagsMatch(listing.tags);
}

function protectedSnapshot(listing: Record<string, unknown>) {
  return {
    shopId: listing.shop_id,
    description: listing.description,
    price: listing.price,
    taxonomyId: listing.taxonomy_id,
    quantity: listing.quantity,
    whoMade: listing.who_made,
    whenMade: listing.when_made,
    listingType: listing.listing_type ?? listing.type
  };
}

function protectedFieldsPreserved(before: Record<string, unknown>, after: Record<string, unknown>) {
  return JSON.stringify(protectedSnapshot(before)) === JSON.stringify(protectedSnapshot(after));
}

function receipt(record: OperationLedgerRecord, providerPatchCount: 0 | 1, updateStatusCode: number | null, readBackStatusCode: number) {
  return NextResponse.json({
    status: providerPatchCount === 1 ? "UPDATED_AND_VERIFIED" : "RECONCILED",
    mode: "WRITE_ONCE",
    operationId: record.operationId,
    requestHash: record.requestHash,
    ledgerStatus: "SUCCEEDED",
    providerPatchCount,
    providerReceipt: { updateStatusCode, readBackStatusCode },
    authorizationId: PD_STOCK_005_B01.authorizationId,
    buildId: PD_STOCK_005_B01.buildId,
    buildFingerprint: PD_STOCK_005_B01.buildFingerprint,
    listingId: PD_STOCK_005_B01.listingId,
    shopId: PD_STOCK_005_B01.shopId,
    verified: { title: "PASS", tagsExactOrdered13: "PASS", protectedProviderFieldsUnchanged: "PASS" }
  });
}

export async function handlePdStock005B01TitleTags(
  body: Record<string, unknown>,
  request: Request,
  runtime: PdStock005B01Runtime = {}
) {
  if (process.env.PUBLISH_WRITES_ENABLED !== "true") {
    return NextResponse.json({ error: "PD_STOCK_005_B01_WRITES_DISABLED" }, { status: 403 });
  }
  const authError = validateWriteAuthorization(request);
  if (authError) return authError;
  const input = exactInput(body);
  if (!input) {
    return NextResponse.json({ error: "PD_STOCK_005_B01_AUTHORIZATION_CONTRACT_MISMATCH", providerPatchCount: 0 }, { status: 409 });
  }
  if ((process.env.ETSY_SHOP_ID?.trim() ?? "") !== PD_STOCK_005_B01.shopId) {
    return NextResponse.json({ error: "PD_STOCK_005_B01_SHOP_MISMATCH", providerPatchCount: 0 }, { status: 409 });
  }

  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  const now = runtime.now?.() ?? new Date().toISOString();
  let begun: Awaited<ReturnType<typeof beginOperation>>;
  try {
    begun = await beginOperation(repository, input.operationId, input, now);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "OPERATION_LEDGER_ERROR", providerPatchCount: 0 }, { status: 409 });
  }

  if (begun.status === "REPLAY" && begun.record.status === "SUCCEEDED") {
    return NextResponse.json({ status: "REPLAY", mode: "WRITE_ONCE", operationId: begun.record.operationId, requestHash: begun.record.requestHash, ledgerStatus: begun.record.status, providerPatchCount: 0, receipt: begun.record.receipt });
  }

  const fetchImpl = runtime.fetchImpl ?? fetch;
  const accessToken = await (runtime.getAccessToken ?? getValidEtsyAccessToken)();
  const readUrl = `https://api.etsy.com/v3/application/listings/${PD_STOCK_005_B01.listingId}`;
  const patchUrl = `https://api.etsy.com/v3/application/shops/${PD_STOCK_005_B01.shopId}/listings/${PD_STOCK_005_B01.listingId}`;

  const read = async () => {
    const response = await fetchImpl(readUrl, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" });
    const value = await parseJson(response);
    return { response, value: isRecord(value) ? value : null };
  };

  if (begun.status === "REPLAY") {
    const current = await read();
    if (current.response.ok && current.value && targetApplied(current.value)) {
      const completed = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "SUCCEEDED", now, { receipt: { reconciled: true, providerPatchCount: 0 } });
      return receipt(completed, 0, null, current.response.status);
    }
    return NextResponse.json({ error: "PD_STOCK_005_B01_ALREADY_CLAIMED", ledgerStatus: begun.record.status, providerPatchCount: 0 }, { status: 409 });
  }

  const before = await read();
  if (!before.response.ok || !before.value) {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "FAILED", now, { recoveryPoint: "PRE_READ_FAILED" });
    return NextResponse.json({ error: "PD_STOCK_005_B01_PREREAD_FAILED", providerPatchCount: 0 }, { status: 502 });
  }
  if (String(before.value.shop_id) !== PD_STOCK_005_B01.shopId || String(before.value.state).toLowerCase() !== "active" || Number(before.value.taxonomy_id) !== PD_STOCK_005_B01.preservedTaxonomyId) {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "FAILED", now, { recoveryPoint: "PRECONDITION_MISMATCH" });
    return NextResponse.json({ error: "PD_STOCK_005_B01_PRECONDITION_MISMATCH", providerPatchCount: 0 }, { status: 409 });
  }
  if (targetApplied(before.value)) {
    const completed = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "SUCCEEDED", now, { receipt: { reconciled: true, providerPatchCount: 0 } });
    return receipt(completed, 0, null, before.response.status);
  }

  // Deliberately limited to the only two fields named in the immutable authorization.
  const patchBody = new URLSearchParams();
  patchBody.set("title", PD_STOCK_005_B01.title);
  patchBody.set("tags", PD_STOCK_005_B01.tags.join(","));
  let updateResponse: Response;
  try {
    updateResponse = await fetchImpl(patchUrl, {
      method: "PATCH",
      headers: { ...etsyApiHeaders(accessToken), "content-type": "application/x-www-form-urlencoded" },
      body: patchBody,
      cache: "no-store"
    });
  } catch {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", now, { recoveryPoint: "POST_PATCH_READBACK" });
    return NextResponse.json({ error: "PD_STOCK_005_B01_PATCH_AMBIGUOUS", providerPatchCount: 1 }, { status: 202 });
  }
  await parseJson(updateResponse);
  if (!updateResponse.ok) {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "FAILED", now, { recoveryPoint: "PATCH_REJECTED" });
    return NextResponse.json({ error: "PD_STOCK_005_B01_PATCH_REJECTED", statusCode: updateResponse.status, providerPatchCount: 1 }, { status: 502 });
  }

  const after = await read();
  if (!after.response.ok || !after.value || !targetApplied(after.value) || !protectedFieldsPreserved(before.value, after.value)) {
    await recordOperationResult(repository, input.operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", now, { recoveryPoint: "POST_PATCH_VERIFICATION" });
    return NextResponse.json({ error: "PD_STOCK_005_B01_POSTREAD_MISMATCH", providerPatchCount: 1 }, { status: 202 });
  }
  const completed = await recordOperationResult(repository, input.operationId, begun.record.requestHash, "SUCCEEDED", now, {
    receipt: { providerPatchCount: 1, updateStatusCode: updateResponse.status, readBackStatusCode: after.response.status }
  });
  return receipt(completed, 1, updateResponse.status, after.response.status);
}
