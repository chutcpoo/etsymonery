import { authorizeFactoryMutation } from "../../../../lib/factory-owner-session";
import { NextResponse } from "next/server";
import { authorizeEtsyOperatorRequest, privateHeaders } from "../../../../lib/etsy-operator-auth";
import { createWorkflowItem, listWorkflowItems } from "../../../../lib/local-factory-workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = await authorizeEtsyOperatorRequest(request, "read", true);
  if (denied) return denied;
  try { return NextResponse.json({ items: await listWorkflowItems() }, { headers: privateHeaders }); }
  catch { return NextResponse.json({ error: "FACTORY_WORKFLOW_STORE_UNAVAILABLE" }, { status: 503, headers: privateHeaders }); }
}
export async function POST(request: Request) {
  const denied = await authorizeFactoryMutation(request);
  if (typeof denied === "string") return NextResponse.json({ error: denied }, { status: 403, headers: privateHeaders });
  if (denied) return denied;
  try { const item = await createWorkflowItem(await request.json()); return NextResponse.json({ item }, { status: 201, headers: privateHeaders }); }
  catch (error) { const message = error instanceof Error ? error.message : "UNKNOWN";
    const invalid = message.startsWith("INVALID_");
    return NextResponse.json({ error: invalid ? message : "FACTORY_WORKFLOW_STORE_UNAVAILABLE" }, { status: invalid ? 400 : 503, headers: privateHeaders }); }
}
