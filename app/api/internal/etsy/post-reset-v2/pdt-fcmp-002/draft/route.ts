import { NextResponse } from "next/server";
import {
  handlePdtFcmp002V1Post,
  pdtFcmp002V1Plan,
  verifyPdtFcmp002V1ProtectedState
} from "../../../../../../../lib/pdt-fcmp-002-v1-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("action") === "verify_protected_state") {
    return verifyPdtFcmp002V1ProtectedState();
  }
  return NextResponse.json(pdtFcmp002V1Plan());
}

export async function POST(request: Request) {
  return handlePdtFcmp002V1Post(request);
}
