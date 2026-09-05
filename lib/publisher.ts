import {
  createCandidateFingerprint,
  createListingFingerprint
} from "./candidate-fingerprint";
import type {
  Channel,
  ChannelPlan,
  EtsyReleaseState,
  EtsyWhoMade,
  GateResult,
  ProductPack,
  PublishPlan
} from "./types";

const SUPPORTED_CHANNELS: Channel[] = ["etsy", "gumroad", "payhip"];
const ETSY_WHO_MADE: EtsyWhoMade[] = ["i_did", "collective", "someone_else"];

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function validBuyerFiles(value: unknown) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((file) => typeof file === "string" && file.trim().length > 0)
  );
}

function validateEtsy(pack: ProductPack, errors: string[]) {
  if (!Array.isArray(pack.channels) || !pack.channels.includes("etsy")) return;

  const tags = normalizeTags(pack.tags);
  const title = cleanString(pack.title);
  const etsy =
    typeof pack.etsy === "object" && pack.etsy !== null ? pack.etsy : undefined;
  const release =
    typeof etsy?.release === "object" && etsy.release !== null ? etsy.release : undefined;

  if (title.length > 140) errors.push("ETSY_TITLE_TOO_LONG");
  if (tags.length !== 13) errors.push("ETSY_TAG_COUNT_MUST_BE_13");
  if (new Set(tags.map((tag) => tag.toLowerCase())).size !== tags.length) {
    errors.push("ETSY_TAGS_MUST_BE_UNIQUE");
  }
  if (tags.some((tag) => tag.length > 20)) errors.push("ETSY_TAG_TOO_LONG");

  if (!etsy) {
    errors.push("ETSY_DRAFT_INPUT_REQUIRED");
    return;
  }

  if (!Number.isSafeInteger(etsy.taxonomyId) || Number(etsy.taxonomyId) <= 0) {
    errors.push("ETSY_TAXONOMY_ID_REQUIRED");
  }
  if (!Number.isSafeInteger(etsy.quantity) || Number(etsy.quantity) <= 0) {
    errors.push("ETSY_QUANTITY_REQUIRED");
  }
  if (!ETSY_WHO_MADE.includes(etsy.whoMade as EtsyWhoMade)) {
    errors.push("ETSY_WHO_MADE_INVALID");
  }
  if (!cleanString(etsy.whenMade)) errors.push("ETSY_WHEN_MADE_REQUIRED");
  if (release?.productionBuildFrozen !== true) errors.push("PRODUCTION_BUILD_NOT_FROZEN");

  if (release?.productionAuthorized === true) {
    if (release.testerPass !== true) errors.push("PRODUCTION_AUTH_REQUIRES_TESTER_PASS");
    if (release.finalQcPass !== true) errors.push("PRODUCTION_AUTH_REQUIRES_FINAL_QC_PASS");
  }
}

export function validateProductPack(input: ProductPack): GateResult {
  const errors: string[] = [];
  const productId = cleanString(input.productId);
  const title = cleanString(input.title);
  const description = cleanString(input.description);

  if (input.productTruthVerified !== true) errors.push("PRODUCT_TRUTH_NOT_VERIFIED");
  if (!productId) errors.push("MISSING_PRODUCT_ID");
  if (!title) errors.push("MISSING_TITLE");
  if (!description) errors.push("MISSING_DESCRIPTION");
  if (typeof input.priceUsd !== "number" || !Number.isFinite(input.priceUsd) || input.priceUsd <= 0) {
    errors.push("INVALID_PRICE");
  }
  if (!validBuyerFiles(input.files)) errors.push("INVALID_BUYER_FILES");
  if (!Array.isArray(input.channels) || input.channels.length === 0) errors.push("NO_CHANNELS");

  for (const channel of Array.isArray(input.channels) ? input.channels : []) {
    if (!SUPPORTED_CHANNELS.includes(channel as Channel)) errors.push(`UNSUPPORTED_CHANNEL:${String(channel)}`);
  }

  validateEtsy(input, errors);

  return { pass: errors.length === 0, errors };
}

function basePayload(pack: ProductPack) {
  return {
    externalProductId: cleanString(pack.productId),
    title: cleanString(pack.title),
    description: cleanString(pack.description),
    priceUsd: Number(pack.priceUsd.toFixed(2)),
    files: pack.files.map((file) => file.trim()),
    tags: normalizeTags(pack.tags)
  };
}

function etsyReleaseState(pack: ProductPack): EtsyReleaseState {
  const release = pack.etsy?.release;
  if (release?.productionBuildFrozen !== true) return "BLOCKED";
  if (release.testerPass !== true) return "TESTER_PENDING";
  if (release.finalQcPass !== true) return "QC_PENDING";
  if (release.productionAuthorized !== true) return "PRODUCTION_AUTHORIZATION_PENDING";
  return "PRODUCTION_AUTHORIZED";
}

function etsyListingIdentity(pack: ProductPack) {
  return {
    title: cleanString(pack.title),
    description: cleanString(pack.description),
    priceUsd: Number(pack.priceUsd.toFixed(2)),
    tags: normalizeTags(pack.tags),
    quantity: pack.etsy?.quantity,
    who_made: pack.etsy?.whoMade,
    when_made: cleanString(pack.etsy?.whenMade),
    taxonomy_id: pack.etsy?.taxonomyId,
    type: "download",
    state: "draft"
  };
}

function channelPlan(
  channel: Channel,
  pack: ProductPack,
  etsyDraftWritesEnabled: boolean
): ChannelPlan {
  const base = basePayload(pack);

  if (channel === "etsy") {
    const releaseState = etsyReleaseState(pack);
    const listingIdentity = etsyListingIdentity(pack);
    const payload = {
      ...base,
      ...listingIdentity,
      listingState: "draft",
      digital: true
    };

    return {
      channel,
      action: "CREATE_DRAFT",
      payload,
      candidateFingerprint: createCandidateFingerprint(payload),
      listingFingerprint: createListingFingerprint(listingIdentity),
      releaseState,
      draftWriteAllowed: etsyDraftWritesEnabled,
      liveWriteAllowed: false,
      assetPersistenceRequired: base.files.length > 0
    };
  }

  if (channel === "gumroad") {
    return {
      channel,
      action: "CREATE_DRAFT",
      payload: {
        ...base,
        published: false
      }
    };
  }

  return {
    channel,
    action: "CREATE_DRAFT",
    payload: {
      ...base,
      visibility: "invisible"
    }
  };
}

export function buildPublishPlan(pack: ProductPack): PublishPlan {
  const gate = validateProductPack(pack);
  const writesEnabled = process.env.PUBLISH_WRITES_ENABLED === "true";
  const etsyDraftWritesEnabled = process.env.ETSY_DRAFT_WRITES_ENABLED === "true";

  if (!gate.pass) {
    return {
      productId: cleanString(pack.productId) || "UNKNOWN",
      status: "BLOCKED",
      gate,
      channels: [],
      writesEnabled,
      etsyDraftWritesEnabled
    };
  }

  return {
    productId: cleanString(pack.productId),
    status: "READY",
    gate,
    channels: pack.channels.map((channel) => channelPlan(channel, pack, etsyDraftWritesEnabled)),
    writesEnabled,
    etsyDraftWritesEnabled
  };
}
