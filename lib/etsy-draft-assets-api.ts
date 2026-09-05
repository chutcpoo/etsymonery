import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { executeReconciledWrite, type ProviderReceipt } from "./draft-upload-reconciliation";
import { getValidEtsyAccessToken } from "./etsy-auth";
import {
  EtsyDraftAssetProvider,
  type EtsyDraftAssetPayload
} from "./etsy-draft-asset-provider";
import { verifyEtsyReadBackIdentity } from "./etsy-readback-normalizer";
import {
  NeonOperationLedgerRepository,
  type OperationLedgerRepository
} from "./operation-ledger";

const DRAFT_WRITE_HEADER = "x-autodigitalpublisher-write-token";
const SHA256 = /^[a-f0-9]{64}$/;

type RouteDependencies = {
  ledger?: OperationLedgerRepository;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  now?: () => string;
};

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function authorizationError(request: Request) {
  const expected = process.env.ETSY_DRAFT_WRITE_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json({ error: "ETSY_DRAFT_WRITE_AUTH_NOT_CONFIGURED" }, { status: 503 });
  }
  const supplied = request.headers.get(DRAFT_WRITE_HEADER)?.trim() ?? "";
  if (!supplied || !secureEqual(supplied, expected)) {
    return NextResponse.json({ error: "ETSY_DRAFT_WRITE_UNAUTHORIZED" }, { status: 401 });
  }
  return null;
}

function stringField(form: FormData, name: string) {
  const value = form.get(name);
  if (typeof value !== "string") throw new Error(`INVALID_${name.toUpperCase()}`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw new Error(`INVALID_${name.toUpperCase()}`);
  return normalized;
}

function positiveIntegerField(form: FormData, name: string) {
  const value = stringField(form, name);
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`INVALID_${name.toUpperCase()}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`INVALID_${name.toUpperCase()}`);
  return parsed;
}

function shaField(form: FormData, name: string) {
  const value = stringField(form, name);
  if (!SHA256.test(value)) throw new Error(`INVALID_${name.toUpperCase()}`);
  return value;
}

function parsePayload(form: FormData) {
  const operationKind = stringField(form, "kind");
  if (operationKind !== "UPLOAD_IMAGE" && operationKind !== "UPLOAD_FILE") {
    throw new Error("INVALID_KIND");
  }
  const rank = positiveIntegerField(form, "rank");
  const maxRank = operationKind === "UPLOAD_IMAGE" ? 10 : 5;
  if (rank > maxRank) throw new Error("INVALID_RANK");
  const asset = form.get("asset");
  if (!(asset instanceof File)) throw new Error("INVALID_ASSET");
  const payload: EtsyDraftAssetPayload = {
    operationKind,
    candidateId: stringField(form, "candidateId"),
    candidateFingerprint: shaField(form, "candidateFingerprint"),
    expectedListingFingerprint: shaField(form, "expectedListingFingerprint"),
    shopId: positiveIntegerField(form, "shopId"),
    draftListingId: positiveIntegerField(form, "draftListingId"),
    assetSha256: shaField(form, "assetSha256"),
    assetName: stringField(form, "assetName"),
    rank
  };
  return { operationId: stringField(form, "operationId"), payload, asset };
}

function identityMatches(expected: string, observation: Parameters<typeof verifyEtsyReadBackIdentity>[1]) {
  return verifyEtsyReadBackIdentity(expected, observation);
}

function errorResponse(error: unknown) {
  const detail = error instanceof Error ? error.message : "UNKNOWN";
  const clientError = /^(INVALID_|OPERATION_ID_PAYLOAD_MISMATCH)/.test(detail);
  return NextResponse.json(
    { error: clientError ? detail : "ETSY_DRAFT_ASSET_OPERATION_FAILED", detail, livePublishPerformed: false },
    { status: clientError ? 400 : 502 }
  );
}

export function createDraftAssetsPostHandler(dependencies: RouteDependencies = {}) {
  const ledger = dependencies.ledger ?? new NeonOperationLedgerRepository();
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const getAccessToken = dependencies.getAccessToken ?? getValidEtsyAccessToken;
  const now = dependencies.now ?? (() => new Date().toISOString());

  return async function POST(request: Request) {
    if (process.env.ETSY_DRAFT_WRITES_ENABLED !== "true") {
      return NextResponse.json(
        { error: "ETSY_DRAFT_WRITES_DISABLED", livePublishPerformed: false },
        { status: 403 }
      );
    }
    const authError = authorizationError(request);
    if (authError) return authError;

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "INVALID_MULTIPART_FORM_DATA" }, { status: 400 });
    }

    try {
      const { operationId, payload, asset } = parsePayload(form);
      const configuredShopId = Number(process.env.ETSY_SHOP_ID);
      if (!Number.isSafeInteger(configuredShopId) || configuredShopId <= 0) {
        return NextResponse.json({ error: "ETSY_SHOP_ID_NOT_CONFIGURED" }, { status: 503 });
      }
      if (payload.shopId !== configuredShopId) {
        return NextResponse.json(
          { error: "ETSY_SHOP_ID_MISMATCH", livePublishPerformed: false },
          { status: 409 }
        );
      }

      const actualAssetSha256 = createHash("sha256")
        .update(Buffer.from(await asset.arrayBuffer()))
        .digest("hex");
      if (actualAssetSha256 !== payload.assetSha256) {
        return NextResponse.json(
          {
            error: "ASSET_SHA256_MISMATCH",
            expectedAssetSha256: payload.assetSha256,
            actualAssetSha256,
            livePublishPerformed: false
          },
          { status: 409 }
        );
      }

      const accessToken = await getAccessToken();
      const provider = new EtsyDraftAssetProvider(accessToken, payload, asset, { fetchImpl });
      const before = await provider.readListing();
      const preIdentity = identityMatches(payload.expectedListingFingerprint, before.observation);
      if (before.observation.state !== "draft" || preIdentity.status !== "MATCH") {
        return NextResponse.json(
          {
            error:
              before.observation.state !== "draft"
                ? "ETSY_LISTING_NOT_DRAFT"
                : "ETSY_LISTING_IDENTITY_MISMATCH",
            listingIdentity: preIdentity.status,
            livePublishPerformed: false
          },
          { status: 409 }
        );
      }

      const result = await executeReconciledWrite(ledger, provider, {
        operationId,
        kind: payload.operationKind,
        payload: { ...payload },
        now: now()
      });
      if (result.status === "RECONCILIATION_REQUIRED") {
        return NextResponse.json(
          { status: result.status, operationId, livePublishPerformed: false },
          { status: 409 }
        );
      }

      const receipt = result.receipt as ProviderReceipt;
      const after = await provider.readListing();
      const postIdentity = identityMatches(payload.expectedListingFingerprint, after.observation);
      if (after.observation.state !== "draft" || postIdentity.status !== "MATCH") {
        return NextResponse.json(
          {
            error: "POST_UPLOAD_LISTING_IDENTITY_MISMATCH",
            operationId,
            listingIdentity: postIdentity.status,
            livePublishPerformed: false
          },
          { status: 409 }
        );
      }
      const assetReadBack = (await provider.hasResource(receipt.providerResourceId))
        ? "MATCH"
        : "IDENTITY_MISMATCH";
      if (assetReadBack !== "MATCH") {
        return NextResponse.json(
          { error: "ASSET_READBACK_MISMATCH", operationId, assetReadBack, livePublishPerformed: false },
          { status: 409 }
        );
      }

      return NextResponse.json({
        status: result.status,
        operationId,
        receipt,
        candidateId: payload.candidateId,
        candidateFingerprint: payload.candidateFingerprint,
        expectedListingFingerprint: payload.expectedListingFingerprint,
        draftListingId: payload.draftListingId,
        assetSha256: payload.assetSha256,
        assetName: payload.assetName,
        rank: payload.rank,
        listingIdentity: "MATCH",
        assetReadBack,
        livePublishPerformed: false
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
