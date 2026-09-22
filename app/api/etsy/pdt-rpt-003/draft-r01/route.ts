import { GET as handleDraftR01 } from "../../../internal/etsy/post-reset-v2/pdt-rpt-003/draft-create-r01/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleDraftR01(request);
}
