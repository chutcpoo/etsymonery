import { beginOperation, recordOperationResult, type OperationLedgerRepository } from "./operation-ledger";

export const DRAFT_UPLOAD_RECONCILIATION_VERSION = "1.0.0" as const;
export type ReconciledWriteKind = "CREATE_DRAFT" | "UPLOAD_IMAGE" | "UPLOAD_FILE";
export type ProviderReceipt = { providerResourceId: string; kind: ReconciledWriteKind; metadata?: Record<string, unknown> };
export interface ReconciledWriteProvider {
  apply(input:{operationId:string;kind:ReconciledWriteKind;payload:Record<string,unknown>}):Promise<ProviderReceipt>;
  reconcile(input:{operationId:string;kind:ReconciledWriteKind;payload:Record<string,unknown>}):Promise<ProviderReceipt|null>;
}
export class ProviderAmbiguousResultError extends Error { constructor(){super("PROVIDER_AMBIGUOUS_RESULT");this.name="ProviderAmbiguousResultError";} }
function required(v:string,c:string){const n=v.normalize("NFC").trim();if(!n)throw new Error(c);return n;}
function receipt(r:ProviderReceipt){const id=required(r.providerResourceId,"INVALID_PROVIDER_RESOURCE_ID");if(!(["CREATE_DRAFT","UPLOAD_IMAGE","UPLOAD_FILE"] as const).includes(r.kind))throw new Error("INVALID_RECONCILED_WRITE_KIND");return {providerResourceId:id,kind:r.kind,...(r.metadata?{metadata:structuredClone(r.metadata)}:{})};}
export async function executeReconciledWrite(repo:OperationLedgerRepository,provider:ReconciledWriteProvider,input:{operationId:string;kind:ReconciledWriteKind;payload:Record<string,unknown>;now:string}){
  const envelope={kind:input.kind,payload:input.payload};const begun=await beginOperation(repo,input.operationId,envelope,input.now);
  if(begun.status==="REPLAY"&&begun.record.status==="SUCCEEDED"&&begun.record.receipt)return {status:"REPLAY" as const,receipt:begun.record.receipt};
  if(begun.status==="REPLAY"&&begun.record.status==="RECONCILIATION_REQUIRED"){const found=await provider.reconcile({operationId:input.operationId,kind:input.kind,payload:input.payload});if(found){const r=receipt(found);await recordOperationResult(repo,input.operationId,begun.record.requestHash,"SUCCEEDED",input.now,{receipt:r});return {status:"RECONCILED" as const,receipt:r};}}
  try{const applied=receipt(await provider.apply({operationId:input.operationId,kind:input.kind,payload:input.payload}));await recordOperationResult(repo,input.operationId,begun.record.requestHash,"SUCCEEDED",input.now,{receipt:applied});return {status:"APPLIED" as const,receipt:applied};}
  catch(error){if(error instanceof ProviderAmbiguousResultError){const found=await provider.reconcile({operationId:input.operationId,kind:input.kind,payload:input.payload});if(found){const r=receipt(found);await recordOperationResult(repo,input.operationId,begun.record.requestHash,"SUCCEEDED",input.now,{receipt:r});return {status:"RECONCILED" as const,receipt:r};}await recordOperationResult(repo,input.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",input.now,{recoveryPoint:"PROVIDER_READ_BACK"});return {status:"RECONCILIATION_REQUIRED" as const};}
    await recordOperationResult(repo,input.operationId,begun.record.requestHash,"FAILED",input.now,{recoveryPoint:"RETRY_SAME_OPERATION_ID"});throw error;}
}
