import { NextResponse } from "next/server";
import {
  handlePdtFcmp002V1PublishR01Post,
  pdtFcmp002V1PublishR01Plan
} from "../../../../../../../lib/pdt-fcmp-002-v1-publish-r01";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const plan = pdtFcmp002V1PublishR01Plan();
  {
    const url = new URL(request.url);
    if (url.searchParams.get("action") === "execute_relay") {
      const nonce = url.searchParams.get("nonce")?.trim() ?? "";
      if (!nonce) {
        return NextResponse.json(
          { status: "BLOCKED_FAIL_CLOSED", error: "PUBLISH_R01_RELAY_NONCE_REQUIRED", ETSY_WRITE_COUNT: 0 },
          { status: 401 }
        );
      }
      const internalRequest = new Request("https://internal.invalid/publish-r01", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-autodigitalpublisher-write-token": nonce
        },
        body: JSON.stringify({
          authorizationText: plan.authorizationText,
          operationId: plan.operationId,
          productId: plan.productId,
          shopId: plan.shopId,
          draftListingId: plan.draftListingId,
          candidateFingerprint: plan.candidateFingerprint,
          listingFingerprint: plan.listingFingerprint
        })
      });
      return handlePdtFcmp002V1PublishR01Post(internalRequest);
    }
  }
  return NextResponse.json(plan);
}

export async function POST(request: Request) {
  return handlePdtFcmp002V1PublishR01Post(request);
}
