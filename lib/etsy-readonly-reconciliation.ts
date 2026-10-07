import { etsyApiHeaders, getMissingEtsyScopes } from "./etsy";
import { fetchEtsyReadWithRetry } from "./etsy-http";
import { getEtsySellerStateSnapshot } from "./etsy-seller-state-reconciliation";
import { loadEtsyTokens, type EtsyStoredTokens } from "./token-store";
import { RECONCILIATION_TRUTH_04_15 } from "./etsy-reconciliation-truth";
import { NeonCanonicalProductRegistryRepository, type CanonicalProductRegistryRepository } from "./product-registry-repository";

export type ProductTruth = {
  productId: string;
  productName: string;
  listingId: number | null;
  expectedTitle: string | null;
  expectedState?: string;
};
export type Listing = {
  listingId: number;
  title: string | null;
  state: string | null;
  url: string | null;
  productIds: readonly string[];
};
export type DurableMapping = { productId: string; listingId: number };
const targets = new Set<string>(RECONCILIATION_TRUTH_04_15.map((p) => p.productId));
// Denylist observed in PR #257's protected-product guard. These are never
// candidates, even if a global shop query returns a conflicting title.
const protectedListingIds = new Set([4587646332, 4588681044, 4588738623]);
const exact = (s: string) => s.normalize("NFC").trim();

export function reconcileListings(
  products: readonly ProductTruth[],
  listings: readonly Listing[],
  durableMappings: readonly DurableMapping[] = []
) {
  if (products.some((p) => !targets.has(p.productId)) || new Set(products.map((p) => p.productId)).size !== products.length) {
    throw new Error("PRODUCT_OUTSIDE_RECONCILIATION_SCOPE");
  }
  // Same ID can appear in multiple state queries. Do not turn duplicate pages
  // into multiple candidates, or silently reconcile inconsistent observations.
  const unique = new Map<number, Listing>();
  for (const listing of listings) {
    if (protectedListingIds.has(listing.listingId) || listing.productIds.some((id) => /-(001|002|003)$/.test(id))) continue;
    const old = unique.get(listing.listingId);
    if (old && JSON.stringify(old) !== JSON.stringify(listing)) {
      throw new Error("ETSY_LISTING_READBACK_INCONSISTENT");
    }
    unique.set(listing.listingId, listing);
  }
  return products.map((product) => {
    const title = product.expectedTitle ?? product.productName;
    const pool = [...unique.values()];
    const ids = durableMappings.filter((m) => m.productId === product.productId).map((m) => m.listingId);
    const evidence: string[] = [];
    const explicit = pool.filter((l) => l.productIds.includes(product.productId));
    const titled = pool.filter((l) => l.title !== null && exact(l.title) === exact(title));
    const mappedIds = product.listingId !== null ? [product.listingId] : ids;
    // Preserve ambiguity even when one candidate has a higher-priority pointer.
    const candidates = pool.filter((l) => mappedIds.includes(l.listingId) || explicit.includes(l) || titled.includes(l));
    let match: "MATCH" | "NOT_FOUND" | "CONFLICT" | "CONFLICT_AMBIGUOUS" = "NOT_FOUND";
    let listing: Listing | undefined;
    if (candidates.length > 1 || new Set(mappedIds).size > 1) {
      match = "CONFLICT_AMBIGUOUS";
      evidence.push("MULTIPLE_CANDIDATES", ...candidates.map((l) => `CANDIDATE_LISTING_ID:${l.listingId}`));
    } else if (candidates.length === 1) {
      listing = candidates[0];
      const identity = listing.productIds.includes(product.productId) || titled.includes(listing);
      const foreignIdentity = listing.productIds.some((id) => id !== product.productId);
      const pointerMismatch = mappedIds.length > 0 && !mappedIds.includes(listing.listingId);
      const titleMismatch = product.expectedTitle !== null && listing.title !== product.expectedTitle;
      const stateMismatch = product.expectedState !== undefined && listing.state !== product.expectedState;
      match = !identity || foreignIdentity || pointerMismatch || titleMismatch || stateMismatch || !listing.title || !listing.state
        ? "CONFLICT" : "MATCH";
      evidence.push(product.listingId !== null ? "DRIVE_LISTING_POINTER" : explicit.includes(listing)
        ? "EXPLICIT_PRODUCT_ID_METADATA" : titled.includes(listing) ? "EXACT_DRIVE_TITLE" : "DURABLE_MAPPING_REQUIRES_IDENTITY");
      if (match === "CONFLICT") evidence.push("POINTER_OR_IDENTITY_OR_TITLE_OR_STATE_MISMATCH");
    } else {
      match = mappedIds.length > 0 ? "CONFLICT" : "NOT_FOUND";
      evidence.push(mappedIds.length > 0 ? "MAPPED_LISTING_NOT_IN_READBACK" : "NO_TRUSTED_IDENTITY_MATCH_NOT_PROOF_OF_ABSENCE");
    }
    return {
      productId: product.productId, productName: product.productName,
      listingId: listing?.listingId ?? null, state: listing?.state ?? null,
      title: listing?.title ?? null, url: listing?.url ?? null, match, evidence
    };
  });
}

type Dependencies = {
  loadTokens?: () => Promise<EtsyStoredTokens | null>;
  loadMappings?: (productIds: readonly string[]) => Promise<DurableMapping[]>;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

async function loadDurableMappings(productIds: readonly string[]): Promise<DurableMapping[]> {
  const repository = new NeonCanonicalProductRegistryRepository();
  // Expose only the existing SELECT method; never seed/save/project registry data.
  const reader: Pick<CanonicalProductRegistryRepository, "load"> = { load: (id) => repository.load(id) };
  const records = await Promise.all(productIds.map((id) => reader.load(id)));
  return records.flatMap((record, index) => {
    if (!record) return [];
    if (record.productId !== productIds[index]) throw new Error("DURABLE_MAPPING_PRODUCT_MISMATCH");
    return record.references.listings.filter((ref) => ref.channel === "etsy").map((ref) => {
      const listingId = Number(ref.listingId);
      if (!Number.isSafeInteger(listingId) || listingId <= 0) throw new Error("DURABLE_MAPPING_LISTING_INVALID");
      return { productId: record.productId, listingId };
    });
  });
}

// No refresh, write-client, write authorization, or database save dependency.
// Shared credential/header and bounded GET retry architecture are reused.
export async function readOnlyReconciliation(productIds?: readonly string[], dependencies: Dependencies = {}) {
  if (productIds?.some((id) => !targets.has(id))) throw new Error("PRODUCT_OUTSIDE_RECONCILIATION_SCOPE");
  const stored = await (dependencies.loadTokens ?? loadEtsyTokens)();
  if (!stored) throw new Error("ETSY_OAUTH_NOT_CONNECTED");
  if (getMissingEtsyScopes(stored.scope, ["listings_r"]).length) throw new Error("ETSY_READ_SCOPE_MISSING");
  if (!Number.isSafeInteger(stored.shopId) || Number(stored.shopId) <= 0) throw new Error("ETSY_SHOP_ID_NOT_AVAILABLE");
  if (!stored.accessToken?.trim()) throw new Error("ETSY_OAUTH_NOT_CONNECTED");
  if (!Number.isFinite(stored.expiresAt.getTime()) || stored.expiresAt.getTime() <= (dependencies.now ?? Date.now)()) {
    throw new Error("ETSY_ACCESS_TOKEN_EXPIRED_READ_ONLY_NO_REFRESH");
  }
  const shopId = Number(stored.shopId);
  const headers = etsyApiHeaders(stored.accessToken);
  const transport = dependencies.fetchImpl ?? fetch;
  // Transport capability: only two GET resources, no arbitrary URL/redirect/body.
  const fetchReadOnly: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (init?.method !== "GET" || init.body != null || url.origin !== "https://api.etsy.com" ||
      ![`/v3/application/shops/${shopId}`, `/v3/application/shops/${shopId}/listings`].includes(url.pathname)) {
      throw new Error("ETSY_RECONCILIATION_READ_ONLY_GUARD");
    }
    return transport(input, { ...init, redirect: "error", signal: AbortSignal.timeout(10_000) });
  };
  const response = await fetchEtsyReadWithRetry(fetchReadOnly, `https://api.etsy.com/v3/application/shops/${shopId}`, {
    method: "GET", headers, cache: "no-store"
  });
  if (!response.ok) throw new Error(response.status === 403 ? "ETSY_READ_SCOPE_MISSING" : "ETSY_SHOP_READ_FAILED");
  const shop = await response.json() as { shop_id?: unknown; shop_name?: unknown };
  if (Number(shop.shop_id) !== shopId || shop.shop_name !== "PoonthaiDigital") throw new Error("ETSY_SHOP_IDENTITY_MISMATCH");
  const snapshot = await getEtsySellerStateSnapshot({ shopId, accessToken: stored.accessToken,
    summaryOnly: true, dependencies: { fetchImpl: fetchReadOnly } });
  const products = RECONCILIATION_TRUTH_04_15.filter((p) => !productIds?.length || productIds.includes(p.productId));
  const mappings = await (dependencies.loadMappings ?? loadDurableMappings)(products.map((p) => p.productId));
  const result = {
    mode: "READ_ONLY", generatedAt: new Date((dependencies.now ?? Date.now)()).toISOString(),
    shop: { shopId, shopName: "PoonthaiDigital" },
    truthInputs: { mode: "DRIVE_SNAPSHOT", masterDriveFileId: "108WmUQjOQ4BR_PkTJUznGXzDHaFwIwIkDJOCdjnl7QM",
      masterModifiedTime: "2026-10-07T10:15:05.273Z", unresolvedLifecycleConflict: true,
      products: products.map((p) => ({ productId: p.productId, lifecycle: p.lifecycle,
        listingId: p.listingId, listingUrl: p.listingUrl, expectedTitle: p.expectedTitle, source: p.source })) },
    // A source constant is not a live observation of all write gates.
    writeStateObserved: "UNKNOWN", products: reconcileListings(products, snapshot.listings, mappings),
    statesQueried: snapshot.states, etsyMutationPerformed: false, ETSY_WRITE_COUNT: 0
  };
  // Provider fields are allowlisted above. Redact credentials even if a provider
  // unexpectedly echoes them in a title or URL. Never serialize raw errors.
  const secrets = [stored.accessToken, stored.refreshToken, ...Object.values(headers),
    process.env.ETSY_API_KEY, process.env.ETSY_SHARED_SECRET, process.env.TOKEN_ENCRYPTION_KEY,
    process.env.DATABASE_URL].filter((s): s is string => Boolean(s));
  let serialized = JSON.stringify(result);
  for (const secret of secrets.sort((a, b) => b.length - a.length)) {
    const escaped = JSON.stringify(secret).slice(1, -1);
    serialized = serialized.split(escaped).join("[REDACTED]");
  }
  return JSON.parse(serialized) as typeof result;
}

const safeErrors = new Set([
  "ETSY_READ_SCOPE_MISSING", "ETSY_OAUTH_NOT_CONNECTED", "ETSY_SHOP_ID_NOT_AVAILABLE",
  "ETSY_ACCESS_TOKEN_EXPIRED_READ_ONLY_NO_REFRESH", "ETSY_SHOP_IDENTITY_MISMATCH",
  "ETSY_API_CREDENTIALS_NOT_CONFIGURED", "DATABASE_URL_NOT_CONFIGURED",
  "ETSY_LISTING_READBACK_INCONSISTENT"
]);
export function reconciliationError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/^ETSY_SELLER_STATE_READBACK_HTTP_[a-z_]+_403$/.test(message)) return "ETSY_READ_SCOPE_MISSING";
  return safeErrors.has(message) ? message : "ETSY_RECONCILIATION_READ_FAILED";
}
