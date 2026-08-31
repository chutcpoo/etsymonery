import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ETSY_SCOPES, getEtsyCredentials } from "../../../../lib/etsy";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await cookies();
  const accessToken = store.get("etsy_access_token")?.value;
  const refreshToken = store.get("etsy_refresh_token")?.value;
  const credentials = getEtsyCredentials();

  return NextResponse.json({
    service: "etsy-open-api-v3",
    apiCredentialsConfigured: credentials.configured,
    oauthConnected: Boolean(accessToken && refreshToken),
    scopes: ETSY_SCOPES,
    redirectUriConfigured: Boolean(process.env.ETSY_REDIRECT_URI)
  });
}
