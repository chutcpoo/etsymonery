import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  handlePdtFcmp002V1PublishR01Post,
  pdtFcmp002V1PublishR01Plan,
  PDT_FCMP_002_V1_PUBLISH_R01_AUTHORIZATION_TEXT,
  PDT_FCMP_002_V1_PUBLISH_R01_OPERATION_ID
} from "../lib/pdt-fcmp-002-v1-publish-r01";
import {
  PDT_FCMP_002_V1_LISTING_FINGERPRINT,
  PDT_FCMP_002_V1_LISTING_IDENTITY
} from "../lib/pdt-fcmp-002-v1-manifest";
import {
  PDT_FCMP_002_V1_DRAFT_LISTING_ID,
  PDT_FCMP_002_V1_EXPECTED_GALLERY_IMAGE_IDS,
  PDT_FCMP_002_V1_LIVE_LISTING_ID,
  PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
  PDT_FCMP_002_V1_RECOVERY_FILE
} from "../lib/pdt-fcmp-002-v1-recovery-manifest";
import {
  PDT_IPT_001_V2_LISTING_IDENTITY
} from "../lib/pdt-ipt-001-v2-manifest";
import { MemoryOperationLedgerRepository } from "../lib/operation-ledger";
import { middleware } from "../middleware";

const SHOP_ID = 23582741;
const WRITE_TOKEN = "publish-r01-test-secret";
const NOW = "2026-09-21T01:00:00.000Z";

type MockOptions = {
  targetState?: "draft" | "active";
  targetTitle?: string;
  protectedTitle?: string;
  ambiguousPatch?: boolean;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function listing(
  listingId: number,
  identity:
    | typeof PDT_FCMP_002_V1_LISTING_IDENTITY
    | typeof PDT_IPT_001_V2_LISTING_IDENTITY,
  state: "draft" | "active",
  title: string = identity.title
) {
  return {
    listing_id: listingId,
    shop_id: SHOP_ID,
    title,
    description: identity.description,
    price: {
      amount: Math.round(identity.priceUsd * 100),
      divisor: 100,
      currency_code: "USD"
    },
    tags: [...identity.tags],
    quantity: identity.quantity,
    who_made: identity.who_made,
    when_made: identity.when_made,
    taxonomy_id: identity.taxonomy_id,
    listing_type: identity.type,
    state
  };
}

function mockEtsy(options: MockOptions = {}) {
  let targetState = options.targetState ?? "draft";
  let patchCalls = 0;
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body instanceof URLSearchParams ? init.body.toString() : undefined;
    calls.push({ url: url.toString(), method, ...(body ? { body } : {}) });

    if (
      method === "PATCH" &&
      url.pathname ===
        `/v3/application/shops/${SHOP_ID}/listings/${PDT_FCMP_002_V1_DRAFT_LISTING_ID}`
    ) {
      patchCalls += 1;
      assert.equal(body, "state=active");
      targetState = "active";
      if (options.ambiguousPatch) throw new Error("transport reset after send");
      return jsonResponse({
        listing_id: PDT_FCMP_002_V1_DRAFT_LISTING_ID,
        state: "active"
      });
    }

    if (
      method === "GET" &&
      url.pathname ===
        `/v3/application/listings/${PDT_FCMP_002_V1_DRAFT_LISTING_ID}`
    ) {
      return jsonResponse(
        listing(
          PDT_FCMP_002_V1_DRAFT_LISTING_ID,
          PDT_FCMP_002_V1_LISTING_IDENTITY,
          targetState,
          options.targetTitle
        )
      );
    }

    if (
      method === "GET" &&
      url.pathname ===
        `/v3/application/listings/${PDT_FCMP_002_V1_LIVE_LISTING_ID}`
    ) {
      return jsonResponse(
        listing(
          PDT_FCMP_002_V1_LIVE_LISTING_ID,
          PDT_IPT_001_V2_LISTING_IDENTITY,
          "active",
          options.protectedTitle
        )
      );
    }

    if (
      method === "GET" &&
      url.pathname ===
        `/v3/application/listings/${PDT_FCMP_002_V1_DRAFT_LISTING_ID}/images`
    ) {
      return jsonResponse({
        results: PDT_FCMP_002_V1_EXPECTED_GALLERY_IMAGE_IDS.map(
          (listingImageId, index) => ({
            listing_image_id: listingImageId,
            rank: index + 1
          })
        )
      });
    }

    if (
      method === "GET" &&
      url.pathname ===
        `/v3/application/shops/${SHOP_ID}/listings/${PDT_FCMP_002_V1_DRAFT_LISTING_ID}/files`
    ) {
      return jsonResponse({
        results: [
          {
            listing_file_id: 700000001,
            rank: 1,
            filename: PDT_FCMP_002_V1_RECOVERY_FILE.fileName,
            size_bytes: PDT_FCMP_002_V1_RECOVERY_FILE.sizeBytes
          }
        ]
      });
    }

    if (
      method === "GET" &&
      url.pathname === `/v3/application/shops/${SHOP_ID}/listings`
    ) {
      const requestedState = url.searchParams.get("state");
      const protectedSummary = {
        listing_id: PDT_FCMP_002_V1_LIVE_LISTING_ID,
        shop_id: SHOP_ID,
        state: "active",
        title: options.protectedTitle ?? PDT_IPT_001_V2_LISTING_IDENTITY.title
      };
      const targetSummary = {
        listing_id: PDT_FCMP_002_V1_DRAFT_LISTING_ID,
        shop_id: SHOP_ID,
        state: targetState,
        title: options.targetTitle ?? PDT_FCMP_002_V1_LISTING_IDENTITY.title
      };
      const results =
        requestedState === "active"
          ? targetState === "active"
            ? [protectedSummary, targetSummary]
            : [protectedSummary]
          : requestedState === "draft" && targetState === "draft"
            ? [targetSummary]
            : [];
      return jsonResponse({ count: results.length, results });
    }

    if (method === "GET" && url.pathname.endsWith("/inventory")) {
      return jsonResponse({ products: [] });
    }

    throw new Error(`UNEXPECTED_ETSY_CALL:${method}:${url.toString()}`);
  };

  return {
    fetchImpl,
    calls,
    patchCalls: () => patchCalls,
    targetState: () => targetState
  };
}

function exactBody(overrides: Record<string, unknown> = {}) {
  return {
    authorizationText: PDT_FCMP_002_V1_PUBLISH_R01_AUTHORIZATION_TEXT,
    operationId: PDT_FCMP_002_V1_PUBLISH_R01_OPERATION_ID,
    productId: "PDT-FCMP-002",
    shopId: SHOP_ID,
    draftListingId: PDT_FCMP_002_V1_DRAFT_LISTING_ID,
    candidateFingerprint: PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
    listingFingerprint: PDT_FCMP_002_V1_LISTING_FINGERPRINT,
    ...overrides
  };
}

function request(body = exactBody()) {
  return new Request("https://example.test/publish-r01", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-autodigitalpublisher-write-token": WRITE_TOKEN
    },
    body: JSON.stringify(body)
  });
}

async function withPublishEnv<T>(fn: () => Promise<T>) {
  const previous = {
    enabled: process.env.ETSY_PDT_FCMP_002_PUBLISH_R01_ENABLED,
    token: process.env.ETSY_PDT_FCMP_002_PUBLISH_R01_WRITE_TOKEN,
    vercelEnv: process.env.VERCEL_ENV,
    shopId: process.env.ETSY_SHOP_ID,
    apiKey: process.env.ETSY_API_KEY,
    sharedSecret: process.env.ETSY_SHARED_SECRET
  };
  process.env.ETSY_PDT_FCMP_002_PUBLISH_R01_ENABLED = "true";
  process.env.ETSY_PDT_FCMP_002_PUBLISH_R01_WRITE_TOKEN = WRITE_TOKEN;
  process.env.VERCEL_ENV = "production";
  process.env.ETSY_SHOP_ID = String(SHOP_ID);
  process.env.ETSY_API_KEY = "test-key";
  process.env.ETSY_SHARED_SECRET = "test-secret";
  try {
    return await fn();
  } finally {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore("ETSY_PDT_FCMP_002_PUBLISH_R01_ENABLED", previous.enabled);
    restore("ETSY_PDT_FCMP_002_PUBLISH_R01_WRITE_TOKEN", previous.token);
    restore("VERCEL_ENV", previous.vercelEnv);
    restore("ETSY_SHOP_ID", previous.shopId);
    restore("ETSY_API_KEY", previous.apiKey);
    restore("ETSY_SHARED_SECRET", previous.sharedSecret);
  }
}

async function execute(
  mock: ReturnType<typeof mockEtsy>,
  repository = new MemoryOperationLedgerRepository(),
  body = exactBody()
) {
  return withPublishEnv(async () => {
    const response = await handlePdtFcmp002V1PublishR01Post(request(body), {
      fetchImpl: mock.fetchImpl,
      getAccessToken: async () => "12345.test-token",
      repository,
      now: () => NOW
    });
    return {
      response,
      payload: (await response.json()) as Record<string, unknown>
    };
  });
}

test("plan exposes one exact PATCH and performs no Etsy write", () => {
  const plan = pdtFcmp002V1PublishR01Plan();
  assert.equal(plan.operationId, "PDT-FCMP-002-V1-ETSY-PUBLISH-R01");
  assert.equal(plan.shopId, SHOP_ID);
  assert.equal(plan.draftListingId, 4579068925);
  assert.deepEqual(plan.mutation, {
    method: "PATCH",
    listingId: 4579068925,
    body: { state: "active" }
  });
  assert.equal(plan.productionMutationExecuted, false);
  assert.equal(plan.ETSY_WRITE_COUNT, 0);
});

test("middleware allows only publish R01 while adjacent internal publish paths stay reset", async () => {
  const exact = middleware(
    new NextRequest(
      "https://example.test/api/internal/etsy/post-reset-v2/pdt-fcmp-002/publish-r01",
      { method: "POST" }
    )
  );
  assert.equal(exact.headers.get("x-middleware-next"), "1");

  const adjacent = middleware(
    new NextRequest(
      "https://example.test/api/internal/etsy/post-reset-v2/pdt-fcmp-002/publish-r02",
      { method: "POST" }
    )
  );
  assert.equal(adjacent.status, 410);
  assert.equal((await adjacent.json()).ETSY_WRITE_COUNT, 0);
});

test("exact happy path performs one state-only PATCH after all read-only checks", async () => {
  const mock = mockEtsy();
  const { response, payload } = await execute(mock);

  assert.equal(response.status, 200);
  assert.equal(payload.status, "PUBLISHED");
  assert.equal(payload.ETSY_WRITE_COUNT, 1);
  assert.equal(mock.patchCalls(), 1);
  assert.equal(mock.targetState(), "active");
  const patchIndex = mock.calls.findIndex((call) => call.method === "PATCH");
  assert.ok(patchIndex > 0);
  assert.ok(mock.calls.slice(0, patchIndex).every((call) => call.method === "GET"));
  assert.ok(mock.calls.slice(patchIndex + 1).some((call) => call.method === "GET"));
  assert.deepEqual(
    mock.calls.filter((call) => call.method === "PATCH").map((call) => call.body),
    ["state=active"]
  );
});

test("wrong listing ID is rejected by the exact contract before Etsy access", async () => {
  const mock = mockEtsy();
  const { response, payload } = await execute(
    mock,
    new MemoryOperationLedgerRepository(),
    exactBody({ draftListingId: 4579068926 })
  );
  assert.equal(response.status, 409);
  assert.equal(
    payload.error,
    "PDT_FCMP_002_PUBLISH_R01_EXACT_AUTHORIZATION_MISMATCH"
  );
  assert.equal(payload.ETSY_WRITE_COUNT, 0);
  assert.equal(mock.calls.length, 0);
});

test("target fingerprint drift stops before authorization consumption and mutation", async () => {
  const mock = mockEtsy({ targetTitle: "Drifted title" });
  const { response, payload } = await execute(mock);
  assert.equal(response.status, 409);
  assert.equal(payload.error, "PDT_FCMP_002_PUBLISH_R01_LISTING_FINGERPRINT_DRIFT");
  assert.equal(payload.ETSY_WRITE_COUNT, 0);
  assert.equal(mock.patchCalls(), 0);
});

test("already-active target fails closed and performs no mutation", async () => {
  const mock = mockEtsy({ targetState: "active" });
  const { response, payload } = await execute(mock);
  assert.equal(response.status, 409);
  assert.equal(
    payload.error,
    "PDT_FCMP_002_PUBLISH_R01_ALREADY_ACTIVE_OR_NOT_DRAFT"
  );
  assert.equal(payload.ETSY_WRITE_COUNT, 0);
  assert.equal(mock.patchCalls(), 0);
});

test("authorization mismatch stops before Etsy access", async () => {
  const mock = mockEtsy();
  const { response, payload } = await execute(
    mock,
    new MemoryOperationLedgerRepository(),
    exactBody({ authorizationText: "AUTHORIZE SOMETHING ELSE" })
  );
  assert.equal(response.status, 409);
  assert.equal(
    payload.error,
    "PDT_FCMP_002_PUBLISH_R01_EXACT_AUTHORIZATION_MISMATCH"
  );
  assert.equal(payload.ETSY_WRITE_COUNT, 0);
  assert.equal(mock.calls.length, 0);
});

test("authorization replay returns the ledger receipt with no second write", async () => {
  const repository = new MemoryOperationLedgerRepository();
  const mock = mockEtsy();
  const first = await execute(mock, repository);
  const callsAfterFirst = mock.calls.length;
  const second = await execute(mock, repository);

  assert.equal(first.payload.status, "PUBLISHED");
  assert.equal(second.response.status, 200);
  assert.equal(second.payload.status, "REPLAY");
  assert.equal(second.payload.ETSY_WRITE_COUNT, 0);
  assert.equal(mock.patchCalls(), 1);
  assert.equal(mock.calls.length, callsAfterFirst);
});

test("ambiguous PATCH performs read-only reconciliation and never retries the write", async () => {
  const mock = mockEtsy({ ambiguousPatch: true });
  const { response, payload } = await execute(mock);

  assert.equal(response.status, 200);
  assert.equal(payload.status, "RECONCILED");
  assert.equal(payload.ETSY_WRITE_COUNT, 1);
  assert.equal(mock.patchCalls(), 1);
  const patchIndex = mock.calls.findIndex((call) => call.method === "PATCH");
  assert.ok(mock.calls.slice(patchIndex + 1).every((call) => call.method === "GET"));
});

test("unrelated Product #1 drift blocks the operation before mutation", async () => {
  const mock = mockEtsy({ protectedTitle: "Unrelated listing was changed" });
  const { response, payload } = await execute(mock);

  assert.equal(response.status, 409);
  assert.equal(payload.error, "PDT_FCMP_002_PUBLISH_R01_UNRELATED_LISTING_DRIFT");
  assert.equal(payload.ETSY_WRITE_COUNT, 0);
  assert.equal(mock.patchCalls(), 0);
});
