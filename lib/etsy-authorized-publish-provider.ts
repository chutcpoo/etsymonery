import {
  PublishAmbiguousResultError,
  type AuthorizedPublishProvider,
  type PublishedReceipt
} from "./authorized-publish-transaction";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { etsyApiHeaders } from "./etsy";
import type { EtsyReadBackObservation } from "./etsy-readback-normalizer";

export const ETSY_AUTHORIZED_PUBLISH_PROVIDER_VERSION = "1.0.0" as const;

type ProviderDependencies = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function required(value: string, code: string) {
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function listingId(value: unknown, fallback: string) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function listingState(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : "unknown";
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

export class EtsyAuthorizedPublishProvider implements AuthorizedPublishProvider {
  private readonly shopId: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getAccessToken: () => Promise<string>;

  constructor(shopId: string, dependencies: ProviderDependencies = {}) {
    const normalizedShopId = required(shopId, "INVALID_ETSY_PUBLISH_SHOP_ID");
    if (!/^\d+$/.test(normalizedShopId)) throw new Error("INVALID_ETSY_PUBLISH_SHOP_ID");
    this.shopId = normalizedShopId;
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.getAccessToken = dependencies.getAccessToken ?? getValidEtsyAccessToken;
  }

  private async readListing(draftListingId: string, allowMissing: boolean) {
    const id = required(draftListingId, "INVALID_ETSY_PUBLISH_DRAFT_ID");
    const accessToken = await this.getAccessToken();
    const response = await this.fetchImpl(
      `https://api.etsy.com/v3/application/listings/${encodeURIComponent(id)}`,
      {
        method: "GET",
        headers: etsyApiHeaders(accessToken),
        cache: "no-store"
      }
    );

    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`ETSY_PUBLISH_READBACK_FAILED:${response.status}`);

    const value = await parseJson(response);
    if (!isRecord(value)) throw new Error("ETSY_PUBLISH_READBACK_INVALID");
    return value;
  }

  async readDraft(draftListingId: string) {
    const value = await this.readListing(draftListingId, false);
    if (!value) throw new Error("ETSY_DRAFT_READBACK_NOT_FOUND");
    return toObservation(value);
  }

  async publish(draftListingId: string): Promise<PublishedReceipt> {
    const id = required(draftListingId, "INVALID_ETSY_PUBLISH_DRAFT_ID");
    const accessToken = await this.getAccessToken();
    let response: Response;

    try {
      response = await this.fetchImpl(
        `https://api.etsy.com/v3/application/shops/${encodeURIComponent(this.shopId)}/listings/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: {
            ...etsyApiHeaders(accessToken),
            "content-type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({ state: "active" }),
          cache: "no-store"
        }
      );
    } catch {
      throw new PublishAmbiguousResultError();
    }

    if (response.status >= 500) throw new PublishAmbiguousResultError();
    if (!response.ok) throw new Error(`ETSY_PUBLISH_REJECTED:${response.status}`);

    const value = await parseJson(response);
    const result = isRecord(value) ? value : {};
    return {
      listingId: listingId(result.listing_id, id),
      state: listingState(result.state) === "unknown" ? "active" : listingState(result.state),
      providerReceipt: { statusCode: response.status }
    };
  }

  async readPublished(draftListingId: string): Promise<PublishedReceipt | null> {
    const id = required(draftListingId, "INVALID_ETSY_PUBLISH_DRAFT_ID");
    const value = await this.readListing(id, true);
    if (!value) return null;
    const observation = toObservation(value);
    return {
      listingId: listingId(value.listing_id, id),
      state: listingState(value.state),
      observation,
      providerReceipt: { readBack: true }
    };
  }
}
