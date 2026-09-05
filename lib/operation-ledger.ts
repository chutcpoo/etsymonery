import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { canonicalizeFingerprintPayload } from "./candidate-fingerprint";

export const OPERATION_LEDGER_SCHEMA_VERSION = "1.0.0" as const;
export type OperationStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "RECONCILIATION_REQUIRED";
export type OperationLedgerRecord = {
  schemaVersion: typeof OPERATION_LEDGER_SCHEMA_VERSION; operationId: string; requestHash: string; attempts: number; status: OperationStatus;
  receipt?: Record<string, unknown>; recoveryPoint?: string; createdAt: string; updatedAt: string;
};
export interface OperationLedgerRepository { load(operationId: string): Promise<OperationLedgerRecord | null>; save(record: OperationLedgerRecord): Promise<void>; }

function required(v:string,c:string){const n=v.normalize("NFC").trim();if(!n)throw new Error(c);return n;}
function instant(v:string,c:string){const n=required(v,c);if(!Number.isFinite(Date.parse(n)))throw new Error(c);return n;}
function clone<T>(v:T):T{return structuredClone(v);}
export function hashOperationRequest(payload: Record<string, unknown>) { const canonical=JSON.stringify(canonicalizeFingerprintPayload(payload)); return createHash("sha256").update(canonical,"utf8").digest("hex"); }
export function validateOperationLedgerRecord(r:OperationLedgerRecord):OperationLedgerRecord{
  if(r.schemaVersion!==OPERATION_LEDGER_SCHEMA_VERSION)throw new Error("UNSUPPORTED_OPERATION_LEDGER_SCHEMA_VERSION");
  const attempts=r.attempts;if(!Number.isSafeInteger(attempts)||attempts<1)throw new Error("INVALID_OPERATION_ATTEMPTS");
  const requestHash=required(r.requestHash,"INVALID_OPERATION_REQUEST_HASH").toLowerCase();if(!/^[a-f0-9]{64}$/.test(requestHash))throw new Error("INVALID_OPERATION_REQUEST_HASH");
  if(!(["PENDING","SUCCEEDED","FAILED","RECONCILIATION_REQUIRED"] as const).includes(r.status))throw new Error("INVALID_OPERATION_STATUS");
  const createdAt=instant(r.createdAt,"INVALID_OPERATION_CREATED_AT"), updatedAt=instant(r.updatedAt,"INVALID_OPERATION_UPDATED_AT");if(Date.parse(updatedAt)<Date.parse(createdAt))throw new Error("OPERATION_UPDATED_BEFORE_CREATED");
  return {schemaVersion:OPERATION_LEDGER_SCHEMA_VERSION,operationId:required(r.operationId,"INVALID_OPERATION_ID"),requestHash,attempts,status:r.status,...(r.receipt?{receipt:clone(r.receipt)}:{}),...(r.recoveryPoint?{recoveryPoint:required(r.recoveryPoint,"INVALID_RECOVERY_POINT")} :{}),createdAt,updatedAt};
}
export class MemoryOperationLedgerRepository implements OperationLedgerRepository{private records=new Map<string,OperationLedgerRecord>();async load(id:string){const r=this.records.get(id);return r?clone(r):null;}async save(r:OperationLedgerRecord){const n=validateOperationLedgerRecord(r);this.records.set(n.operationId,clone(n));}}
function sql(){const url=process.env.DATABASE_URL?.trim();if(!url)throw new Error("DATABASE_URL_NOT_CONFIGURED");return neon(url);}
export class NeonOperationLedgerRepository implements OperationLedgerRepository{
  private async ensure(){const q=sql();await q`CREATE TABLE IF NOT EXISTS channel_operation_ledger (operation_id text PRIMARY KEY, schema_version text NOT NULL, request_hash text NOT NULL, attempts integer NOT NULL, status text NOT NULL, receipt jsonb, recovery_point text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL)`;}
  async load(operationId:string){await this.ensure();const q=sql();const rows=await q`SELECT operation_id, schema_version, request_hash, attempts, status, receipt, recovery_point, created_at, updated_at FROM channel_operation_ledger WHERE operation_id=${operationId} LIMIT 1`;const x=rows[0] as any;if(!x)return null;return validateOperationLedgerRecord({schemaVersion:x.schema_version,operationId:x.operation_id,requestHash:x.request_hash,attempts:x.attempts,status:x.status, ...(x.receipt?{receipt:x.receipt}:{}),...(x.recovery_point?{recoveryPoint:x.recovery_point}:{}),createdAt:new Date(x.created_at).toISOString(),updatedAt:new Date(x.updated_at).toISOString()});}
  async save(record:OperationLedgerRecord){await this.ensure();const r=validateOperationLedgerRecord(record),q=sql();await q`INSERT INTO channel_operation_ledger(operation_id,schema_version,request_hash,attempts,status,receipt,recovery_point,created_at,updated_at) VALUES(${r.operationId},${r.schemaVersion},${r.requestHash},${r.attempts},${r.status},${r.receipt?JSON.stringify(r.receipt):null}::jsonb,${r.recoveryPoint??null},${r.createdAt},${r.updatedAt}) ON CONFLICT(operation_id) DO UPDATE SET attempts=EXCLUDED.attempts,status=EXCLUDED.status,receipt=EXCLUDED.receipt,recovery_point=EXCLUDED.recovery_point,updated_at=EXCLUDED.updated_at WHERE channel_operation_ledger.request_hash=EXCLUDED.request_hash`; }
}
export async function beginOperation(repo:OperationLedgerRepository, operationId:string, payload:Record<string,unknown>, now:string){const id=required(operationId,"INVALID_OPERATION_ID"),hash=hashOperationRequest(payload),existing=await repo.load(id);if(existing){if(existing.requestHash!==hash)throw new Error("OPERATION_ID_PAYLOAD_MISMATCH");return {status:"REPLAY" as const,record:existing};}const at=instant(now,"INVALID_OPERATION_TIME");const record=validateOperationLedgerRecord({schemaVersion:OPERATION_LEDGER_SCHEMA_VERSION,operationId:id,requestHash:hash,attempts:1,status:"PENDING",createdAt:at,updatedAt:at});await repo.save(record);return {status:"STARTED" as const,record};}
export async function recordOperationResult(repo:OperationLedgerRepository, operationId:string, requestHash:string, status:Exclude<OperationStatus,"PENDING">, now:string, options:{receipt?:Record<string,unknown>;recoveryPoint?:string}={}){const existing=await repo.load(operationId);if(!existing)throw new Error("OPERATION_NOT_FOUND");if(existing.requestHash!==requestHash.toLowerCase())throw new Error("OPERATION_ID_PAYLOAD_MISMATCH");if(existing.status==="SUCCEEDED")return existing;const record=validateOperationLedgerRecord({...existing,status,attempts:existing.attempts+1,updatedAt:instant(now,"INVALID_OPERATION_TIME"),...(options.receipt?{receipt:options.receipt}:{}),...(options.recoveryPoint?{recoveryPoint:options.recoveryPoint}:{})});await repo.save(record);return record;}
