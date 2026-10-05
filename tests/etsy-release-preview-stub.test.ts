import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { createPreviewStubSession } from "../lib/etsy-release-preview-stub";
import { previewStubForm, PREVIEW_STUB_HEADER, PREVIEW_STUB_MARKER, PREVIEW_STUB_BRANCH, PREVIEW_STUB_RELEASE_ID } from "../lib/etsy-release-preview-fixture";
import { assertGenericPrepareRuntime } from "../lib/etsy-release-api";
function env() { Object.assign(process.env, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: PREVIEW_STUB_BRANCH, ETSY_GENERIC_PREPARE_ENABLED: "false" }); }
function request(body?: FormData) { return new Request("https://example.test", { method: "POST", headers: { [PREVIEW_STUB_HEADER]: PREVIEW_STUB_MARKER }, ...(body ? { body } : {}) }); }
test("preview stub prepare/status/publish have zero network, OAuth, DB dependency", async () => {
  const old = { ...process.env }; env(); delete process.env.ETSY_API_KEY; delete process.env.ETSY_SHARED_SECRET; delete process.env.DATABASE_URL;
  const native = globalThis.fetch; globalThis.fetch = async () => { throw new Error("ANY_NETWORK_FORBIDDEN"); };
  try {
    const api = createPreviewStubSession(); const first = await api.prepare(request(previewStubForm())); const body = await first.json();
    assert.equal(first.status, 200); assert.equal(body.status, "READY_TO_PUBLISH"); assert.equal(body.ETSY_WRITE_COUNT, 0); assert.equal(body.mockMutationCount, 4);
    const replay = await api.prepare(request(previewStubForm())); assert.equal((await replay.json()).mockMutationCount, 4);
    const status = await api.status(request(), PREVIEW_STUB_RELEASE_ID); assert.equal((await status.json()).status, "READY_TO_PUBLISH");
    const publish = await api.publish(request(), PREVIEW_STUB_RELEASE_ID); const denied = await publish.json(); assert.equal(publish.status, 409); assert.equal(denied.error, "GENERIC_PRODUCTION_PUBLISH_DISABLED"); assert.equal(denied.ETSY_WRITE_COUNT, 0);
  } finally { globalThis.fetch = native; process.env = old; }
});
test("stub disabled in production, other branches, or when real prepare enabled", async () => {
  const old = { ...process.env };
  try {
    for (const [environment, branch, enabled] of [["production", PREVIEW_STUB_BRANCH, "false"], ["preview", "main", "false"], ["preview", PREVIEW_STUB_BRANCH, "true"]]) {
      Object.assign(process.env, { VERCEL_ENV: environment, VERCEL_GIT_COMMIT_REF: branch, ETSY_GENERIC_PREPARE_ENABLED: enabled });
      const api = createPreviewStubSession(), r = await api.prepare(request(previewStubForm())); assert.equal(r.status, 409); assert.equal((await r.json()).mockMutationCount, 0);
    }
  } finally { process.env = old; }
});
test("real prepare cannot be enabled on validation branch", () => {
  const old = { ...process.env }; env(); process.env.ETSY_GENERIC_PREPARE_ENABLED = "true";
  try { assert.throws(assertGenericPrepareRuntime, /GENERIC_REAL_ETSY_PREVIEW_DISABLED/); } finally { process.env = old; }
});
test("legacy GET execute and all protected mutations blocked on preview branch", () => {
  const old = { ...process.env }; env();
  try { for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
    const r = middleware(new NextRequest("https://example.test/api/internal/etsy/post-reset-v2/pdt-bipc-003/video-r01?action=execute", { method })); assert.equal(r.status, 403);
  } } finally { process.env = old; }
});
