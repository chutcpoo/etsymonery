import { readOnlyReconciliation, reconciliationError } from "./etsy-readonly-reconciliation";
import { RECONCILIATION_TRUTH_04_15 } from "./etsy-reconciliation-truth";

const headers = { "cache-control": "no-store" };
const blocked = (error: string, status: number) => Response.json({
  mode: "READ_ONLY", status: "BLOCKED", error, writeStateObserved: "UNKNOWN",
  etsyMutationPerformed: false, ETSY_WRITE_COUNT: 0
}, { status, headers });

export function rejectReconciliationMethod() {
  return Response.json({ mode: "READ_ONLY", error: "METHOD_NOT_ALLOWED", etsyMutationPerformed: false,
    ETSY_WRITE_COUNT: 0 }, { status: 405, headers: { ...headers, Allow: "GET" } });
}

export async function handleReconciliationGet(request: Request, read = readOnlyReconciliation) {
  if (request.method !== "GET") return rejectReconciliationMethod();
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => key !== "productId") || request.body !== null ||
    [...request.headers.keys()].some((key) => /authorization|nonce|token|secret/i.test(key))) {
    return blocked("RECONCILIATION_INPUT_REJECTED", 400);
  }
  const productIds = url.searchParams.getAll("productId");
  if (productIds.some((id) => !RECONCILIATION_TRUTH_04_15.some((p) => p.productId === id))) {
    return blocked("PRODUCT_OUTSIDE_RECONCILIATION_SCOPE", 400);
  }
  try {
    return Response.json(await read(productIds), { headers });
  } catch (error) {
    return blocked(reconciliationError(error), 503);
  }
}
