import {
  ProviderAmbiguousResultError,
  type ProviderReceipt,
  type ReconciledWriteKind,
  type ReconciledWriteProvider
} from "./draft-upload-reconciliation";
import { etsyApiHeaders } from "./etsy";
import type { EtsyReadBackObservation } from "./etsy-readback-normalizer";

type AssetUploadKind = Exclude<ReconciledWriteKind, "CREATE_DRAFT">;

export type EtsyDraftAssetPayload = {
  operationKind: AssetUploadKind;
  candidateId: string;
  candidateFingerprint: string;
  expectedListingFingerprint: string;
  shopId: number;
  draftListingId: number;
  assetSha256: string;
  assetName: string;
  rank: number;
};

type EtsyDraftAssetProviderDependencies = {
  fetchImpl?: typeof fetch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function positiveResourceId(value: unknown, code: string) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && /^[1-9]\d*$/.test(value.trim())) return value.trim();
  throw new Error(code);
}

function resourceId(value: Record<string, unknown>, kind: AssetUploadKind) {
  return positiveResourceId(
    kind === "UPLOAD_IMAGE" ? value.listing_image_id : value.listing_file_id,
    kind === "UPLOAD_IMAGE"
      ? "ETSY_IMAGE_UPLOAD_RECEIPT_INVALID"
      : "ETSY_FILE_UPLOAD_RECEIPT_INVALID"
  );
}

function resultRank(value: Record<string, unknown>) {
  return typeof value.rank === "number" && Number.isSafeInteger(value.rank) ? value.rank : null;
}

function resultFilename(value: Record<string, unknown>) {
  return typeof value.filename === "string" ? value.filename.normalize("NFC").trim() : null;
}

function toObservation(value: Record<string, unknown>): EtsyReadBackObservation {
  return {
    title: value.title,
    description: value.description,
    price: value.price as EtsyReadBackObservation["price"],
    tags: value.tags,
    quantity: value.quantity,
    who_made: value.who_made,
    when_made: value.when_made,
    taxonomy_id: value.taxonomy_id,
    type: value.listing_type ?? value.type ?? "download",
    state: value.state
  };
}

function multipartHeaders(accessToken: string) {
  const headers = etsyApiHeaders(accessToken);
  delete headers["content-type"];
  return headers;
}

export class EtsyDraftAssetProvider implements ReconciledWriteProvider {
  private readonly fetchImpl: typeof fetch;
  private baselineIds: Set<string> | null = null;

  constructor(
    private readonly accessToken: string,
    private readonly payload: EtsyDraftAssetPayload,
    private readonly asset: File,
    dependencies: EtsyDraftAssetProviderDependencies = {}
  ) {
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
  }

  private collectionUrl() {
    const { shopId, draftListingId, operationKind } = this.payload;
    if (operationKind === "UPLOAD_IMAGE") {
      return `https://api.etsy.com/v3/application/listings/${draftListingId}/images`;
    }
    return `https://api.etsy.com/v3/application/shops/${shopId}/listings/${draftListingId}/files`;
  }

  private uploadUrl() {
    const { shopId, draftListingId, operationKind } = this.payload;
    const collection = operationKind === "UPLOAD_IMAGE" ? "images" : "files";
    return `https://api.etsy.com/v3/application/shops/${shopId}/listings/${draftListingId}/${collection}`;
  }

  async readListing() {
    const response = await this.fetchImpl(
      `https://api.etsy.com/v3/application/listings/${this.payload.draftListingId}`,
      {
        method: "GET",
        headers: etsyApiHeaders(this.accessToken),
        cache: "no-store"
      }
    );
    if (!response.ok) throw new Error(`ETSY_DRAFT_READBACK_FAILED:${response.status}`);
    const value = await parseJson(response);
    if (!isRecord(value)) throw new Error("ETSY_DRAFT_READBACK_INVALID");
    return { raw: value, observation: toObservation(value) };
  }

  async readAssets() {
    const response = await this.fetchImpl(this.collectionUrl(), {
      method: "GET",
      headers: etsyApiHeaders(this.accessToken),
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`ETSY_ASSET_READBACK_FAILED:${response.status}`);
    const value = await parseJson(response);
    if (!isRecord(value) || !Array.isArray(value.results)) {
      throw new Error("ETSY_ASSET_READBACK_INVALID");
    }
    return value.results.filter(isRecord);
  }

  async hasResource(providerResourceId: string) {
    const results = await this.readAssets();
    return results.some((item) => {
      try {
        return resourceId(item, this.payload.operationKind) === providerResourceId;
      } catch {
        return false;
      }
    });
  }

  async apply(input: {
    operationId: string;
    kind: ReconciledWriteKind;
    payload: Record<string, unknown>;
  }): Promise<ProviderReceipt> {
    if (input.kind !== this.payload.operationKind) throw new Error("ETSY_ASSET_KIND_MISMATCH");

    const before = await this.readAssets();
    this.baselineIds = new Set(
      before.flatMap((item) => {
        try {
          return [resourceId(item, this.payload.operationKind)];
        } catch {
          return [];
        }
      })
    );

    const body = new FormData();
    const field = this.payload.operationKind === "UPLOAD_IMAGE" ? "image" : "file";
    body.append(field, this.asset, this.payload.assetName);
    if (this.payload.operationKind === "UPLOAD_FILE") body.append("name", this.payload.assetName);
    body.append("rank", String(this.payload.rank));

    let response: Response;
    try {
      response = await this.fetchImpl(this.uploadUrl(), {
        method: "POST",
        headers: multipartHeaders(this.accessToken),
        body,
        cache: "no-store"
      });
    } catch {
      throw new ProviderAmbiguousResultError();
    }

    if (response.status >= 500) throw new ProviderAmbiguousResultError();
    if (!response.ok) throw new Error(`ETSY_ASSET_UPLOAD_REJECTED:${response.status}`);

    let value: unknown;
    try {
      value = await parseJson(response);
    } catch {
      throw new ProviderAmbiguousResultError();
    }
    if (!isRecord(value)) throw new ProviderAmbiguousResultError();
    let id: string;
    try {
      id = resourceId(value, this.payload.operationKind);
    } catch {
      throw new ProviderAmbiguousResultError();
    }
    return {
      providerResourceId: id,
      kind: this.payload.operationKind,
      metadata: { assetName: this.payload.assetName, rank: this.payload.rank }
    };
  }

  async reconcile(input: {
    operationId: string;
    kind: ReconciledWriteKind;
    payload: Record<string, unknown>;
  }): Promise<ProviderReceipt | null> {
    if (input.kind !== this.payload.operationKind) throw new Error("ETSY_ASSET_KIND_MISMATCH");
    const baselineIds = this.baselineIds;
    if (baselineIds === null) return null;
    let results: Record<string, unknown>[];
    try {
      results = await this.readAssets();
    } catch {
      return null;
    }
    const matches = results.filter((item) => {
      let id: string;
      try {
        id = resourceId(item, this.payload.operationKind);
      } catch {
        return false;
      }
      if (baselineIds.has(id)) return false;
      if (resultRank(item) !== this.payload.rank) return false;
      return (
        this.payload.operationKind === "UPLOAD_IMAGE" ||
        resultFilename(item) === this.payload.assetName
      );
    });
    if (matches.length !== 1) return null;
    return {
      providerResourceId: resourceId(matches[0], this.payload.operationKind),
      kind: this.payload.operationKind,
      metadata: { assetName: this.payload.assetName, rank: this.payload.rank, readBack: true }
    };
  }
}
