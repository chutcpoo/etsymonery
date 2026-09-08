import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  handlePdStock005B01TitleTags,
  PD_STOCK_005_B01
} from "../../../../lib/pd-stock-005-b01-title-tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRIGGER_SHA256 = "ade4923af6b2e85e5af19045d0a22af8d3aeec7e70546ccd6283c41ff0829c39";

function triggerMatches(value: string) {
  const actual = createHash("sha256").update(value, "utf8").digest();
  const expected = Buffer.from(TRIGGER_SHA256, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: Request) {
  const trigger = new URL(request.url).searchParams.get("key") ?? "";
  if (!trigger || !triggerMatches(trigger)) {
    return NextResponse.json({ error: "PD_STOCK_005_B01_TRIGGER_UNAUTHORIZED" }, { status: 401 });
  }

  const writeToken = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  if (!writeToken) {
    return NextResponse.json({ error: "PD_STOCK_005_B01_AUTH_NOT_CONFIGURED" }, { status: 503 });
  }

  const body = {
    operation: PD_STOCK_005_B01.operation,
    operationId: PD_STOCK_005_B01.operationId,
    authorizationId: PD_STOCK_005_B01.authorizationId,
    productId: PD_STOCK_005_B01.productId,
    productVersion: PD_STOCK_005_B01.productVersion,
    shopId: PD_STOCK_005_B01.shopId,
    listingId: PD_STOCK_005_B01.listingId,
    candidateId: PD_STOCK_005_B01.candidateId,
    candidateFingerprint: PD_STOCK_005_B01.candidateFingerprint,
    buildId: PD_STOCK_005_B01.buildId,
    buildFingerprint: PD_STOCK_005_B01.buildFingerprint,
    acceptanceCriteriaVersion: PD_STOCK_005_B01.acceptanceCriteriaVersion,
    acceptanceCriteriaSha256: PD_STOCK_005_B01.acceptanceCriteriaSha256,
    protectedFieldSnapshotSha256: PD_STOCK_005_B01.protectedFieldSnapshotSha256,
    patch: {
      title: PD_STOCK_005_B01.title,
      tags: [...PD_STOCK_005_B01.tags]
    }
  };

  const delegated = new Request(request.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-autodigitalpublisher-write-token": writeToken
    }
  });

  return handlePdStock005B01TitleTags(body, delegated);
}
