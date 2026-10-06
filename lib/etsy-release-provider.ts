import { createHash } from "node:crypto";
import { getValidEtsyAccessToken, getEtsyUserIdFromToken } from "./etsy-auth";
import { etsyApiHeaders, ETSY_SELLER_WRITE_SCOPES } from "./etsy";
import { fetchEtsyReadWithRetry } from "./etsy-http";
import { EtsyDraftAssetProvider } from "./etsy-draft-asset-provider";
import { normalizeEtsyReadBack, verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "./etsy-readback-normalizer";
import { getEtsySellerStateSnapshot } from "./etsy-seller-state-reconciliation";
import { hashOperationRequest } from "./operation-ledger";
import { releaseFingerprints, validateReleaseManifest, type ProductManifest, type ReleaseAsset } from "./etsy-release-manifest";
import type { ReleaseOperationProvider, ReleaseReceipt } from "./etsy-release-operation";

export type EtsyRecord = Record<string, unknown>;
export type ReleaseProviderDependencies = {
  fetchImpl: typeof fetch;
  apiHeaders?: typeof etsyApiHeaders;
  getAccessToken?: (scopes: readonly string[]) => Promise<string>;
  assertExecutionAllowed: () => void;
  loadManifest: () => Promise<ProductManifest>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => string;
  assertTargetBaseline?: (listingId: string) => Promise<void>;
};
export function observation(r: EtsyRecord): EtsyReadBackObservation {
  return { title: r.title, description: r.description, price: r.price as EtsyReadBackObservation["price"], tags: r.tags,
    quantity: r.quantity, who_made: r.who_made, when_made: r.when_made, taxonomy_id: r.taxonomy_id,
    type: r.listing_type ?? r.type, state: r.state };
}
function id(value: unknown) {
  const n = Number(value); if (!Number.isSafeInteger(n) || n < 1) throw new Error("INVALID_ETSY_RESOURCE_ID"); return String(n);
}
function rows(r: EtsyRecord) {
  if (!Array.isArray(r.results) || !r.results.every(x => x && typeof x === "object" && !Array.isArray(x)) || r.count !== r.results.length) throw new Error("ETSY_COLLECTION_INCOMPLETE");
  return r.results as EtsyRecord[];
}
export class EtsyReleaseContext {
  readonly now: () => string;
  readonly sleep: (ms: number) => Promise<void>;
  constructor(readonly manifest: ProductManifest, readonly dependencies: ReleaseProviderDependencies) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.sleep = dependencies.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  }
  async token() {
    const token = await (this.dependencies.getAccessToken ?? getValidEtsyAccessToken)(ETSY_SELLER_WRITE_SCOPES);
    if (!token?.trim() || getEtsyUserIdFromToken(token) !== this.manifest.shop.userId) throw new Error("ETSY_AUTHENTICATED_USER_MISMATCH");
    return token;
  }
  async read(path: string): Promise<EtsyRecord> {
    const r = await fetchEtsyReadWithRetry(this.dependencies.fetchImpl, `https://api.etsy.com/v3/application${path}`,
      { method: "GET", headers: (this.dependencies.apiHeaders ?? etsyApiHeaders)(await this.token()), cache: "no-store" });
    if (!r.ok) throw new Error(`ETSY_RELEASE_READ_FAILED:${r.status}`);
    const v: unknown = await r.json();
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("ETSY_RELEASE_READ_INVALID");
    return v as EtsyRecord;
  }
  async assertAuthority() {
    const fresh = validateReleaseManifest(await this.dependencies.loadManifest(), this.now());
    if (hashOperationRequest({ manifest: fresh }) !== hashOperationRequest({ manifest: this.manifest })) throw new Error("AUTHORITATIVE_MANIFEST_CHANGED");
    const shop = await this.read(`/users/${this.manifest.shop.userId}/shops`);
    if (Number(shop.shop_id) !== this.manifest.shop.shopId || Number(shop.user_id) !== this.manifest.shop.userId) throw new Error("ETSY_SHOP_IDENTITY_MISMATCH");
  }
  async listing(listingId: string) {
    const r = await this.read(`/listings/${id(listingId)}`);
    if (id(r.listing_id) !== listingId || Number(r.shop_id) !== this.manifest.shop.shopId) throw new Error("ETSY_LISTING_SHOP_MISMATCH");
    if (r.state !== "draft") throw new Error("ETSY_LISTING_NOT_DRAFT");
    if (verifyEtsyReadBackIdentity(releaseFingerprints(this.manifest).listingFingerprint, observation(r)).status !== "MATCH") throw new Error("ETSY_LISTING_FINGERPRINT_MISMATCH");
    return r;
  }
  async media(listingId: string) {
    const [images, files, videos] = await Promise.all([
      this.read(`/listings/${listingId}/images`),
      this.read(`/shops/${this.manifest.shop.shopId}/listings/${listingId}/files`),
      this.read(`/listings/${listingId}/videos`)
    ]);
    return { images: rows(images), files: rows(files), videos: rows(videos) };
  }
  async protectedHash(listingId: number) {
    const listing = await this.read(`/listings/${listingId}`);
    if (Number(listing.shop_id) !== this.manifest.shop.shopId) throw new Error("PROTECTED_SHOP_MISMATCH");
    const media = await this.media(String(listingId));
    const inventory = await this.read(`/listings/${listingId}/inventory`);
    // Avoid volatile URLs/timestamps while retaining all protected content.
    return hashOperationRequest({ listing: normalizeEtsyReadBack(observation(listing)), inventory,
      images: media.images.map(r => ({ id: r.listing_image_id, rank: r.rank, altText: r.alt_text })),
      files: media.files.map(r => ({ id: r.listing_file_id, rank: r.rank, filename: r.filename, sizeBytes: r.size_bytes })),
      videos: media.videos.map(r => ({ id: r.video_id, state: r.video_state })) });
  }
  async sellerCheck(allowedDraftId?: string, allowMatchingDraft = false) {
    const snapshot = await getEtsySellerStateSnapshot({ shopId: this.manifest.shop.shopId, accessToken: await this.token(), dependencies: { fetchImpl: this.dependencies.fetchImpl, apiHeaders: this.dependencies.apiHeaders, retryOptions: { sleep: this.sleep } } });
    const protectedIds = new Set(this.manifest.protectedSellerState.map(r => r.listingId));
    for (const expected of this.manifest.protectedSellerState) {
      const actual = snapshot.listings.find(r => r.listingId === expected.listingId);
      if (!actual || actual.state !== expected.state || await this.protectedHash(expected.listingId) !== expected.snapshotHash) throw new Error("PROTECTED_SELLER_STATE_MISMATCH");
    }
    const matches: string[] = [];
    for (const row of snapshot.listings) {
      if (protectedIds.has(row.listingId)) continue;
      if (String(row.listingId) === allowedDraftId) { await this.listing(allowedDraftId); continue; }
      if (allowMatchingDraft && row.state === "draft") {
        await this.listing(String(row.listingId)); matches.push(String(row.listingId));
      } else throw new Error("UNEXPECTED_SELLER_LISTING");
    }
    if (matches.length > 1) throw new Error("DUPLICATE_DRAFT_FINGERPRINT_COLLISION");
    return matches;
  }
  async guard(listingId?: string, allowMatchingDraft = false) {
    this.dependencies.assertExecutionAllowed();
    await this.assertAuthority();
    if (listingId) { await this.listing(listingId); await this.dependencies.assertTargetBaseline?.(listingId); }
    return this.sellerCheck(listingId, allowMatchingDraft);
  }
  async post(path: string, body: BodyInit, contentType?: string, listingId?: string) {
    await this.guard(listingId);
    const headers = (this.dependencies.apiHeaders ?? etsyApiHeaders)(await this.token());
    if (contentType) headers["content-type"] = contentType; else delete headers["content-type"];
    const response = await this.dependencies.fetchImpl(`https://api.etsy.com/v3/application${path}`, { method: "POST", headers, body, cache: "no-store" });
    if (!response.ok) throw new Error(`ETSY_MUTATION_OUTCOME_UNCONFIRMED:${response.status}`);
    return await response.json() as EtsyRecord;
  }
}
export class GenericEtsyDraftCreationProvider implements ReleaseOperationProvider {
  constructor(private readonly context: EtsyReleaseContext) {}
  async baseline() {
    const matches = await this.context.guard(undefined, true);
    return matches.length ? { existingResourceId: matches[0] } : {};
  }
  async apply() {
    const c = this.context, m = c.manifest;
    // Scan again immediately before POST; a concurrently created match blocks this attempt.
    const matches = await c.guard(undefined, true);
    if (matches.length) throw new Error("DRAFT_APPEARED_BEFORE_WRITE");
    const body = new URLSearchParams({ title: m.title, description: m.description, price: m.price.toFixed(2), quantity: String(m.quantity),
      who_made: m.whoMade, when_made: m.whenMade, taxonomy_id: String(m.taxonomyId), tags: m.tags.join(","), type: "download" });
    const result = await c.post(`/shops/${m.shop.shopId}/listings`, body, "application/x-www-form-urlencoded");
    return id(result.listing_id);
  }
  async verify(resourceId: string): Promise<ReleaseReceipt> {
    await this.context.assertAuthority(); await this.context.listing(resourceId); await this.context.sellerCheck(resourceId);
    return { providerResourceId: resourceId, kind: "CREATE_DRAFT", disposition: "CREATED", ...releaseFingerprints(this.context.manifest) };
  }
  async reconcile(_baseline: Record<string, unknown>): Promise<ReleaseReceipt | null> {
    await this.context.assertAuthority();
    const matches = await this.context.sellerCheck(undefined, true);
    if (matches.length !== 1) return null;
    return { ...await this.verify(matches[0]), disposition: "RECONCILED" };
  }
}
export async function verifyAssetBytes(asset: ReleaseAsset, file: File) {
  if (file.name !== asset.filename || file.size !== asset.sizeBytes || file.type !== asset.mimeType) throw new Error("ASSET_METADATA_MISMATCH");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error("ASSET_SHA256_MISMATCH");
  if (asset.mimeType === "video/mp4" && (bytes.length < 12 || bytes.subarray(4, 8).toString() !== "ftyp")) throw new Error("VIDEO_CONTENT_MIME_MISMATCH");
  if (asset.mimeType === "image/png" && bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("IMAGE_CONTENT_MIME_MISMATCH");
  if (asset.mimeType === "image/jpeg" && bytes.subarray(0, 3).toString("hex") !== "ffd8ff") throw new Error("IMAGE_CONTENT_MIME_MISMATCH");
}
export class GenericEtsyAssetProvider implements ReleaseOperationProvider {
  private delegate?: EtsyDraftAssetProvider;
  constructor(protected readonly context: EtsyReleaseContext, protected readonly listingId: string,
    protected readonly asset: ReleaseAsset, protected readonly file: File, protected readonly kind: "UPLOAD_IMAGE" | "UPLOAD_FILE" | "UPLOAD_VIDEO") {}
  private collection(media: Awaited<ReturnType<EtsyReleaseContext["media"]>>) {
    return this.kind === "UPLOAD_IMAGE" ? media.images : this.kind === "UPLOAD_FILE" ? media.files : media.videos;
  }
  private resourceId(row: EtsyRecord) { return id(this.kind === "UPLOAD_IMAGE" ? row.listing_image_id : this.kind === "UPLOAD_FILE" ? row.listing_file_id : row.video_id); }
  async baseline() {
    await verifyAssetBytes(this.asset, this.file); await this.context.guard(this.listingId);
    const current = this.collection(await this.context.media(this.listingId));
    if (this.kind === "UPLOAD_VIDEO" && current.length !== 0) throw new Error("VIDEO_BASELINE_NOT_EMPTY");
    if (this.kind !== "UPLOAD_VIDEO" && current.some(r => Number(r.rank) >= this.asset.rank)) throw new Error("ASSET_BASELINE_COLLISION");
    return { ids: current.map(r => this.resourceId(r)) };
  }
  async apply() {
    await verifyAssetBytes(this.asset, this.file);
    const c = this.context, m = c.manifest;
    if (this.kind === "UPLOAD_VIDEO") {
      // Empty baseline is checked again to avoid replacing an existing video.
      if ((await c.media(this.listingId)).videos.length) throw new Error("VIDEO_BASELINE_CHANGED");
      const body = new FormData(); body.append("video", this.file, this.asset.filename); body.append("name", this.asset.filename); body.append("is_multi_video", "false");
      return id((await c.post(`/shops/${m.shop.shopId}/listings/${this.listingId}/videos`, body, undefined, this.listingId)).video_id);
    }
    // Reuse the proven multipart upload layer. Intercept its POST for fresh gates.
    const guardedFetch: typeof fetch = async (url, init) => {
      if (init?.method === "POST") await c.guard(this.listingId);
      return c.dependencies.fetchImpl(url, init);
    };
    this.delegate = new EtsyDraftAssetProvider(await c.token(), { operationKind: this.kind, candidateId: m.candidateId,
      candidateFingerprint: releaseFingerprints(m).candidateFingerprint, expectedListingFingerprint: releaseFingerprints(m).listingFingerprint,
      shopId: m.shop.shopId, draftListingId: Number(this.listingId), assetSha256: this.asset.sha256, assetName: this.asset.filename,
      rank: this.asset.rank, altText: this.asset.altText }, this.file, { fetchImpl: guardedFetch, apiHeaders: c.dependencies.apiHeaders });
    return (await this.delegate.apply({ operationId: "release", kind: this.kind, payload: {} })).providerResourceId;
  }
  async verify(resourceId: string): Promise<ReleaseReceipt | null> {
    const c = this.context;
    await c.assertAuthority(); await c.listing(this.listingId); await c.sellerCheck(this.listingId);
    let stable = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      const items = this.collection(await c.media(this.listingId));
      const row = items.find(r => this.resourceId(r) === resourceId);
      const match = row && (this.kind === "UPLOAD_VIDEO" ? items.length === 1 && row.video_state === "active" && Number(row.width) > 0 && Number(row.height) > 0 :
        Number(row.rank) === this.asset.rank && (this.kind === "UPLOAD_IMAGE" ? row.alt_text === this.asset.altText : row.filename === this.asset.filename && Number(row.size_bytes) === this.asset.sizeBytes));
      stable = match ? stable + 1 : 0;
      if (stable >= (this.kind === "UPLOAD_VIDEO" ? 2 : 1)) return { providerResourceId: resourceId, kind: this.kind, disposition: "CREATED", assetSha256: this.asset.sha256, filename: this.asset.filename, rank: this.asset.rank };
      if (attempt < 4) await c.sleep(500);
    }
    return null;
  }
  async reconcile(_baseline: Record<string, unknown>): Promise<ReleaseReceipt | null> {
    // Etsy does not return source SHA256 for transcoded media. A delta alone cannot
    // prove which bytes landed. Missing durable resource receipt requires review.
    return null;
  }
}
export class GenericEtsyVideoProvider extends GenericEtsyAssetProvider {
  constructor(context: EtsyReleaseContext, listingId: string, asset: ReleaseAsset, file: File) { super(context, listingId, asset, file, "UPLOAD_VIDEO"); }
}
