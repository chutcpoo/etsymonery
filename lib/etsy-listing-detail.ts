export const NOT_AVAILABLE = "NOT_AVAILABLE" as const;
export const BYTE_HASH_NOT_AVAILABLE_FROM_PROVIDER =
  "BYTE_HASH_NOT_AVAILABLE_FROM_PROVIDER" as const;
export const SHA256_NOT_AVAILABLE_FROM_PROVIDER =
  "SHA256_NOT_AVAILABLE_FROM_PROVIDER" as const;
export const NOT_AVAILABLE_FROM_CURRENT_ETSY_API_PATH =
  "NOT_AVAILABLE_FROM_CURRENT_ETSY_API_PATH" as const;

type JsonRecord = Record<string, unknown>;

type ProviderRequestEvidence = {
  name: string;
  method: "GET";
  endpoint: string;
  httpStatus: number | typeof NOT_AVAILABLE;
  outcome: "PASS" | "NOT_AVAILABLE";
  error?: string;
};

type ProviderResult = {
  evidence: ProviderRequestEvidence;
  payload: unknown;
};

type FetchLike = typeof fetch;

export type EtsyListingDetailInput = {
  listingId: number;
  shopId: number;
  headers: Record<string, string>;
  fetchImpl?: FetchLike;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function available(record: JsonRecord, key: string) {
  return key in record && record[key] !== null && record[key] !== undefined
    ? record[key]
    : NOT_AVAILABLE;
}

function results(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.results)) return [];
  return payload.results.filter(isRecord);
}

function count(payload: unknown, fallback: number) {
  if (!isRecord(payload) || typeof payload.count !== "number") return fallback;
  return payload.count;
}

function providerError(payload: unknown, status: number) {
  if (isRecord(payload) && typeof payload.error === "string") {
    return payload.error.slice(0, 300);
  }
  return `ETSY_HTTP_${status}`;
}

async function providerGet(
  name: string,
  endpoint: string,
  headers: Record<string, string>,
  fetchImpl: FetchLike
): Promise<ProviderResult> {
  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers,
      cache: "no-store"
    });
    const text = await response.text();
    let payload: unknown = {};
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = {};
      }
    }

    return {
      evidence: {
        name,
        method: "GET",
        endpoint,
        httpStatus: response.status,
        outcome: response.ok ? "PASS" : "NOT_AVAILABLE",
        ...(response.ok ? {} : { error: providerError(payload, response.status) })
      },
      payload
    };
  } catch (error) {
    return {
      evidence: {
        name,
        method: "GET",
        endpoint,
        httpStatus: NOT_AVAILABLE,
        outcome: "NOT_AVAILABLE",
        error: error instanceof Error ? error.message.slice(0, 300) : "ETSY_NETWORK_ERROR"
      },
      payload: {}
    };
  }
}

function findTaxonomyPath(
  nodes: JsonRecord[],
  taxonomyId: number,
  ancestors: string[] = []
): { id: number; name: string | typeof NOT_AVAILABLE; path: string[] } | null {
  for (const node of nodes) {
    const name = typeof node.name === "string" ? node.name : NOT_AVAILABLE;
    const path = name === NOT_AVAILABLE ? ancestors : [...ancestors, name];
    if (Number(node.id) === taxonomyId) return { id: taxonomyId, name, path };
    const children = Array.isArray(node.children) ? node.children.filter(isRecord) : [];
    const nested = findTaxonomyPath(children, taxonomyId, path);
    if (nested) return nested;
  }
  return null;
}

function listingCore(listing: JsonRecord, category: unknown) {
  return {
    listing_id: available(listing, "listing_id"),
    shop_id: available(listing, "shop_id"),
    state: available(listing, "state"),
    title: available(listing, "title"),
    description: available(listing, "description"),
    price: available(listing, "price"),
    taxonomy_id: available(listing, "taxonomy_id"),
    category,
    who_made: available(listing, "who_made"),
    when_made: available(listing, "when_made"),
    listing_type: available(listing, "listing_type"),
    is_digital: available(listing, "is_digital"),
    type: available(listing, "type"),
    quantity: available(listing, "quantity"),
    tags: available(listing, "tags")
  };
}

function gallery(payload: unknown) {
  const images = results(payload);
  return {
    count: count(payload, images.length),
    providerOrderPreserved: true,
    byteHashEvidence: BYTE_HASH_NOT_AVAILABLE_FROM_PROVIDER,
    images: images.map((image, index) => ({
      provider_position: index + 1,
      listing_image_id: available(image, "listing_image_id"),
      rank: available(image, "rank"),
      urls: {
        url_75x75: available(image, "url_75x75"),
        url_170x135: available(image, "url_170x135"),
        url_570xN: available(image, "url_570xN"),
        url_fullxfull: available(image, "url_fullxfull")
      },
      full_width: available(image, "full_width"),
      full_height: available(image, "full_height"),
      alt_text: available(image, "alt_text"),
      byte_hash: BYTE_HASH_NOT_AVAILABLE_FROM_PROVIDER
    }))
  };
}

function properties(payload: unknown) {
  const items = results(payload);
  return {
    count: count(payload, items.length),
    properties: items.map((property) => ({
      property_id: available(property, "property_id"),
      property_name: available(property, "property_name"),
      scale_id: available(property, "scale_id"),
      scale_name: available(property, "scale_name"),
      value_ids: available(property, "value_ids"),
      values: available(property, "values")
    }))
  };
}

function digitalBuyerFiles(payload: unknown) {
  const files = results(payload);
  return {
    count: count(payload, files.length),
    providerOrderPreserved: true,
    sha256Evidence: SHA256_NOT_AVAILABLE_FROM_PROVIDER,
    files: files.map((file, index) => ({
      provider_position: index + 1,
      listing_file_id: available(file, "listing_file_id"),
      listing_id: available(file, "listing_id"),
      rank: available(file, "rank"),
      filename: available(file, "filename"),
      filesize: available(file, "filesize"),
      size_bytes: available(file, "size_bytes"),
      filetype: available(file, "filetype"),
      status: NOT_AVAILABLE,
      url: NOT_AVAILABLE,
      sha256: SHA256_NOT_AVAILABLE_FROM_PROVIDER
    }))
  };
}

function deliveryConfiguration(listing: JsonRecord, fileCount: number) {
  return {
    status: "PARTIAL_PROVIDER_EVIDENCE",
    is_digital: available(listing, "is_digital"),
    listing_type: available(listing, "listing_type"),
    type: available(listing, "type"),
    file_data: available(listing, "file_data"),
    digital_file_count: fileCount,
    shipping_profile_id: available(listing, "shipping_profile_id"),
    return_policy_id: available(listing, "return_policy_id"),
    processing_min: available(listing, "processing_min"),
    processing_max: available(listing, "processing_max"),
    provider_delivery_endpoint: NOT_AVAILABLE,
    evidenceGap:
      "Etsy Open API path used here exposes listing/digital-file metadata but no dedicated digital-delivery configuration or delivery-status endpoint."
  };
}

export async function getEtsyListingDetailEvidence(input: EtsyListingDetailInput) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = "https://api.etsy.com/v3/application";
  const coreEndpoint = `${base}/listings/${input.listingId}`;
  const imageEndpoint = `${base}/listings/${input.listingId}/images`;
  const propertiesEndpoint = `${base}/shops/${input.shopId}/listings/${input.listingId}/properties`;
  const filesEndpoint = `${base}/shops/${input.shopId}/listings/${input.listingId}/files`;

  const [coreResult, imageResult, propertiesResult, filesResult] = await Promise.all([
    providerGet("listing_core", coreEndpoint, input.headers, fetchImpl),
    providerGet("listing_images", imageEndpoint, input.headers, fetchImpl),
    providerGet("listing_properties", propertiesEndpoint, input.headers, fetchImpl),
    providerGet("listing_files", filesEndpoint, input.headers, fetchImpl)
  ]);

  const providerRequests = [
    coreResult.evidence,
    imageResult.evidence,
    propertiesResult.evidence,
    filesResult.evidence
  ];
  const listing = isRecord(coreResult.payload) ? coreResult.payload : {};

  if (coreResult.evidence.outcome !== "PASS") {
    return {
      status: "BLOCKED",
      mode: "READ_ONLY",
      ETSY_WRITE_COUNT: 0,
      generatedAt: new Date().toISOString(),
      requestedListingId: input.listingId,
      authenticatedShopId: input.shopId,
      providerRequests,
      evidenceGaps: ["LISTING_CORE_NOT_AVAILABLE_FROM_PROVIDER"]
    };
  }

  if (Number(listing.listing_id) !== input.listingId) {
    return {
      status: "BLOCKED",
      mode: "READ_ONLY",
      ETSY_WRITE_COUNT: 0,
      generatedAt: new Date().toISOString(),
      requestedListingId: input.listingId,
      authenticatedShopId: input.shopId,
      providerRequests,
      evidenceGaps: ["LISTING_IDENTITY_MISMATCH"]
    };
  }

  if (Number(listing.shop_id) !== input.shopId) {
    return {
      status: "BLOCKED",
      mode: "READ_ONLY",
      ETSY_WRITE_COUNT: 0,
      generatedAt: new Date().toISOString(),
      requestedListingId: input.listingId,
      authenticatedShopId: input.shopId,
      providerRequests,
      evidenceGaps: ["LISTING_SHOP_ID_MISMATCH"]
    };
  }

  let category: unknown = NOT_AVAILABLE;
  const taxonomyId = Number(listing.taxonomy_id);
  if (Number.isSafeInteger(taxonomyId) && taxonomyId > 0) {
    const taxonomyEndpoint = `${base}/seller-taxonomy/nodes`;
    const taxonomyResult = await providerGet(
      "seller_taxonomy_nodes",
      taxonomyEndpoint,
      input.headers,
      fetchImpl
    );
    providerRequests.push(taxonomyResult.evidence);
    if (taxonomyResult.evidence.outcome === "PASS") {
      category = findTaxonomyPath(results(taxonomyResult.payload), taxonomyId) ?? NOT_AVAILABLE;
    }
  }

  const imageEvidence = gallery(imageResult.payload);
  const propertyEvidence = properties(propertiesResult.payload);
  const fileEvidence = digitalBuyerFiles(filesResult.payload);
  const evidenceGaps = [
    "GALLERY_BYTE_HASH:BYTE_HASH_NOT_AVAILABLE_FROM_PROVIDER",
    "DIGITAL_BUYER_FILE_SHA256:SHA256_NOT_AVAILABLE_FROM_PROVIDER",
    "DIGITAL_BUYER_FILE_URL:NOT_AVAILABLE",
    "DIGITAL_BUYER_FILE_STATUS:NOT_AVAILABLE",
    "OFFER_DISCOUNT:NOT_AVAILABLE_FROM_CURRENT_ETSY_API_PATH",
    "DIGITAL_DELIVERY_CONFIGURATION:DEDICATED_PROVIDER_ENDPOINT_NOT_AVAILABLE"
  ];

  if (category === NOT_AVAILABLE) evidenceGaps.push("CATEGORY_NAME_PATH:NOT_AVAILABLE");
  for (const request of providerRequests) {
    if (request.outcome !== "PASS") {
      evidenceGaps.push(`${request.name.toUpperCase()}:NOT_AVAILABLE`);
    }
  }

  return {
    status: "PASS",
    mode: "READ_ONLY",
    ETSY_WRITE_COUNT: 0,
    generatedAt: new Date().toISOString(),
    requestedListingId: input.listingId,
    authenticatedShopId: input.shopId,
    identityVerified: true,
    providerRequests,
    listing: listingCore(listing, category),
    gallery: imageEvidence,
    attributes: propertyEvidence,
    digitalBuyerFiles: fileEvidence,
    offerDiscount: {
      status: NOT_AVAILABLE_FROM_CURRENT_ETSY_API_PATH,
      evidence:
        "No seller-side offer or discount configuration endpoint is exposed by the current Etsy Open API path; listing price is not used to infer an offer."
    },
    deliveryConfiguration: deliveryConfiguration(listing, fileEvidence.count),
    fieldAvailability: {
      listingCore: "PASS",
      galleryMetadata: imageResult.evidence.outcome === "PASS" ? "PASS" : NOT_AVAILABLE,
      galleryByteHash: BYTE_HASH_NOT_AVAILABLE_FROM_PROVIDER,
      attributes: propertiesResult.evidence.outcome === "PASS" ? "PASS" : NOT_AVAILABLE,
      digitalBuyerFileMetadata: filesResult.evidence.outcome === "PASS" ? "PASS" : NOT_AVAILABLE,
      digitalBuyerFileSha256: SHA256_NOT_AVAILABLE_FROM_PROVIDER,
      offerDiscount: NOT_AVAILABLE_FROM_CURRENT_ETSY_API_PATH,
      deliveryConfiguration: "PARTIAL_PROVIDER_EVIDENCE"
    },
    evidenceGaps
  };
}
