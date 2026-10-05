import { beginOperation, recordOperationResult, type OperationLedgerRepository, type OperationLedgerRecord } from "./operation-ledger";

export type ReleaseReceipt = { providerResourceId: string; kind: string; disposition: "CREATED" | "RECONCILED"; [key: string]: unknown };
export interface ReleaseOperationProvider {
  baseline(): Promise<Record<string, unknown>>;
  apply(): Promise<string>;
  verify(resourceId: string): Promise<ReleaseReceipt | null>;
  reconcile(baseline: Record<string, unknown>): Promise<ReleaseReceipt | null>;
}
// PENDING includes the crash window before/after POST. Every replay is GET-only.
export async function executeReleaseOperation(ledger: OperationLedgerRepository, operationId: string,
  payload: Record<string, unknown>, provider: ReleaseOperationProvider, now: () => string) {
  const begun = await beginOperation(ledger, operationId, payload, now());
  let record = begun.record;
  const reconcile = async () => {
    let receipt: ReleaseReceipt | null = null;
    try {
      if (record.receipt?.providerResourceId) {
        receipt = await provider.verify(String(record.receipt.providerResourceId));
      } else if (record.receipt?.baseline) {
        receipt = await provider.reconcile(record.receipt.baseline as Record<string, unknown>);
      }
    } catch { /* Unprovable outcomes remain unresolved, never retried. */ }
    if (receipt) {
      await recordOperationResult(ledger, operationId, record.requestHash, "SUCCEEDED", now(), { receipt });
      return { status: "SUCCEEDED" as const, receipt, replay: begun.status === "REPLAY" };
    }
    if (record.status === "SUCCEEDED") {
      await ledger.save({ ...record, status: "RECONCILIATION_REQUIRED", recoveryPoint: "FRESH_RECEIPT_VERIFICATION_FAILED", updatedAt: now() });
    } else await recordOperationResult(ledger, operationId, record.requestHash, "RECONCILIATION_REQUIRED", now(), { recoveryPoint: "GET_ONLY_READBACK" });
    return { status: "RECONCILIATION_REQUIRED" as const, replay: begun.status === "REPLAY" };
  };
  if (begun.status === "REPLAY") return reconcile();
  try {
    const baseline = await provider.baseline();
    record = { ...record, receipt: { baseline }, updatedAt: now() };
    await ledger.save(record); // durable before the first byte of the mutation
    if (baseline.existingResourceId) return reconcile();
  } catch (error) {
    await recordOperationResult(ledger, operationId, record.requestHash, "FAILED", now(), { recoveryPoint: "PRE_WRITE_BLOCKED" });
    throw error;
  }
  // No exception after entering apply is evidence that no mutation happened.
  try {
    const id = await provider.apply();
    record = { ...record, receipt: { ...record.receipt, providerResourceId: id }, updatedAt: now() };
    await ledger.save(record);
    const receipt = await provider.verify(id);
    if (receipt) {
      await recordOperationResult(ledger, operationId, record.requestHash, "SUCCEEDED", now(), { receipt });
      return { status: "SUCCEEDED" as const, receipt, replay: false };
    }
  } catch { /* network, 5xx, malformed receipt, readback failure: GET-only */ }
  return reconcile();
}
export function operationSummary(record: OperationLedgerRecord | null) {
  return record ? { operationId: record.operationId, status: record.status, receipt: record.receipt, recoveryPoint: record.recoveryPoint } : null;
}
