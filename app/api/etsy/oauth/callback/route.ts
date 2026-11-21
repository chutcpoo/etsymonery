import { NextRequest, NextResponse } from "next/server";
import { getEtsyCredentials, etsyApiHeaders } from "../../../../../lib/etsy";
import { fetchEtsyReadWithRetry } from "../../../../../lib/etsy-http";
import { privateHeaders } from "../../../../../lib/etsy-operator-auth";
import {
  migrationPreflight, statesEqual, validateMigrationToken
} from "../../../../../lib/etsy-oauth-migration";
import { consumeMigrationSession, stageMigrationGrant } from "../../../../../lib/etsy-oauth-migration-store";
import { getStoredEtsyGrantMetadata } from "../../../../../lib/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function blocked(error: string, status = 403) {
  return NextResponse.json({ status: "BLOCKED", error, ETSY_WRITE_COUNT: 0 },
    { status, headers: privateHeaders });
}

export async function GET(request: NextRequest) {
  if (process.env.ETSY_OAUTH_MIGRATION_ENABLED !== "true")
    return blocked("OAUTH_GRANT_CHANGE_REQUIRES_OWNER");

  const url = request.nextUrl;
  const state = url.searchParams.get("state");
  const cookie = request.cookies.get("etsy_migration_state")?.value;
  const code = url.searchParams.get("code");
  if (!statesEqual(cookie, state) || !code || code.length > 2048 ||
      url.searchParams.has("error")) return blocked("OAUTH_STATE_OR_CODE_REJECTED", 400);

  try {
    const primary = await getStoredEtsyGrantMetadata();
    const settings = migrationPreflight(request.url, primary);
    // Atomic one-time consumption, BEFORE exchanging the authorization code.
    const session = await consumeMigrationSession(state!);
    if (!session || session.callback !== settings.callback ||
        session.userId !== settings.userId || session.shopId !== settings.shopId)
      return blocked("OAUTH_SESSION_INVALID_OR_REPLAYED", 400);

    const { keystring } = getEtsyCredentials();
    if (!keystring) return blocked("OAUTH_APP_KEY_UNAVAILABLE", 503);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: keystring,
      redirect_uri: settings.callback,
      code, code_verifier: session.verifier
    });
    const tokenResponse = await fetch("https://api.etsy.com/v3/public/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body, redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
    if (!tokenResponse.ok) return blocked("OAUTH_TOKEN_EXCHANGE_FAILED", 502);
    const grant = validateMigrationToken(await tokenResponse.json(), settings.userId);

    // Validate a real shop-scoped GET without touching the primary token row.
    const verify = await fetchEtsyReadWithRetry(fetch,
      `https://api.etsy.com/v3/application/shops/${settings.shopId}/listings?state=active&limit=1`,
      { method: "GET", headers: etsyApiHeaders(grant.accessToken),
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) },
      { maxAttempts: 1 });
    if (!verify.ok) return blocked("OAUTH_SHOP_READ_VERIFICATION_FAILED", 502);
    const data = await verify.json();
    if (!Number.isSafeInteger(data?.count) || data.count < 0 ||
        !Array.isArray(data.results) ||
        data.results.length !== Math.min(1, data.count) ||
        data.results.some((r: { shop_id?: number; listing_id?: number; state?: string } | null) =>
          !r || r.shop_id !== settings.shopId || r.state !== "active" ||
          !Number.isSafeInteger(r.listing_id) || Number(r.listing_id) < 1))
      return blocked("OAUTH_SHOP_READ_DATA_INVALID", 502);

    await stageMigrationGrant(state!, grant, settings.shopId);
    const destination = new URL("/?oauth_migration=staged", request.url);
    const response = NextResponse.redirect(destination, 303);
    for (const [key, value] of Object.entries(privateHeaders))
      response.headers.set(key, value);
    response.cookies.set("etsy_migration_state", "", {
      httpOnly: true, secure: true, sameSite: "lax",
      path: "/api/etsy/oauth/callback", maxAge: 0
    });
    return response;
  } catch {
    return blocked("OAUTH_MIGRATION_STAGING_FAILED", 503);
  }
}
