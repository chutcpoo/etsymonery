import { NextResponse } from "next/server";
import {
  handlePdtFcmp002V1RecoveryPost,
  pdtFcmp002V1RecoveryPlan,
  verifyPdtFcmp002V1RecoveryProtectedState
} from "../../../../../../../lib/pdt-fcmp-002-v1-recovery";
import { handlePdtFcmp002V1RecoveryRelayGet } from "../../../../../../../lib/pdt-fcmp-002-v1-recovery-relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("action") === "verify_protected_state") {
    return verifyPdtFcmp002V1RecoveryProtectedState();
  }
  if (url.searchParams.get("action") === "execute_relay") {
    return handlePdtFcmp002V1RecoveryRelayGet(request);
  }
  return NextResponse.json(pdtFcmp002V1RecoveryPlan());
}

export async function POST(request: Request) {
  return handlePdtFcmp002V1RecoveryPost(request);
}
