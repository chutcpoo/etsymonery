import { beginOperation, recordOperationResult, hashOperationRequest, type OperationLedgerRepository } from "./operation-ledger";
import { startCorrelation, propagateCorrelation } from "./end-to-end-correlation";
import { validateReleaseManifest, releaseFingerprints, type ProductManifest, type ReleaseAsset } from "./etsy-release-manifest";
import { EtsyReleaseContext, GenericEtsyDraftCreationProvider, GenericEtsyAssetProvider, GenericEtsyVideoProvider, verifyAssetBytes, type ReleaseProviderDependencies } from "./etsy-release-provider";
import { executeReleaseOperation, operationSummary, type ReleaseReceipt } from "./etsy-release-operation";
import { executeAuthorizedPublishTransaction, type AuthorizedPublishProvider } from "./authorized-publish-transaction";
import type { PublishAuthorizationGrant } from "./publish-authorization";

export type ReleaseEngineDependencies = ReleaseProviderDependencies & { ledger: OperationLedgerRepository; resolveAsset: (asset: ReleaseAsset) => Promise<File> };
export function releaseOperationIds(m: ProductManifest) {
  const fp = releaseFingerprints(m);
  // A global fingerprint reservation prevents two release IDs racing to create duplicates.
  const base = `etsy-release:${m.shop.shopId}:${fp.candidateFingerprint}`;
  return { release: `etsy-release-status:${m.releaseId}`, draft: `etsy-draft:${m.shop.shopId}:${fp.listingFingerprint}`,
    images: m.listingImages.map(a => `${base}:image:${a.rank}`), files: m.buyerFiles.map(a => `${base}:file:${a.rank}`), video: m.video ? `${base}:video` : null, publish: `${base}:publish` };
}
export async function getReleaseStatus(manifest: ProductManifest, ledger: OperationLedgerRepository) {
  const ids = releaseOperationIds(manifest);
  const operations = await Promise.all([ids.draft, ...ids.images, ...ids.files, ...(ids.video ? [ids.video] : [])].map(async operationId =>
    operationSummary(await ledger.load(operationId)) ?? { operationId, status: "NOT_STARTED" }));
  const root = await ledger.load(ids.release);
  let status = root?.receipt?.status ?? root?.status ?? "NOT_STARTED";
  let gateError: string | undefined;
  try {
    validateReleaseManifest(manifest, new Date().toISOString());
    if (root && root.requestHash !== hashOperationRequest({ manifest })) throw new Error("AUTHORITATIVE_MANIFEST_CHANGED");
  } catch (error) { status = "BLOCKED_FAIL_CLOSED"; gateError = error instanceof Error ? error.message : "MANIFEST_INVALID"; }
  return { releaseId: manifest.releaseId, productId: manifest.productId, candidateId: manifest.candidateId,
    status, gateError, lastVerifiedAt: root?.updatedAt ?? null, observation: "PERSISTED_SNAPSHOT", operations, livePublishPerformed: false };
}
export async function prepareRelease(input: ProductManifest, deps: ReleaseEngineDependencies) {
  const now = deps.now ?? (() => new Date().toISOString());
  deps.assertExecutionAllowed();
  const m = validateReleaseManifest(input, now()), fp = releaseFingerprints(m), ids = releaseOperationIds(m);
  const files = new Map<string, File>();
  // All source bytes are verified before draft creation, including resumed calls.
  for (const asset of [...m.listingImages, ...m.buyerFiles, ...(m.video ? [m.video] : [])]) {
    const file = await deps.resolveAsset(asset); await verifyAssetBytes(asset, file); files.set(asset.assetId, file);
  }
  const root = await beginOperation(deps.ledger, ids.release, { manifest: m }, now());
  const correlation = startCorrelation(m.releaseId, { eventId: `${m.releaseId}:validate`, aggregateId: m.productId,
    eventType: "RELEASE_VALIDATED", occurredAt: now(), evidenceIds: [m.productTruth.evidenceId, m.authoritativeCandidate.evidenceId] });
  const context = new EtsyReleaseContext(m, deps);
  const receipts: ReleaseReceipt[] = [];
  let listingId: string | undefined;
  const persist = async (status: string, result: Record<string, unknown>, success = false) => {
    const receipt: Record<string, unknown> & { status: string } = { ...result, status, releaseId: m.releaseId, productId: m.productId, candidateId: m.candidateId,
      correlationId: m.releaseId, ...fp, livePublishPerformed: false };
    // Refresh readiness evidence on verified replay; revoke it on fresh drift.
    const current = await deps.ledger.load(ids.release);
    if (current?.status === "SUCCEEDED") {
      await deps.ledger.save({ ...current, status: success ? "SUCCEEDED" : "RECONCILIATION_REQUIRED", receipt, updatedAt: now() });
    } else await recordOperationResult(deps.ledger, ids.release, root.record.requestHash, success ? "SUCCEEDED" : "RECONCILIATION_REQUIRED", now(), { receipt });
    return receipt;
  };
  try {
    await context.assertAuthority();
    const draft = await executeReleaseOperation(deps.ledger, ids.draft, { kind: "CREATE_DRAFT", shop: m.shop, ...fp }, new GenericEtsyDraftCreationProvider(context), now);
    if (draft.status !== "SUCCEEDED" || !draft.receipt) return persist("RECONCILIATION_REQUIRED", { operations: await getReleaseStatus(m, deps.ledger) });
    listingId = draft.receipt.providerResourceId; receipts.push(draft.receipt);
    const completed: Array<{ asset: ReleaseAsset; kind: "UPLOAD_IMAGE" | "UPLOAD_FILE" | "UPLOAD_VIDEO"; receipt: ReleaseReceipt }> = [];
    const assertBaseline = async () => {
      const media = await context.media(listingId!);
      for (const [kind, rows] of [["UPLOAD_IMAGE", media.images], ["UPLOAD_FILE", media.files], ["UPLOAD_VIDEO", media.videos]] as const) {
        const expected = completed.filter(r => r.kind === kind);
        if (rows.length !== expected.length) throw new Error("TARGET_ASSET_BASELINE_CHANGED");
        for (const item of expected) {
          const row = rows.find(r => String(kind === "UPLOAD_IMAGE" ? r.listing_image_id : kind === "UPLOAD_FILE" ? r.listing_file_id : r.video_id) === item.receipt.providerResourceId);
          if (!row || (kind === "UPLOAD_IMAGE" && (row.rank !== item.asset.rank || row.alt_text !== item.asset.altText)) ||
            (kind === "UPLOAD_FILE" && (row.rank !== item.asset.rank || row.filename !== item.asset.filename || row.size_bytes !== item.asset.sizeBytes)) ||
            (kind === "UPLOAD_VIDEO" && row.video_state !== "active")) throw new Error("TARGET_ASSET_IDENTITY_CHANGED");
        }
      }
    };
    const run = async (asset: ReleaseAsset, kind: "UPLOAD_IMAGE" | "UPLOAD_FILE" | "UPLOAD_VIDEO", operationId: string) => {
      // Gate checks during a new POST compare the complete already-verified asset prefix.
      context.dependencies.assertTargetBaseline = async () => assertBaseline();
      const provider = kind === "UPLOAD_VIDEO" ? new GenericEtsyVideoProvider(context, listingId!, asset, files.get(asset.assetId)!) :
        new GenericEtsyAssetProvider(context, listingId!, asset, files.get(asset.assetId)!, kind);
      const result = await executeReleaseOperation(deps.ledger, operationId, { kind, listingId, ...fp, asset }, provider, now);
      if (result.status !== "SUCCEEDED" || !result.receipt) return false;
      completed.push({ asset, kind, receipt: result.receipt }); receipts.push(result.receipt); return true;
    };
    for (let i = 0; i < m.listingImages.length; i++) if (!await run(m.listingImages[i], "UPLOAD_IMAGE", ids.images[i])) return persist("RECONCILIATION_REQUIRED", { draftListingId: listingId, operationReceipts: receipts });
    for (let i = 0; i < m.buyerFiles.length; i++) if (!await run(m.buyerFiles[i], "UPLOAD_FILE", ids.files[i])) return persist("RECONCILIATION_REQUIRED", { draftListingId: listingId, operationReceipts: receipts });
    if (m.video && !await run(m.video, "UPLOAD_VIDEO", ids.video!)) return persist("RECONCILIATION_REQUIRED", { draftListingId: listingId, operationReceipts: receipts });
    await context.assertAuthority(); await context.listing(listingId); await context.sellerCheck(listingId); await assertBaseline();
    const qcEvent = propagateCorrelation(correlation, "GATE", { eventId: `${m.releaseId}:qc`, aggregateId: m.candidateId,
      eventType: "READY_TO_PUBLISH", occurredAt: now(), evidenceIds: [m.testerPass.evidenceId, m.finalQcPass.evidenceId] });
    return persist("READY_TO_PUBLISH", { draftListingId: listingId, imageCount: m.listingImages.length, buyerFileCount: m.buyerFiles.length,
      videoCount: m.video ? 1 : 0, qcResult: { pass: true, freshReadBack: true }, operationReceipts: receipts,
      draftDisposition: draft.receipt.disposition, reconciled: draft.replay || draft.receipt.disposition === "RECONCILED", trace: [correlation, qcEvent] }, true);
  } catch (error) {
    return persist("BLOCKED_FAIL_CLOSED", { draftListingId: listingId ?? null, error: error instanceof Error ? error.message : "RELEASE_FAILED", operationReceipts: receipts, qcResult: { pass: false } });
  }
}

// HTTP production execution remains unconditionally disabled in this revision.
// Explicit test capability allows transaction tests without exposing an env bypass.
export async function publishReleaseForValidation(m: ProductManifest, deps: ReleaseEngineDependencies,
  authorization: PublishAuthorizationGrant | null, testProvider?: AuthorizedPublishProvider) {
  if (!authorization || m.productionAuthorized !== true) throw new Error("PUBLISH_EXPLICIT_AUTHORIZATION_REQUIRED");
  if (process.env.NODE_ENV !== "test" || !testProvider) throw new Error("GENERIC_PRODUCTION_PUBLISH_DISABLED");
  const prepared = await prepareRelease(m, deps);
  if (prepared.status !== "READY_TO_PUBLISH" || typeof prepared.draftListingId !== "string") throw new Error("FINAL_QC_NOT_READY");
  // Tests supply EtsyAuthorizedPublishProvider with a mock fetch, or a test double.
  const provider = testProvider;
  return executeAuthorizedPublishTransaction(deps.ledger, provider, { operationId: releaseOperationIds(m).publish,
    authorization, candidateId: m.candidateId, candidateFingerprint: releaseFingerprints(m).candidateFingerprint,
    expectedListingFingerprint: releaseFingerprints(m).listingFingerprint, shopId: String(m.shop.shopId), draftListingId: prepared.draftListingId, channel: "etsy", now: (deps.now ?? (() => new Date().toISOString()))() });
}
