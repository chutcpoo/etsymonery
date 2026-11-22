import assert from "node:assert/strict";
import test from "node:test";
import {
  executeAuthorizedPublishTransaction,
  productIdFromAuthorizedCandidate,
  type AuthorizedPublishProvider,
  type PublishedReceipt
} from "../lib/authorized-publish-transaction";
import { createListingFingerprint } from "../lib/candidate-fingerprint";
import { MemoryOperationLedgerRepository } from "../lib/operation-ledger";
import { createPublishAuthorization } from "../lib/publish-authorization";

const PRODUCT_ID = "PDT-CBP-004";
const CANDIDATE_ID = `POSTRESET-${PRODUCT_ID}-V1-123456abcdef`;
const CANDIDATE_FP = "a".repeat(64);
const LISTING_ID = "4999999999";
const NOW = "2026-10-09T08:00:00.000Z";
const DRAFT = {
  title: "Planning Workbook",
  description: "Verified description",
  price: 9.9,
  tags: ["planning", "cleaning"],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2025",
  taxonomy_id: 123,
  type: "download",
  state: "draft"
};
const LISTING_FP = createListingFingerprint({
  title: DRAFT.title,
  description: DRAFT.description,
  priceUsd: DRAFT.price,
  tags: DRAFT.tags,
  quantity: DRAFT.quantity,
  who_made: DRAFT.who_made,
  when_made: DRAFT.when_made,
  taxonomy_id: DRAFT.taxonomy_id,
  type: DRAFT.type,
  state: "draft"
});

class Provider implements AuthorizedPublishProvider {
  async readDraft() {
    return DRAFT;
  }

  async publish() {
    return { listingId: LISTING_ID, state: "active" };
  }

  async readPublished(): Promise<PublishedReceipt> {
    return {
      listingId: LISTING_ID,
      state: "active",
      observation: { ...DRAFT, state: "active" }
    };
  }
}

test("post-reset candidate Product ID is derived from the exact authorized candidate identity", () => {
  assert.equal(productIdFromAuthorizedCandidate(CANDIDATE_ID), PRODUCT_ID);
  assert.equal(productIdFromAuthorizedCandidate("UNBOUND-CANDIDATE"), null);
});

test("verified publish receipt persists Product ID and candidate ID for dynamic channel projection", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const authorization = createPublishAuthorization({
    authorizationId: "AUTH-CBP-004",
    candidateId: CANDIDATE_ID,
    candidateFingerprint: CANDIDATE_FP,
    channel: "etsy",
    shopId: "23582741",
    draftListingId: LISTING_ID,
    issuedAt: "2026-10-09T07:59:00.000Z"
  });

  const result = await executeAuthorizedPublishTransaction(
    repository,
    new Provider(),
    {
      operationId: "PDT-CBP-004-V1-ETSY-PUBLISH-R01",
      authorization,
      candidateId: CANDIDATE_ID,
      candidateFingerprint: CANDIDATE_FP,
      expectedListingFingerprint: LISTING_FP,
      shopId: "23582741",
      draftListingId: LISTING_ID,
      channel: "etsy",
      now: NOW
    }
  );

  assert.equal(result.status, "PUBLISHED");
  assert.equal(result.receipt.productId, PRODUCT_ID);
  assert.equal(result.receipt.candidateId, CANDIDATE_ID);
  assert.equal(result.receipt.listingId, LISTING_ID);
  assert.equal(result.receipt.state, "active");
  assert.equal(result.receipt.authorizationState, "CONSUMED");
});
