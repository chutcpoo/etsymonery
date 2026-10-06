import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
function worker(kind: string, id: string, fault?: string) {
  return JSON.parse(execFileSync(process.execPath,["--import","tsx","scripts/generic-durable-worker.ts",kind,id,...(fault?[fault]:[])],{encoding:"utf8",env:process.env}));
}
const id="preview-stub-interrupted";
const before=worker("status",id); assert.equal(before.operations[0].status,"RECONCILIATION_REQUIRED"); assert.equal(before.mockMutationCount,1);
const resumed=worker("prepare",id); assert.equal(resumed.httpStatus,200);assert.equal(resumed.status,"READY_TO_PUBLISH");assert.equal(resumed.mockMutationCount,4);
const status=worker("status",id);assert.equal(status.status,"READY_TO_PUBLISH");assert.equal(status.operations.length,4);
const replay=worker("prepare",id);assert.equal(replay.status,"READY_TO_PUBLISH");assert.equal(replay.mockMutationCount,4);
const denied=worker("publish",id);assert.equal(denied.error,"GENERIC_PRODUCTION_PUBLISH_DISABLED");
const rows=[before,resumed,status,replay,denied];assert.equal(new Set(rows.map(r=>r.instanceId)).size,rows.length);
for(const r of rows){assert.equal(r.ETSY_WRITE_COUNT,0);assert.equal(r.ledgerDurability,"NEON_DURABLE_PREVIEW_SCHEMA");}
console.log(JSON.stringify({newProcessPerRequest:true,scenario:"durable response-loss reconciliation then resume and replay",results:rows},null,2));
