import { NextResponse } from "next/server";
import { privateHeaders } from "../../../../../lib/etsy-operator-auth";

export function GET() {
  return NextResponse.json({ status: "BLOCKED", error: "OAUTH_GRANT_CHANGE_REQUIRES_OWNER" },
    { status: 403, headers: privateHeaders });
}
