import assert from "node:assert/strict";
import test from "node:test";
import {
  executeAuthorizedPublishTransaction,
  PublishAmbiguousResultError,
  type AuthorizedPublishProvider,
  type PublishedReceipt
} from "../lib/authorized-publish-transaction";
import { createListingFingerprint } from "../lib/candidate-fingerprint";
import { MemoryOperationLedgerRepository } from "../lib/operation-ledger";
import {
  consumePublishAuthorization,
  createPublishAuthorization,
  revokePublishAuthorization,
  type PublishAuthorizationGrant
} from "../lib/publish-authorization";

const CANDIDATE_FP = "a".repeat(64);
const NOW = "2026-09-05T09:00:00.000Z";
const DRAFT_READ = {
  title: "Planner",
  description: "Desc",
  price: 14.9,
  tags: ["one", "two"],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2025",
  taxonomy_id: 123,
  type: "download",
  state: "draft"
};
const LISTING_FP = createListingFingerprint({
  title: "Planner",
  description: "Desc",
  priceUsd: 14.9,
  tags: ["one", "two"],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2025",
  taxonomy_id: 123,
  type: "download",
  state: "draft"
});

function grant(overrides: { expiresAt?: string } = {}) {
  return createPublishAuthorization({
    authorizationId: "AUTH",
    candidateId: "CAND",
    candidateFingerprint: CANDIDATE_FP,
    channel: "etsy",
    shopId: "SHOP",
    draftListingId: "DRAFT",
    issuedAt: "2026-09-05T08:59:00.000Z",
    ...overrides
  });
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    operationId: "OP-PUB",
    authorization: grant(),
    candidateId: "CAND",
    candidateFingerprint: CANDIDATE_FP,
    expectedListingFingerprint: LISTING_FP,
    shopId: "SHOP",
    draftListingId: "DRAFT",
    channel: "etsy",
    now: NOW,
    ...overrides
  };
}

function activeReceipt(overrides: Partial<PublishedReceipt> = {}): PublishedReceipt {
  return {
    listingId: "DRAFT",
    state: "active",
    observation: { ...DRAFT_READ, state: "active" },
    ...overrides
  };
}

class Provider implements AuthorizedPublishProvider {
  publishes = 0;
  draftReads = 0;
  publishedReads = 0;
  published: PublishedReceipt | null = null;
  ambiguous = false;
  draftDrift = false;
  postDrift = false;
  postState = "active";

  async readDraft() {
    this.draftReads += 1;
    return this.draftDrift ? { ...DRAFT_READ, title: "Drift" } : DRAFT_READ;
  }

  async publish() {
    this.publishes += 1;
    this.published = activeReceipt({
      state: this.postState,
      observation: {
        ...DRAFT_READ,
        ...(this.postDrift ? { title: "Drift" } : {}),
        state: this.postState
      }
    });
    if (this.ambiguous) throw new PublishAmbiguousResultError();
    return { listingId: "DRAFT", state: "active" };
  }

  async readPublished() {
    this.publishedReads += 1;
    return this.published;
  }
}

function consumedGrant(source: PublishAuthorizationGrant) {
  return consumePublishAuthorization(source, {
    authorizationId: source.authorization.authorizationId,
    candidateId: source.authorization.candidateId,
    candidateFingerprint: source.authorization.candidateFingerprint,
    shopId: source.shopId,
    draftListingId: source.draftListingId,
    channel: source.authorization.channel,
    now: NOW
  });
}

test("exact pre-read authorization publishes once and confirms post-read identity", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const provider = new Provider();
  const result = await executeAuthorizedPublishTransaction(repository, provider, input());

  assert.equal(result.status, "PUBLISHED");
  assert.equal(provider.publishes, 1);
  assert.equal(provider.publishedReads, 1);
  assert.equal(result.authorization.authorization.state, "CONSUMED");
  assert.equal(result.receipt.listingId, "DRAFT");
  assert.equal(result.receipt.state, "active");
  assert.equal(result.receipt.expectedListingFingerprint, LISTING_FP);
  assert.equal(result.receipt.actualListingFingerprint, LISTING_FP);
});

test("candidate identity mismatch stops before authorization consumption or publish", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const provider = new Provider();
  provider.draftDrift = true;

  const result = await executeAuthorizedPublishTransaction(repository, provider, input());
  assert.equal(result.status, "IDENTITY_MISMATCH");
  assert.equal(provider.publishes, 0);
  assert.equal(result.authorization.authorization.state, "ACTIVE");
});

test("expected listing fingerprint mismatch performs no publish", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const provider = new Provider();
  const result = await executeAuthorizedPublishTransaction(
    repository,
    provider,
    input({ expectedListingFingerprint: "b".repeat(64) })
  );
  assert.equal(result.status, "IDENTITY_MISMATCH");
  assert.equal(provider.publishes, 0);
});

test("authorization candidate mismatch performs no publish", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const provider = new Provider();
  await assert.rejects(
    () => executeAuthorizedPublishTransaction(repository, provider, input({ candidateId: "OTHER" })),
    /AUTHORIZATION_CANDIDATE_MISMATCH/
  );
  assert.equal(provider.publishes, 0);
});

test("authorization shop mismatch performs no publish", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const provider = new Provider();
  await assert.rejects(
    () => executeAuthorizedPublishTransaction(repository, provider, input({ shopId: "OTHER" })),
    /AUTHORIZATION_SHOP_MISMATCH/
  );
  assert.equal(provider.publishes, 0);
});

test("authorization Draft mismatch performs no publish", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const provider = new Provider();
  await assert.rejects(
    () =>
      executeAuthorizedPublishTransaction(
        repository,
        provider,
        input({ draftListingId: "OTHER-DRAFT" })
      ),
    /AUTHORIZATION_DRAFT_MISMATCH/
  );
  assert.equal(provider.publishes, 0);
});

test("expired authorization performs no publish", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const provider = new Provider();
  const expired = grant({ expiresAt: "2026-09-05T08:59:30.000Z" });
  await assert.rejects(
    () => executeAuthorizedPublishTransaction(repository, provider, input({ authorization: expired })),
    /AUTHORIZATION_EXPIRED/
  );
  assert.equal(provider.publishes, 0);
});

test("revoked authorization performs no publish", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const provider = new Provider();
  const revoked = revokePublishAuthorization(grant(), "2026-09-05T08:59:30.000Z");
  await assert.rejects(
    () => executeAuthorizedPublishTransaction(repository, provider, input({ authorization: revoked })),
    /AUTHORIZATION_NOT_ACTIVE/
  );
  assert.equal(provider.publishes, 0);
});

test("consumed authorization performs no publish", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const provider = new Provider();
  const consumed = consumedGrant(grant());
  await assert.rejects(
    () => executeAuthorizedPublishTransaction(repository, provider, input({ authorization: consumed })),
    /AUTHORIZATION_NOT_ACTIVE/
  );
  assert.equal(provider.publishes, 0);
});

test("ambiguous provider response reconciles via read-only post-read", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const provider = new Provider();
  provider.ambiguous = true;

  const result = await executeAuthorizedPublishTransaction(repository, provider, input());
  assert.equal(result.status, "RECONCILED");
  assert.equal(provider.publishes, 1);
  assert.equal(provider.publishedReads, 1);
});

test("ambiguous with no read-back enters reconciliation and never republishes on replay", async () => {
  const repository = new MemoryOperationLedgerRepository();
  let publishes = 0;
  let publishedReads = 0;
  const provider: AuthorizedPublishProvider = {
    async readDraft() {
      return DRAFT_READ;
    },
    async publish() {
      publishes += 1;
      throw new PublishAmbiguousResultError();
    },
    async readPublished() {
      publishedReads += 1;
      return null;
    }
  };
  const firstInput = input();
  const first = await executeAuthorizedPublishTransaction(repository, provider, firstInput);
  const replay = await executeAuthorizedPublishTransaction(repository, provider, {
    ...firstInput,
    now: "2026-09-05T09:01:00.000Z"
  });

  assert.equal(first.status, "RECONCILIATION_REQUIRED");
  assert.equal(replay.status, "RECONCILIATION_REQUIRED");
  assert.equal(publishes, 1);
  assert.equal(publishedReads, 2);
});

test("later read-only reconciliation closes ambiguous operation without republish", async () => {
  const repository = new MemoryOperationLedgerRepository();
  let publishes = 0;
  let live: PublishedReceipt | null = null;
  const provider: AuthorizedPublishProvider = {
    async readDraft() {
      return DRAFT_READ;
    },
    async publish() {
      publishes += 1;
      throw new PublishAmbiguousResultError();
    },
    async readPublished() {
      return live;
    }
  };
  const firstInput = input();
  await executeAuthorizedPublishTransaction(repository, provider, firstInput);
  live = activeReceipt();
  const result = await executeAuthorizedPublishTransaction(repository, provider, {
    ...firstInput,
    now: "2026-09-05T09:02:00.000Z"
  });

  assert.equal(result.status, "RECONCILED");
  assert.equal(publishes, 1);
});

test("successful operation replay returns the same receipt and never publishes twice", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const provider = new Provider();
  const firstInput = input();
  const first = await executeAuthorizedPublishTransaction(repository, provider, firstInput);
  const replay = await executeAuthorizedPublishTransaction(repository, provider, {
    ...firstInput,
    now: "2026-09-05T09:01:00.000Z"
  });

  assert.equal(replay.status, "REPLAY");
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(provider.publishes, 1);
});

test("post-read that is not active or published stays reconciliation-required", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const provider = new Provider();
  provider.postState = "draft";

  const result = await executeAuthorizedPublishTransaction(repository, provider, input());
  assert.equal(result.status, "RECONCILIATION_REQUIRED");
  assert.equal(provider.publishes, 1);
});

test("post-read identity drift cannot be accepted as success", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const provider = new Provider();
  provider.postDrift = true;

  const result = await executeAuthorizedPublishTransaction(repository, provider, input());
  assert.equal(result.status, "RECONCILIATION_REQUIRED");
  assert.equal(provider.publishes, 1);
});

test("same operation with changed transaction identity fails ledger idempotency", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const provider = new Provider();
  const firstInput = input();
  await executeAuthorizedPublishTransaction(repository, provider, firstInput);

  await assert.rejects(
    () =>
      executeAuthorizedPublishTransaction(repository, provider, {
        ...firstInput,
        expectedListingFingerprint: "b".repeat(64)
      }),
    /OPERATION_ID_PAYLOAD_MISMATCH/
  );
  assert.equal(provider.publishes, 1);
});
