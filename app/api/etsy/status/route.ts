import { NextResponse } from "next/server";
import { getEtsyCredentials } from "../../../../lib/etsy";
import { buildEtsyOAuthStatus } from "../../../../lib/etsy-status";
import {
  getStoredEtsyGrantMetadata,
  hasStoredEtsyTokens,
  isTokenStoreConfigured
} from "../../../../lib/token-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET is metadata-only: no token refresh, Etsy HTTP call or listing mutation.
export async function GET() {
  try {
    const credentials = getEtsyCredentials();
    const persistenceConfigured = isTokenStoreConfigured();
    const oauthConnected = persistenceConfigured ? await hasStoredEtsyTokens() : false;
    const grant = persistenceConfigured ? await getStoredEtsyGrantMetadata() : null;

    return NextResponse.json(
      buildEtsyOAuthStatus({
        apiCredentialsConfigured: credentials.configured,
        tokenStoreConfigured: persistenceConfigured,
        tokensStored: oauthConnected,
        grantScope: grant?.scope,
        grantExpiresAt: grant?.expiresAt,
        redirectUriConfigured: Boolean(process.env.ETSY_REDIRECT_URI?.trim()),
        shopIdConfigured: Boolean(process.env.ETSY_SHOP_ID?.trim()),
        writeGates: {
          draftWritesEnabled: process.env.ETSY_DRAFT_WRITES_ENABLED === "true",
          publishWritesEnabled: process.env.PUBLISH_WRITES_ENABLED === "true",
          postResetV2WritesEnabled:
            process.env.ETSY_POST_RESET_V2_WRITES_ENABLED === "true"
        }
      }),
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    // Do not expose database details, OAuth tokens or secret values to callers.
    return NextResponse.json(
      {
        status: "BLOCKED",
        mode: "READ_ONLY",
        service: "etsy-open-api-v3",
        error: "OAUTH_STATUS_STORE_UNAVAILABLE",
        etsyApiLiveVerification: "NOT_TESTED",
        ETSY_WRITE_COUNT: 0
      },
      {
        status: 503,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
