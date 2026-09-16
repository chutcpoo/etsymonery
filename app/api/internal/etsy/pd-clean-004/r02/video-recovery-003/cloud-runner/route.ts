import { NextResponse } from "next/server";
import {
  PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003,
  handlePdClean004VideoRecovery003,
  verifyPdClean004VideoRecovery003ProtectedState
} from "../../../../../../../../lib/pd-clean-004-visual-r02-video-recovery-003";
import { verifyPdClean004CloudRunnerOidc } from "../../../../../../../../lib/pd-clean-004-r02-cloud-runner-oidc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OIDC_AUDIENCE = "https://autodigitalpublisher.vercel.app/api/internal/etsy/pd-clean-004/r02/video-recovery-003/cloud-runner";

function delegatedRequest(request: Request) {
  const writeToken = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  if (!writeToken) return null;
  return new Request(request.url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken }
  });
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return NextResponse.json({ error: "PD_CLEAN_004_VIDEO_RECOVERY_003_CLOUD_OIDC_MISSING", ETSY_WRITE_COUNT: 0 }, { status: 401 });
  }
  try {
    await verifyPdClean004CloudRunnerOidc(authorization.slice("Bearer ".length).trim(), OIDC_AUDIENCE);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "PD_CLEAN_004_VIDEO_RECOVERY_003_CLOUD_OIDC_INVALID",
      ETSY_WRITE_COUNT: 0
    }, { status: 401 });
  }

  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: "PD_CLEAN_004_VIDEO_RECOVERY_003_CLOUD_INVALID_JSON", ETSY_WRITE_COUNT: 0 }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "PD_CLEAN_004_VIDEO_RECOVERY_003_CLOUD_INVALID_PAYLOAD", ETSY_WRITE_COUNT: 0 }, { status: 400 });
  }

  const input = payload as Record<string, unknown>;
  const operationId = typeof input.operationId === "string" ? input.operationId : "";
  const confirmation = typeof input.confirmation === "string" ? input.confirmation : "";
  const action = typeof input.action === "string" ? input.action : "verify_protected_state";
  if (operationId !== PD_CLEAN_004_VISUAL_R02_VIDEO_RECOVERY_003.operationId || confirmation !== operationId) {
    return NextResponse.json({ error: "PD_CLEAN_004_VIDEO_RECOVERY_003_CLOUD_CONFIRMATION_MISMATCH", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  }

  if (action === "verify_protected_state") return verifyPdClean004VideoRecovery003ProtectedState();
  if (action !== "execute") {
    return NextResponse.json({ error: "PD_CLEAN_004_VIDEO_RECOVERY_003_CLOUD_INVALID_ACTION", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  }

  const protectedStateFingerprint = typeof input.protectedStateFingerprint === "string" ? input.protectedStateFingerprint.trim().toLowerCase() : "";
  const authorizationRequestHash = typeof input.authorizationRequestHash === "string" ? input.authorizationRequestHash.trim().toLowerCase() : "";
  if (!/^[a-f0-9]{64}$/.test(protectedStateFingerprint) || !/^[a-f0-9]{64}$/.test(authorizationRequestHash)) {
    return NextResponse.json({ error: "PD_CLEAN_004_VIDEO_RECOVERY_003_CLOUD_EXACT_BINDING_REQUIRED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  }

  const delegated = delegatedRequest(request);
  if (!delegated) return NextResponse.json({ error: "PD_CLEAN_004_VIDEO_RECOVERY_003_CLOUD_WRITE_TOKEN_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0 }, { status: 503 });
  return handlePdClean004VideoRecovery003(protectedStateFingerprint, authorizationRequestHash, delegated);
}
