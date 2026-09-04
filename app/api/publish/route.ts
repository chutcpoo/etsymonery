import { NextResponse } from "next/server";
import { getValidEtsyAccessToken } from "../../../lib/etsy-auth";
import { etsyApiHeaders } from "../../../lib/etsy";
import { buildPublishPlan } from "../../../lib/publisher";
import type { ChannelPlan, ProductPack } from "../../../lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function etsyPlanFrom(channels: ChannelPlan[]) {
  return channels.find((channel) => channel.channel === "etsy");
}

function readMoney(value: unknown) {
  if (!isRecord(value)) return null;
  const amount = value.amount;
  const divisor = value.divisor;
  if (typeof amount !== "number" || typeof divisor !== "number" || divisor === 0) return null;
  return amount / divisor;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim());
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

async function createVerifiedEtsyDraft(pack: ProductPack, plan: ChannelPlan) {
  if (!plan.draftWriteAllowed) {
    return NextResponse.json(
      {
        error: "ETSY_DRAFT_WRITES_DISABLED",
        candidateFingerprint: plan.candidateFingerprint
      },
      { status: 403 }
    );
  }

  const shopId = Number(process.env.ETSY_SHOP_ID);
  if (!Number.isSafeInteger(shopId) || shopId <= 0) {
    return NextResponse.json({ error: "ETSY_SHOP_ID_NOT_CONFIGURED" }, { status: 503 });
  }

  const accessToken = await getValidEtsyAccessToken();
  const headers = {
    ...etsyApiHeaders(accessToken),
    "content-type": "application/x-www-form-urlencoded"
  };
  const tags = (pack.tags ?? []).map((tag) => tag.trim());

  const body = new URLSearchParams({
    quantity: String(pack.etsy?.quantity),
    title: pack.title.trim(),
    description: pack.description.trim(),
    price: pack.priceUsd.toFixed(2),
    who_made: String(pack.etsy?.whoMade),
    when_made: String(pack.etsy?.whenMade?.trim()),
    taxonomy_id: String(pack.etsy?.taxonomyId),
    tags: tags.join(",")
  });

  const createResponse = await fetch(
    `https://api.etsy.com/v3/application/shops/${shopId}/listings`,
    {
      method: "POST",
      headers,
      body,
      cache: "no-store"
    }
  );
  const created = await parseJson(createResponse);

  if (!createResponse.ok || !isRecord(created) || typeof created.listing_id !== "number") {
    return NextResponse.json(
      {
        error: "ETSY_DRAFT_CREATE_FAILED",
        statusCode: createResponse.status,
        detail: created,
        candidateFingerprint: plan.candidateFingerprint
      },
      { status: 502 }
    );
  }

  const listingId = created.listing_id;
  const typeResponse = await fetch(
    `https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}`,
    {
      method: "PATCH",
      headers,
      body: new URLSearchParams({ type: "download" }),
      cache: "no-store"
    }
  );
  const typeResult = await parseJson(typeResponse);

  if (!typeResponse.ok) {
    return NextResponse.json(
      {
        error: "ETSY_DRAFT_TYPE_UPDATE_FAILED",
        listingId,
        statusCode: typeResponse.status,
        detail: typeResult,
        candidateFingerprint: plan.candidateFingerprint,
        state: "DRAFT_CREATED_PARTIAL"
      },
      { status: 502 }
    );
  }

  const readBackResponse = await fetch(
    `https://api.etsy.com/v3/application/listings/${listingId}`,
    {
      method: "GET",
      headers: etsyApiHeaders(accessToken),
      cache: "no-store"
    }
  );
  const readBack = await parseJson(readBackResponse);

  if (!readBackResponse.ok || !isRecord(readBack)) {
    return NextResponse.json(
      {
        error: "ETSY_DRAFT_READBACK_FAILED",
        listingId,
        statusCode: readBackResponse.status,
        detail: readBack,
        candidateFingerprint: plan.candidateFingerprint
      },
      { status: 502 }
    );
  }

  const readBackTags = normalizeStringArray(readBack.tags);
  const readBackPrice = readMoney(readBack.price);
  const listingType =
    typeof readBack.listing_type === "string"
      ? readBack.listing_type
      : typeof readBack.type === "string"
        ? readBack.type
        : null;

  const checks = {
    state: readBack.state === "draft",
    title: readBack.title === pack.title.trim(),
    description: readBack.description === pack.description.trim(),
    quantity: readBack.quantity === pack.etsy?.quantity,
    taxonomyId: readBack.taxonomy_id === pack.etsy?.taxonomyId,
    whoMade: readBack.who_made === pack.etsy?.whoMade,
    whenMade: readBack.when_made === pack.etsy?.whenMade?.trim(),
    tags: sameStringArray(readBackTags, tags),
    price:
      typeof readBackPrice === "number" && Math.abs(readBackPrice - pack.priceUsd) < 0.005,
    type: listingType === "download"
  };
  const persisted = Object.values(checks).every(Boolean);

  return NextResponse.json(
    {
      status: persisted ? "PERSISTED_DRAFT_VERIFIED" : "PERSISTENCE_MISMATCH",
      listingId,
      candidateFingerprint: plan.candidateFingerprint,
      releaseState: plan.releaseState,
      checks,
      readBack: {
        state: readBack.state,
        title: readBack.title,
        quantity: readBack.quantity,
        taxonomy_id: readBack.taxonomy_id,
        who_made: readBack.who_made,
        when_made: readBack.when_made,
        tags: readBackTags,
        priceUsd: readBackPrice,
        listingType
      },
      liveWritePerformed: false
    },
    { status: persisted ? 201 : 409 }
  );
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const operation = typeof body.operation === "string" ? body.operation : "PLAN";
  const packSource = isRecord(body.product) ? body.product : body;
  const pack = packSource as ProductPack;
  const plan = buildPublishPlan(pack);

  if (plan.status !== "READY") {
    return NextResponse.json(plan, { status: 422 });
  }

  if (operation === "PLAN") {
    return NextResponse.json(plan, { status: 200 });
  }

  if (operation !== "CREATE_ETSY_DRAFT") {
    return NextResponse.json({ error: "UNSUPPORTED_OPERATION" }, { status: 400 });
  }

  const etsyPlan = etsyPlanFrom(plan.channels);
  if (!etsyPlan) {
    return NextResponse.json({ error: "ETSY_CHANNEL_NOT_REQUESTED" }, { status: 422 });
  }

  try {
    return await createVerifiedEtsyDraft(pack, etsyPlan);
  } catch (error) {
    return NextResponse.json(
      {
        error: "ETSY_DRAFT_OPERATION_FAILED",
        detail: error instanceof Error ? error.message : "UNKNOWN"
      },
      { status: 500 }
    );
  }
}
