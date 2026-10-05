import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { releaseFingerprints, validateReleaseManifest, listingIdentity, type ProductManifest, type ReleaseAsset } from "../lib/etsy-release-manifest";
import { MemoryOperationLedgerRepository, beginOperation } from "../lib/operation-ledger";
import { prepareRelease, releaseOperationIds, getReleaseStatus, publishReleaseForValidation, type ReleaseEngineDependencies } from "../lib/etsy-release-engine";
import { executeReleaseOperation } from "../lib/etsy-release-operation";
import { createReleaseApi, assertGenericPrepareRuntime } from "../lib/etsy-release-api";
import { createPublishAuthorization } from "../lib/publish-authorization";
import { getMissingEtsyScopes } from "../lib/etsy";
import { EtsyAuthorizedPublishProvider } from "../lib/etsy-authorized-publish-provider";

const NOW = "2026-10-05T05:00:00Z";
const png = Buffer.from("89504e470d0a1a0a00000000", "hex"), pdf = Buffer.from("%PDF-fixture"), mp4 = Buffer.from("000000146674797069736f6d00000000", "hex");
function asset(assetId: string, filename: string, mimeType: string, bytes: Buffer, altText?: string): ReleaseAsset {
  return { assetId, filename, mimeType, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), rank: 1, ...(altText ? { altText } : {}) };
}
function bind(m: ProductManifest) {
  const fp = releaseFingerprints(m);
  m.authoritativeCandidate = { candidateId: m.candidateId, ...fp, evidenceId: "candidate-evidence" };
  m.releaseLock.candidateFingerprint = fp.candidateFingerprint;
  m.testerPass.candidateFingerprint = fp.candidateFingerprint; m.finalQcPass.candidateFingerprint = fp.candidateFingerprint;
  return m;
}
function manifest(video = false): ProductManifest {
  return bind({ schemaVersion: "1.0.0", releaseId: "release-fixture", productId: "product-fixture", candidateId: "candidate-fixture",
    title: "Fixture Planner", description: "Fixture Description", price: 12.5, quantity: 999, taxonomyId: 123,
    tags: Array.from({ length: 13 }, (_, i) => `tag ${i}`), whoMade: "i_did", whenMade: "2020_2026", shop: { shopId: 77, userId: 88 },
    listingImages: [asset("image1", "image.png", "image/png", png, "Planner dashboard")], buyerFiles: [asset("file1", "buyer.pdf", "application/pdf", pdf)],
    ...(video ? { video: asset("video1", "preview.mp4", "video/mp4", mp4) } : {}),
    productTruth: { verified: true, evidenceId: "truth-evidence" }, releaseLock: { locked: true, candidateFingerprint: "", expiresAt: "2026-10-06T05:00:00Z" },
    authoritativeCandidate: { candidateId: "", candidateFingerprint: "", listingFingerprint: "", evidenceId: "" },
    testerPass: { pass: true, candidateFingerprint: "", evidenceId: "tester-evidence" }, finalQcPass: { pass: true, candidateFingerprint: "", evidenceId: "qc-evidence" }, productionAuthorized: false, protectedSellerState: [] });
}
function harness(m = manifest()) {
  process.env.ETSY_API_KEY = "test-only-key"; process.env.ETSY_SHARED_SECRET = "test-only-secret";
  const ledger = new MemoryOperationLedgerRepository();
  const listings: Array<Record<string, unknown>> = [], images: Array<Record<string, unknown>> = [], files: Array<Record<string, unknown>> = [], videos: Array<Record<string, unknown>> = [];
  const writes: string[] = [];
  let fault: "network" | "5xx" | "lost" | "readback" | null = null, wrongShop = false, failImage = false, drift = false;
  const newListing = (listing_id = 101) => {
    const { priceUsd, ...rest } = listingIdentity(m);
    return { ...rest, price: priceUsd, listing_id, shop_id: m.shop.shopId };
  };
  const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
  const fetchImpl: typeof fetch = async (input, init) => {
    const u = new URL(String(input)), method = init?.method ?? "GET", path = u.pathname;
    assert.equal(u.hostname, "api.etsy.com");
    if (method !== "GET") {
      assert.equal(method, "POST"); writes.push(path);
      if (path.endsWith("/listings")) {
        if (fault !== "lost") listings.push(newListing());
        if (fault === "network" || fault === "lost") throw new Error("mock timeout");
        if (fault === "5xx") return response({}, 503);
        return response({ listing_id: 101 });
      }
      const body = init?.body as FormData;
      if (path.endsWith("/images")) {
        if (failImage) return response({}, 503);
        images.push({ listing_image_id: 201, rank: Number(body.get("rank")), alt_text: body.get("alt_text") }); return response({ listing_image_id: 201 });
      }
      if (path.endsWith("/files")) { files.push({ listing_file_id: 301, rank: Number(body.get("rank")), filename: body.get("name"), size_bytes: pdf.length }); return response({ listing_file_id: 301 }); }
      if (path.endsWith("/videos")) { assert.equal(body.get("is_multi_video"), "false"); videos.push({ video_id: 401, video_state: "active", width: 1920, height: 1080 }); return response({ video_id: 401 }); }
      throw new Error(`UNEXPECTED_MOCK_WRITE:${path}`);
    }
    if (path.endsWith("/shops") && path.includes("/users/")) return response({ shop_id: wrongShop ? 99 : 77, user_id: 88 });
    if (path.endsWith("/listings")) { const result = listings.filter(r => r.state === u.searchParams.get("state")); return response({ count: result.length, results: result }); }
    if (path.endsWith("/inventory")) return response({ products: [] });
    if (path.endsWith("/images")) return response({ count: images.length, results: images });
    if (path.endsWith("/files")) return response({ count: files.length, results: files });
    if (path.endsWith("/videos")) return response({ count: videos.length, results: videos });
    const row = listings.find(r => String(r.listing_id) === path.split("/").at(-1));
    if (fault === "readback" && row) throw new Error("mock readback outage");
    if (row) return response(drift ? { ...row, title: "Changed" } : row);
    throw new Error(`UNEXPECTED_MOCK_READ:${path}`);
  };
  const deps: ReleaseEngineDependencies = { ledger, fetchImpl, loadManifest: async () => m, resolveAsset: async a => new File([new Uint8Array(a.assetId === "image1" ? png : a.assetId === "file1" ? pdf : mp4)], a.filename, { type: a.mimeType }),
    getAccessToken: async scopes => { assert.deepEqual(scopes, ["listings_r", "listings_w"]); return "88.mock-token"; }, assertExecutionAllowed: () => {}, now: () => NOW, sleep: async () => {} };
  return { m, deps, listings, images, files, videos, writes, newListing, setFault: (v: typeof fault) => { fault = v; }, wrongShop: () => { wrongShop = true; }, failImage: (v: boolean) => { failImage = v; }, drift: () => { drift = true; } };
}
test("generic create, image/file upload and final READY readback", async () => {
  const h = harness(); const r = await prepareRelease(h.m, h.deps);
  assert.equal(r.status, "READY_TO_PUBLISH"); assert.equal(r.livePublishPerformed, false); assert.equal(r.draftListingId, "101");
  assert.equal(r.imageCount, 1); assert.equal(r.buyerFileCount, 1); assert.equal(r.videoCount, 0); assert.equal(h.writes.length, 3);
  assert.equal((await getReleaseStatus(h.m, h.deps.ledger)).status, "READY_TO_PUBLISH");
});
test("existing matching draft reconciles without creation", async () => { const h = harness(); h.listings.push(h.newListing()); const r = await prepareRelease(h.m, h.deps); assert.equal(r.status, "READY_TO_PUBLISH"); assert.equal(h.writes.filter(p => p.endsWith("/listings")).length, 0); assert.equal(r.draftDisposition, "RECONCILED"); });
test("duplicate drafts block", async () => { const h = harness(); h.listings.push(h.newListing(), h.newListing(102)); const r = await prepareRelease(h.m, h.deps); assert.equal(r.status, "BLOCKED_FAIL_CLOSED"); assert.match(String(r.error), /DUPLICATE/); assert.equal(h.writes.length, 0); });
for (const fault of ["network", "5xx"] as const) test(`${fault} after draft POST reconciles with GET only`, async () => { const h = harness(); h.setFault(fault); assert.equal((await prepareRelease(h.m, h.deps)).status, "READY_TO_PUBLISH"); assert.equal(h.writes.filter(p => p.endsWith("/listings")).length, 1); });
test("unresolved timeout never repeats POST across resume", async () => { const h = harness(); h.setFault("lost"); assert.equal((await prepareRelease(h.m, h.deps)).status, "RECONCILIATION_REQUIRED"); h.setFault(null); assert.equal((await prepareRelease(h.m, h.deps)).status, "RECONCILIATION_REQUIRED"); assert.equal(h.writes.length, 1); });
test("missing listings_w blocks with zero writes", async () => { const h = harness(); h.deps.getAccessToken = async required => { const missing = getMissingEtsyScopes("listings_r", required); if (missing.length) throw new Error(`ETSY_SCOPE_MISSING:${missing.join(",")}`); return "88.mock"; }; const r = await prepareRelease(h.m, h.deps); assert.match(String(r.error), /listings_w/); assert.equal(h.writes.length, 0); });
test("wrong authenticated shop blocks", async () => { const h = harness(); h.wrongShop(); assert.equal((await prepareRelease(h.m, h.deps)).status, "BLOCKED_FAIL_CLOSED"); assert.equal(h.writes.length, 0); });
test("candidate drift rejected before write", async () => { const h = harness(); h.m.title = "Different"; await assert.rejects(prepareRelease(h.m, h.deps), /FINGERPRINT/); assert.equal(h.writes.length, 0); });
test("listing drift before image write blocks", async () => { const h = harness(); h.listings.push(h.newListing()); h.drift(); assert.equal((await prepareRelease(h.m, h.deps)).status, "BLOCKED_FAIL_CLOSED"); assert.equal(h.writes.length, 0); });
test("video upload waits for two stable active observations", async () => { const h = harness(manifest(true)); assert.equal((await prepareRelease(h.m, h.deps)).status, "READY_TO_PUBLISH"); assert.equal(h.videos.length, 1); assert.equal(h.writes.length, 4); });
test("asset SHA mismatch blocks before draft", async () => { const h = harness(); h.deps.resolveAsset = async a => new File([new Uint8Array(Buffer.alloc(a.sizeBytes))], a.filename, { type: a.mimeType }); await assert.rejects(prepareRelease(h.m, h.deps), /SHA256/); assert.equal(h.writes.length, 0); });
test("resume PENDING draft from persisted baseline is GET-only", async () => { const h = harness(); const fp = releaseFingerprints(h.m), op = releaseOperationIds(h.m).draft; const begun = await beginOperation(h.deps.ledger, op, { kind: "CREATE_DRAFT", shop: h.m.shop, ...fp }, NOW); await h.deps.ledger.save({ ...begun.record, receipt: { baseline: {} } }); h.listings.push(h.newListing()); assert.equal((await prepareRelease(h.m, h.deps)).status, "READY_TO_PUBLISH"); assert.equal(h.writes.filter(p => p.endsWith("/listings")).length, 0); });
test("repeated prepare verifies fresh state without mutations", async () => { const h = harness(); await prepareRelease(h.m, h.deps); assert.equal((await prepareRelease(h.m, h.deps)).status, "READY_TO_PUBLISH"); assert.equal(h.writes.length, 3); h.drift(); assert.notEqual((await prepareRelease(h.m, h.deps)).status, "READY_TO_PUBLISH"); assert.notEqual((await getReleaseStatus(h.m, h.deps.ledger)).status, "READY_TO_PUBLISH"); assert.equal(h.writes.length, 3); });
test("QC failure cannot publish", async () => { const h = harness(); h.m.finalQcPass.pass = false; await assert.rejects(prepareRelease(h.m, h.deps), /QC/); assert.equal(h.writes.length, 0); });
test("publish without authorization blocks", async () => { const h = harness(); await assert.rejects(publishReleaseForValidation(h.m, h.deps, null), /AUTHORIZATION_REQUIRED/); assert.equal(h.writes.length, 0); });
test("publish transaction mocked success with exact authorization", async () => {
  const old = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: "test" });
  try {
    const m = manifest(); m.productionAuthorized = true; const h = harness(m); let published = 0;
    const { priceUsd, ...rest } = listingIdentity(m), obs = { ...rest, price: priceUsd };
    const provider = new EtsyAuthorizedPublishProvider("77", { getAccessToken: async () => "88.mock", fetchImpl: async (_url, init) => {
      if (init?.method === "PATCH") { published++; assert.equal((init.body as URLSearchParams).get("state"), "active"); }
      return new Response(JSON.stringify({ ...obs, listing_id: 101, shop_id: 77, state: published ? "active" : "draft" }), { status: 200 });
    } });
    const authorization = createPublishAuthorization({ authorizationId: "test-grant", candidateId: m.candidateId, candidateFingerprint: releaseFingerprints(m).candidateFingerprint, channel: "etsy", shopId: "77", draftListingId: "101", issuedAt: "2026-10-05T04:00:00Z", expiresAt: "2026-10-05T06:00:00Z" });
    assert.equal((await publishReleaseForValidation(m, h.deps, authorization, provider)).status, "PUBLISHED"); assert.equal(published, 1);
    assert.equal(h.writes.some(p => p.includes("publish")), false);
  } finally { if (old === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Object.assign(process.env, { NODE_ENV: old }); }
});
test("ambiguous asset upload does not infer SHA from count or retry", async () => { const h = harness(); h.failImage(true); assert.equal((await prepareRelease(h.m, h.deps)).status, "RECONCILIATION_REQUIRED"); h.failImage(false); assert.equal((await prepareRelease(h.m, h.deps)).status, "RECONCILIATION_REQUIRED"); assert.equal(h.writes.length, 2); });
test("persisted resource receipt resumes delayed readback without apply", async () => {
  const ledger = new MemoryOperationLedgerRepository(), payload = { sha: "test" }; const begun = await beginOperation(ledger, "pending-asset", payload, NOW);
  await ledger.save({ ...begun.record, receipt: { baseline: { ids: [] }, providerResourceId: "201" } }); let applies = 0;
  const r = await executeReleaseOperation(ledger, "pending-asset", payload, { baseline: async () => ({}), apply: async () => { applies++; return "201"; }, verify: async () => ({ providerResourceId: "201", kind: "UPLOAD_IMAGE", disposition: "RECONCILED" }), reconcile: async () => null }, () => NOW);
  assert.equal(r.status, "SUCCEEDED"); assert.equal(applies, 0);
});
test("concurrent claims issue at most one mutation", async () => {
  const ledger = new MemoryOperationLedgerRepository(); let applies = 0;
  const provider = { baseline: async () => ({}), apply: async () => { applies++; return "1"; }, verify: async () => ({ providerResourceId: "1", kind: "CREATE_DRAFT", disposition: "CREATED" as const }), reconcile: async () => null };
  await Promise.all([1, 2].map(() => executeReleaseOperation(ledger, "concurrent", {}, provider, () => NOW))); assert.equal(applies, 1);
});
test("production runtime cannot be enabled by flags; API publish always closed", async () => {
  const old = { ...process.env }; process.env.VERCEL_ENV = "production"; process.env.ETSY_GENERIC_PREPARE_ENABLED = "true"; process.env.ETSY_GENERIC_RELEASE_TOKEN = "test-token";
  try {
    assert.throws(assertGenericPrepareRuntime, /DISABLED/); const h = harness();
    const api = createReleaseApi({ ledger: h.deps.ledger, loadManifest: async () => h.m });
    const request = new Request("https://example.test/api/releases/prepare", { method: "POST", headers: { "x-autodigitalpublisher-release-token": "test-token" } });
    assert.equal((await api.prepare(request)).status, 409); const result = await api.publish(request, h.m.releaseId); assert.match(JSON.stringify(await result.json()), /PUBLISH_DISABLED/); assert.equal(h.writes.length, 0);
  } finally { process.env = old; }
});
test("release lock and asset counts fail closed", () => { const m = manifest(); m.releaseLock.expiresAt = NOW; assert.throws(() => validateReleaseManifest(m, NOW), /LOCK/); const other = manifest(); other.listingImages = []; assert.throws(() => validateReleaseManifest(other, NOW), /ASSET_COUNT/); });
test("resume interrupted asset sequence skips completed image", async () => {
  const h = harness(); const original = h.deps.ledger.save.bind(h.deps.ledger); let interrupted = false;
  h.deps.ledger.save = async record => {
    if (!interrupted && record.operationId.includes(":file:") && record.status === "PENDING" && record.receipt?.baseline) { interrupted = true; throw new Error("mock interruption before file write"); }
    return original(record);
  };
  assert.equal((await prepareRelease(h.m, h.deps)).status, "BLOCKED_FAIL_CLOSED");
  assert.equal(h.images.length, 1); assert.equal(h.files.length, 0);
  // Crash before a POST cannot be proved from PENDING alone. Resume stays closed
  // for the uncertain file, while the completed image is never uploaded twice.
  assert.equal((await prepareRelease(h.m, h.deps)).status, "RECONCILIATION_REQUIRED");
  assert.equal(h.writes.filter(p => p.endsWith("/images")).length, 1);
});
test("API prepare, status and replay use trusted manifest and multipart bytes", async () => {
  const old = { ...process.env }; Object.assign(process.env, { VERCEL_ENV: "preview", ETSY_GENERIC_PREPARE_ENABLED: "true", ETSY_GENERIC_RELEASE_TOKEN: "test-token" });
  try {
    const h = harness(), api = createReleaseApi({ ledger: h.deps.ledger, loadManifest: async () => h.m, engine: h.deps });
    const request = async () => { const form = new FormData(); form.set("releaseId", h.m.releaseId); form.set("manifest", JSON.stringify({ productionAuthorized: true }));
      for (const a of [...h.m.listingImages, ...h.m.buyerFiles]) form.set(a.assetId, await h.deps.resolveAsset(a));
      return new Request("https://example.test/api/releases/prepare", { method: "POST", headers: { "x-autodigitalpublisher-release-token": "test-token" }, body: form }); };
    const response = await api.prepare(await request()); assert.equal(response.status, 200); assert.equal((await response.json()).status, "READY_TO_PUBLISH");
    assert.equal((await api.prepare(await request())).status, 200); assert.equal(h.writes.length, 3);
    const status = await api.status(new Request("https://example.test", { headers: { "x-autodigitalpublisher-release-token": "test-token" } }), h.m.releaseId);
    assert.equal(status.status, 200); assert.equal((await status.json()).operations.filter((r: { status: string }) => r.status === "SUCCEEDED").length, 3);
    assert.equal((await api.status(new Request("https://example.test"), h.m.releaseId)).status, 409);
  } finally { process.env = old; }
});
test("authoritative manifest revocation between validation and POST blocks", async () => {
  const h = harness(); h.deps.loadManifest = async () => ({ ...h.m, productTruth: { ...h.m.productTruth, verified: false } });
  assert.equal((await prepareRelease(h.m, h.deps)).status, "BLOCKED_FAIL_CLOSED"); assert.equal(h.writes.length, 0);
});
test("unexpected protected seller state blocks draft creation", async () => {
  const h = harness(); h.listings.push({ ...h.newListing(999), state: "active" });
  assert.equal((await prepareRelease(h.m, h.deps)).status, "BLOCKED_FAIL_CLOSED"); assert.equal(h.writes.length, 0);
});
test("video MIME, size, source signature fail closed", async () => {
  const h = harness(manifest(true)); h.m.video!.mimeType = "application/octet-stream"; bind(h.m); await assert.rejects(prepareRelease(h.m, h.deps), /VIDEO/);
  const tooLarge = harness(manifest(true)); tooLarge.m.video!.sizeBytes = 101 * 1024 * 1024; bind(tooLarge.m); await assert.rejects(prepareRelease(tooLarge.m, tooLarge.deps), /VIDEO/);
  assert.equal(h.writes.length + tooLarge.writes.length, 0);
});
test("test preload rejects unmocked live Etsy mutations", async () => {
  await assert.rejects(fetch("https://api.etsy.com/v3/application/shops/1/listings", { method: "POST" }), /TEST_LIVE_ETSY_NETWORK_FORBIDDEN/);
});
test("manifest rejects raw tag/alt-text values changed by upload normalization", () => {
  const m = manifest(); m.tags.push(""); bind(m); assert.throws(() => validateReleaseManifest(m, NOW), /TAG_COUNT/);
  const a = manifest(); a.listingImages[0].altText = " padded "; bind(a); assert.throws(() => validateReleaseManifest(a, NOW), /ALT_TEXT/);
});
test("resume completed image and continue an untouched buyer-file operation", async () => {
  const h = harness(), original = h.deps.ledger.claim.bind(h.deps.ledger); let interrupted = false;
  h.deps.ledger.claim = async record => {
    if (!interrupted && record.operationId.includes(":file:")) { interrupted = true; throw new Error("mock process interruption before file claim"); }
    return original(record);
  };
  assert.equal((await prepareRelease(h.m, h.deps)).status, "BLOCKED_FAIL_CLOSED");
  assert.equal(h.images.length, 1); assert.equal(h.files.length, 0);
  assert.equal((await prepareRelease(h.m, h.deps)).status, "READY_TO_PUBLISH");
  assert.equal(h.writes.filter(p => p.endsWith("/images")).length, 1);
  assert.equal(h.writes.filter(p => p.endsWith("/files")).length, 1);
  assert.equal(h.writes.filter(p => p.endsWith("/listings")).length, 1);
});
