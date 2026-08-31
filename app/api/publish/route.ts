import { NextResponse } from "next/server";
import { buildPublishPlan } from "../../../lib/publisher";
import type { ProductPack } from "../../../lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const pack = body as ProductPack;
  const plan = buildPublishPlan(pack);

  return NextResponse.json(plan, { status: plan.status === "READY" ? 200 : 422 });
}
