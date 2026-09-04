import { createHash } from "node:crypto";
import type {
  Channel,
  ChannelPlan,
  EtsyReleaseState,
  GateResult,
  ProductPack,
  PublishPlan
} from "./types";

const SUPPORTED_CHANNELS: Channel[] = ["etsy", "gumroad", "payhip"];

function normalizeTags(tags: string[] | undefined) {
  return (tags ?? []).map((tag) => tag.trim()).filter(Boolean);
}

function validateEtsy(pack: ProductPack, errors: string[]) {
  if (!pack.channels?.includes("etsy")) return;

  const tags = normalizeTags(pack.tags);
  const etsy = pack.etsy;

  if (pack.title.trim().length > 140) errors.push("ETSY_TITLE_TOO_LONG");
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
  if (!etsy.whoMade) errors.push("ETSY_WHO_MADE_REQUIRED");
  if (!etsy.whenMade?.trim()) errors.push("ETSY_WHEN_MADE_REQUIRED");
  if (!etsy.release?.productionBuildFrozen) errors.push("PRODUCTION_BUILD_NOT_FROZEN");

  if (etsy.release?.productionAuthorized) {
    if (!etsy.release.testerPass) errors.push("PRODUCTION_AUTH_REQUIRES_TESTER_PASS");
    if (!etsy.release.finalQcPass) errors.push("PRODUCTION_AUTH_REQUIRES_FINAL_QC_PASS");
  }
}

export function validateProductPack(input: ProductPack): GateResult {
  const errors: string[] = [];

  if (!input.productTruthVerified) errors.push("PRODUCT_TRUTH_NOT_VERIFIED");
  if (!input.productId?.trim()) errors.push("MISSING_PRODUCT_ID");
  if (!input.title?.trim()) errors.push("MISSING_TITLE");
  if (!input.description?.trim()) errors.push("MISSING_DESCRIPTION");
  if (!Number.isFinite(input.priceUsd) || input.priceUsd <= 0) errors.push("INVALID_PRICE");
  if (!Array.isArray(input.files) || input.files.length === 0) errors.push("NO_BUYER_FILES");
  if (!Array.isArray(input.channels) || input.channels.length === 0) errors.push("NO_CHANNELS");

  for (const channel of input.channels ?? []) {
    if (!SUPPORTED_CHANNELS.includes(channel)) errors.push(`UNSUPPORTED_CHANNEL:${channel}`);
  }

  validateEtsy(input, errors);

  return { pass: errors.length === 0, errors };
}

function basePayload(pack: ProductPack) {
  return {
    externalProductId: pack.productId,
    title: pack.title.trim(),
    description: pack.description.trim(),
    priceUsd: Number(pack.priceUsd.toFixed(2)),
    files: pack.files,
    tags: normalizeTags(pack.tags)
  };
}

function fingerprint(payload: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function etsyReleaseState(pack: ProductPack): EtsyReleaseState {
  const release = pack.etsy?.release;
  if (!release?.productionBuildFrozen) return "BLOCKED";
  if (!release.testerPass) return "TESTER_PENDING";
  if (!release.finalQcPass) return "QC_PENDING";
  if (!release.productionAuthorized) return "PRODUCTION_AUTHORIZATION_PENDING";
  return "PRODUCTION_AUTHORIZED";
}

function channelPlan(
  channel: Channel,
  pack: ProductPack,
  etsyDraftWritesEnabled: boolean,
  liveWritesEnabled: boolean
): ChannelPlan {
  const base = basePayload(pack);

  if (channel === "etsy") {
    const releaseState = etsyReleaseState(pack);
    const payload = {
      ...base,
      quantity: pack.etsy?.quantity,
      who_made: pack.etsy?.whoMade,
      when_made: pack.etsy?.whenMade?.trim(),
      taxonomy_id: pack.etsy?.taxonomyId,
      type: "download",
      listingState: "draft",
      digital: true
    };

    return {
      channel,
      action: "CREATE_DRAFT",
      payload,
      candidateFingerprint: fingerprint(payload),
      releaseState,
      draftWriteAllowed: etsyDraftWritesEnabled,
      liveWriteAllowed: liveWritesEnabled && releaseState === "PRODUCTION_AUTHORIZED"
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
      productId: pack.productId || "UNKNOWN",
      status: "BLOCKED",
      gate,
      channels: [],
      writesEnabled,
      etsyDraftWritesEnabled
    };
  }

  return {
    productId: pack.productId,
    status: "READY",
    gate,
    channels: pack.channels.map((channel) =>
      channelPlan(channel, pack, etsyDraftWritesEnabled, writesEnabled)
    ),
    writesEnabled,
    etsyDraftWritesEnabled
  };
}
