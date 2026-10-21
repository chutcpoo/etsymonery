import { NextResponse } from "next/server";
import {
  createEtsyDriveAssetBridgeHandler,
  getEtsyDriveBridgeStatus
} from "../../../../lib/etsy-drive-asset-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json(getEtsyDriveBridgeStatus(), {
    headers: { "cache-control": "no-store" }
  });
}

export const POST = createEtsyDriveAssetBridgeHandler();
