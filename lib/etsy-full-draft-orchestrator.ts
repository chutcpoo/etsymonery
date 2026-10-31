/**
 * ETSY FULL DRAFT ORCHESTRATOR
 *
 * High-level, fail-closed operation that:
 * 1. Creates a digital Draft listing (metadata only)
 * 2. Uploads all approved listing images from Google Drive
 * 3. Uploads all approved buyer files from Google Drive
 *
 * All writes remain behind existing feature gates and exact approvals.
 * This service composes the existing Generic Draft Create + Drive Asset Bridge.
 * It does NOT activate/publish the listing.
 *
 * Status: CANDIDATE — requires independent QC before any production use.
 */

import { NextResponse } from "next/server";
import { createGenericDraftPostHandler } from "./etsy-generic-draft-create";
import { createEtsyDriveAssetBridgeHandler } from "./etsy-drive-asset-bridge";

export type FullDraftAsset = {
  kind: "UPLOAD_IMAGE" | "UPLOAD_FILE";
  driveFileId: string;
  assetName: string;
  expectedSha256: string;
  expectedBytes: number;
  rank: number;
};

export type FullDraftOrchestratorRequest = {
  action: "PREFLIGHT" | "EXECUTE";
  operationId: string;
  shopId: number;
  productId: string;
  candidateId: string;
  candidateFingerprint: string;
  expectedListingFingerprint: string;
  listing: {
    title: string;
    description: string;
    priceUsd: number;
    tags: string[];
    quantity: number;
    taxonomy_id: number;
    who_made: string;
    when_made: string;
    type: "download";
    state: "draft";
  };
  assets: FullDraftAsset[];
  qc: {
    state: "QC_PASSED";
    productTruthVerified: true;
    testerFingerprint: string;
    independentFinalQcFingerprint: string;
  };
};

function fail(code: string): never {
  throw new Error(code);
}

export function parseFullDraftRequest(raw: unknown): FullDraftOrchestratorRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("INVALID_ORCHESTRATOR_BODY");
  const x = raw as Record<string, unknown>;
  if (x.action !== "PREFLIGHT" && x.action !== "EXECUTE") fail("INVALID_ORCHESTRATOR_ACTION");
  if (!Array.isArray(x.assets)) fail("INVALID_ORCHESTRATOR_ASSETS");
  if (x.assets.length === 0) fail("ORCHESTRATOR_ASSETS_REQUIRED");
  if (x.assets.length > 15) fail("ORCHESTRATOR_ASSETS_TOO_MANY");

  return x as FullDraftOrchestratorRequest;
}

export function createFullDraftOrchestratorHandler() {
  const draftHandler = createGenericDraftPostHandler();
  const assetHandler = createEtsyDriveAssetBridgeHandler();

  return async (request: Request) => {
    let body: FullDraftOrchestratorRequest;
    try {
      body = parseFullDraftRequest(await request.json());
    } catch (error) {
      return NextResponse.json({
        status: "BLOCKED",
        error: error instanceof Error ? error.message : "INVALID_JSON",
        ETSY_WRITE_COUNT: 0
      }, { status: 400 });
    }

    if (body.action === "PREFLIGHT") {
      return NextResponse.json({
        status: "ORCHESTRATOR_PREFLIGHT_OK",
        mode: "READ_ONLY",
        assetCount: body.assets.length,
        imageCount: body.assets.filter(a => a.kind === "UPLOAD_IMAGE").length,
        fileCount: body.assets.filter(a => a.kind === "UPLOAD_FILE").length,
        publishAuthorized: false,
        ETSY_WRITE_COUNT: 0
      }, { headers: { "cache-control": "no-store" } });
    }

    const draftReq = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({
        action: "CREATE_DRAFT",
        operationId: `${body.operationId}-draft`,
        shopId: body.shopId,
        productId: body.productId,
        candidateId: body.candidateId,
        candidateFingerprint: body.candidateFingerprint,
        expectedListingFingerprint: body.expectedListingFingerprint,
        listing: body.listing,
        qc: body.qc
      })
    });

    const draftRes = await draftHandler(draftReq);
    const draftJson = await draftRes.json() as Record<string, unknown>;

    if (!draftRes.ok || draftJson.status !== "APPLIED") {
      return NextResponse.json({
        status: "BLOCKED",
        stage: "DRAFT_CREATE",
        error: draftJson.error ?? "DRAFT_CREATE_FAILED",
        ETSY_WRITE_COUNT: draftJson.ETSY_WRITE_COUNT ?? 0,
        publishAuthorized: false
      }, { status: draftRes.status });
    }

    const draftListingId = Number(draftJson.providerResourceId ?? draftJson.draftListingId);
    if (!Number.isSafeInteger(draftListingId) || draftListingId < 1) {
      return NextResponse.json({
        status: "RECONCILIATION_REQUIRED",
        stage: "DRAFT_CREATE",
        error: "DRAFT_LISTING_ID_MISSING",
        ETSY_WRITE_COUNT: "UNKNOWN",
        publishAuthorized: false
      }, { status: 409 });
    }

    const sorted = [...body.assets].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "UPLOAD_IMAGE" ? -1 : 1;
      return a.rank - b.rank;
    });

    const uploaded: unknown[] = [];
    let writeCount = 1;

    for (const asset of sorted) {
      const assetBody = {
        action: "UPLOAD",
        operationId: `${body.operationId}-${asset.kind}-${asset.rank}`,
        productId: body.productId,
        candidateId: body.candidateId,
        candidateFingerprint: body.candidateFingerprint,
        expectedListingFingerprint: body.expectedListingFingerprint,
        shopId: body.shopId,
        draftListingId,
        rank: asset.rank,
        kind: asset.kind,
        driveFileId: asset.driveFileId,
        assetName: asset.assetName,
        expectedSha256: asset.expectedSha256,
        expectedBytes: asset.expectedBytes,
        qc: body.qc
      };

      const assetReq = new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(assetBody)
      });

      const assetRes = await assetHandler(assetReq);
      const assetJson = await assetRes.json() as Record<string, unknown>;

      if (!assetRes.ok || assetJson.status !== "APPLIED") {
        return NextResponse.json({
          status: "BLOCKED",
          stage: "ASSET_UPLOAD",
          failedAsset: { kind: asset.kind, rank: asset.rank, name: asset.assetName },
          error: assetJson.error ?? "ASSET_UPLOAD_FAILED",
          uploadedSoFar: uploaded.length,
          ETSY_WRITE_COUNT: writeCount,
          draftListingId,
          publishAuthorized: false
        }, { status: assetRes.status });
      }

      uploaded.push({ kind: asset.kind, rank: asset.rank, status: assetJson.status });
      if (assetJson.ETSY_WRITE_COUNT === 1) writeCount += 1;
    }

    return NextResponse.json({
      status: "ORCHESTRATOR_COMPLETE",
      draftListingId,
      assetsUploaded: uploaded.length,
      imagesUploaded: uploaded.filter((u: any) => u.kind === "UPLOAD_IMAGE").length,
      filesUploaded: uploaded.filter((u: any) => u.kind === "UPLOAD_FILE").length,
      ETSY_WRITE_COUNT: writeCount,
      publishAuthorized: false,
      note: "Draft created with assets. Publish remains separately gated."
    }, { headers: { "cache-control": "no-store" } });
  };
}
