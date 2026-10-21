import {
  ETSY_SCOPES,
  ETSY_SELLER_READ_SCOPES,
  ETSY_SELLER_WRITE_SCOPES,
  getMissingEtsyScopes,
  parseEtsyGrantedScopes
} from "./etsy";
import { POST_RESET_PLATFORM_STATE } from "./post-reset-platform";

// A stored grant is evidence of permissions, not evidence that an API request
// has succeeded. This module deliberately makes no Etsy HTTP requests.
export const ETSY_STATUS_REQUIRED_SCOPES = [
  "listings_r",
  "listings_w",
  "transactions_r"
] as const;

export type EtsyStatusWriteGates = {
  draftWritesEnabled: boolean;
  publishWritesEnabled: boolean;
  postResetV2WritesEnabled: boolean;
};

export type EtsyOAuthStatusInput = {
  apiCredentialsConfigured: boolean;
  tokenStoreConfigured: boolean;
  tokensStored: boolean;
  grantScope?: string | null;
  grantExpiresAt?: Date | null;
  redirectUriConfigured: boolean;
  shopIdConfigured: boolean;
  writeGates: EtsyStatusWriteGates;
  now?: Date;
};

export function buildEtsyOAuthStatus(input: EtsyOAuthStatusInput) {
  const oauthConnected = input.tokenStoreConfigured && input.tokensStored;
  const grantedScopes = oauthConnected
    ? parseEtsyGrantedScopes(input.grantScope)
    : [];
  const scopeMetadataPresent = oauthConnected && Boolean(input.grantScope?.trim());
  const missingRequiredScopes = ETSY_STATUS_REQUIRED_SCOPES.filter(
    (scope) => !grantedScopes.includes(scope)
  );
  const missingSellerReadScopes = getMissingEtsyScopes(
    grantedScopes,
    ETSY_SELLER_READ_SCOPES
  );
  const missingSellerWriteScopes = getMissingEtsyScopes(
    grantedScopes,
    ETSY_SELLER_WRITE_SCOPES
  );
  const requiredScopeChecks = {
    listings_r: scopeMetadataPresent && grantedScopes.includes("listings_r"),
    listings_w: scopeMetadataPresent && grantedScopes.includes("listings_w"),
    transactions_r: scopeMetadataPresent && grantedScopes.includes("transactions_r")
  };
  const allCheckedWriteGatesClosed =
    !input.writeGates.draftWritesEnabled &&
    !input.writeGates.publishWritesEnabled &&
    !input.writeGates.postResetV2WritesEnabled;

  let oauthGrantStatus:
    | "TOKEN_STORE_NOT_CONFIGURED"
    | "TOKEN_NOT_STORED"
    | "GRANT_METADATA_MISSING"
    | "REQUIRED_SCOPES_MISSING"
    | "GRANT_RECORDED";
  if (!input.tokenStoreConfigured) oauthGrantStatus = "TOKEN_STORE_NOT_CONFIGURED";
  else if (!input.tokensStored) oauthGrantStatus = "TOKEN_NOT_STORED";
  else if (!scopeMetadataPresent) oauthGrantStatus = "GRANT_METADATA_MISSING";
  else if (missingRequiredScopes.length) oauthGrantStatus = "REQUIRED_SCOPES_MISSING";
  else oauthGrantStatus = "GRANT_RECORDED";

  const now = input.now ?? new Date();
  const tokenExpiryStatus =
    !oauthConnected || !input.grantExpiresAt ||
    !Number.isFinite(input.grantExpiresAt.getTime())
      ? "UNKNOWN"
      : input.grantExpiresAt.getTime() > now.getTime()
        ? "UNEXPIRED"
        : "EXPIRED_REFRESH_MAY_BE_REQUIRED";

  return {
    ...POST_RESET_PLATFORM_STATE,
    mode: "READ_ONLY" as const,
    service: "etsy-open-api-v3",
    apiCredentialsConfigured: input.apiCredentialsConfigured,
    oauthConnected,
    tokenStorage: input.tokenStoreConfigured
      ? "persistent-encrypted"
      : "not-configured",
    refreshLifecycle: input.tokenStoreConfigured ? "enabled" : "blocked",
    scopes: ETSY_SCOPES,
    requestedScopes: ETSY_SCOPES,
    grantedScopes,
    scopeMetadataPresent,
    missingSellerReadScopes,
    missingSellerWriteScopes,
    sellerReadGrantReady: scopeMetadataPresent && missingSellerReadScopes.length === 0,
    sellerWriteGrantReady: scopeMetadataPresent && missingSellerWriteScopes.length === 0,
    transactionsReadGrantReady: requiredScopeChecks.transactions_r,
    requiredScopeChecks,
    missingRequiredScopes,
    allRequiredScopesGranted: scopeMetadataPresent && missingRequiredScopes.length === 0,
    oauthGrantStatus,
    tokenExpiryStatus,
    etsyApiLiveVerification: "NOT_TESTED" as const,
    etsyApiLiveVerificationNote:
      "Stored OAuth grant metadata only; no live Etsy request or marketplace write was performed.",
    writeGates: input.writeGates,
    allCheckedWriteGatesClosed,
    redirectUriConfigured: input.redirectUriConfigured,
    shopIdConfigured: input.shopIdConfigured
  };
}
