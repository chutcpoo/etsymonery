import assert from "node:assert/strict";
import test from "node:test";
import { createFullDraftOrchestratorHandler, parseFullDraftRequest } from "../lib/etsy-full-draft-orchestrator";

const fp = "a".repeat(64);
const listing = {
  title: "Test Digital Product",
  description: "Test description for orchestrator.",
  priceUsd: 4.99,
  tags: Array(13).fill(0).map((_, i) => `tag${i + 1}`),
  quantity: 999,
  taxonomy_id: 12478,
  who_made: "i_did",
  when_made: "2020_2026",
  type: "download" as const,
  state: "draft" as const
};

function baseRequest(action: "PREFLIGHT" | "EXECUTE" = "PREFLIGHT") {
  return {
    action,
    operationId: "ORCH-TEST-001",
    shopId: 23582741,
    productId: "PDT-TEST-001",
    candidateId: "CAND-TEST",
    candidateFingerprint: fp,
    expectedListingFingerprint: fp,
    listing,
    assets: [
      {
        kind: "UPLOAD_IMAGE" as const,
        driveFileId: "drive-image-1",
        assetName: "hero.jpg",
        expectedSha256: "b".repeat(64),
        expectedBytes: 100000,
        rank: 1
      }
    ],
    qc: {
      state: "QC_PASSED" as const,
      productTruthVerified: true as const,
      testerFingerprint: fp,
      independentFinalQcFingerprint: fp
    }
  };
}

function makeReq(body: unknown) {
  return new Request("https://example.com/api/orchestrator", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

test("parseFullDraftRequest accepts valid PREFLIGHT payload", () => {
  const parsed = parseFullDraftRequest(baseRequest());
  assert.equal(parsed.action, "PREFLIGHT");
  assert.equal(parsed.assets.length, 1);
});

test("parseFullDraftRequest rejects missing assets", () => {
  assert.throws(
    () => parseFullDraftRequest({ ...baseRequest(), assets: [] }),
    /ORCHESTRATOR_ASSETS_REQUIRED/
  );
});

test("parseFullDraftRequest rejects too many assets", () => {
  const many = Array(16).fill(baseRequest().assets[0]);
  assert.throws(
    () => parseFullDraftRequest({ ...baseRequest(), assets: many }),
    /ORCHESTRATOR_ASSETS_TOO_MANY/
  );
});

test("PREFLIGHT returns counts without writes", async () => {
  const handler = createFullDraftOrchestratorHandler();
  const response = await handler(makeReq(baseRequest("PREFLIGHT")));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "ORCHESTRATOR_PREFLIGHT_OK");
  assert.equal(body.mode, "READ_ONLY");
  assert.equal(body.ETSY_WRITE_COUNT, 0);
  assert.equal(body.assetCount, 1);
  assert.equal(body.publishAuthorized, false);
});

test("EXECUTE fails closed when draft create is blocked", async () => {
  const handler = createFullDraftOrchestratorHandler();
  const response = await handler(makeReq(baseRequest("EXECUTE")));
  const body = await response.json();
  // Without proper gates / mocked success, it should block
  assert.ok(response.status >= 400);
  assert.equal(body.publishAuthorized, false);
  assert.ok(body.ETSY_WRITE_COUNT === 0 || body.ETSY_WRITE_COUNT === "UNKNOWN");
});
