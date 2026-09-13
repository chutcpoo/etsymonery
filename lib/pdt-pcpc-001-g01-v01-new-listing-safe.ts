import { NextResponse } from "next/server";
import {
  exactPdtPcpc001Body,
  handlePdtPcpc001NewListing,
  PDT_PCPC_001_G01_V01,
  PDT_PCPC_001_G01_V01_ASSETS,
  type PdtPcpc001Asset
} from "./pdt-pcpc-001-g01-v01-new-listing";
import {
  NeonOperationLedgerRepository,
  type OperationLedgerRecord,
  type OperationLedgerRepository
} from "./operation-ledger";

export type PdtPcpc001SafeRuntime = {
  repository?: OperationLedgerRepository;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  loadAsset?: (asset: PdtPcpc001Asset) => Promise<Buffer>;
  now?: () => string;
};

function childOperationIds() {
  return [
    `${PDT_PCPC_001_G01_V01.operationId}:CREATE_DRAFT`,
    ...PDT_PCPC_001_G01_V01_ASSETS.map((asset) => {
      const kind = asset.kind === "UPLOAD_IMAGE" ? "IMAGE" : asset.kind === "UPLOAD_FILE" ? "FILE" : "VIDEO";
      return `${PDT_PCPC_001_G01_V01.operationId}:${kind}:${String(asset.rank).padStart(2, "0")}`;
    }),
    `${PDT_PCPC_001_G01_V01.operationId}:PUBLISH`
  ];
}

async function snapshot(repository: OperationLedgerRepository) {
  const entries = await Promise.all(
    childOperationIds().map(async (operationId) => [operationId, await repository.load(operationId)] as const)
  );
  return new Map<string, OperationLedgerRecord | null>(entries);
}

function hasUnresolved(after: Map<string, OperationLedgerRecord | null>) {
  return childOperationIds().some((operationId) => {
    const record = after.get(operationId);
    return record?.status === "PENDING" || record?.status === "RECONCILIATION_REQUIRED";
  });
}

function confirmedWritesThisRequest(
  before: Map<string, OperationLedgerRecord | null>,
  after: Map<string, OperationLedgerRecord | null>
) {
  return childOperationIds().filter((operationId) => {
    if (before.get(operationId)) return false;
    return after.get(operationId)?.status === "SUCCEEDED";
  }).length;
}

function totalConfirmedOperations(after: Map<string, OperationLedgerRecord | null>) {
  return childOperationIds().filter((operationId) => after.get(operationId)?.status === "SUCCEEDED").length;
}

function responseStatus(payload: Record<string, unknown>, unresolved: boolean) {
  if (unresolved || payload.status === "RECONCILIATION_REQUIRED") return "UNRESOLVED_REQUIRES_RECONCILIATION";
  if (payload.status === "PUBLISHED_AND_VERIFIED") return "CONFIRMED";
  return "CONFIRMED_TO_LEDGER_STATE";
}

export async function handlePdtPcpc001NewListingSafe(
  request: Request,
  runtime: PdtPcpc001SafeRuntime = {}
) {
  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  const before = await snapshot(repository);
  const response = await handlePdtPcpc001NewListing(exactPdtPcpc001Body(), request, { ...runtime, repository });
  const payload = await response.clone().json() as Record<string, unknown>;
  const after = await snapshot(repository);
  const confirmedThisRequest = confirmedWritesThisRequest(before, after);
  const unresolved = hasUnresolved(after) || payload.status === "RECONCILIATION_REQUIRED";
  const totalConfirmed = totalConfirmedOperations(after);
  const { ETSY_WRITE_COUNT: _unsafeCount, ...rest } = payload;

  return NextResponse.json({
    ...rest,
    ETSY_WRITE_COUNT_STATUS: responseStatus(payload, unresolved),
    ETSY_WRITE_COUNT_CONFIRMED_MINIMUM: confirmedThisRequest,
    ...(unresolved ? {} : { ETSY_WRITE_COUNT: confirmedThisRequest }),
    ETSY_CONFIRMED_OPERATION_COUNT_TOTAL: totalConfirmed
  }, { status: response.status });
}
