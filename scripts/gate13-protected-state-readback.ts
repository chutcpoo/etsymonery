import { getValidEtsyAccessToken } from "../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../lib/etsy-seller-state-reconciliation";
import { hashOperationRequest } from "../lib/operation-ledger";
import {
  PDT_IPT_001_V2_CANDIDATE_FINGERPRINT,
  PDT_IPT_001_V2_DRAFT,
  PDT_IPT_001_V2_LISTING_FINGERPRINT,
  PDT_IPT_001_V2_OPERATION_ID
} from "../lib/pdt-ipt-001-v2-manifest";

async function main() {
  const marker = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "";
  if (
    process.env.VERCEL_ENV !== "production" ||
    !marker.includes("[GATE13_READBACK]")
  ) {
    console.log("GATE13_PROTECTED_STATE=SKIP_NON_TARGET_BUILD");
    return;
  }

  const shopId = Number(process.env.ETSY_SHOP_ID);
  if (shopId !== PDT_IPT_001_V2_DRAFT.shopId) {
    throw new Error("GATE13_SHOP_ID_MISMATCH");
  }

  const accessToken = await getValidEtsyAccessToken();
  const state = await getEtsySellerStateSnapshot({
    shopId,
    accessToken
  });
  const listingIds = state.listings
    .map((item) => item.listingId)
    .sort((a, b) => a - b);

  const snapshot = {
    operationId: PDT_IPT_001_V2_OPERATION_ID,
    candidateId: PDT_IPT_001_V2_DRAFT.candidateId,
    candidateFingerprint: PDT_IPT_001_V2_CANDIDATE_FINGERPRINT,
    listingFingerprint: PDT_IPT_001_V2_LISTING_FINGERPRINT,
    shopId,
    stateCounts: state.counts,
    listingIds
  };
  const fingerprint = hashOperationRequest(snapshot);

  console.log(
    "GATE13_PROTECTED_STATE=" +
      JSON.stringify({
        authenticated: true,
        mode: "READ_ONLY",
        counts: state.counts,
        total: state.total,
        listingIds,
        protectedStateFingerprint: fingerprint,
        candidateFingerprint: PDT_IPT_001_V2_CANDIDATE_FINGERPRINT,
        listingFingerprint: PDT_IPT_001_V2_LISTING_FINGERPRINT,
        ETSY_WRITE_COUNT: 0
      })
  );

  if (state.total !== 0 || listingIds.length !== 0) {
    throw new Error("GATE13_NON_EMPTY_CATALOG_FAIL_CLOSED");
  }
}

main().catch((error) => {
  console.error(
    "GATE13_READBACK_ERROR=" +
      (error instanceof Error ? error.message : "UNKNOWN")
  );
  process.exit(42);
});
