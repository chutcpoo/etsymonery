import { NextResponse, type NextRequest } from "next/server";
import { authorizeEtsyOperatorRequest, isEtsyOperatorProtectedPath, privateHeaders, type OperatorRole } from "./lib/etsy-operator-auth";
import { reviewMarketplaceRequest } from "./lib/etsy-policy";

function blocked(error: string, missing?: string[]) {
  return NextResponse.json({ status: "BLOCKED", error, missing, ETSY_WRITE_COUNT: 0 }, { status: 403, headers: privateHeaders });
}

function planRole(path: string): OperatorRole | null {
  if (/^\/api\/product-plans\/[^/]+\/approve$/.test(path)) return "seller";
  if (/^\/api\/product-plans\/[^/]+\/qc$/.test(path)) return "qc";
  if (path === "/api/product-plans/create" || path === "/api/products/prepare" ||
      /^\/api\/products\/[^/]+\/build$/.test(path)) return "plan";
  return null;
}

// This is a single-shop operator service. Only explicitly reviewed entry points
// may reach handlers. Some retired GET handlers can mutate or collect Etsy data.
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/\/+$/, "") || "/";
  const read = ["GET", "HEAD"].includes(request.method);
  if (!isEtsyOperatorProtectedPath(path) && read) return NextResponse.next();
  const role = request.method === "POST" ? planRole(path) : null;
  const denied = await authorizeEtsyOperatorRequest(request, role ?? "read", read);
  if (denied) return denied;
  if (role || (read && (["/", "/api/platform/status", "/api/etsy/status", "/api/etsy/seller-state"].includes(path) ||
      /^\/api\/product-plans\/[a-zA-Z0-9_-]+$/.test(path)))) {
    const response = NextResponse.next();
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
    return response;
  }
  if (path.includes("/oauth/") || path === "/connect/etsy") return blocked("OAUTH_GRANT_CHANGE_REQUIRES_OWNER");
  if (/commerce|sales|events|control-center|stats-evidence|market-research|factory/.test(path))
    return blocked("ETSY_DATA_USE_REQUIRES_WRITTEN_AUTHORIZATION");
  if (path === "/p" || path.startsWith("/p/")) return blocked("PUBLIC_DISPLAY_REQUIRES_VERIFIED_LIVE_DATA");
  const operation = /publish|release|activate/.test(path) ? "publish" : "draft";
  return blocked("MARKETPLACE_OPERATIONS_LOCKED", reviewMarketplaceRequest(request.headers, operation).missing);
}

export const config = { matcher: ["/((?!_next/static/|_next/image$|favicon.ico$).*)"] };
