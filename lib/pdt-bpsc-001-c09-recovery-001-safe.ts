import { NextResponse } from "next/server";
import {
  exactPdtBpsc001C09Recovery001Body,
  handlePdtBpsc001C09Recovery001,
  PDT_BPSC_001_C09_RECOVERY_001
} from "./pdt-bpsc-001-c09-recovery-001";
import { PDT_BPSC_001_C09_ASSETS } from "./pdt-bpsc-001-c09-new-listing";
import {
  NeonOperationLedgerRepository,
  type OperationLedgerRecord,
  type OperationLedgerRepository
} from "./operation-ledger";

export type PdtBpsc001C09Recovery001SafeRuntime = Parameters<typeof handlePdtBpsc001C09Recovery001>[3] & {
  repository?: OperationLedgerRepository;
};

function providerOperationIds() {
  return [
    ...PDT_BPSC_001_C09_ASSETS.map((asset) => {
      const kind = asset.kind === "UPLOAD_IMAGE" ? "IMAGE" : "FILE";
      return `${PDT_BPSC_001_C09_RECOVERY_001.operationId}:${kind}:${String(asset.rank).padStart(2, "0")}`;
    }),
    `${PDT_BPSC_001_C09_RECOVERY_001.operationId}:PUBLISH`
  ];
}

async function snapshot(repository: OperationLedgerRepository) {
  const ids = [PDT_BPSC_001_C09_RECOVERY_001.operationId, ...providerOperationIds()];
  const entries = await Promise.all(ids.map(async (operationId) => [operationId, await repository.load(operationId)] as const));
  return new Map<string, OperationLedgerRecord | null>(entries);
}

function hasUnresolved(after: Map<string, OperationLedgerRecord | null>) {
  return [PDT_BPSC_001_C09_RECOVERY_001.operationId, ...providerOperationIds()].some((operationId) => {
    const record = after.get(operationId);
    return record?.status === "PENDING" || record?.status === "RECONCILIATION_REQUIRED";
  });
}

function confirmedWritesThisRequest(
  before: Map<string, OperationLedgerRecord | null>,
  after: Map<string, OperationLedgerRecord | null>
) {
  return providerOperationIds().filter((operationId) => {
    if (before.get(operationId)) return false;
    return after.get(operationId)?.status === "SUCCEEDED";
  }).length;
}

function totalConfirmedProviderOperations(after: Map<string, OperationLedgerRecord | null>) {
  return providerOperationIds().filter((operationId) => after.get(operationId)?.status === "SUCCEEDED").length;
}

function responseStatus(payload: Record<string, unknown>, unresolved: boolean) {
  if (unresolved || payload.status === "RECONCILIATION_REQUIRED") return "UNRESOLVED_REQUIRES_RECONCILIATION";
  if (payload.status === "PUBLISHED_AND_VERIFIED") return "CONFIRMED";
  return "CONFIRMED_TO_LEDGER_STATE";
}

export async function handlePdtBpsc001C09Recovery001Safe(
  body: ReturnType<typeof exactPdtBpsc001C09Recovery001Body>,
  authorizationRequestHash: string,
  request: Request,
  runtime: PdtBpsc001C09Recovery001SafeRuntime = {}
) {
  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  const before = await snapshot(repository);
  const response = await handlePdtBpsc001C09Recovery001(
    body,
    authorizationRequestHash,
    request,
    { ...runtime, repository }
  );
  const payload = await response.clone().json() as Record<string, unknown>;
  const after = await snapshot(repository);
  const confirmedThisRequest = confirmedWritesThisRequest(before, after);
  const unresolved = hasUnresolved(after) || payload.status === "RECONCILIATION_REQUIRED";
  const totalConfirmed = totalConfirmedProviderOperations(after);
  const { ETSY_WRITE_COUNT: _unsafeCount, ...rest } = payload;

  return NextResponse.json({
    ...rest,
    ETSY_WRITE_COUNT_STATUS: responseStatus(payload, unresolved),
    ETSY_WRITE_COUNT_CONFIRMED_MINIMUM: confirmedThisRequest,
    ...(unresolved ? {} : { ETSY_WRITE_COUNT: confirmedThisRequest }),
    ETSY_CONFIRMED_OPERATION_COUNT_TOTAL: totalConfirmed
  }, { status: response.status });
}
