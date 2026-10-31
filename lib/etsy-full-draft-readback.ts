/** Independent read-only Etsy metadata check. Does not verify byte hashes or publish. */
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { fetchEtsyReadWithRetry } from "./etsy-http";
import { verifyEtsyReadBackIdentity } from "./etsy-readback-normalizer";
import type { FullDraftRequest } from "./etsy-full-draft-contract";
import type { FullDraftReadback } from "./etsy-full-draft-staged";

function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("ETSY_READBACK_INVALID");
  return v as Record<string, unknown>;
}
function id(v: unknown): number {
  const n = typeof v === "number" ? v :
    typeof v === "string" && /^[1-9]\d*$/.test(v) ? Number(v) : NaN;
  if (!Number.isSafeInteger(n) || n < 1) throw new Error("ETSY_READBACK_ID_INVALID");
  return n;
}
function rank(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1) {
    throw new Error("ETSY_READBACK_RANK_INVALID");
  }
  return v;
}
function collection(v: unknown): Record<string, unknown>[] {
  const x = record(v);
  if (!Array.isArray(x.results) || x.results.some(e => !e || typeof e !== "object" || Array.isArray(e))) {
    throw new Error("ETSY_READBACK_COLLECTION_INVALID");
  }
  return x.results as Record<string, unknown>[];
}
async function getJson(url: string, headers: Record<string, string>, get: typeof fetch) {
  const response = await fetchEtsyReadWithRetry(get, url,
    {method: "GET", headers, cache: "no-store"},
    {maxAttempts: 3, baseDelayMs: 500, maxRetryDelayMs: 2000});
  if (!response.ok) throw new Error("ETSY_READBACK_HTTP_" + response.status);
  return response.json() as Promise<unknown>;
}
export async function readBackEtsyDraftAssets(
  input: FullDraftRequest,
  dependencies: {
    getToken?: (scopes: readonly string[]) => Promise<string>;
    fetchImpl?: typeof fetch;
    getHeaders?: (token: string) => Record<string, string>
  } = {}
): Promise<FullDraftReadback> {
  if (!input.draftListingId) throw new Error("ETSY_DRAFT_LISTING_ID_REQUIRED");
  if (process.env.ETSY_SHOP_ID !== String(input.shopId)) throw new Error("ETSY_SHOP_ID_MISMATCH");
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const token = await (dependencies.getToken ?? getValidEtsyAccessToken)(["listings_r"]);
  const headers = (dependencies.getHeaders ?? etsyApiHeaders)(token);
  const root = "https://api.etsy.com/v3/application";
  const [coreRaw, imageRaw, fileRaw] = await Promise.all([
    getJson(root + "/listings/" + input.draftListingId, headers, fetchImpl),
    getJson(root + "/listings/" + input.draftListingId + "/images", headers, fetchImpl),
    getJson(root + "/shops/" + input.shopId + "/listings/" + input.draftListingId + "/files", headers, fetchImpl)
  ]);
  const core = record(coreRaw);
  const listingId = id(core.listing_id);
  const shopId = id(core.shop_id);
  const identity = verifyEtsyReadBackIdentity(input.expectedListingFingerprint, {
    title: core.title, description: core.description,
    price: core.price as Parameters<typeof verifyEtsyReadBackIdentity>[1]["price"],
    tags: core.tags, quantity: core.quantity,
    who_made: core.who_made, when_made: core.when_made,
    taxonomy_id: core.taxonomy_id, type: core.listing_type ?? core.type, state: core.state
  });
  const images = collection(imageRaw).map(x => ({
    rank: rank(x.rank), resourceId: String(id(x.listing_image_id))
  }));
  const buyerFiles = collection(fileRaw).map(x => ({
    rank: rank(x.rank), resourceId: String(id(x.listing_file_id)),
    filename: typeof x.filename === "string" ? x.filename.normalize("NFC").trim() : "",
    sizeBytes: typeof x.size_bytes === "number" && Number.isSafeInteger(x.size_bytes) && x.size_bytes > 0
      ? x.size_bytes : null
  }));
  if (new Set(images.map(x => x.rank)).size !== images.length ||
      new Set(buyerFiles.map(x => x.rank)).size !== buyerFiles.length) {
    throw new Error("ETSY_READBACK_DUPLICATE_RANK");
  }
  return {listingId, shopId, listingState: String(core.state),
    listingIdentity: identity.status, images, buyerFiles};
}
