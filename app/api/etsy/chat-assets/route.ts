import { NextResponse } from "next/server";
import {
  createEtsyChatAssetHandler,
  getChatAssetIntakeStatus
} from "../../../../lib/etsy-chat-asset-intake";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET() {
  return NextResponse.json(getChatAssetIntakeStatus(), {
    headers: { "cache-control": "no-store" }
  });
}
export const POST = createEtsyChatAssetHandler();
