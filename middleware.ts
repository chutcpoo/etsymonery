import { NextResponse, type NextRequest } from "next/server";

const RESET_DATE = "2026-09-20";
const POST_RESET_V2_PDT_IPT_ROUTE = "/api/internal/etsy/post-reset-v2/pdt-ipt-001/draft";

const BLOCKED_PUBLIC_PREFIXES = [
  "/api/etsy/active-listing-update",
  "/api/etsy/authorized-destructive-action",
  "/api/etsy/authorized-listing-update",
  "/api/etsy/b01",
  "/api/etsy/draft-assets",
  "/api/etsy/pd-clean-004",
  "/api/etsy/pd-stock-005",
  "/api/etsy/pdt-boba-001",
  "/api/etsy/pdt-hbop-001"
];

function resetResponse(pathname: string) {
  return NextResponse.json(
    {
      status: "CATALOG_RESET",
      catalogState: "EMPTY_CATALOG",
      legacyWritesEnabled: false,
      resetDate: RESET_DATE,
      pathname,
      ETSY_WRITE_COUNT: 0
    },
    { status: 410 }
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  if (pathname === "/api/internal/etsy/reset-status") {
    return NextResponse.next();
  }

  if (pathname === POST_RESET_V2_PDT_IPT_ROUTE) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/internal/etsy/")) {
    return resetResponse(pathname);
  }

  if (pathname === "/api/publish" || pathname.startsWith("/api/webhooks/etsy")) {
    return resetResponse(pathname);
  }

  if (BLOCKED_PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return resetResponse(pathname);
  }

  if (pathname.startsWith("/api/etsy/") && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    return resetResponse(pathname);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/etsy/:path*",
    "/api/internal/etsy/:path*",
    "/api/publish",
    "/api/webhooks/etsy/:path*"
  ]
};
