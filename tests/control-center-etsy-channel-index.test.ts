import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTROL_CENTER_ETSY_CHANNEL_INDEX,
  CONTROL_CENTER_ETSY_SOURCE
} from "../lib/control-center-etsy-channel-index";

test("Control Center Etsy projection is bound to latest Master plus Product Truth", () => {
  assert.equal(
    CONTROL_CENTER_ETSY_SOURCE.driveId,
    "108WmUQjOQ4BR_PkTJUznGXzDHaFwIwIkDJOCdjnl7QM"
  );
  assert.equal(CONTROL_CENTER_ETSY_SOURCE.title, "00 - Master Project Brief");
  assert.equal(CONTROL_CENTER_ETSY_SOURCE.snapshotRevisionId, "27");
  assert.equal(
    CONTROL_CENTER_ETSY_SOURCE.authority,
    "MASTER_PLUS_PRODUCT_TRUTH_IDENTIFIER_PROJECTION"
  );
  assert.deepEqual(CONTROL_CENTER_ETSY_SOURCE.productTruthDriveIds, {
    "PDT-CSCH-001": "1dCdQ8kvRDVH_qynLljAynLKxOp_a5WH-9aUva5oitCc",
    "PDT-PCL-002": "1G_zXzW1e1MIfAKdIf618VXMZKUWWR0Hq7qRFBoUj1tU",
    "PDT-CPR-003": "18xSNFCFmFzLveI54ELCjrZLABOPQ0lLe"
  });
});

test("Control Center Etsy projection contains exactly three ACTIVE protected mappings", () => {
  assert.deepEqual(CONTROL_CENTER_ETSY_CHANNEL_INDEX, [
    { productId: "PDT-CSCH-001", listingId: 4587646332 },
    { productId: "PDT-PCL-002", listingId: 4588681044 },
    { productId: "PDT-CPR-003", listingId: 4588738623 }
  ]);
});

test("Control Center Etsy projection is identifier-only and unique", () => {
  assert.equal(
    new Set(CONTROL_CENTER_ETSY_CHANNEL_INDEX.map((entry) => entry.productId)).size,
    CONTROL_CENTER_ETSY_CHANNEL_INDEX.length
  );
  assert.equal(
    new Set(CONTROL_CENTER_ETSY_CHANNEL_INDEX.map((entry) => entry.listingId)).size,
    CONTROL_CENTER_ETSY_CHANNEL_INDEX.length
  );
  for (const entry of CONTROL_CENTER_ETSY_CHANNEL_INDEX) {
    assert.deepEqual(Object.keys(entry).sort(), ["listingId", "productId"]);
  }
});
