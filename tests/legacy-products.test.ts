import assert from "node:assert/strict";
import test from "node:test";
import releaseLocks from "../docs/release-locks/RELEASE_LOCK_INDEX.json";
import { LEGACY_ETSY_CHANNEL_INDEX } from "../lib/catalog-channel-index";
import { isLegacyProduct } from "../lib/legacy-products";
import { IMAGE01_V2_TARGETS } from "../lib/poonthaidigital-image01-v2-9of9-release";

test("all 29 audited historical listing pairs belong to 28 archived products", () => {
  const historicalPairs = [
    ...LEGACY_ETSY_CHANNEL_INDEX,
    ...releaseLocks.products.map((product) => ({
      productId: product.productId,
      listingId: product.etsyListingId ?? product.historicalEtsyListingId
    })),
    ...IMAGE01_V2_TARGETS
  ].map(({ productId, listingId }) => `${productId}:${listingId}`).sort();

  assert.deepEqual(historicalPairs, [
    "PD-CLEAN-004:4561795303",
    "PD-COFFEE-002:4561793463",
    "PD-REST-003:4561819638",
    "PD-STOCK-005:4561821192",
    "PDT-ABT-013:4589550767",
    "PDT-BOBA-001:4560696421",
    "PDT-BPSC-001:4573789186",
    "PDT-CBEO-004:4580126260",
    "PDT-CBP-004:4589549763",
    "PDT-CCP-007:4589550297",
    "PDT-CFB-014:4589561140",
    "PDT-CIF-010:4589560740",
    "PDT-CIP-011:4589550605",
    "PDT-CMK-015:4589551011",
    "PDT-CPR-003:4588738623",
    "PDT-CQE-008:4589550347",
    "PDT-CRM-012:4589550677",
    "PDT-CS-001:4587646332",
    "PDT-CSC-009:4589560648",
    "PDT-DCL-005:4589560344",
    "PDT-FCMP-002:4579068925",
    "PDT-HBOP-001:4566738686",
    "PDT-HBOP-001:4581821318",
    "PDT-IPT-001:4578945050",
    "PDT-MCL-006:4589550241",
    "PDT-PCL-002:4588681044",
    "PDT-PCSO-001:4569445414",
    "PDT-POGO-001:4568730165",
    "PDT-RPT-003:4580303015"
  ]);

  const productIds = new Set(historicalPairs.map((pair) => pair.split(":")[0]));
  assert.equal(productIds.size, 28);
  for (const productId of productIds) assert.ok(isLegacyProduct(productId), productId);
  assert.equal(isLegacyProduct("CREATIVE-M01"), false);
});
