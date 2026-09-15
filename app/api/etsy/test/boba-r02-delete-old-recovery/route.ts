import { verifyPdtBoba001R02DeleteOldRecoveryProtectedState } from "../../../../../lib/pdt-boba-001-r02-video-repair";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return verifyPdtBoba001R02DeleteOldRecoveryProtectedState();
}
