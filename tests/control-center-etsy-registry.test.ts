import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeControlCenterEtsyMappings,
  productIdForEtsyListing,
  projectVerifiedPublishLedgerMappings,
  type ControlCenterEtsyMapping
} from "../lib/control-center-etsy-registry";

const CURRENT_LIVE_LISTING_IDS = [4587646332, 4588681044, 4588738623] as const;

test("Drive-backed migration bootstrap resolves the current three active Etsy listings 3/3 with zero live-only", () => {
  const projection = mergeControlCenterEtsyMappings([], []);
  const tracked = CURRENT_LIVE_LISTING_IDS.filter(
    (listingId) => productIdForEtsyListing(projection, listingId) != null
  );

  assert.equal(projection.length, 3);
  assert.equal(tracked.length, 3);
  assert.equal(CURRENT_LIVE_LISTING_IDS.length - tracked.length, 0);
  assert.equal(productIdForEtsyListing(projection, 4587646332), "PDT-CSCH-001");
  assert.equal(productIdForEtsyListing(projection, 4588681044), "PDT-PCL-002");
  assert.equal(productIdForEtsyListing(projection, 4588738623), "PDT-CPR-003");
});

test("a future post-reset verified publish receipt becomes tracked without adding a hardcoded mapping", () => {
  const ledgerMappings = projectVerifiedPublishLedgerMappings([
    {
      operation_id: "PDT-CBP-004-V1-ETSY-PUBLISH-R01",
      receipt: {
        productId: "PDT-CBP-004",
        candidateId: "POSTRESET-PDT-CBP-004-V1-123456abcdef",
        listingId: "4999999999",
        state: "active",
        authorizationState: "CONSUMED"
      }
    }
  ]);
  const projection = mergeControlCenterEtsyMappings([], ledgerMappings);

  assert.deepEqual(ledgerMappings, [
    {
      productId: "PDT-CBP-004",
      listingId: 4999999999,
      source: "VERIFIED_PUBLISH_LEDGER"
    }
  ]);
  assert.equal(projection.length, 4);
  assert.equal(productIdForEtsyListing(projection, 4999999999), "PDT-CBP-004");
});

test("unverified or non-live ledger receipts cannot create dynamic mappings", () => {
  const mappings = projectVerifiedPublishLedgerMappings([
    {
      receipt: {
        productId: "PDT-CBP-004",
        candidateId: "POSTRESET-PDT-CBP-004-V1-123456abcdef",
        listingId: "4999999999",
        state: "draft",
        authorizationState: "CONSUMED"
      }
    },
    {
      receipt: {
        productId: "PDT-CBP-004",
        candidateId: "POSTRESET-PDT-CBP-004-V1-123456abcdef",
        listingId: "4999999999",
        state: "active",
        authorizationState: "ACTIVE"
      }
    },
    {
      receipt: {
        productId: "PDT-CBP-004",
        candidateId: "UNBOUND-CANDIDATE",
        listingId: "4999999999",
        state: "active",
        authorizationState: "CONSUMED"
      }
    }
  ]);

  assert.deepEqual(mappings, []);
});

test("conflicting Product ID for the same Etsy Listing ID fails closed", () => {
  const conflict: ControlCenterEtsyMapping = {
    productId: "PDT-CBP-004",
    listingId: 4587646332,
    source: "VERIFIED_PUBLISH_LEDGER"
  };

  assert.throws(
    () => mergeControlCenterEtsyMappings([], [conflict]),
    /CONTROL_CENTER_ETSY_LISTING_CONFLICT:4587646332:PDT-CSCH-001:PDT-CBP-004/
  );
});
