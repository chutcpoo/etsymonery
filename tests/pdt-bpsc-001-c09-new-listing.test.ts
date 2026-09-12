import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  exactPdtBpsc001C09Body,
  pdtBpsc001C09AuthorizationRequestHash,
  PDT_BPSC_001_C09,
  PDT_BPSC_001_C09_ASSETS,
  PDT_BPSC_001_C09_LISTING_FINGERPRINT,
  verifyPdtBpsc001C09ProtectedState
} from "../lib/pdt-bpsc-001-c09-new-listing";

const ACTIVE_IDS = [4560696421,4561793463,4561795303,4561819638,4561821192,4566738686,4568730165,4569445414];
const json = (response: Response) => response.json() as Promise<Record<string, unknown>>;

function readOnlyProvider(options: { collision?: boolean } = {}) {
  let writes = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (method !== "GET") writes += 1;
    if (url.pathname.endsWith("/shops/23582741")) {
      return Response.json({ shop_id: 23582741, shop_name: "PoonthaiDigital", currency_code: "USD" });
    }
    if (url.pathname.endsWith("/shops/23582741/listings")) {
      const state = url.searchParams.get("state");
      if (state === "active") {
        return Response.json({ count: ACTIVE_IDS.length, results: ACTIVE_IDS.map((listing_id) => ({ listing_id, title: `existing-${listing_id}` })) });
      }
      if (state === "draft") {
        return options.collision
          ? Response.json({ count: 1, results: [{ listing_id: 9999999999, title: PDT_BPSC_001_C09.title }] })
          : Response.json({ count: 0, results: [] });
      }
    }
    return Response.json({ error: "not found" }, { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, writes: () => writes };
}

test("locks exact immutable C09 identity and canonical payload", () => {
  assert.equal(PDT_BPSC_001_C09.operationId, "PDT-BPSC-001-C09-NEW-LISTING-001");
  assert.equal(PDT_BPSC_001_C09.operation, "CREATE_NEW_DIGITAL_LISTING_EXACT_C09_ONLY");
  assert.equal(PDT_BPSC_001_C09.candidateId, "ETSY-LISTING-CANDIDATE-PDT-BPSC-001-V1-B04-20260912-C09");
  assert.equal(PDT_BPSC_001_C09.candidateFingerprint, "4fe93e0ea22a9151f413e366ee0282072199e3ec215ff0c1a6d00acb12bb81fa");
  assert.equal(PDT_BPSC_001_C09.buildFingerprint, "a093bfbe9e12b8d48f2738564e5562709b984cdece9d673eb2087b4f9ddf94bc");
  assert.equal(PDT_BPSC_001_C09.acceptanceCriteriaSha256, "da0ae8f6300d348c053254521a86657cb4a3e7f3a8c776f3e80c063965681ed8");
  assert.equal(PDT_BPSC_001_C09.packageFingerprint, "88f4840fe4c0a3eb748153f59a0b7663fcbe577057022a56bd4b043643ae720f");
  assert.equal(PDT_BPSC_001_C09.tags.length, 13);
  assert.deepEqual(PDT_BPSC_001_C09.tags, ["production schedule","bakery production","bakery schedule","baking schedule","bake day planner","bake day workflow","bakery workflow","bakery spreadsheet","bakery order planner","bakery capacity","production planner","production planning","excel template"]);
  assert.equal(PDT_BPSC_001_C09_LISTING_FINGERPRINT, "04f594da40849d67d8617c6ccc2e339ecc76c73371711ce83fbf9d3de2b54324");
});

test("locks exact 10 gallery plus 5 buyer-file identities", () => {
  assert.equal(PDT_BPSC_001_C09.gallery.length, 10);
  assert.equal(PDT_BPSC_001_C09.buyerFiles.length, 5);
  assert.equal(PDT_BPSC_001_C09_ASSETS.length, 15);
  assert.equal(new Set(PDT_BPSC_001_C09_ASSETS.map((asset) => asset.sha256)).size, 15);
  assert.equal(PDT_BPSC_001_C09.buyerFiles[0].sha256, "da0a6e1439613a19366cc6e8c223761fad5d7c8fcf247a83c0402ff2d351fa8b");
  assert.equal(PDT_BPSC_001_C09.gallery[0].sha256, "8056236c3095eeadfbe692552c4f7242eab8852d032b11c4a5c489cdbc056db9");
});

test("authorization request hash binds authorization and fresh protected state", () => {
  const protectedStateA = "a".repeat(64);
  const protectedStateB = "b".repeat(64);
  const body = exactPdtBpsc001C09Body("AUTH-C09-001", protectedStateA);
  const hash = pdtBpsc001C09AuthorizationRequestHash("AUTH-C09-001", protectedStateA);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, pdtBpsc001C09AuthorizationRequestHash("AUTH-C09-002", protectedStateA));
  assert.notEqual(hash, pdtBpsc001C09AuthorizationRequestHash("AUTH-C09-001", protectedStateB));
  assert.equal(body.candidateFingerprint, PDT_BPSC_001_C09.candidateFingerprint);
  assert.equal(body.protectedStateFingerprint, protectedStateA);
});

test("fresh protected-state verifier is GET-only and returns exact match", async () => {
  process.env.ETSY_SHOP_ID = "23582741";
  const provider = readOnlyProvider();
  const response = await verifyPdtBpsc001C09ProtectedState({ fetchImpl: provider.fetchImpl, getAccessToken: async () => "token" });
  const payload = await json(response);
  assert.equal(response.status, 200);
  assert.equal(payload.status, "PROTECTED_STATE_MATCH");
  assert.equal(payload.candidateFingerprint, PDT_BPSC_001_C09.candidateFingerprint);
  assert.equal(payload.listingFingerprint, PDT_BPSC_001_C09_LISTING_FINGERPRINT);
  assert.equal(payload.targetCollision, "NONE");
  assert.equal(payload.ETSY_WRITE_COUNT, 0);
  assert.equal(provider.writes(), 0);
});

test("target collision fails closed with zero Etsy writes", async () => {
  process.env.ETSY_SHOP_ID = "23582741";
  const provider = readOnlyProvider({ collision: true });
  const response = await verifyPdtBpsc001C09ProtectedState({ fetchImpl: provider.fetchImpl, getAccessToken: async () => "token" });
  const payload = await json(response);
  assert.equal(response.status, 409);
  assert.equal(payload.status, "PROTECTED_STATE_MISMATCH");
  assert.deepEqual(payload.targetCollisionIds, ["9999999999"]);
  assert.equal(payload.ETSY_WRITE_COUNT, 0);
  assert.equal(provider.writes(), 0);
});

test("C09 is registered in protected OIDC ingress, asset whitelist and workflow binding", () => {
  const operationRoute = readFileSync(new URL("../app/api/internal/etsy/authorized-operation/route.ts", import.meta.url), "utf8");
  const assetRoute = readFileSync(new URL("../app/api/internal/etsy/authorized-operation/asset-chunk/route.ts", import.meta.url), "utf8");
  const workflow = readFileSync(new URL("../.github/workflows/execute-authorized-etsy-operation.yml", import.meta.url), "utf8");
  assert.match(operationRoute, /PDT_BPSC_001_C09\.operationId/);
  assert.match(operationRoute, /verifyPdtBpsc001C09ProtectedState/);
  assert.match(operationRoute, /authorizationRequestHash/);
  assert.match(assetRoute, /PDT_BPSC_001_C09_ASSETS\.find/);
  assert.match(workflow, /authorization_request_hash/);
  assert.match(workflow, /PUBLISHED_AND_VERIFIED/);
});
