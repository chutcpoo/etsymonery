import { NextResponse } from "next/server";
import { readActiveCatalog } from "../../../../lib/etsy-live-count";
import { privateHeaders } from "../../../../lib/etsy-operator-auth";
export const dynamic = "force-dynamic";

export async function GET() {
  const live = await readActiveCatalog();
  return NextResponse.json({ ...live, scope: "active", marketplaceWritesEnabled: false, ETSY_WRITE_COUNT: 0 },
    { status: live.status === "PASS" ? 200 : 503, headers: privateHeaders });
}
