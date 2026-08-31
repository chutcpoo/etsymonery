import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    service: "autodigitalpublisher",
    status: "ok",
    version: "1.0.0",
    marketplaceWritesEnabled: process.env.PUBLISH_WRITES_ENABLED === "true"
  });
}
