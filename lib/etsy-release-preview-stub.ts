import { MemoryOperationLedgerRepository } from "./operation-ledger";
import { createReleaseApi } from "./etsy-release-api";
import { listingIdentity } from "./etsy-release-manifest";
import { PREVIEW_STUB_BRANCH, PREVIEW_STUB_HEADER, PREVIEW_STUB_MARKER, PREVIEW_STUB_RELEASE_ID, createPreviewStubManifest } from "./etsy-release-preview-fixture";

export function assertPreviewStubRuntime() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== PREVIEW_STUB_BRANCH) throw new Error("PREVIEW_STUB_RUNTIME_DISABLED");
  if (process.env.ETSY_GENERIC_PREPARE_ENABLED === "true") throw new Error("PREVIEW_STUB_REQUIRES_REAL_WRITES_DISABLED");
}
function authorize(request: Request) {
  assertPreviewStubRuntime();
  // Public fixture selector, not a credential or authorization for real Etsy.
  if (request.headers.get(PREVIEW_STUB_HEADER) !== PREVIEW_STUB_MARKER) throw new Error("PREVIEW_STUB_SELECTOR_REQUIRED");
}
export function createPreviewStubSession() {
  const m = createPreviewStubManifest(), ledger = new MemoryOperationLedgerRepository();
  const listings: Record<string, unknown>[] = [], images: Record<string, unknown>[] = [], files: Record<string, unknown>[] = [], videos: Record<string, unknown>[] = [];
  let mockMutationCount = 0;
  const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
  const fetchImpl: typeof fetch = async (input, init) => {
    assertPreviewStubRuntime();
    const url = new URL(String(input)), path = url.pathname, method = init?.method ?? "GET";
    if (url.hostname !== "api.etsy.com" || !path.startsWith("/v3/application/")) throw new Error("PREVIEW_STUB_UNEXPECTED_URL");
    if (method === "POST") {
      mockMutationCount++;
      if (path === "/v3/application/shops/77/listings") {
        if (listings.length) throw new Error("PREVIEW_STUB_DUPLICATE_CREATE");
        const { priceUsd, ...identity } = listingIdentity(m);
        listings.push({ ...identity, price: priceUsd, listing_id: 101, shop_id: 77 }); return json({ listing_id: 101 });
      }
      const body = init?.body;
      if (!(body instanceof FormData)) throw new Error("PREVIEW_STUB_MULTIPART_REQUIRED");
      if (path === "/v3/application/shops/77/listings/101/images") { images.push({ listing_image_id: 201, rank: Number(body.get("rank")), alt_text: body.get("alt_text") }); return json({ listing_image_id: 201 }); }
      if (path === "/v3/application/shops/77/listings/101/files") { files.push({ listing_file_id: 301, rank: Number(body.get("rank")), filename: body.get("name"), size_bytes: m.buyerFiles[0].sizeBytes }); return json({ listing_file_id: 301 }); }
      if (path === "/v3/application/shops/77/listings/101/videos") { videos.push({ video_id: 401, video_state: "active", width: 1920, height: 1080 }); return json({ video_id: 401 }); }
      throw new Error("PREVIEW_STUB_UNEXPECTED_MUTATION");
    }
    if (method !== "GET") throw new Error("PREVIEW_STUB_PUBLISH_MUTATION_FORBIDDEN");
    if (path === "/v3/application/users/88/shops") return json({ shop_id: 77, user_id: 88 });
    if (path === "/v3/application/shops/77/listings") { const results = listings.filter(r => r.state === url.searchParams.get("state")); return json({ count: results.length, results }); }
    if (path === "/v3/application/listings/101") return listings.length ? json(listings[0]) : new Response("{}", { status: 404 });
    if (path === "/v3/application/listings/101/inventory") return json({ products: [] });
    for (const [expected, rows] of [["/v3/application/listings/101/images", images], ["/v3/application/shops/77/listings/101/files", files], ["/v3/application/listings/101/videos", videos]] as const)
      if (path === expected) return json({ count: rows.length, results: rows });
    // No global fetch, network client, token store or DB fallback exists here.
    throw new Error("PREVIEW_STUB_UNEXPECTED_READ");
  };
  const api = createReleaseApi({ ledger, assertRuntime: assertPreviewStubRuntime, authorize,
    loadManifest: async releaseId => { if (releaseId !== PREVIEW_STUB_RELEASE_ID) throw new Error("PREVIEW_STUB_RELEASE_NOT_ALLOWED"); return structuredClone(m); },
    engine: { fetchImpl, apiHeaders: () => ({ "x-stub-transport": "in-process-only" }),
      getAccessToken: async scopes => { if (scopes.join(",") !== "listings_r,listings_w") throw new Error("PREVIEW_STUB_SCOPE_MISMATCH"); return "88.synthetic-stub"; },
      assertExecutionAllowed: assertPreviewStubRuntime, sleep: async () => {} } });
  const decorate = async (response: Response) => {
    const value = await response.json();
    return jsonResponse({ ...value, validationMode: "PREVIEW_STUB_ONLY", mockMutationCount, ETSY_WRITE_COUNT: 0,
      livePublishPerformed: false, ledgerDurability: "PROCESS_LOCAL_TEST_ONLY", remoteCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null }, response.status);
  };
  return { prepare: async (request: Request) => decorate(await api.prepare(request)),
    status: async (request: Request, releaseId: string) => decorate(await api.status(request, releaseId)),
    publish: async (request: Request, releaseId: string) => decorate(await api.publish(request, releaseId)) };
}
function jsonResponse(value: unknown, status: number) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
let session: ReturnType<typeof createPreviewStubSession> | undefined;
export function previewStubApi(request: Request) {
  if (request.headers.get(PREVIEW_STUB_HEADER) !== PREVIEW_STUB_MARKER) return null;
  // Authorize every operation; a cached fixture cannot bypass environment changes.
  return session ??= createPreviewStubSession();
}
