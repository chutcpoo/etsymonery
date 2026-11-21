import { NextRequest, NextResponse } from "next/server";
import { createOAuthState, createPkcePair, getEtsyCredentials } from "../../../../../lib/etsy";
import { authorizeEtsyOperatorRequest, privateHeaders } from "../../../../../lib/etsy-operator-auth";
import {
  migrationPreflight, buildMigrationAuthorizationUrl
} from "../../../../../lib/etsy-oauth-migration";
import { saveMigrationSession } from "../../../../../lib/etsy-oauth-migration-store";
import { getStoredEtsyGrantMetadata } from "../../../../../lib/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This URL is *not* a general reauthorization endpoint. It is disabled until
// the owner separately configures migration approval and a same-host callback.
export async function GET(request: NextRequest) {
  if (process.env.ETSY_OAUTH_MIGRATION_ENABLED !== "true")
    return NextResponse.json({ status: "BLOCKED", error: "OAUTH_GRANT_CHANGE_REQUIRES_OWNER" },
      { status: 403, headers: privateHeaders });

  const denied = await authorizeEtsyOperatorRequest(request, "seller", true);
  if (denied) return denied;
  // A link opened from ChatGPT/email is cross-site. Never create an OAuth
  // session on that request: redirect to an inert, authenticated landing page.
  // The owner's subsequent click is a same-origin navigation to this route.
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return NextResponse.redirect(new URL("/api/etsy/oauth/migration/launch", request.url),
      { status: 303, headers: privateHeaders });

  try {
    const primary = await getStoredEtsyGrantMetadata();
    const settings = migrationPreflight(request.url, primary);
    const { keystring } = getEtsyCredentials();
    if (!keystring) throw new Error("APP_KEY_MISSING");
    const state = createOAuthState();
    const { verifier, challenge } = createPkcePair();
    await saveMigrationSession(state, verifier, settings);
    const authorizationUrl = buildMigrationAuthorizationUrl(
      keystring, settings.callback, state, challenge
    );
    const response = NextResponse.redirect(authorizationUrl, 303);
    for (const [key, value] of Object.entries(privateHeaders))
      response.headers.set(key, value);
    response.cookies.set("etsy_migration_state", state, {
      httpOnly: true, secure: true, sameSite: "lax",
      path: "/api/etsy/oauth/callback", maxAge: 600
    });
    return response;
  } catch {
    return NextResponse.json({ status: "BLOCKED", error: "OAUTH_MIGRATION_PREFLIGHT_FAILED" },
      { status: 503, headers: privateHeaders });
  }
}
