import { NextResponse } from "next/server";
import {
  prepareNewProductCandidate,
  validateNewProductManifest
} from "../../../../lib/post-reset-platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "BLOCKED", errors: ["INVALID_JSON"], EtsyWriteCount: 0 }, { status: 400 });
  }

  const validated = validateNewProductManifest(body);
  if (!validated.ok) {
    return NextResponse.json(
      { status: "BLOCKED", errors: validated.errors, EtsyWriteCount: 0 },
      { status: 422 }
    );
  }

  return NextResponse.json({
    ...prepareNewProductCandidate(validated.manifest),
    next: "FRESH_PROTECTED_STATE_VERIFICATION",
    note: "Preparation only. No Etsy listing, draft, asset upload, price change, or publish action was performed."
  });
}
