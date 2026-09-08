import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  handlePdStock005B01TitleTags,
  PD_STOCK_005_B01
} from "../../../../../lib/pd-stock-005-b01-title-tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRIGGER_HEADER = "x-autodigitalpublisher-trigger-token";

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expectedTrigger = process.env.AUTODIGITALPUBLISHER_GITHUB_TRIGGER_TOKEN?.trim() ?? "";
  const suppliedTrigger = request.headers.get(TRIGGER_HEADER)?.trim() ?? "";

  if (!expectedTrigger) {
    return NextResponse.json({ error: "AUTHORIZED_ETSY_TRIGGER_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!suppliedTrigger || !secureEqual(suppliedTrigger, expectedTrigger)) {
    return NextResponse.json({ error: "AUTHORIZED_ETSY_TRIGGER_UNAUTHORIZED" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "AUTHORIZED_ETSY_INVALID_JSON" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "AUTHORIZED_ETSY_INVALID_PAYLOAD" }, { status: 400 });
  }

  const input = payload as Record<string, unknown>;
  const operationId = typeof input.operationId === "string" ? input.operationId : "";
  const confirmation = typeof input.confirmation === "string" ? input.confirmation : "";

  if (!operationId || operationId !== confirmation) {
    return NextResponse.json({ error: "AUTHORIZED_ETSY_CONFIRMATION_MISMATCH" }, { status: 409 });
  }
  if (operationId !== PD_STOCK_005_B01.operationId) {
    return NextResponse.json({ error: "AUTHORIZED_ETSY_OPERATION_NOT_REGISTERED" }, { status: 409 });
  }

  const writeToken = process.env.ETSY_B01_WRITE_TOKEN?.trim() ?? "";
  if (!writeToken) {
    return NextResponse.json({ error: "AUTHORIZED_ETSY_WRITE_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  }

  const exactBody = {
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

  return handlePdStock005B01TitleTags(exactBody, delegated);
}
