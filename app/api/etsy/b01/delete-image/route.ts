import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../lib/etsy-auth";
import { beginOperation, NeonOperationLedgerRepository, recordOperationResult } from "../../../../../lib/operation-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = 23582741;
const LISTING_ID = 4560696421;
const BUILD_ID = "ETSY-RESET-V1-PDT-BOBA-001-BUILD-20260906-B01";
const CANDIDATE_FINGERPRINT = "e478bf31dc1a4c92ed0be9318d076db047c17afbd38b58cad0e7f2557eb40041";
const WRITE_HEADER = "x-autodigitalpublisher-b01-token";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function secureEqual(left: string, right: string) {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function authError(request: Request) {
  const expected = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!expected) return NextResponse.json({ error: "ETSY_B01_WRITE_AUTH_NOT_CONFIGURED" }, { status: 503 });
  if (!supplied || !secureEqual(supplied, expected)) return NextResponse.json({ error: "ETSY_B01_WRITE_UNAUTHORIZED" }, { status: 401 });
  return null;
}
async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}
async function fetchImages(accessToken: string) {
  const response = await fetch(`https://api.etsy.com/v3/application/listings/${LISTING_ID}/images`, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" });
  const value = await parseJson(response);
  if (!response.ok || !isRecord(value) || !Array.isArray(value.results)) throw new Error(`ETSY_B01_IMAGE_READ_FAILED:${response.status}`);
  return value.results.filter(isRecord);
}

export async function DELETE(request: Request) {
  if (process.env.PUBLISH_WRITES_ENABLED !== "true") return NextResponse.json({ error: "ETSY_B01_WRITES_DISABLED" }, { status: 403 });
  const authorization = authError(request);
  if (authorization) return authorization;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  if (!isRecord(body)) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  const imageId = typeof body.listingImageId === "number" && Number.isSafeInteger(body.listingImageId) ? body.listingImageId : NaN;
  if (!Number.isSafeInteger(imageId) || imageId <= 0) return NextResponse.json({ error: "INVALID_LISTING_IMAGE_ID" }, { status: 400 });

  const accessToken = await getValidEtsyAccessToken();
  const before = await fetchImages(accessToken);
  const target = before.find((image) => Number(image.listing_image_id) === imageId);
  const rank = Number(target?.rank);
  if (!target || !Number.isSafeInteger(rank) || rank <= 10) {
    return NextResponse.json({ error: "B01_DELETE_NOT_SURPLUS_IMAGE", listingImageId: imageId, rank: Number.isFinite(rank) ? rank : null }, { status: 409 });
  }
  const operationId = `B01-IMAGE-DELETE-${imageId}`;
  const payload = { operation: "DELETE_SURPLUS_ACTIVE_LISTING_IMAGE", operationId, buildId: BUILD_ID, candidateFingerprint: CANDIDATE_FINGERPRINT, shopId: String(SHOP_ID), listingId: String(LISTING_ID), listingImageId: imageId, observedRank: rank };
  const ledger = new NeonOperationLedgerRepository();
  const now = new Date().toISOString();
  const begun = await beginOperation(ledger, operationId, payload, now);
  if (begun.status === "REPLAY") {
    if (begun.record.status === "SUCCEEDED") return NextResponse.json({ status: "REPLAY", operationId, requestHash: begun.record.requestHash, receipt: begun.record.receipt });
    return NextResponse.json({ error: "B01_DELETE_ALREADY_CLAIMED", operationId, requestHash: begun.record.requestHash, ledgerStatus: begun.record.status }, { status: 409 });
  }

  let response: Response;
  try {
    response = await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${LISTING_ID}/images/${imageId}`, { method: "DELETE", headers: etsyApiHeaders(accessToken), cache: "no-store" });
  } catch {
    const after = await fetchImages(accessToken).catch(() => [] as Record<string, unknown>[]);
    if (!after.some((image) => Number(image.listing_image_id) === imageId)) {
      const completed = await recordOperationResult(ledger, operationId, begun.record.requestHash, "SUCCEEDED", new Date().toISOString(), { receipt: { listingImageId: imageId, observedRank: rank, reconciled: true } });
      return NextResponse.json({ status: "RECONCILED", operationId, requestHash: completed.requestHash, receipt: completed.receipt });
    }
    const pending = await recordOperationResult(ledger, operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", new Date().toISOString(), { recoveryPoint: "IMAGE_DELETE_READBACK" });
    return NextResponse.json({ error: "B01_IMAGE_DELETE_AMBIGUOUS", operationId, requestHash: pending.requestHash, ledgerStatus: pending.status }, { status: 202 });
  }
  await parseJson(response);
  if (!response.ok) {
    const failed = await recordOperationResult(ledger, operationId, begun.record.requestHash, "FAILED", new Date().toISOString(), { recoveryPoint: "IMAGE_DELETE_REJECTED" });
    return NextResponse.json({ error: "B01_IMAGE_DELETE_REJECTED", statusCode: response.status, operationId, requestHash: failed.requestHash, ledgerStatus: failed.status }, { status: 502 });
  }
  const after = await fetchImages(accessToken);
  if (after.some((image) => Number(image.listing_image_id) === imageId)) {
    const pending = await recordOperationResult(ledger, operationId, begun.record.requestHash, "RECONCILIATION_REQUIRED", new Date().toISOString(), { recoveryPoint: "IMAGE_DELETE_POSTREAD_MISMATCH" });
    return NextResponse.json({ error: "B01_IMAGE_DELETE_POSTREAD_MISMATCH", operationId, requestHash: pending.requestHash, ledgerStatus: pending.status }, { status: 202 });
  }
  const completed = await recordOperationResult(ledger, operationId, begun.record.requestHash, "SUCCEEDED", new Date().toISOString(), { receipt: { listingImageId: imageId, observedRank: rank } });
  return NextResponse.json({ status: "DELETED_AND_VERIFIED", operationId, requestHash: completed.requestHash, receipt: completed.receipt });
}
