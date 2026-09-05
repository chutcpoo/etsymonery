import { FACTORY_DOMAIN_SCHEMA_VERSION, validateAuthorization, type Authorization } from "./factory-domain-schemas";

export const PUBLISH_AUTHORIZATION_SCHEMA_VERSION = "1.0.0" as const;

export type PublishAuthorizationGrant = {
  schemaVersion: typeof PUBLISH_AUTHORIZATION_SCHEMA_VERSION;
  authorization: Authorization;
  shopId: string;
  draftListingId: string;
  revokedAt?: string;
};

export type PublishAuthorizationRequest = {
  authorizationId: string;
  candidateId: string;
  candidateFingerprint: string;
  shopId: string;
  draftListingId: string;
  channel: string;
  now: string;
};

function required(value: string, code: string) { const v = value.normalize("NFC").trim(); if (!v) throw new Error(code); return v; }
function instant(value: string, code: string) { const v = required(value, code); if (!Number.isFinite(Date.parse(v))) throw new Error(code); return v; }

export function createPublishAuthorization(input: {
  authorizationId: string; candidateId: string; candidateFingerprint: string; channel: string; shopId: string; draftListingId: string; issuedAt: string; expiresAt?: string;
}): PublishAuthorizationGrant {
  const authorization = validateAuthorization({
    schemaVersion: FACTORY_DOMAIN_SCHEMA_VERSION, authorizationId: input.authorizationId, scope: "PUBLISH",
    candidateId: input.candidateId, candidateFingerprint: input.candidateFingerprint, channel: input.channel, state: "ACTIVE",
    issuedAt: input.issuedAt, ...(input.expiresAt ? { expiresAt: input.expiresAt } : {})
  });
  if (authorization.expiresAt && Date.parse(authorization.expiresAt) <= Date.parse(authorization.issuedAt)) throw new Error("AUTHORIZATION_EXPIRY_MUST_FOLLOW_ISSUE");
  return Object.freeze({ schemaVersion: PUBLISH_AUTHORIZATION_SCHEMA_VERSION, authorization: Object.freeze(authorization), shopId: required(input.shopId, "INVALID_AUTHORIZATION_SHOP_ID"), draftListingId: required(input.draftListingId, "INVALID_AUTHORIZATION_DRAFT_ID") });
}

export function revokePublishAuthorization(grant: PublishAuthorizationGrant, revokedAt: string): PublishAuthorizationGrant {
  if (grant.authorization.state !== "ACTIVE") throw new Error("AUTHORIZATION_NOT_ACTIVE");
  const at = instant(revokedAt, "INVALID_AUTHORIZATION_REVOKED_AT");
  if (Date.parse(at) < Date.parse(grant.authorization.issuedAt)) throw new Error("AUTHORIZATION_REVOKED_BEFORE_ISSUED");
  return Object.freeze({ ...grant, authorization: Object.freeze(validateAuthorization({ ...grant.authorization, state: "REVOKED" })), revokedAt: at });
}

function assertExact(grant: PublishAuthorizationGrant, request: PublishAuthorizationRequest) {
  const auth = validateAuthorization(grant.authorization);
  if (request.authorizationId !== auth.authorizationId) throw new Error("AUTHORIZATION_ID_MISMATCH");
  if (request.candidateId !== auth.candidateId || request.candidateFingerprint.normalize("NFC").trim().toLowerCase() !== auth.candidateFingerprint) throw new Error("AUTHORIZATION_CANDIDATE_MISMATCH");
  if (required(request.channel, "INVALID_PUBLISH_CHANNEL").toLowerCase() !== auth.channel) throw new Error("AUTHORIZATION_CHANNEL_MISMATCH");
  if (required(request.shopId, "INVALID_PUBLISH_SHOP_ID") !== grant.shopId) throw new Error("AUTHORIZATION_SHOP_MISMATCH");
  if (required(request.draftListingId, "INVALID_PUBLISH_DRAFT_ID") !== grant.draftListingId) throw new Error("AUTHORIZATION_DRAFT_MISMATCH");
  const now = instant(request.now, "INVALID_PUBLISH_AUTHORIZATION_TIME");
  if (auth.state !== "ACTIVE") throw new Error("AUTHORIZATION_NOT_ACTIVE");
  if (auth.expiresAt && Date.parse(now) >= Date.parse(auth.expiresAt)) throw new Error("AUTHORIZATION_EXPIRED");
  if (Date.parse(now) < Date.parse(auth.issuedAt)) throw new Error("AUTHORIZATION_USE_BEFORE_ISSUED");
  return { auth, now };
}

export function consumePublishAuthorization(grant: PublishAuthorizationGrant, request: PublishAuthorizationRequest): PublishAuthorizationGrant {
  const { auth, now } = assertExact(grant, request);
  const consumed = validateAuthorization({ ...auth, state: "CONSUMED", consumedAt: now });
  return Object.freeze({ ...grant, authorization: Object.freeze(consumed) });
}

export function assertPublishAuthorizationUsable(grant: PublishAuthorizationGrant, request: PublishAuthorizationRequest): true { assertExact(grant, request); return true; }
