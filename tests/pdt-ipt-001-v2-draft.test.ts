import assert from "node:assert/strict";
import test from "node:test";
import {
  exactPdtIpt001V2AuthorizationContract,
  handlePdtIpt001V2Post,
  pdtIpt001V2AuthorizationRequestHash,
  pdtIpt001V2Plan,
  verifyPdtIpt001V2ProtectedState
} from "../lib/pdt-ipt-001-v2-draft";
import {
  assertPdtIpt001V2ManifestFrozen,
  PDT_IPT_001_V2_AUTHORIZATION_TEXT,
  PDT_IPT_001_V2_BUYER_FILES,
  PDT_IPT_001_V2_CANDIDATE_FINGERPRINT,
  PDT_IPT_001_V2_DRAFT,
  PDT_IPT_001_V2_FROZEN_CANDIDATE_FINGERPRINT,
  PDT_IPT_001_V2_FROZEN_LISTING_FINGERPRINT,
  PDT_IPT_001_V2_GALLERY,
  PDT_IPT_001_V2_LISTING_FINGERPRINT,
  PDT_IPT_001_V2_LISTING_IDENTITY
} from "../lib/pdt-ipt-001-v2-manifest";
import { MemoryOperationLedgerRepository } from "../lib/operation-ledger";

const COMMIT = "a".repeat(40);
const TOKEN = "post-reset-v2-token";

async function withEnv<T>(
  fn: () => Promise<T>,
  overrides: Record<string, string | undefined> = {}
) {
  const keys = [
    "ETSY_SHOP_ID",
    "ETSY_POST_RESET_V2_WRITES_ENABLED",
    "ETSY_POST_RESET_V2_WRITE_TOKEN",
    "VERCEL_ENV",
    "VERCEL_GIT_COMMIT_SHA",
    "ETSY_API_KEY",
    "ETSY_SHARED_SECRET"
  ] as const;
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.ETSY_SHOP_ID = "23582741";
  process.env.ETSY_POST_RESET_V2_WRITES_ENABLED = "true";
  process.env.ETSY_POST_RESET_V2_WRITE_TOKEN = TOKEN;
  process.env.VERCEL_ENV = "production";
  process.env.VERCEL_GIT_COMMIT_SHA = COMMIT;
  process.env.ETSY_API_KEY = "test-key";
  process.env.ETSY_SHARED_SECRET = "test-secret";
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const key of keys) {
      const value = before[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function emptySellerStateFetch(methods: string[] = []): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    methods.push(method);
    if (
      url.pathname === "/v3/application/shops/23582741/listings" &&
      method === "GET"
    ) {
      return Response.json({ count: 0, results: [] });
    }
    throw new Error("UNEXPECTED_" + method + "_" + url.pathname);
  };
}

async function protectedFingerprint(fetchImpl: typeof fetch) {
  const response = await verifyPdtIpt001V2ProtectedState({
    fetchImpl,
    getAccessToken: async () => "token"
  });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    protectedStateFingerprint: string;
  };
  return payload.protectedStateFingerprint;
}

function exactFile(asset: (typeof PDT_IPT_001_V2_GALLERY)[number] | (typeof PDT_IPT_001_V2_BUYER_FILES)[number]) {
  return new File(
    [new Uint8Array(asset.sizeBytes)],
    asset.fileName,
    { type: asset.mimeType }
  );
}

function buildExecutionForm(
  protectedStateFingerprint: string,
  options: {
    authorizationText?: string;
    candidateFingerprint?: string;
    listingFingerprint?: string;
    productionCommit?: string;
    deploymentCommit?: string;
    requestHash?: string;
    extraField?: [string, string];
  } = {}
) {
  const productionCommit = options.productionCommit ?? COMMIT;
  const deploymentCommit = options.deploymentCommit ?? COMMIT;
  const form = new FormData();
  form.set(
    "authorizationText",
    options.authorizationText ?? PDT_IPT_001_V2_AUTHORIZATION_TEXT
  );
  form.set(
    "candidateFingerprint",
    options.candidateFingerprint ?? PDT_IPT_001_V2_CANDIDATE_FINGERPRINT
  );
  form.set(
    "listingFingerprint",
    options.listingFingerprint ?? PDT_IPT_001_V2_LISTING_FINGERPRINT
  );
  form.set("protectedStateFingerprint", protectedStateFingerprint);
  form.set("productionCommit", productionCommit);
  form.set("deploymentCommit", deploymentCommit);
  form.set(
    "requestHash",
    options.requestHash ??
      pdtIpt001V2AuthorizationRequestHash(
        protectedStateFingerprint,
        productionCommit,
        deploymentCommit
      )
  );
  for (const asset of PDT_IPT_001_V2_GALLERY) {
    form.set("image" + String(asset.rank).padStart(2, "0"), exactFile(asset));
  }
  for (const asset of PDT_IPT_001_V2_BUYER_FILES) {
    form.set("buyerFile" + String(asset.rank).padStart(2, "0"), exactFile(asset));
  }
  if (options.extraField) form.set(options.extraField[0], options.extraField[1]);
  return form;
}

function executeRequest(form: FormData) {
  return new Request("https://preview.example.test/api/internal/etsy/post-reset-v2/pdt-ipt-001/draft", {
    method: "POST",
    headers: { "x-autodigitalpublisher-write-token": TOKEN },
    body: form
  });
}

function listingRecord(id: number) {
  const listing = PDT_IPT_001_V2_LISTING_IDENTITY;
  return {
    listing_id: id,
    shop_id: PDT_IPT_001_V2_DRAFT.shopId,
    state: "draft",
    title: listing.title,
    description: listing.description,
    price: { amount: 799, divisor: 100, currency_code: "USD" },
    tags: [...listing.tags],
    quantity: listing.quantity,
    who_made: listing.who_made,
    when_made: listing.when_made,
    taxonomy_id: listing.taxonomy_id,
    listing_type: "download"
  };
}

test("V2 candidate manifest is immutable, exact and post-reset only", () => {
  assert.equal(assertPdtIpt001V2ManifestFrozen(), true);
  assert.equal(
    PDT_IPT_001_V2_CANDIDATE_FINGERPRINT,
    PDT_IPT_001_V2_FROZEN_CANDIDATE_FINGERPRINT
  );
  assert.equal(
    PDT_IPT_001_V2_LISTING_FINGERPRINT,
    PDT_IPT_001_V2_FROZEN_LISTING_FINGERPRINT
  );
  assert.equal(PDT_IPT_001_V2_GALLERY.length, 10);
  assert.equal(PDT_IPT_001_V2_BUYER_FILES.length, 2);
  assert.equal(PDT_IPT_001_V2_LISTING_IDENTITY.priceUsd, 7.99);
  assert.equal(PDT_IPT_001_V2_LISTING_IDENTITY.tags.length, 13);
  assert.equal(PDT_IPT_001_V2_DRAFT.publishAuthorized, false);
});

test("PLAN is inert and performs zero Etsy writes", () => {
  const plan = pdtIpt001V2Plan();
  assert.equal(plan.status, "PLAN_ONLY");
  assert.equal(plan.publishAuthorized, false);
  assert.equal(plan.ETSY_WRITE_COUNT, 0);
  assert.equal(plan.imageCount, 10);
  assert.equal(plan.buyerFileCount, 2);
});

test("protected-state verification is authenticated read-only across every seller state", async () => {
  await withEnv(async () => {
    const methods: string[] = [];
    const response = await verifyPdtIpt001V2ProtectedState({
      fetchImpl: emptySellerStateFetch(methods),
      getAccessToken: async () => "token"
    });
    const payload = (await response.json()) as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.equal(payload.status, "PROTECTED_STATE_MATCH");
    assert.equal(payload.total, 0);
    assert.equal(payload.ETSY_WRITE_COUNT, 0);
    assert.equal(methods.length, 5);
    assert.equal(methods.every((method) => method === "GET"), true);
  });
});

test("feature gate defaults fail closed before parsing assets or touching Etsy", async () => {
  await withEnv(
    async () => {
      let calls = 0;
      const response = await handlePdtIpt001V2Post(
        new Request("https://example.test/execute", { method: "POST" }),
        {
          fetchImpl: async () => {
            calls += 1;
            throw new Error("SHOULD_NOT_RUN");
          }
        }
      );
      const payload = (await response.json()) as Record<string, unknown>;
      assert.equal(response.status, 403);
      assert.equal(payload.error, "PDT_IPT_V2_WRITES_DISABLED");
      assert.equal(payload.ETSY_WRITE_COUNT, 0);
      assert.equal(calls, 0);
    },
    { ETSY_POST_RESET_V2_WRITES_ENABLED: undefined }
  );
});

test("preview runtime can never execute a mutation even when feature flag is true", async () => {
  await withEnv(
    async () => {
      let calls = 0;
      const response = await handlePdtIpt001V2Post(
        new Request("https://example.test/execute", { method: "POST" }),
        {
          fetchImpl: async () => {
            calls += 1;
            throw new Error("SHOULD_NOT_RUN");
          }
        }
      );
      const payload = (await response.json()) as Record<string, unknown>;
      assert.equal(response.status, 403);
      assert.equal(payload.error, "PDT_IPT_V2_PRODUCTION_RUNTIME_REQUIRED");
      assert.equal(payload.ETSY_WRITE_COUNT, 0);
      assert.equal(calls, 0);
    },
    { VERCEL_ENV: "preview" }
  );
});

test("stale authorization, stale listing fields and commit drift are rejected before Etsy writes", async () => {
  await withEnv(async () => {
    const protectedState = "b".repeat(64);
    const cases = [
      buildExecutionForm(protectedState, {
        authorizationText: "AUTHORIZE PDT-IPT-001-R04-DRAFT-RECOVERY EXACT SCOPE ONLY"
      }),
      buildExecutionForm(protectedState, {
        extraField: ["listingId", "4578391569"]
      }),
      buildExecutionForm(protectedState, {
        productionCommit: "c".repeat(40),
        deploymentCommit: "c".repeat(40)
      })
    ];
    for (const form of cases) {
      let writes = 0;
      const response = await handlePdtIpt001V2Post(executeRequest(form), {
        fetchImpl: async (_input, init) => {
          if ((init?.method ?? "GET") !== "GET") writes += 1;
          return Response.json({ count: 0, results: [] });
        },
        getAccessToken: async () => "token",
        repository: new MemoryOperationLedgerRepository(),
        verifyAsset: () => true
      });
      assert.notEqual(response.status, 200);
      assert.equal(writes, 0);
      const payload = (await response.json()) as Record<string, unknown>;
      assert.equal(payload.ETSY_WRITE_COUNT, 0);
    }
  });
});

test("wrong asset bytes fail hash validation before any Etsy request", async () => {
  await withEnv(async () => {
    const protectedState = "b".repeat(64);
    const form = buildExecutionForm(protectedState);
    let calls = 0;
    const response = await handlePdtIpt001V2Post(executeRequest(form), {
      fetchImpl: async () => {
        calls += 1;
        return Response.json({ count: 0, results: [] });
      },
      getAccessToken: async () => "token",
      repository: new MemoryOperationLedgerRepository()
    });
    const payload = (await response.json()) as Record<string, unknown>;
    assert.equal(response.status, 400);
    assert.match(String(payload.error), /ASSET_SHA256_MISMATCH/);
    assert.equal(payload.ETSY_WRITE_COUNT, 0);
    assert.equal(calls, 0);
  });
});

test("non-empty seller catalog is rejected before any mutation", async () => {
  await withEnv(async () => {
    const methods: string[] = [];
    const preflightFetch: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const method = (init?.method ?? "GET").toUpperCase();
      methods.push(method);
      if (
        url.pathname === "/v3/application/shops/23582741/listings" &&
        method === "GET"
      ) {
        const state = url.searchParams.get("state");
        if (state === "active") {
          return Response.json({
            count: 1,
            results: [
              {
                listing_id: 999,
                shop_id: 23582741,
                state: "active",
                title: "Existing listing"
              }
            ]
          });
        }
        return Response.json({ count: 0, results: [] });
      }
      if (
        url.pathname === "/v3/application/listings/999/inventory" &&
        method === "GET"
      ) {
        return Response.json({ products: [] });
      }
      throw new Error("UNEXPECTED_" + method + "_" + url.pathname);
    };
    const psv = await verifyPdtIpt001V2ProtectedState({
      fetchImpl: preflightFetch,
      getAccessToken: async () => "token"
    });
    assert.equal(psv.status, 409);
    const psvBody = (await psv.json()) as { protectedStateFingerprint: string };
    const form = buildExecutionForm(psvBody.protectedStateFingerprint);
    let writes = 0;
    const response = await handlePdtIpt001V2Post(executeRequest(form), {
      fetchImpl: async (input, init) => {
        if ((init?.method ?? "GET") !== "GET") writes += 1;
        return preflightFetch(input, init);
      },
      getAccessToken: async () => "token",
      repository: new MemoryOperationLedgerRepository(),
      verifyAsset: () => true
    });
    const payload = (await response.json()) as Record<string, unknown>;
    assert.equal(response.status, 409);
    assert.equal(payload.error, "PDT_IPT_V2_NON_EMPTY_CATALOG_BLOCKED");
    assert.equal(writes, 0);
  });
});

test("request hash binding rejects a changed contract before seller mutation", async () => {
  await withEnv(async () => {
    const protectedState = "b".repeat(64);
    const form = buildExecutionForm(protectedState, {
      requestHash: "c".repeat(64)
    });
    let writes = 0;
    const response = await handlePdtIpt001V2Post(executeRequest(form), {
      fetchImpl: async (_input, init) => {
        if ((init?.method ?? "GET") !== "GET") writes += 1;
        return Response.json({ count: 0, results: [] });
      },
      getAccessToken: async () => "token",
      repository: new MemoryOperationLedgerRepository(),
      verifyAsset: () => true
    });
    const payload = (await response.json()) as Record<string, unknown>;
    assert.equal(response.status, 400);
    assert.equal(payload.error, "PDT_IPT_V2_AUTHORIZATION_REQUEST_HASH_MISMATCH");
    assert.equal(writes, 0);
  });
});

test("exact authorized executor creates one draft, persists 10 images + 2 files, never publishes, and replays at-most-once", async () => {
  await withEnv(async () => {
    const listingId = 9900000001;
    let created = false;
    const images: Record<string, unknown>[] = [];
    const files: Record<string, unknown>[] = [];
    const writeCalls: Array<{ method: string; path: string }> = [];
    let imageId = 8100000000;
    let fileId = 1510000000000;

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const method = (init?.method ?? "GET").toUpperCase();

      if (
        url.pathname === "/v3/application/shops/23582741/listings" &&
        method === "GET"
      ) {
        const state = url.searchParams.get("state");
        if (state === "draft" && created) {
          return Response.json({
            count: 1,
            results: [listingRecord(listingId)]
          });
        }
        return Response.json({ count: 0, results: [] });
      }

      if (
        url.pathname === "/v3/application/shops/23582741/listings" &&
        method === "POST"
      ) {
        writeCalls.push({ method, path: url.pathname });
        assert.equal(created, false);
        created = true;
        return Response.json({ listing_id: listingId }, { status: 201 });
      }

      if (
        url.pathname === "/v3/application/listings/" + String(listingId) &&
        method === "GET"
      ) {
        return Response.json(listingRecord(listingId));
      }

      if (
        url.pathname ===
          "/v3/application/listings/" + String(listingId) + "/images" &&
        method === "GET"
      ) {
        return Response.json({ count: images.length, results: images });
      }

      if (
        url.pathname ===
          "/v3/application/shops/23582741/listings/" +
            String(listingId) +
            "/images" &&
        method === "POST"
      ) {
        writeCalls.push({ method, path: url.pathname });
        assert.ok(init?.body instanceof FormData);
        const form = init.body as FormData;
        const rank = Number(form.get("rank"));
        const expected = PDT_IPT_001_V2_GALLERY[rank - 1];
        assert.equal(String(form.get("alt_text")), expected.altText);
        const row = {
          listing_image_id: ++imageId,
          rank,
          alt_text: expected.altText,
          full_width: 2000,
          full_height: 2000
        };
        images.push(row);
        return Response.json(row, { status: 201 });
      }

      if (
        url.pathname ===
          "/v3/application/shops/23582741/listings/" +
            String(listingId) +
            "/files" &&
        method === "GET"
      ) {
        return Response.json({ count: files.length, results: files });
      }

      if (
        url.pathname ===
          "/v3/application/shops/23582741/listings/" +
            String(listingId) +
            "/files" &&
        method === "POST"
      ) {
        writeCalls.push({ method, path: url.pathname });
        assert.ok(init?.body instanceof FormData);
        const form = init.body as FormData;
        const rank = Number(form.get("rank"));
        const expected = PDT_IPT_001_V2_BUYER_FILES[rank - 1];
        const row = {
          listing_file_id: ++fileId,
          rank,
          filename: String(form.get("name")),
          size_bytes: expected.sizeBytes
        };
        files.push(row);
        return Response.json(row, { status: 201 });
      }

      throw new Error("UNEXPECTED_" + method + "_" + url.pathname);
    };

    const psvResponse = await verifyPdtIpt001V2ProtectedState({
      fetchImpl,
      getAccessToken: async () => "token"
    });
    const psv = (await psvResponse.json()) as {
      protectedStateFingerprint: string;
    };
    const repository = new MemoryOperationLedgerRepository();
    const runtime = {
      fetchImpl,
      getAccessToken: async () => "token",
      repository,
      verifyAsset: () => true,
      now: () => "2026-09-20T09:00:00.000Z"
    };

    const first = await handlePdtIpt001V2Post(
      executeRequest(buildExecutionForm(psv.protectedStateFingerprint)),
      runtime
    );
    const firstPayload = (await first.json()) as Record<string, unknown>;
    assert.equal(first.status, 200);
    assert.equal(firstPayload.status, "DRAFT_CREATED_AND_PERSISTENCE_VERIFIED");
    assert.equal(firstPayload.draftListingId, listingId);
    assert.equal(firstPayload.publishPerformed, false);
    assert.equal(firstPayload.ETSY_WRITE_COUNT, 13);
    assert.equal(images.length, 10);
    assert.equal(files.length, 2);
    assert.equal(writeCalls.length, 13);
    assert.equal(writeCalls.some((call) => call.method === "PATCH"), false);
    assert.equal(writeCalls.some((call) => call.method === "PUT"), false);
    assert.equal(writeCalls.some((call) => call.method === "DELETE"), false);
    assert.equal(
      writeCalls.some((call) => call.path.includes("active")),
      false
    );

    const writesBeforeReplay = writeCalls.length;
    const replay = await handlePdtIpt001V2Post(
      executeRequest(buildExecutionForm(psv.protectedStateFingerprint)),
      runtime
    );
    const replayPayload = (await replay.json()) as Record<string, unknown>;
    assert.equal(replay.status, 200);
    assert.equal(replayPayload.status, "REPLAY");
    assert.equal(replayPayload.ETSY_WRITE_COUNT, 0);
    assert.equal(writeCalls.length, writesBeforeReplay);
  });
});

test("ambiguous provider create result becomes RECONCILIATION_REQUIRED and is never blind-retried", async () => {
  await withEnv(async () => {
    let createAttempts = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const method = (init?.method ?? "GET").toUpperCase();
      if (
        url.pathname === "/v3/application/shops/23582741/listings" &&
        method === "GET"
      ) {
        return Response.json({ count: 0, results: [] });
      }
      if (
        url.pathname === "/v3/application/shops/23582741/listings" &&
        method === "POST"
      ) {
        createAttempts += 1;
        return Response.json({ error: "provider unavailable" }, { status: 503 });
      }
      throw new Error("UNEXPECTED_" + method + "_" + url.pathname);
    };
    const psvResponse = await verifyPdtIpt001V2ProtectedState({
      fetchImpl,
      getAccessToken: async () => "token"
    });
    const psv = (await psvResponse.json()) as {
      protectedStateFingerprint: string;
    };
    const repository = new MemoryOperationLedgerRepository();
    const runtime = {
      fetchImpl,
      getAccessToken: async () => "token",
      repository,
      verifyAsset: () => true,
      now: () => "2026-09-20T09:10:00.000Z"
    };
    const response = await handlePdtIpt001V2Post(
      executeRequest(buildExecutionForm(psv.protectedStateFingerprint)),
      runtime
    );
    const payload = (await response.json()) as Record<string, unknown>;
    assert.equal(response.status, 202);
    assert.equal(payload.status, "RECONCILIATION_REQUIRED");
    assert.equal(payload.ETSY_WRITE_COUNT, 1);
    assert.equal(createAttempts, 1);

    const second = await handlePdtIpt001V2Post(
      executeRequest(buildExecutionForm(psv.protectedStateFingerprint)),
      runtime
    );
    const secondPayload = (await second.json()) as Record<string, unknown>;
    assert.notEqual(second.status, 200);
    assert.equal(createAttempts, 1);
    assert.equal(secondPayload.ETSY_WRITE_COUNT, 0);
  });
});

test("authorization contract contains no publish permission and binds exact assets + commits", () => {
  const protectedState = "b".repeat(64);
  const contract = exactPdtIpt001V2AuthorizationContract(
    protectedState,
    COMMIT,
    COMMIT
  );
  assert.equal(contract.publishAuthorized, false);
  assert.equal(contract.gallery.length, 10);
  assert.equal(contract.buyerFiles.length, 2);
  assert.equal(contract.productionCommit, COMMIT);
  assert.equal(contract.deploymentCommit, COMMIT);
  assert.equal(contract.authorizationText, PDT_IPT_001_V2_AUTHORIZATION_TEXT);
});


test("seller-state POST is protected by the new V2 token even though it is read-only", async () => {
  await withEnv(
    async () => {
      let calls = 0;
      const request = new Request("https://example.test/internal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "verify_protected_state" })
      });
      const response = await handlePdtIpt001V2Post(request, {
        fetchImpl: async () => {
          calls += 1;
          throw new Error("SHOULD_NOT_RUN");
        },
        getAccessToken: async () => "token"
      });
      const payload = (await response.json()) as Record<string, unknown>;
      assert.equal(response.status, 503);
      assert.equal(payload.error, "PDT_IPT_V2_WRITE_TOKEN_NOT_CONFIGURED");
      assert.equal(payload.ETSY_WRITE_COUNT, 0);
      assert.equal(calls, 0);
    },
    { ETSY_POST_RESET_V2_WRITE_TOKEN: undefined }
  );
});

test("image count/order and buyer-file count drift fail before Etsy access", async () => {
  await withEnv(async () => {
    const protectedState = "b".repeat(64);
    const variants: FormData[] = [];

    const missingImage = buildExecutionForm(protectedState);
    missingImage.delete("image10");
    variants.push(missingImage);

    const wrongOrder = buildExecutionForm(protectedState);
    wrongOrder.set("image01", exactFile(PDT_IPT_001_V2_GALLERY[1]));
    variants.push(wrongOrder);

    const missingBuyerFile = buildExecutionForm(protectedState);
    missingBuyerFile.delete("buyerFile02");
    variants.push(missingBuyerFile);

    for (const form of variants) {
      let calls = 0;
      const response = await handlePdtIpt001V2Post(executeRequest(form), {
        fetchImpl: async () => {
          calls += 1;
          throw new Error("SHOULD_NOT_RUN");
        },
        getAccessToken: async () => "token",
        repository: new MemoryOperationLedgerRepository(),
        verifyAsset: () => true
      });
      const payload = (await response.json()) as Record<string, unknown>;
      assert.equal(response.status, 400);
      assert.match(
        String(payload.error),
        /(MISSING_ASSET|ASSET_FILENAME_MISMATCH)/
      );
      assert.equal(payload.ETSY_WRITE_COUNT, 0);
      assert.equal(calls, 0);
    }
  });
});

test("created-draft metadata mismatch becomes reconciliation-required instead of continuing to assets", async () => {
  await withEnv(async () => {
    const listingId = 9900000999;
    let created = false;
    let createAttempts = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const method = (init?.method ?? "GET").toUpperCase();
      if (
        url.pathname === "/v3/application/shops/23582741/listings" &&
        method === "GET"
      ) {
        const state = url.searchParams.get("state");
        if (state === "draft" && created) {
          return Response.json({
            count: 1,
            results: [{ ...listingRecord(listingId), title: "WRONG TITLE" }]
          });
        }
        return Response.json({ count: 0, results: [] });
      }
      if (
        url.pathname === "/v3/application/shops/23582741/listings" &&
        method === "POST"
      ) {
        createAttempts += 1;
        created = true;
        return Response.json({ listing_id: listingId }, { status: 201 });
      }
      if (
        url.pathname === "/v3/application/listings/" + String(listingId) &&
        method === "GET"
      ) {
        return Response.json({ ...listingRecord(listingId), title: "WRONG TITLE" });
      }
      throw new Error("UNEXPECTED_" + method + "_" + url.pathname);
    };

    const psvResponse = await verifyPdtIpt001V2ProtectedState({
      fetchImpl,
      getAccessToken: async () => "token"
    });
    const psv = (await psvResponse.json()) as {
      protectedStateFingerprint: string;
    };

    const response = await handlePdtIpt001V2Post(
      executeRequest(buildExecutionForm(psv.protectedStateFingerprint)),
      {
        fetchImpl,
        getAccessToken: async () => "token",
        repository: new MemoryOperationLedgerRepository(),
        verifyAsset: () => true,
        now: () => "2026-09-20T09:20:00.000Z"
      }
    );
    const payload = (await response.json()) as Record<string, unknown>;
    assert.equal(response.status, 202);
    assert.equal(payload.status, "RECONCILIATION_REQUIRED");
    assert.equal(payload.ETSY_WRITE_COUNT, 1);
    assert.equal(createAttempts, 1);
  });
});


test("Gate14 production marker does not bypass token authentication", async () => {
  await withEnv(
    async () => {
      let calls = 0;
      const response = await handlePdtIpt001V2Post(
        new Request("https://example.test/execute", {
          method: "POST",
          headers: { "x-autodigitalpublisher-write-token": "wrong-gate14-token" }
        }),
        {
          fetchImpl: async () => {
            calls += 1;
            throw new Error("SHOULD_NOT_RUN");
          }
        }
      );
      const payload = (await response.json()) as Record<string, unknown>;
      assert.equal(response.status, 401);
      assert.equal(payload.error, "PDT_IPT_V2_WRITE_UNAUTHORIZED");
      assert.equal(payload.ETSY_WRITE_COUNT, 0);
      assert.equal(calls, 0);
    },
    {
      ETSY_POST_RESET_V2_WRITES_ENABLED: undefined,
      ETSY_POST_RESET_V2_WRITE_TOKEN: undefined,
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_MESSAGE: "[GATE14_EXECUTE] exact one-time draft"
    }
  );
});
