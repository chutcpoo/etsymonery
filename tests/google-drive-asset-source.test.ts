import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  fetchVerifiedGoogleDriveAsset,
  DRIVE_MAX_BUYER_BYTES
} from "../lib/google-drive-asset-source";

const ID = "1qZ9DriveFakeProductAsset123456";
const ROOT = "1qZ9DriveCanonicalRoot123456789";
const bytes = Buffer.from("%PDF-1.7\n test file\n", "utf8");
const sha = createHash("sha256").update(bytes).digest("hex");
const spec = {
  driveFileId: ID, assetName: "buyer.pdf", expectedSha256: sha,
  expectedBytes: bytes.byteLength, kind: "UPLOAD_FILE" as const
};

function googleBackend(changes: Record<string, unknown> = {}, root = ROOT) {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.includes("?alt=media")) return new Response(new Uint8Array(bytes));
    if (url.includes("/files/")) {
      return Response.json({
        id: ID, name: "buyer.pdf", mimeType: "application/pdf",
        size: String(bytes.byteLength), parents: [root],
        capabilities: { canDownload: true }, ...changes
      });
    }
    throw new Error("UNEXPECTED_GOOGLE_REQUEST");
  };
  return { calls, fetchImpl };
}

test("reads only exact Drive bytes below approved root and checks SHA-256", async () => {
  const backend = googleBackend();
  const file = await fetchVerifiedGoogleDriveAsset(spec, {
    sourceRootId: ROOT, getAccessToken: async () => "fixture-token",
    fetchImpl: backend.fetchImpl
  });
  assert.equal(file.sha256, sha);
  assert.equal(file.sizeBytes, bytes.byteLength);
  assert.equal(file.assetName, "buyer.pdf");
  assert.equal(backend.calls.length, 2);
  assert.ok(backend.calls.every(c => c.method === "GET"));
  assert.ok(backend.calls.every(c => c.url.startsWith("https://www.googleapis.com/drive/v3/files/")));
});

test("rejects Drive files outside canonical root before download", async () => {
  const backend = googleBackend({}, "1DifferentUnapprovedDriveRoot123");
  await assert.rejects(() => fetchVerifiedGoogleDriveAsset(spec, {
    sourceRootId: ROOT, getAccessToken: async () => "fixture-token",
    fetchImpl: backend.fetchImpl
  }), /UNEXPECTED_GOOGLE_REQUEST|GOOGLE_DRIVE_FILE_OUTSIDE_APPROVED_ROOT|GOOGLE_DRIVE_IDENTITY_MISMATCH/);
  assert.equal(backend.calls.some(c => c.url.includes("?alt=media")), false);
});

test("rejects metadata content drift, canDownload=false and mismatched bytes", async () => {
  for (const changes of [
    { size: String(bytes.byteLength + 1) },
    { name: "old-buyer.pdf" },
    { capabilities: { canDownload: false } }
  ]) {
    const backend = googleBackend(changes);
    await assert.rejects(() => fetchVerifiedGoogleDriveAsset(spec, {
      sourceRootId: ROOT, getAccessToken: async () => "fixture-token",
      fetchImpl: backend.fetchImpl
    }));
    assert.equal(backend.calls.some(c => c.url.includes("?alt=media")), false);
  }
  const backend = googleBackend();
  await assert.rejects(() => fetchVerifiedGoogleDriveAsset({
    ...spec, expectedSha256: "a".repeat(64)
  }, { sourceRootId: ROOT, getAccessToken: async () => "fixture-token",
       fetchImpl: backend.fetchImpl }), /GOOGLE_DRIVE_SOURCE_SHA256_MISMATCH/);
});

test("buyer limits and unsafe formats block before any network call", async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => { called = true; throw new Error("SHOULD_NOT_FETCH"); };
  for (const value of [
    { ...spec, expectedBytes: DRIVE_MAX_BUYER_BYTES + 1 },
    { ...spec, assetName: "buyer.svg" },
    { ...spec, assetName: "../buyer.pdf" },
    { ...spec, driveFileId: "https://evil.example/x.pdf" }
  ]) {
    await assert.rejects(() => fetchVerifiedGoogleDriveAsset(value, {
      sourceRootId: ROOT, fetchImpl, getAccessToken: async () => "fixture-token"
    }));
  }
  assert.equal(called, false);
});
