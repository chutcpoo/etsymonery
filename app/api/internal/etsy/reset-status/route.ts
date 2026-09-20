import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "RESET_SAFE",
    shop: "PoonthaiDigital",
    catalogState: "EMPTY_CATALOG",
    liveCatalogCount: 0,
    legacyOperationsEnabled: false,
    legacyAssetStagingEnabled: false,
    publishEnabled: false,
    resetDate: "2026-09-20",
    ETSY_WRITE_COUNT: 0
  });
}
