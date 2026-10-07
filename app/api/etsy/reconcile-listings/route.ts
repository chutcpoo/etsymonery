import { handleReconciliationGet, rejectReconciliationMethod } from "../../../../lib/etsy-reconciliation-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handleReconciliationGet(request);
}
export { rejectReconciliationMethod as POST, rejectReconciliationMethod as PUT,
  rejectReconciliationMethod as PATCH, rejectReconciliationMethod as DELETE,
  rejectReconciliationMethod as HEAD, rejectReconciliationMethod as OPTIONS };
