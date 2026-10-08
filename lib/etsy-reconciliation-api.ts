import { timingSafeEqual } from "node:crypto";
import { readOnlyReconciliation, reconciliationError } from "./etsy-readonly-reconciliation";
import { RECONCILIATION_TRUTH_04_15 } from "./etsy-reconciliation-truth";

const headers = { "cache-control": "no-store" };

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function authorizeCaller(request: Request) {
  const expected = process.env.ETSY_RECONCILIATION_READ_TOKEN?.trim() ?? "";
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!expected) return blocked("ETSY_RECONCILIATION_READ_AUTH_NOT_CONFIGURED", 503);
  if (!supplied || !secureEqual(supplied, expected)) {
    return Response.json({
      mode: "READ_ONLY", status: "BLOCKED", error: "ETSY_RECONCILIATION_READ_UNAUTHORIZED",
      writeStateObserved: "UNKNOWN", etsyMutationPerformed: false, ETSY_WRITE_COUNT: 0
    }, { status: 401, headers: { ...headers, "www-authenticate": "Bearer" } });
  }
  return null;
}
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
  const authError = authorizeCaller(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const sensitiveHeaders = [...request.headers.keys()].filter((key) => /authorization|nonce|token|secret/i.test(key));
  if ([...url.searchParams.keys()].some((key) => key !== "productId") || request.body !== null ||
    sensitiveHeaders.some((key) => key !== "authorization")) {
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
