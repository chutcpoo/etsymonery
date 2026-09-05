import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { after, before } from "node:test";
import { createListingFingerprint } from "../lib/candidate-fingerprint";
import { MemoryOperationLedgerRepository } from "../lib/operation-ledger";
import { createDraftAssetsPostHandler } from "../lib/etsy-draft-assets-api";

const SHOP_ID = 23582741;
const LISTING_ID = 4569445414;
const CANDIDATE_ID = "ETSY-CANDIDATE-PDT-PCSO-001-V1-EXCEL-FIX-2026-09-05-A";
const CANDIDATE_FINGERPRINT = "deeb056afecfc0b848e21c1a2092fb5ba8fc523cc3b24206a8874808bac09fe2";
const ASSET_BYTES = Buffer.from("offline Etsy draft asset fixture", "utf8");
const ASSET_SHA256 = createHash("sha256").update(ASSET_BYTES).digest("hex");
const LISTING = {
  listing_id: LISTING_ID,
  title: "Frozen Planner",
  description: "Frozen production candidate",
  price: { amount: 1200, divisor: 100, currency_code: "USD" },
  tags: ["planner", "operations"],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2026",
  taxonomy_id: 1234,
  type: "download",
  state: "draft"
};
const LISTING_FINGERPRINT = createListingFingerprint({
  title: LISTING.title,
  description: LISTING.description,
  priceUsd: 12,
  tags: LISTING.tags,
  quantity: LISTING.quantity,
  who_made: LISTING.who_made,
  when_made: LISTING.when_made,
  taxonomy_id: LISTING.taxonomy_id,
  type: LISTING.type,
  state: LISTING.state
});

const previousEnv = {
  draftWrites: process.env.ETSY_DRAFT_WRITES_ENABLED,
  draftToken: process.env.ETSY_DRAFT_WRITE_TOKEN,
  shopId: process.env.ETSY_SHOP_ID,
  apiKey: process.env.ETSY_API_KEY,
  sharedSecret: process.env.ETSY_SHARED_SECRET
};

function assignEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

before(() => {
  process.env.ETSY_DRAFT_WRITES_ENABLED = "true";
  process.env.ETSY_DRAFT_WRITE_TOKEN = "draft-secret";
  process.env.ETSY_SHOP_ID = String(SHOP_ID);
  process.env.ETSY_API_KEY = "api-key";
  process.env.ETSY_SHARED_SECRET = "shared-secret";
});

after(() => {
  assignEnv("ETSY_DRAFT_WRITES_ENABLED", previousEnv.draftWrites);
  assignEnv("ETSY_DRAFT_WRITE_TOKEN", previousEnv.draftToken);
  assignEnv("ETSY_SHOP_ID", previousEnv.shopId);
  assignEnv("ETSY_API_KEY", previousEnv.apiKey);
  assignEnv("ETSY_SHARED_SECRET", previousEnv.sharedSecret);
});

type FormOverrides = Partial<{
  operationId: string;
  kind: "UPLOAD_IMAGE" | "UPLOAD_FILE";
  candidateId: string;
  candidateFingerprint: string;
  expectedListingFingerprint: string;
  shopId: string;
  draftListingId: string;
  assetSha256: string;
  assetName: string;
  rank: string;
}>;

function request(overrides: FormOverrides = {}, token = "draft-secret") {
  const fields = {
    operationId: "OP-ASSET-1",
    kind: "UPLOAD_IMAGE" as const,
    candidateId: CANDIDATE_ID,
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    expectedListingFingerprint: LISTING_FINGERPRINT,
    shopId: String(SHOP_ID),
    draftListingId: String(LISTING_ID),
    assetSha256: ASSET_SHA256,
    assetName: "gallery-01.png",
    rank: "1",
    ...overrides
  };
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append("asset", new Blob([ASSET_BYTES], { type: "application/octet-stream" }), fields.assetName);
  return new Request("https://example.test/api/etsy/draft-assets", {
    method: "POST",
    headers: { "x-autodigitalpublisher-write-token": token },
    body: form
  });
}

type Call = { url: string; init?: RequestInit };

function etsyBackend(listing: Record<string, unknown> = LISTING) {
  const calls: Call[] = [];
  const images: Record<string, unknown>[] = [];
  const files: Record<string, unknown>[] = [];
  let nextImageId = 71001;
  let nextFileId = 81001;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (init?.method === "GET" && url.endsWith(`/application/listings/${LISTING_ID}`)) {
      return Response.json(listing);
    }
    if (init?.method === "GET" && url.endsWith(`/application/listings/${LISTING_ID}/images`)) {
      return Response.json({ count: images.length, results: images });
    }
    if (init?.method === "GET" && url.endsWith(`/listings/${LISTING_ID}/files`)) {
      return Response.json({ count: files.length, results: files });
    }
    if (init?.method === "POST" && url.endsWith(`/listings/${LISTING_ID}/images`)) {
      const body = init.body as FormData;
      const created = { listing_image_id: nextImageId++, rank: Number(body.get("rank")) };
      images.push(created);
      return Response.json(created, { status: 201 });
    }
    if (init?.method === "POST" && url.endsWith(`/listings/${LISTING_ID}/files`)) {
      const body = init.body as FormData;
      const created = {
        listing_file_id: nextFileId++,
        filename: body.get("name"),
        rank: Number(body.get("rank"))
      };
      files.push(created);
      return Response.json(created, { status: 201 });
    }
    throw new Error(`UNEXPECTED_FETCH:${init?.method}:${url}`);
  };
  return { calls, images, files, fetchImpl };
}

function handler(fetchImpl: typeof fetch, ledger = new MemoryOperationLedgerRepository()) {
  return createDraftAssetsPostHandler({
    fetchImpl,
    ledger,
    getAccessToken: async () => "12345.offline-token",
    now: () => "2026-09-05T08:30:00.000Z"
  });
}

function assetPosts(calls: Call[]) {
  return calls.filter((call) => call.init?.method === "POST");
}

test("unauthorized token performs zero Etsy writes", async () => {
  const backend = etsyBackend();
  const response = await handler(backend.fetchImpl)(request({}, "wrong-secret"));
  assert.equal(response.status, 401);
  assert.equal(backend.calls.length, 0);
});

test("shop mismatch performs zero Etsy writes", async () => {
  const backend = etsyBackend();
  const response = await handler(backend.fetchImpl)(request({ shopId: "99999999" }));
  assert.equal(response.status, 409);
  assert.equal(backend.calls.length, 0);
});

test("asset SHA mismatch performs zero Etsy writes", async () => {
  const backend = etsyBackend();
  const response = await handler(backend.fetchImpl)(request({ assetSha256: "a".repeat(64) }));
  assert.equal(response.status, 409);
  assert.equal(backend.calls.length, 0);
});

test("pre-read listing identity mismatch performs zero asset writes", async () => {
  const backend = etsyBackend({ ...LISTING, title: "Changed Etsy title" });
  const response = await handler(backend.fetchImpl)(request());
  assert.equal(response.status, 409);
  assert.equal(backend.calls.length, 1);
  assert.equal(assetPosts(backend.calls).length, 0);
});

test("UPLOAD_IMAGE sends binary image and rank, then confirms returned image ID", async () => {
  const backend = etsyBackend();
  const response = await handler(backend.fetchImpl)(request());
  const result = await response.json();
  const post = assetPosts(backend.calls)[0];
  const headers = post.init?.headers as Record<string, string>;
  const body = post.init?.body as FormData;

  assert.equal(response.status, 200);
  assert.equal(result.status, "APPLIED");
  assert.equal(result.receipt.providerResourceId, "71001");
  assert.equal(result.listingIdentity, "MATCH");
  assert.equal(result.assetReadBack, "MATCH");
  assert.equal(result.livePublishPerformed, false);
  assert.ok(body.get("image") instanceof File);
  assert.equal(body.get("rank"), "1");
  assert.equal(body.get("state"), null);
  assert.equal(headers["content-type"], undefined);
  assert.equal(headers["x-api-key"], "api-key:shared-secret");
  assert.equal(headers.Authorization, "Bearer 12345.offline-token");
});

test("UPLOAD_FILE sends binary file, name, and rank, then confirms returned file ID", async () => {
  const backend = etsyBackend();
  const response = await handler(backend.fetchImpl)(
    request({ kind: "UPLOAD_FILE", operationId: "OP-FILE-1", assetName: "buyer.zip", rank: "2" })
  );
  const result = await response.json();
  const post = assetPosts(backend.calls)[0];
  const body = post.init?.body as FormData;

  assert.equal(response.status, 200);
  assert.equal(result.receipt.providerResourceId, "81001");
  assert.ok(body.get("file") instanceof File);
  assert.equal(body.get("name"), "buyer.zip");
  assert.equal(body.get("rank"), "2");
  assert.equal(body.get("state"), null);
  assert.equal(result.assetReadBack, "MATCH");
});

test("same operation replay returns prior receipt without duplicate POST", async () => {
  const backend = etsyBackend();
  const ledger = new MemoryOperationLedgerRepository();
  const post = handler(backend.fetchImpl, ledger);
  const first = await post(request({ operationId: "OP-REPLAY" }));
  const second = await post(request({ operationId: "OP-REPLAY" }));
  const replay = await second.json();

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(replay.status, "REPLAY");
  assert.equal(replay.receipt.providerResourceId, "71001");
  assert.equal(assetPosts(backend.calls).length, 1);
});

test("changed payload under one operation ID is rejected before a duplicate provider write", async () => {
  const backend = etsyBackend();
  const ledger = new MemoryOperationLedgerRepository();
  const post = handler(backend.fetchImpl, ledger);
  const first = await post(request({ operationId: "OP-COLLISION" }));
  const changed = await post(request({ operationId: "OP-COLLISION", rank: "2" }));
  const result = await changed.json();

  assert.equal(first.status, 200);
  assert.equal(changed.status, 400);
  assert.equal(result.error, "OPERATION_ID_PAYLOAD_MISMATCH");
  assert.equal(assetPosts(backend.calls).length, 1);
});

test("unresolved Etsy 5xx remains reconciliation-required without a duplicate upload", async () => {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (init?.method === "GET" && url.endsWith(`/application/listings/${LISTING_ID}`)) {
      return Response.json(LISTING);
    }
    if (init?.method === "GET" && url.endsWith(`/application/listings/${LISTING_ID}/images`)) {
      return Response.json({ count: 0, results: [] });
    }
    if (init?.method === "POST") return Response.json({ error: "timeout" }, { status: 503 });
    throw new Error(`UNEXPECTED_FETCH:${init?.method}:${url}`);
  };
  const ledger = new MemoryOperationLedgerRepository();
  const post = handler(fetchImpl, ledger);
  const first = await post(request({ operationId: "OP-AMBIGUOUS" }));
  const replay = await post(request({ operationId: "OP-AMBIGUOUS" }));

  assert.equal(first.status, 409);
  assert.equal((await first.json()).status, "RECONCILIATION_REQUIRED");
  assert.equal(replay.status, 409);
  assert.equal((await replay.json()).status, "RECONCILIATION_REQUIRED");
  assert.equal(assetPosts(calls).length, 1);
});

for (const scenario of [
  {
    kind: "UPLOAD_IMAGE" as const,
    operationId: "OP-FRESH-IMAGE",
    assetName: "gallery-01.png",
    rank: "1",
    collectionSuffix: `/application/listings/${LISTING_ID}/images`,
    existingAsset: { listing_image_id: 71999, rank: 1 }
  },
  {
    kind: "UPLOAD_FILE" as const,
    operationId: "OP-FRESH-FILE",
    assetName: "buyer.zip",
    rank: "2",
    collectionSuffix: `/listings/${LISTING_ID}/files`,
    existingAsset: { listing_file_id: 81999, filename: "buyer.zip", rank: 2 }
  }
]) {
  test(`fresh provider cannot reconcile an old ${scenario.kind} from a pre-existing rank match`, async () => {
    const calls: Call[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (init?.method === "GET" && url.endsWith(`/application/listings/${LISTING_ID}`)) {
        return Response.json(LISTING);
      }
      if (init?.method === "GET" && url.endsWith(scenario.collectionSuffix)) {
        return Response.json({ count: 1, results: [scenario.existingAsset] });
      }
      if (init?.method === "POST") {
        return Response.json({ error: "timeout" }, { status: 503 });
      }
      throw new Error(`UNEXPECTED_FETCH:${init?.method}:${url}`);
    };
    const ledger = new MemoryOperationLedgerRepository();
    const post = handler(fetchImpl, ledger);
    const requestOverrides = {
      kind: scenario.kind,
      operationId: scenario.operationId,
      assetName: scenario.assetName,
      rank: scenario.rank
    };

    const first = await post(request(requestOverrides));
    const postsAfterFirstRequest = assetPosts(calls).length;
    const replay = await post(request(requestOverrides));

    assert.equal(first.status, 409);
    assert.equal((await first.json()).status, "RECONCILIATION_REQUIRED");
    assert.equal(replay.status, 409);
    assert.equal((await replay.json()).status, "RECONCILIATION_REQUIRED");
    assert.equal(postsAfterFirstRequest, 1);
    assert.equal(assetPosts(calls).length, postsAfterFirstRequest);
  });
}

test("same-request ambiguous upload still reconciles an asset created after its baseline", async () => {
  const calls: Call[] = [];
  const images: Record<string, unknown>[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (init?.method === "GET" && url.endsWith(`/application/listings/${LISTING_ID}`)) {
      return Response.json(LISTING);
    }
    if (init?.method === "GET" && url.endsWith(`/application/listings/${LISTING_ID}/images`)) {
      return Response.json({ count: images.length, results: images });
    }
    if (init?.method === "POST" && url.endsWith(`/listings/${LISTING_ID}/images`)) {
      images.push({ listing_image_id: 71077, rank: 1 });
      return Response.json({ error: "upstream response lost" }, { status: 503 });
    }
    throw new Error(`UNEXPECTED_FETCH:${init?.method}:${url}`);
  };

  const response = await handler(fetchImpl)(request({ operationId: "OP-SAME-REQUEST" }));
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.status, "RECONCILED");
  assert.equal(result.receipt.providerResourceId, "71077");
  assert.equal(assetPosts(calls).length, 1);
});
