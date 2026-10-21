import assert from "node:assert/strict";
import test from "node:test";
import { inspectCatalogIntegrity, type CatalogIntegrityInput } from "../lib/catalog-integrity";

function fixture(): CatalogIntegrityInput {
  return {
    shopId: 900001,
    generatedAt: "2026-10-21T13:00:00.000Z",
    source: {
      driveId: "canonical-drive-source",
      snapshotModifiedAt: "2026-09-27T10:58:42.116Z",
      snapshotRevisionId: "snapshot-revision"
    },
    projection: [
      { productId: "OLD-001", listingId: 101 },
      { productId: "OLD-002", listingId: 102 }
    ],
    counts: { active: 2, draft: 1, inactive: 0, sold_out: 0, expired: 0 },
    listings: [
      { listingId: 101, shopId: 900001, state: "active" },
      { listingId: 201, shopId: 900001, state: "active" },
      { listingId: 202, shopId: 900001, state: "draft" }
    ]
  };
}

test("catalog integrity reports dated mapping gaps without modifying Product Truth", () => {
  const report = inspectCatalogIntegrity(fixture());
  assert.equal(report.status, "REVIEW_REQUIRED");
  assert.equal(report.mode, "READ_ONLY");
  assert.equal(report.source.currentDriveTruthVerified, false);
  assert.equal(report.summary.datedProjectionCount, 2);
  assert.equal(report.summary.listingIdsObservedInBoth, 1);
  assert.equal(report.summary.projectionNotObservedCount, 1);
  assert.equal(report.summary.etsyOutsideProjectionCount, 2);
  assert.deepEqual(report.observedPointers, [{ productId: "OLD-001", listingId: 101, state: "active" }]);
  assert.deepEqual(report.projectionNotObserved, [{ productId: "OLD-002", listingId: 102 }]);
  assert.deepEqual(report.etsyNotInProjection, [
    { listingId: 201, state: "active" },
    { listingId: 202, state: "draft" }
  ]);
  assert.equal(report.etsy.counts.active, 2);
  assert.equal(report.etsy.counts.draft, 1);
  assert.equal(report.productTruthUpdated, false);
  assert.equal(report.publishAuthorized, false);
  assert.equal(report.etsyMutationPerformed, false);
  assert.equal(report.ETSY_WRITE_COUNT, 0);
});

test("matching identifiers remain PROJECTION_ONLY, never VERIFIED Product Truth", () => {
  const data = fixture();
  data.projection = [{ productId: "A", listingId: 101 }];
  data.counts = { active: 1, draft: 0, inactive: 0, sold_out: 0, expired: 0 };
  data.listings = [{ listingId: 101, shopId: 900001, state: "active" }];
  const report = inspectCatalogIntegrity(data);
  assert.equal(report.status, "PROJECTION_ONLY");
  assert.deepEqual(report.warnings, ["DATED_PROJECTION_NOT_CURRENT_PRODUCT_TRUTH"]);
  assert.equal(report.source.currentDriveTruthVerified, false);
});

test("duplicated projection identity fails closed", () => {
  const data = fixture();
  data.projection = [...data.projection, { productId: "OLD-001", listingId: 999 }];
  assert.throws(() => inspectCatalogIntegrity(data), /AMBIGUOUS_PROJECTION/);
  data.projection = [{ productId: "A", listingId: 1 }, { productId: "B", listingId: 1 }];
  assert.throws(() => inspectCatalogIntegrity(data), /AMBIGUOUS_PROJECTION/);
});

test("cross-shop and duplicate Etsy readback fail closed", () => {
  const data = fixture();
  data.listings = [{ ...data.listings[0], shopId: 222 }];
  assert.throws(() => inspectCatalogIntegrity(data), /INVALID_ETSY_LISTING_IDENTITY/);
  data.listings = [...fixture().listings, fixture().listings[0]];
  assert.throws(() => inspectCatalogIntegrity(data), /DUPLICATE_ETSY_LISTING_IDENTITY/);
});

test("incomplete five-state counts or an unknown state never generate PASS", () => {
  const data = fixture();
  data.counts = { ...data.counts, draft: 0 };
  assert.throws(() => inspectCatalogIntegrity(data), /INCOMPLETE_ETSY_STATE_SNAPSHOT/);
  data.counts = fixture().counts;
  data.listings = [...data.listings.slice(0, 2), { listingId: 202, shopId: 900001, state: "unknown" }];
  assert.throws(() => inspectCatalogIntegrity(data), /INVALID_ETSY_LISTING_IDENTITY/);
});

test("invalid source identity and invalid listing IDs fail closed", () => {
  const data = fixture();
  data.source = { ...data.source, driveId: "" };
  assert.throws(() => inspectCatalogIntegrity(data), /INVALID_SOURCE_OR_SNAPSHOT_IDENTITY/);
  data.source = fixture().source;
  data.projection = [{ productId: "A", listingId: 0 }];
  assert.throws(() => inspectCatalogIntegrity(data), /INVALID_PROJECTION/);
});
