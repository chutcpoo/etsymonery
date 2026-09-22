import { NextResponse, type NextRequest } from "next/server";

const RESET_DATE = "2026-09-20";
const POST_RESET_V2_PDT_IPT_ROUTE = "/api/internal/etsy/post-reset-v2/pdt-ipt-001/draft";
const POST_RESET_V2_PDT_FCMP_ROUTE = "/api/internal/etsy/post-reset-v2/pdt-fcmp-002/draft";
const POST_RESET_V2_PDT_FCMP_RECOVERY_ROUTE = "/api/internal/etsy/post-reset-v2/pdt-fcmp-002/recovery-r01";
const POST_RESET_V2_PDT_FCMP_PUBLISH_R01_ROUTE =
  "/api/internal/etsy/post-reset-v2/pdt-fcmp-002/publish-r01";
const POST_RESET_V2_PDT_FCMP_QC_REPAIR_R01_ROUTE =
  "/api/internal/etsy/post-reset-v2/pdt-fcmp-002/qc-repair-r01";
const POST_RESET_V2_PDT_FCMP_MEDIA_POLICY_R02_ROUTE =
  "/api/internal/etsy/post-reset-v2/pdt-fcmp-002/media-policy-r02";
const POST_RESET_V2_PDT_IPT_MEDIA_POLICY_R01_ROUTE =
  "/api/internal/etsy/post-reset-v2/pdt-ipt-001/media-policy-r01";
const POST_RESET_V2_PDT_BIPC_DRAFT_R01_ROUTE =
  "/api/internal/etsy/post-reset-v2/pdt-bipc-003/draft-r01";
const POST_RESET_V2_PDT_BIPC_POLICY_REPAIR_R01_ROUTE =
  "/api/internal/etsy/post-reset-v2/pdt-bipc-003/policy-repair-r01";
const POST_RESET_V2_PDT_BIPC_PUBLISH_R02_ROUTE =
  "/api/internal/etsy/post-reset-v2/pdt-bipc-003/publish-r02";
const POST_RESET_V2_PDT_BIPC_VIDEO_R01_ROUTE =
  "/api/internal/etsy/post-reset-v2/pdt-bipc-003/video-r01";
const POST_RESET_V2_PDT_CBEO_DRAFT_CREATE_R01_ROUTE =
  "/api/internal/etsy/post-reset-v2/pdt-cbeo-004/draft-create-r01";
const POST_RESET_V2_PDT_CBEO_BUYERFILES_R01_ROUTE =
  "/api/internal/etsy/post-reset-v2/pdt-cbeo-004/buyerfiles-r01";
const POST_RESET_V2_PDT_CBEO_MEDIA_R01_ROUTE =
  "/api/internal/etsy/post-reset-v2/pdt-cbeo-004/media-r01";

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

  if (
    pathname === POST_RESET_V2_PDT_IPT_ROUTE ||
    pathname === POST_RESET_V2_PDT_FCMP_ROUTE ||
    pathname === POST_RESET_V2_PDT_FCMP_RECOVERY_ROUTE ||
    pathname === POST_RESET_V2_PDT_FCMP_PUBLISH_R01_ROUTE ||
    pathname === POST_RESET_V2_PDT_FCMP_QC_REPAIR_R01_ROUTE ||
    pathname === POST_RESET_V2_PDT_FCMP_MEDIA_POLICY_R02_ROUTE ||
    pathname === POST_RESET_V2_PDT_IPT_MEDIA_POLICY_R01_ROUTE ||
    pathname === POST_RESET_V2_PDT_BIPC_DRAFT_R01_ROUTE ||
    pathname === POST_RESET_V2_PDT_BIPC_POLICY_REPAIR_R01_ROUTE ||
    pathname === POST_RESET_V2_PDT_BIPC_PUBLISH_R02_ROUTE ||
    pathname === POST_RESET_V2_PDT_BIPC_VIDEO_R01_ROUTE ||
    pathname === POST_RESET_V2_PDT_CBEO_DRAFT_CREATE_R01_ROUTE ||
    pathname === POST_RESET_V2_PDT_CBEO_BUYERFILES_R01_ROUTE ||
    pathname === POST_RESET_V2_PDT_CBEO_MEDIA_R01_ROUTE
  ) {
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
