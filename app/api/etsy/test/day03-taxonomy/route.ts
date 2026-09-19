import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../lib/etsy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NodeRecord = {
  id?: number;
  name?: string;
  level?: number;
  parent_id?: number | null;
  children?: NodeRecord[];
  full_path_taxonomy_ids?: number[];
};

function findNode(nodes: NodeRecord[], targetId: number): NodeRecord | null {
  for (const node of nodes) {
    if (Number(node.id) === targetId) return node;
    if (Array.isArray(node.children)) {
      const nested = findNode(node.children, targetId);
      if (nested) return nested;
    }
  }
  return null;
}

export async function GET() {
  try {
    const accessToken = await getValidEtsyAccessToken();
    const response = await fetch(
      "https://api.etsy.com/v3/application/seller-taxonomy/nodes",
      {
        method: "GET",
        headers: etsyApiHeaders(accessToken),
        cache: "no-store"
      }
    );
    const payload = await response.json() as { results?: NodeRecord[]; count?: number; error?: string };
    if (!response.ok || !Array.isArray(payload.results)) {
      return NextResponse.json({
        status: "BLOCKED",
        mode: "READ_ONLY",
        ETSY_WRITE_COUNT: 0,
        http: response.status,
        error: payload.error ?? "SELLER_TAXONOMY_READ_FAILED"
      }, { status: 502, headers: { "cache-control": "no-store" } });
    }
    const targetId = 12476;
    const node = findNode(payload.results, targetId);
    return NextResponse.json({
      status: node ? "PASS" : "NOT_FOUND",
      mode: "READ_ONLY",
      ETSY_WRITE_COUNT: 0,
      targetTaxonomyId: targetId,
      node: node ? {
        id: node.id,
        name: node.name ?? null,
        level: node.level ?? null,
        parentId: node.parent_id ?? null,
        fullPathTaxonomyIds: node.full_path_taxonomy_ids ?? []
      } : null,
      rootCount: payload.count ?? payload.results.length
    }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      status: "BLOCKED",
      mode: "READ_ONLY",
      ETSY_WRITE_COUNT: 0,
      error: error instanceof Error ? error.message : "UNKNOWN"
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
