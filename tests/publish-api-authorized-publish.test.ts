import assert from "node:assert/strict";
import test from "node:test";
import { handleAuthorizedPublishOperation } from "../lib/authorized-publish-api";
import type {
  AuthorizedPublishProvider,
  PublishedReceipt
} from "../lib/authorized-publish-transaction";
import { createListingFingerprint } from "../lib/candidate-fingerprint";
import { MemoryOperationLedgerRepository } from "../lib/operation-ledger";
import { createPublishAuthorization } from "../lib/publish-authorization";

const SHOP_ID = "23582741";
const DRAFT_ID = "900000001";
const CANDIDATE_FP = "a".repeat(64);
const NOW = "2026-09-05T09:00:00.000Z";
const DRAFT_READ = {
  title: "Proof Planner",
  description: "Proof description",
  price: 9.99,
  tags: ["proof", "planner"],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2025",
  taxonomy_id: 1234,
  type: "download",
  state: "draft"
};
const LISTING_FP = createListingFingerprint({
  title: "Proof Planner",
  description: "Proof description",
  priceUsd: 9.99,
  tags: ["proof", "planner"],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2025",
  taxonomy_id: 1234,
  type: "download",
  state: "draft"
});

function authorization() {
  return createPublishAuthorization({
    authorizationId: "AUTH-PROOF",
    candidateId: "CAND-PROOF",
    candidateFingerprint: CANDIDATE_FP,
    channel: "etsy",
    shopId: SHOP_ID,
    draftListingId: DRAFT_ID,
    issuedAt: "2026-09-05T08:59:00.000Z"
  });
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    operation: "AUTHORIZED_PUBLISH",
    operationId: "OP-PROOF",
    authorization: authorization(),
    candidateId: "CAND-PROOF",
    candidateFingerprint: CANDIDATE_FP,
    expectedListingFingerprint: LISTING_FP,
    shopId: SHOP_ID,
    draftListingId: DRAFT_ID,
    channel: "etsy",
    ...overrides
  };
}

function request(token?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("x-autodigitalpublisher-write-token", token);
  return new Request("https://example.test/api/publish", { method: "POST", headers });
}

class Provider implements AuthorizedPublishProvider {
  publishes = 0;

  async readDraft() {
    return DRAFT_READ;
  }

  async publish() {
    this.publishes += 1;
    return { listingId: DRAFT_ID, state: "active" };
  }

  async readPublished(): Promise<PublishedReceipt> {
    return {
      listingId: DRAFT_ID,
      state: "active",
      observation: { ...DRAFT_READ, state: "active" }
    };
  }
}

async function withRuntimeEnv<T>(
  values: { writes?: string; token?: string; shop?: string },
  fn: () => Promise<T>
) {
  const previous = {
    writes: process.env.PUBLISH_WRITES_ENABLED,
    token: process.env.ETSY_DRAFT_WRITE_TOKEN,
    shop: process.env.ETSY_SHOP_ID
  };
  const assign = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  assign("PUBLISH_WRITES_ENABLED", values.writes);
  assign("ETSY_DRAFT_WRITE_TOKEN", values.token);
  assign("ETSY_SHOP_ID", values.shop);
  try {
    return await fn();
  } finally {
    assign("PUBLISH_WRITES_ENABLED", previous.writes);
    assign("ETSY_DRAFT_WRITE_TOKEN", previous.token);
    assign("ETSY_SHOP_ID", previous.shop);
  }
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

test("missing production write flag performs no Etsy publish", async () => {
  const provider = new Provider();
  const response = await withRuntimeEnv(
    { token: "secret", shop: SHOP_ID },
    () =>
      handleAuthorizedPublishOperation(body(), request("secret"), {
        repository: new MemoryOperationLedgerRepository(),
        provider,
        now: () => NOW
      })
  );
  assert.equal(response.status, 403);
  assert.equal((await json(response)).error, "ETSY_PUBLISH_WRITES_DISABLED");
  assert.equal(provider.publishes, 0);
});

test("missing secure write token performs no publish", async () => {
  const provider = new Provider();
  const response = await withRuntimeEnv(
    { writes: "true", shop: SHOP_ID },
    () =>
      handleAuthorizedPublishOperation(body(), request(), {
        repository: new MemoryOperationLedgerRepository(),
        provider,
        now: () => NOW
      })
  );
  assert.equal(response.status, 503);
  assert.equal((await json(response)).error, "ETSY_PUBLISH_WRITE_AUTH_NOT_CONFIGURED");
  assert.equal(provider.publishes, 0);
});

test("invalid secure write token performs no publish", async () => {
  const provider = new Provider();
  const response = await withRuntimeEnv(
    { writes: "true", token: "secret", shop: SHOP_ID },
    () =>
      handleAuthorizedPublishOperation(body(), request("wrong"), {
        repository: new MemoryOperationLedgerRepository(),
        provider,
        now: () => NOW
      })
  );
  assert.equal(response.status, 401);
  assert.equal((await json(response)).error, "ETSY_PUBLISH_WRITE_UNAUTHORIZED");
  assert.equal(provider.publishes, 0);
});

test("runtime shop mismatch fails closed before provider publish", async () => {
  const provider = new Provider();
  const response = await withRuntimeEnv(
    { writes: "true", token: "secret", shop: SHOP_ID },
    () =>
      handleAuthorizedPublishOperation(
        body({ shopId: "99999999" }),
        request("secret"),
        {
          repository: new MemoryOperationLedgerRepository(),
          provider,
          now: () => NOW
        }
      )
  );
  assert.equal(response.status, 409);
  assert.equal((await json(response)).error, "ETSY_PUBLISH_SHOP_MISMATCH");
  assert.equal(provider.publishes, 0);
});

test("exact protected request executes the existing authorized transaction once", async () => {
  const provider = new Provider();
  const repository = new MemoryOperationLedgerRepository();
  const response = await withRuntimeEnv(
    { writes: "true", token: "secret", shop: SHOP_ID },
    () =>
      handleAuthorizedPublishOperation(body(), request("secret"), {
        repository,
        provider,
        now: () => NOW
      })
  );
  const result = await json(response);
  assert.equal(response.status, 200);
  assert.equal(result.status, "PUBLISHED");
  assert.equal(provider.publishes, 1);
  assert.equal(
    (result.authorization as { authorization: { state: string } }).authorization.state,
    "CONSUMED"
  );
});

test("successful protected request replay returns prior receipt with zero extra publish calls", async () => {
  const provider = new Provider();
  const repository = new MemoryOperationLedgerRepository();
  const first = await withRuntimeEnv(
    { writes: "true", token: "secret", shop: SHOP_ID },
    () =>
      handleAuthorizedPublishOperation(body(), request("secret"), {
        repository,
        provider,
        now: () => NOW
      })
  );
  const replay = await withRuntimeEnv(
    { writes: "true", token: "secret", shop: SHOP_ID },
    () =>
      handleAuthorizedPublishOperation(body(), request("secret"), {
        repository,
        provider,
        now: () => "2026-09-05T09:01:00.000Z"
      })
  );
  const firstJson = await json(first);
  const replayJson = await json(replay);
  assert.equal(replay.status, 200);
  assert.equal(replayJson.status, "REPLAY");
  assert.deepEqual(replayJson.receipt, firstJson.receipt);
  assert.equal(provider.publishes, 1);
});
