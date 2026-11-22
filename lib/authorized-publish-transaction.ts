import {
  beginOperation,
  recordOperationResult,
  type OperationLedgerRecord,
  type OperationLedgerRepository
} from "./operation-ledger";
import {
  assertPublishAuthorizationUsable,
  consumePublishAuthorization,
  type PublishAuthorizationGrant
} from "./publish-authorization";
import {
  verifyEtsyReadBackIdentity,
  type EtsyReadBackObservation
} from "./etsy-readback-normalizer";

export const AUTHORIZED_PUBLISH_TRANSACTION_VERSION = "1.1.0" as const;

export class PublishAmbiguousResultError extends Error {
  constructor() {
    super("PUBLISH_AMBIGUOUS_RESULT");
    this.name = "PublishAmbiguousResultError";
  }
}

export type PublishedReceipt = {
  listingId: string;
  state: string;
  observation?: EtsyReadBackObservation;
  providerReceipt?: Record<string, unknown>;
};

export interface AuthorizedPublishProvider {
  readDraft(draftListingId: string): Promise<EtsyReadBackObservation>;
  publish(draftListingId: string): Promise<PublishedReceipt>;
  readPublished(draftListingId: string): Promise<PublishedReceipt | null>;
}

export type AuthorizedPublishInput = {
  operationId: string;
  authorization: PublishAuthorizationGrant;
  candidateId: string;
  candidateFingerprint: string;
  expectedListingFingerprint: string;
  shopId: string;
  draftListingId: string;
  channel: string;
  now: string;
};

type VerifiedPublishedReadBack = {
  receipt: {
    listingId: string;
    state: "active" | "published";
    providerReceipt?: Record<string, unknown>;
  };
  identity: ReturnType<typeof verifyEtsyReadBackIdentity>;
};

export function productIdFromAuthorizedCandidate(candidateId: string) {
  const normalized = candidateId.normalize("NFC").trim();
  return normalized.match(/^POSTRESET-(PDT-[A-Z0-9]+-\d+)-/)?.[1] ?? null;
}

function normalizedReceipt(receipt: PublishedReceipt) {
  const listingId = receipt.listingId.normalize("NFC").trim();
  const state = receipt.state.normalize("NFC").trim().toLowerCase();
  if (!listingId) throw new Error("INVALID_PUBLISHED_LISTING_ID");
  if (state !== "active" && state !== "published") {
    throw new Error("PUBLISHED_STATE_NOT_CONFIRMED");
  }
  return {
    listingId,
    state: state as "active" | "published",
    ...(receipt.providerReceipt
      ? { providerReceipt: structuredClone(receipt.providerReceipt) }
      : {})
  };
}

function authRequest(input: AuthorizedPublishInput) {
  return {
    authorizationId: input.authorization.authorization.authorizationId,
    candidateId: input.candidateId,
    candidateFingerprint: input.candidateFingerprint,
    shopId: input.shopId,
    draftListingId: input.draftListingId,
    channel: input.channel,
    now: input.now
  };
}

function opPayload(input: AuthorizedPublishInput) {
  return {
    type: "AUTHORIZED_PUBLISH",
    productId: productIdFromAuthorizedCandidate(input.candidateId),
    authorizationId: input.authorization.authorization.authorizationId,
    candidateId: input.candidateId,
    candidateFingerprint: input.candidateFingerprint,
    expectedListingFingerprint: input.expectedListingFingerprint,
    shopId: input.shopId,
    draftListingId: input.draftListingId,
    channel: input.channel
  };
}

function verifyPublishedReadBack(
  input: AuthorizedPublishInput,
  published: PublishedReceipt
): VerifiedPublishedReadBack {
  const receipt = normalizedReceipt(published);
  if (receipt.listingId !== input.draftListingId.normalize("NFC").trim()) {
    throw new Error("PUBLISHED_LISTING_ID_MISMATCH");
  }
  if (!published.observation) {
    throw new Error("POST_PUBLISH_IDENTITY_NOT_AVAILABLE");
  }
  const identity = verifyEtsyReadBackIdentity(input.expectedListingFingerprint, {
    ...published.observation,
    state: "draft"
  });
  if (identity.status !== "MATCH") {
    throw new Error("POST_PUBLISH_IDENTITY_MISMATCH");
  }
  return { receipt, identity };
}

function consumedAt(
  record: OperationLedgerRecord,
  authorization: PublishAuthorizationGrant,
  now: string
) {
  const prior = record.receipt?.authorizationConsumedAt;
  return (
    authorization.authorization.consumedAt ??
    (typeof prior === "string" ? prior : now)
  );
}

function receiptFor(
  verified: VerifiedPublishedReadBack,
  input: AuthorizedPublishInput,
  record: OperationLedgerRecord,
  authorization: PublishAuthorizationGrant
) {
  return {
    ...verified.receipt,
    productId: productIdFromAuthorizedCandidate(input.candidateId),
    candidateId: input.candidateId,
    authorizationId: input.authorization.authorization.authorizationId,
    authorizationState: "CONSUMED",
    authorizationConsumedAt: consumedAt(record, authorization, input.now),
    expectedListingFingerprint: verified.identity.expectedFingerprint,
    actualListingFingerprint: verified.identity.actualFingerprint
  };
}

async function readOnlyReconcile(
  repository: OperationLedgerRepository,
  provider: AuthorizedPublishProvider,
  input: AuthorizedPublishInput,
  record: OperationLedgerRecord,
  authorization: PublishAuthorizationGrant,
  successStatus: "PUBLISHED" | "RECONCILED"
) {
  let found: PublishedReceipt | null = null;
  try {
    found = await provider.readPublished(input.draftListingId);
  } catch {
    found = null;
  }

  if (found) {
    let verified: VerifiedPublishedReadBack | null = null;
    try {
      verified = verifyPublishedReadBack(input, found);
    } catch {
      verified = null;
    }
    if (verified) {
      const receipt = receiptFor(verified, input, record, authorization);
      await recordOperationResult(
        repository,
        input.operationId,
        record.requestHash,
        "SUCCEEDED",
        input.now,
        { receipt }
      );
      return {
        status: successStatus,
        receipt,
        postPublishIdentity: verified.identity,
        authorization
      };
    }
  }

  const auditReceipt =
    authorization.authorization.state === "CONSUMED"
      ? {
          productId: productIdFromAuthorizedCandidate(input.candidateId),
          candidateId: input.candidateId,
          authorizationId: input.authorization.authorization.authorizationId,
          authorizationState: "CONSUMED",
          authorizationConsumedAt: consumedAt(record, authorization, input.now)
        }
      : undefined;
  await recordOperationResult(
    repository,
    input.operationId,
    record.requestHash,
    "RECONCILIATION_REQUIRED",
    input.now,
    {
      ...(auditReceipt ? { receipt: auditReceipt } : {}),
      recoveryPoint: "POST_PUBLISH_READ_BACK"
    }
  );
  return { status: "RECONCILIATION_REQUIRED" as const, authorization };
}

export async function executeAuthorizedPublishTransaction(
  repository: OperationLedgerRepository,
  provider: AuthorizedPublishProvider,
  input: AuthorizedPublishInput
) {
  const begun = await beginOperation(
    repository,
    input.operationId,
    opPayload(input),
    input.now
  );

  if (
    begun.status === "REPLAY" &&
    begun.record.status === "SUCCEEDED" &&
    begun.record.receipt
  ) {
    return {
      status: "REPLAY" as const,
      receipt: begun.record.receipt,
      authorization: input.authorization
    };
  }
  if (begun.status === "REPLAY" && begun.record.status === "FAILED") {
    return {
      status: "FAILED_REPLAY" as const,
      action: "STOP" as const,
      authorization: input.authorization
    };
  }
  if (begun.status === "REPLAY") {
    return readOnlyReconcile(
      repository,
      provider,
      input,
      begun.record,
      input.authorization,
      "RECONCILED"
    );
  }

  const preRead = await provider.readDraft(input.draftListingId);
  const identity = verifyEtsyReadBackIdentity(
    input.expectedListingFingerprint,
    preRead
  );
  if (identity.status !== "MATCH") {
    await recordOperationResult(
      repository,
      input.operationId,
      begun.record.requestHash,
      "FAILED",
      input.now,
      { recoveryPoint: "IDENTITY_MISMATCH_STOP" }
    );
    return {
      status: "IDENTITY_MISMATCH" as const,
      action: "STOP" as const,
      identity,
      authorization: input.authorization
    };
  }

  try {
    assertPublishAuthorizationUsable(input.authorization, authRequest(input));
  } catch (error) {
    await recordOperationResult(
      repository,
      input.operationId,
      begun.record.requestHash,
      "FAILED",
      input.now,
      { recoveryPoint: "AUTHORIZATION_REJECTED" }
    );
    throw error;
  }

  const consumed = consumePublishAuthorization(
    input.authorization,
    authRequest(input)
  );
  try {
    await provider.publish(input.draftListingId);
  } catch (error) {
    if (error instanceof PublishAmbiguousResultError) {
      return readOnlyReconcile(
        repository,
        provider,
        input,
        begun.record,
        consumed,
        "RECONCILED"
      );
    }
    await recordOperationResult(
      repository,
      input.operationId,
      begun.record.requestHash,
      "FAILED",
      input.now,
      { recoveryPoint: "PUBLISH_FAILED" }
    );
    throw error;
  }

  return readOnlyReconcile(
    repository,
    provider,
    input,
    begun.record,
    consumed,
    "PUBLISHED"
  );
}
