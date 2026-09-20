import { NextResponse } from "next/server";
import {
  handlePdtIpt001V2Post,
  pdtIpt001V2Plan
} from "../../../../../../../lib/pdt-ipt-001-v2-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(pdtIpt001V2Plan());
}

export async function POST(request: Request) {
  return handlePdtIpt001V2Post(request);
}
