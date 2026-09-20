import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resetResponse() {
  return NextResponse.json(
    {
      status: "CATALOG_RESET",
      catalogState: "EMPTY_CATALOG",
      legacyOperationsEnabled: false,
      resetDate: "2026-09-20",
      ETSY_WRITE_COUNT: 0
    },
    { status: 410 }
  );
}

export async function GET() {
  return resetResponse();
}

export async function POST() {
  return resetResponse();
}
