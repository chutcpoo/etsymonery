import { NextResponse } from "next/server";
import {
  ETSY_SCOPES,
  ETSY_SELLER_READ_SCOPES,
  ETSY_SELLER_WRITE_SCOPES,
  getEtsyCredentials,
  getMissingEtsyScopes,
  parseEtsyGrantedScopes
} from "../../../../lib/etsy";
import {
  getStoredEtsyGrantMetadata,
  hasStoredEtsyTokens,
  isTokenStoreConfigured
} from "../../../../lib/token-store";
import { POST_RESET_PLATFORM_STATE } from "../../../../lib/post-reset-platform";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const credentials = getEtsyCredentials();
  const persistenceConfigured = isTokenStoreConfigured();
  const oauthConnected = persistenceConfigured ? await hasStoredEtsyTokens() : false;
  const grant = persistenceConfigured ? await getStoredEtsyGrantMetadata() : null;
  const grantedScopes = parseEtsyGrantedScopes(grant?.scope);
  const scopeMetadataPresent = Boolean(grant?.scope?.trim());
  const missingSellerReadScopes = getMissingEtsyScopes(
    grant?.scope,
    ETSY_SELLER_READ_SCOPES
  );
  const missingSellerWriteScopes = getMissingEtsyScopes(
    grant?.scope,
    ETSY_SELLER_WRITE_SCOPES
  );

  return NextResponse.json({
    ...POST_RESET_PLATFORM_STATE,
    service: "etsy-open-api-v3",
    apiCredentialsConfigured: credentials.configured,
    oauthConnected,
    tokenStorage: persistenceConfigured ? "persistent-encrypted" : "not-configured",
    refreshLifecycle: persistenceConfigured ? "enabled" : "blocked",
    scopes: ETSY_SCOPES,
    requestedScopes: ETSY_SCOPES,
    grantedScopes,
    scopeMetadataPresent,
    missingSellerReadScopes,
    missingSellerWriteScopes,
    sellerReadGrantReady:
      oauthConnected && scopeMetadataPresent && missingSellerReadScopes.length === 0,
    sellerWriteGrantReady:
      oauthConnected && scopeMetadataPresent && missingSellerWriteScopes.length === 0,
    redirectUriConfigured: Boolean(process.env.ETSY_REDIRECT_URI),
    shopIdConfigured: Boolean(process.env.ETSY_SHOP_ID)
  });
}
