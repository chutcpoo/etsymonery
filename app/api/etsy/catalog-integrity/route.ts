import { NextResponse } from "next/server";
import { CANONICAL_CATALOG_SOURCE, ETSY_CHANNEL_INDEX } from "../../../../lib/catalog-channel-index";
import { inspectCatalogIntegrity } from "../../../../lib/catalog-integrity";
import { getValidEtsyAccessToken } from "../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../lib/etsy-seller-state-reconciliation";
import { getStoredEtsyShopId } from "../../../../lib/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store" };
const noWrites = {
  mode: "READ_ONLY" as const,
  productTruthUpdated: false,
  publishAuthorized: false,
  etsyMutationPerformed: false,
  ETSY_WRITE_COUNT: 0 as const
};

// This handler reads live Etsy evidence for ALL five states. The dated Drive
// identifier projection is comparison-only, never a source of publishing rights.
export async function GET() {
  try {
    const shopId = await getStoredEtsyShopId();
    if (!shopId) throw new Error("SHOP_UNAVAILABLE");
    const accessToken = await getValidEtsyAccessToken();
    const snapshot = await getEtsySellerStateSnapshot({
      shopId,
      accessToken,
      summaryOnly: true
    });
    const integrity = inspectCatalogIntegrity({
      shopId,
      generatedAt: new Date().toISOString(),
      source: CANONICAL_CATALOG_SOURCE,
      projection: ETSY_CHANNEL_INDEX,
      counts: snapshot.counts,
      listings: snapshot.listings
    });
    return NextResponse.json(integrity, { headers });
  } catch {
    // No provider errors, tokens, env values, or partial snapshots are returned.
    return NextResponse.json({
      status: "BLOCKED",
      error: "CATALOG_INTEGRITY_EVIDENCE_UNAVAILABLE",
      ...noWrites
    }, { status: 503, headers });
  }
}

function methodNotAllowed() {
  return NextResponse.json({
    status: "BLOCKED",
    error: "METHOD_NOT_ALLOWED",
    ...noWrites
  }, { status: 405, headers: { ...headers, allow: "GET" } });
}
export {
  methodNotAllowed as POST, methodNotAllowed as PUT,
  methodNotAllowed as PATCH, methodNotAllowed as DELETE
};
