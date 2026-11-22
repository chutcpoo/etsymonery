import { NextResponse } from "next/server";
import { authorizeEtsyOperatorRequest, privateHeaders } from "../../../../../lib/etsy-operator-auth";
import { updateWorkflowItem } from "../../../../../lib/local-factory-workflow";
export const runtime = "nodejs";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await authorizeEtsyOperatorRequest(request, "plan", false);
  if (denied) return denied;
  try { const { id } = await params; const item = await updateWorkflowItem(id, await request.json());
    return item ? NextResponse.json({ item }, { headers: privateHeaders })
      : NextResponse.json({ error: "WORKFLOW_NOT_FOUND" }, { status: 404, headers: privateHeaders }); }
  catch (error) { const message = error instanceof Error ? error.message : "UNKNOWN";
    const conflict = message === "WORKFLOW_REVISION_CONFLICT";
    const invalid = message.startsWith("INVALID_") || message.endsWith("_REQUIRED") || message.endsWith("_LOCKED");
    return NextResponse.json({ error: conflict || invalid ? message : "FACTORY_WORKFLOW_STORE_UNAVAILABLE" },
      { status: conflict ? 409 : invalid ? 400 : 503, headers: privateHeaders }); }
}
