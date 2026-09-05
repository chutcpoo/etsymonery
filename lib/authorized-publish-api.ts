import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  executeAuthorizedPublishTransaction,
  type AuthorizedPublishProvider
} from "./authorized-publish-transaction";
import { EtsyAuthorizedPublishProvider } from "./etsy-authorized-publish-provider";
import {
  NeonOperationLedgerRepository,
  type OperationLedgerRepository
} from "./operation-ledger";
import type { PublishAuthorizationGrant } from "./publish-authorization";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function validatePublishWriteAuthorization(request: Request) {
  const expected = process.env.ETSY_DRAFT_WRITE_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json({ error: "ETSY_PUBLISH_WRITE_AUTH_NOT_CONFIGURED" }, { status: 503 });
  }

  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!supplied || !secureEqual(supplied, expected)) {
    return NextResponse.json({ error: "ETSY_PUBLISH_WRITE_UNAUTHORIZED" }, { status: 401 });
  }

  return null;
}

function bodyString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}

export type AuthorizedPublishRuntime = {
  repository?: OperationLedgerRepository;
  provider?: AuthorizedPublishProvider;
  now?: () => string;
};

function authorizedPublishErrorStatus(code: string) {
  if (code === "OPERATION_ID_PAYLOAD_MISMATCH") return 409;
  if (code.startsWith("AUTHORIZATION_")) return 409;
  if (code.startsWith("INVALID_")) return 400;
  if (code === "DATABASE_URL_NOT_CONFIGURED") return 503;
  if (code.startsWith("ETSY_")) return 502;
  return 500;
}

export async function handleAuthorizedPublishOperation(
  body: Record<string, unknown>,
  request: Request,
  runtime: AuthorizedPublishRuntime = {}
) {
  if (process.env.PUBLISH_WRITES_ENABLED !== "true") {
    return NextResponse.json({ error: "ETSY_PUBLISH_WRITES_DISABLED" }, { status: 403 });
  }

  const authorizationError = validatePublishWriteAuthorization(request);
  if (authorizationError) return authorizationError;

  const operationId = bodyString(body, "operationId");
  const candidateId = bodyString(body, "candidateId");
  const candidateFingerprint = bodyString(body, "candidateFingerprint");
  const expectedListingFingerprint = bodyString(body, "expectedListingFingerprint");
  const shopId = bodyString(body, "shopId");
  const draftListingId = bodyString(body, "draftListingId");
  const channel = bodyString(body, "channel");

  if (
    !operationId ||
    !candidateId ||
    !candidateFingerprint ||
    !expectedListingFingerprint ||
    !shopId ||
    !draftListingId ||
    channel !== "etsy"
  ) {
    return NextResponse.json({ error: "INVALID_AUTHORIZED_PUBLISH_INPUT" }, { status: 400 });
  }

  if (!isRecord(body.authorization) || !isRecord(body.authorization.authorization)) {
    return NextResponse.json({ error: "INVALID_PUBLISH_AUTHORIZATION" }, { status: 400 });
  }

  const configuredShopId = process.env.ETSY_SHOP_ID?.trim() ?? "";
  if (!configuredShopId || !/^\d+$/.test(configuredShopId)) {
    return NextResponse.json({ error: "ETSY_SHOP_ID_NOT_CONFIGURED" }, { status: 503 });
  }
  if (shopId !== configuredShopId) {
    return NextResponse.json({ error: "ETSY_PUBLISH_SHOP_MISMATCH" }, { status: 409 });
  }

  const authorization = body.authorization as unknown as PublishAuthorizationGrant;
  const repository = runtime.repository ?? new NeonOperationLedgerRepository();
  const provider = runtime.provider ?? new EtsyAuthorizedPublishProvider(configuredShopId);
  const now = runtime.now?.() ?? new Date().toISOString();

  try {
    const result = await executeAuthorizedPublishTransaction(repository, provider, {
      operationId,
      authorization,
      candidateId,
      candidateFingerprint,
      expectedListingFingerprint,
      shopId,
      draftListingId,
      channel,
      now
    });

    const statusCode =
      result.status === "IDENTITY_MISMATCH" || result.status === "FAILED_REPLAY"
        ? 409
        : result.status === "RECONCILIATION_REQUIRED"
          ? 202
          : 200;

    return NextResponse.json(
      {
        operation: "AUTHORIZED_PUBLISH",
        operationId,
        candidateId,
        candidateFingerprint,
        expectedListingFingerprint,
        shopId,
        draftListingId,
        ...result
      },
      { status: statusCode }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json(
      { error: "AUTHORIZED_PUBLISH_FAILED", code, operationId, candidateId, draftListingId },
      { status: authorizedPublishErrorStatus(code) }
    );
  }
}
