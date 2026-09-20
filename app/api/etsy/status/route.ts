import { NextResponse } from "next/server";
import { ETSY_SCOPES, getEtsyCredentials } from "../../../../lib/etsy";
import { hasStoredEtsyTokens, isTokenStoreConfigured } from "../../../../lib/token-store";
import { POST_RESET_PLATFORM_STATE } from "../../../../lib/post-reset-platform";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const credentials = getEtsyCredentials();
  const persistenceConfigured = isTokenStoreConfigured();
  const oauthConnected = persistenceConfigured ? await hasStoredEtsyTokens() : false;

  return NextResponse.json({
    ...POST_RESET_PLATFORM_STATE,
    service: "etsy-open-api-v3",
    apiCredentialsConfigured: credentials.configured,
    oauthConnected,
    tokenStorage: persistenceConfigured ? "persistent-encrypted" : "not-configured",
    refreshLifecycle: persistenceConfigured ? "enabled" : "blocked",
    scopes: ETSY_SCOPES,
    redirectUriConfigured: Boolean(process.env.ETSY_REDIRECT_URI),
    shopIdConfigured: Boolean(process.env.ETSY_SHOP_ID)
  });
}
