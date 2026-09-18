import { verifyPdStock005R03ProtectedState } from "../../../../../../lib/pd-stock-005-live-catalog-v3-r03";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return verifyPdStock005R03ProtectedState();
}
