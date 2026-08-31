import type { Channel, ChannelPlan, GateResult, ProductPack, PublishPlan } from "./types";

const SUPPORTED_CHANNELS: Channel[] = ["etsy", "gumroad", "payhip"];

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

  return { pass: errors.length === 0, errors };
}

function basePayload(pack: ProductPack) {
  return {
    externalProductId: pack.productId,
    title: pack.title.trim(),
    description: pack.description.trim(),
    priceUsd: Number(pack.priceUsd.toFixed(2)),
    files: pack.files,
    tags: pack.tags ?? []
  };
}

function channelPlan(channel: Channel, pack: ProductPack): ChannelPlan {
  const base = basePayload(pack);

  if (channel === "etsy") {
    return {
      channel,
      action: "CREATE_DRAFT",
      payload: {
        ...base,
        listingState: "draft",
        digital: true,
        taxonomyStatus: "NEEDS_CATEGORY_MAPPING"
      }
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

  if (!gate.pass) {
    return {
      productId: pack.productId || "UNKNOWN",
      status: "BLOCKED",
      gate,
      channels: [],
      writesEnabled
    };
  }

  return {
    productId: pack.productId,
    status: "READY",
    gate,
    channels: pack.channels.map((channel) => channelPlan(channel, pack)),
    writesEnabled
  };
}
