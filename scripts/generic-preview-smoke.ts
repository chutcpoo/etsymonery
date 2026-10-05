import assert from "node:assert/strict";
import { PREVIEW_STUB_HEADER, PREVIEW_STUB_MARKER, PREVIEW_STUB_RELEASE_ID, previewStubForm } from "../lib/etsy-release-preview-fixture";

const base = process.env.PREVIEW_SMOKE_URL ?? "http://127.0.0.1:3001";
const headers: Record<string, string> = { [PREVIEW_STUB_HEADER]: PREVIEW_STUB_MARKER };
// Optional Vercel protection cookie is passed in process environment, never logged.
if (process.env.PREVIEW_SMOKE_COOKIE) headers.cookie = process.env.PREVIEW_SMOKE_COOKIE;
const results: Record<string, unknown>[] = [];
async function call(name: string, path: string, init: RequestInit = {}) {
  const response = await fetch(new URL(path, base), { ...init, headers: { ...headers, ...init.headers }, redirect: "error" });
  const body = await response.json();
  assert.equal(body.validationMode, "PREVIEW_STUB_ONLY"); assert.equal(body.ETSY_WRITE_COUNT, 0); assert.equal(body.livePublishPerformed, false);
  assert.equal(body.ledgerDurability, "NEON_DURABLE_PREVIEW_SCHEMA");
  if (process.env.PREVIEW_SMOKE_SHA) assert.equal(body.remoteCommitSha, process.env.PREVIEW_SMOKE_SHA);
  results.push({ name, httpStatus: response.status, status: body.status, error: body.error ?? null, EtsyProductionWriteCount: body.ETSY_WRITE_COUNT,
    instanceId: body.instanceId, sessionId: body.sessionId, operations: body.operations, ledgerSchema: body.ledgerSchema,
    mockMutationCount: body.mockMutationCount, ledgerDurability: body.ledgerDurability, remoteCommitSha: body.remoteCommitSha });
  return { response, body };
}
async function main() {
const interruptedPrefix = "/api/releases/preview-stub-interrupted";
if (process.env.PREVIEW_SMOKE_PHASE === "cold") {
  const saved = await call("cold-status-ready", `/api/releases/${PREVIEW_STUB_RELEASE_ID}/status`); assert.equal(saved.body.status,"READY_TO_PUBLISH"); assert.equal(saved.body.mockMutationCount,4);
  const held = await call("cold-interrupted-status", `${interruptedPrefix}/status`); assert.equal(held.body.status,"RECONCILIATION_REQUIRED"); assert.equal(held.body.mockMutationCount,1);
  const resumed = await call("cold-resume", "/api/releases/prepare", {method:"POST",body:previewStubForm("preview-stub-interrupted")}); assert.equal(resumed.body.status,"READY_TO_PUBLISH");assert.equal(resumed.body.mockMutationCount,4);
  const replay = await call("cold-replay", "/api/releases/prepare", {method:"POST",body:previewStubForm("preview-stub-interrupted")}); assert.equal(replay.body.status,"READY_TO_PUBLISH");assert.equal(replay.body.mockMutationCount,4);
  const after = await call("cold-status-after", `${interruptedPrefix}/status`); assert.equal(after.body.status,"READY_TO_PUBLISH");assert.equal(after.body.operations.length,4);
  console.log(JSON.stringify({url:base,phase:"cold",results},null,2));return;
}
const prefix = `/api/releases/${PREVIEW_STUB_RELEASE_ID}`;
const before = await call("status-before", `${prefix}/status`); assert.equal(before.response.status, 200);
const prepared = await call("prepare", "/api/releases/prepare", { method: "POST", body: previewStubForm() });
assert.equal(prepared.response.status, 200); assert.equal(prepared.body.status, "READY_TO_PUBLISH");
assert.equal(prepared.body.imageCount, 1); assert.equal(prepared.body.buyerFileCount, 1); assert.equal(prepared.body.videoCount, 1);
assert.equal(prepared.body.mockMutationCount, 4); assert.equal(prepared.body.qcResult.pass, true);
const repeat = await call("prepare-replay", "/api/releases/prepare", { method: "POST", body: previewStubForm() });
assert.equal(repeat.response.status, 200); assert.equal(repeat.body.status, "READY_TO_PUBLISH"); assert.equal(repeat.body.mockMutationCount, 4);
const after = await call("status-after", `${prefix}/status`); assert.equal(after.response.status, 200);
assert.equal(after.body.status, "READY_TO_PUBLISH");
assert.equal(after.body.operations.length, 4);
const publish = await call("publish-no-authorization", `${prefix}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
assert.equal(publish.response.status, 409); assert.equal(publish.body.error, "GENERIC_PRODUCTION_PUBLISH_DISABLED");
const forged = await call("publish-forged-authorization", `${prefix}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productionAuthorized: true, authorization: { state: "ACTIVE" } }) });
assert.equal(forged.response.status, 409); assert.equal(forged.body.error, "GENERIC_PRODUCTION_PUBLISH_DISABLED");
const real = await fetch(new URL("/api/releases/prepare", base), { method: "POST", headers: headers.cookie ? { cookie: headers.cookie } : {} });
assert.equal(real.status, 409); assert.equal((await real.json()).livePublishPerformed, false);
const legacy = await fetch(new URL("/api/internal/etsy/post-reset-v2/pdt-bipc-003/video-r01?action=execute", base), { headers: headers.cookie ? { cookie: headers.cookie } : {} });
assert.equal(legacy.status, 403); const legacyBody = await legacy.json(); assert.equal(legacyBody.error, "PREVIEW_REAL_ETSY_OPERATIONS_DISABLED"); assert.equal(legacyBody.ETSY_WRITE_COUNT, 0);
results.push({ name: "real-prepare-no-auth", httpStatus: real.status, EtsyProductionWriteCount: 0 }, { name: "legacy-GET-execute-blocked", httpStatus: legacy.status, EtsyProductionWriteCount: 0 });
const interrupted = await call("interrupt-after-provider-commit", "/api/releases/prepare", {method:"POST",body:previewStubForm("preview-stub-interrupted"),headers:{"x-preview-stub-fault":"draft-response-lost"}});
assert.equal(interrupted.response.status,409);assert.equal(interrupted.body.status,"RECONCILIATION_REQUIRED");assert.equal(interrupted.body.mockMutationCount,1);
const held = await call("status-interrupted", `${interruptedPrefix}/status`);assert.equal(held.body.status,"RECONCILIATION_REQUIRED");assert.equal(held.body.operations[0].recoveryPoint,"GET_ONLY_READBACK");assert.equal(held.body.mockMutationCount,1);
console.log(JSON.stringify({ url: base, validationMode: "PREVIEW_STUB_ONLY", EtsyProductionWriteCount: 0, results }, null, 2));

}
main().catch(error => { console.error(error); process.exitCode = 1; });
