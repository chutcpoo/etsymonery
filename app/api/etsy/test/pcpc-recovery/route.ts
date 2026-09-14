import { verifyPdtPcpc001DraftRecovery001ProtectedState } from "../../../../../lib/pdt-pcpc-001-draft-recovery-001";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return verifyPdtPcpc001DraftRecovery001ProtectedState();
}
