import { NextResponse } from "next/server";
import {
  exactPdtBpsc001C09Body,
  handlePdtBpsc001C09NewListing,
  PDT_BPSC_001_C09,
  PDT_BPSC_001_C09_ASSETS
} from "./pdt-bpsc-001-c09-new-listing";
import {
  NeonOperationLedgerRepository,
  type OperationLedgerRecord,
  type OperationLedgerRepository
} from "./operation-ledger";

export type PdtBpsc001C09SafeRuntime = {
  repository?: OperationLedgerRepository;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  loadAsset?: (asset: (typeof PDT_BPSC_001_C09_ASSETS)[number]) => Promise<Buffer>;
  now?: () => string;
};

function childOperationIds() {
  return [
    `${PDT_BPSC_001_C09.operationId}:CREATE_DRAFT`,
    ...PDT_BPSC_001_C09_ASSETS.map((asset) => {
      const kind = asset.kind === "UPLOAD_IMAGE" ? "IMAGE" : "FILE";
      return `${PDT_BPSC_001_C09.operationId}:${kind}:${String(asset.rank).padStart(2, "0")}`;
    }),
    `${PDT_BPSC_001_C09.operationId}:PUBLISH`
  ];
}

async function snapshot(repository: OperationLedgerRepository) {
  const entries = await Promise.all(
    childOperationIds().map(async (operationId) => [operationId, await repository.load(operationId)] as const)
  );
  return new Map<string, OperationLedgerRecord | null>(entries);
}

function isNewlyUnresolved(
  before: Map<string, OperationLedgerRecord | null>,
  after: Map<string, OperationLedgerRecord | null>
) {
  return childOperationIds().some((operationId) => {
    if (before.get(operationId)) return false;
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
    return after.get(operationId)?.status === "SUCCESS";
  }).length;
}

function totalConfirmedOperations(after: Map<string, OperationLedgerRecord | null>) {
  return childOperationIds().filter((operationId) => after.get(operationId)?.status === "SUCCESS").length;
}

function responseStatus(payload: Record<string, unknown>, unresolved: boolean) {
  if (unresolved) return "UNRESOLVED_REQUIRES_RECONCILIATION";
  if (payload.status === "PUBLISHED_AND_VERIFIED") return "CONFIRMED";
  return "CONFIRMED_TO_LEDGER_STATE";
}

export async function handlePdtBpsc001C09NewListingSafe(
  body: ReturnType<typeof exactPdtBpsc001C09Body>,
  authorizationRequestHash: string,
  request: Request,
  runtime: PdtBpsc001C09SafeRuntime = {}
) {
  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  const before = await snapshot(repository);
  const response = await handlePdtBpsc001C09NewListing(
    body,
    authorizationRequestHash,
    request,
    { ...runtime, repository }
  );
  const payload = await response.clone().json() as Record<string, unknown>;
  const after = await snapshot(repository);
  const confirmedThisRequest = confirmedWritesThisRequest(before, after);
  const unresolved = isNewlyUnresolved(before, after);
  const totalConfirmed = totalConfirmedOperations(after);
  const { ETSY_WRITE_COUNT: _unsafeCount, ...rest } = payload;

  return NextResponse.json(
    {
      ...rest,
      ETSY_WRITE_COUNT_STATUS: responseStatus(payload, unresolved),
      ETSY_WRITE_COUNT_CONFIRMED_MINIMUM: confirmedThisRequest,
      ...(unresolved ? {} : { ETSY_WRITE_COUNT: confirmedThisRequest }),
      ETSY_CONFIRMED_OPERATION_COUNT_TOTAL: totalConfirmed
    },
    { status: response.status }
  );
}
