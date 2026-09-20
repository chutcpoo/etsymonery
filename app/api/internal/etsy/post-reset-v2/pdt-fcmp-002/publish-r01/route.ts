import { NextResponse } from "next/server";
import {
  handlePdtFcmp002V1PublishR01Post,
  pdtFcmp002V1PublishR01Plan
} from "../../../../../../../lib/pdt-fcmp-002-v1-publish-r01";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(pdtFcmp002V1PublishR01Plan());
}

export async function POST(request: Request) {
  return handlePdtFcmp002V1PublishR01Post(request);
}
