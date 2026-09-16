import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  PD_CLEAN_004_VISUAL_R02_RELEASE,
  exactPdClean004AuthorizationHash,
  handlePdClean004R02Release,
  verifyPdClean004R02ProtectedState
} from "../../../../../../../../lib/pd-clean-004-visual-r02-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_SHA256 = "b264f880419c95138c61157580e6682b168976951f9273c96927c1eee53af99c";
const TOKEN_HEADER = "x-pd-clean-r02-execute-once-token";

function authorized(request: Request) {
  const supplied = request.headers.get(TOKEN_HEADER)?.trim() ?? "";
  if (!supplied) return false;
  const actual = createHash("sha256").update(supplied, "utf8").digest("hex");
  const a = Buffer.from(actual);
  const b = Buffer.from(TOKEN_SHA256);
  return a.length === b.length && timingSafeEqual(a, b);
}

function delegatedRequest(request: Request) {
  const writeToken = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  if (!writeToken) return null;
  return new Request(request.url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-autodigitalpublisher-write-token": writeToken }
  });
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "PD_CLEAN_R02_EXECUTE_ONCE_UNAUTHORIZED", ETSY_WRITE_COUNT: 0 }, { status: 401 });

  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: "PD_CLEAN_R02_EXECUTE_ONCE_INVALID_JSON", ETSY_WRITE_COUNT: 0 }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ error: "PD_CLEAN_R02_EXECUTE_ONCE_INVALID_PAYLOAD", ETSY_WRITE_COUNT: 0 }, { status: 400 });

  const input = payload as Record<string, unknown>;
  const operationId = typeof input.operationId === "string" ? input.operationId : "";
  const confirmation = typeof input.confirmation === "string" ? input.confirmation : "";
  const action = typeof input.action === "string" ? input.action : "verify_protected_state";
  if (operationId !== PD_CLEAN_004_VISUAL_R02_RELEASE.operationId || confirmation !== operationId) {
    return NextResponse.json({ error: "PD_CLEAN_R02_EXECUTE_ONCE_CONFIRMATION_MISMATCH", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  }

  if (action === "verify_protected_state") return verifyPdClean004R02ProtectedState();

  if (action === "execute_authorized_fresh") {
    const verification = await verifyPdClean004R02ProtectedState();
    if (!verification.ok) return verification;
    const verified = await verification.json() as Record<string, unknown>;
    const protectedStateFingerprint = typeof verified.protectedStateFingerprint === "string" ? verified.protectedStateFingerprint.trim().toLowerCase() : "";
    if (verified.status !== "PROTECTED_STATE_MATCH" || verified.ETSY_WRITE_COUNT !== 0 || !/^[a-f0-9]{64}$/.test(protectedStateFingerprint)) {
      return NextResponse.json({ error: "PD_CLEAN_R02_EXECUTE_ONCE_FRESH_PSV_NOT_MATCHED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
    }
    const delegated = delegatedRequest(request);
    if (!delegated) return NextResponse.json({ error: "PD_CLEAN_R02_EXECUTE_ONCE_WRITE_TOKEN_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0 }, { status: 503 });
    return handlePdClean004R02Release(protectedStateFingerprint, exactPdClean004AuthorizationHash(protectedStateFingerprint), delegated);
  }

  if (action !== "execute") return NextResponse.json({ error: "PD_CLEAN_R02_EXECUTE_ONCE_INVALID_ACTION", ETSY_WRITE_COUNT: 0 }, { status: 409 });

  const protectedStateFingerprint = typeof input.protectedStateFingerprint === "string" ? input.protectedStateFingerprint.trim().toLowerCase() : "";
  const authorizationRequestHash = typeof input.authorizationRequestHash === "string" ? input.authorizationRequestHash.trim().toLowerCase() : "";
  if (!/^[a-f0-9]{64}$/.test(protectedStateFingerprint) || !/^[a-f0-9]{64}$/.test(authorizationRequestHash)) {
    return NextResponse.json({ error: "PD_CLEAN_R02_EXECUTE_ONCE_EXACT_BINDING_REQUIRED", ETSY_WRITE_COUNT: 0 }, { status: 409 });
  }

  const delegated = delegatedRequest(request);
  if (!delegated) return NextResponse.json({ error: "PD_CLEAN_R02_EXECUTE_ONCE_WRITE_TOKEN_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0 }, { status: 503 });
  return handlePdClean004R02Release(protectedStateFingerprint, authorizationRequestHash, delegated);
}
