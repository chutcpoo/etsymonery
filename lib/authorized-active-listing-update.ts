import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { etsyApiHeaders } from "./etsy";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "./etsy-readback-normalizer";

const WRITE_HEADER = "x-autodigitalpublisher-write-token";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function bodyString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  return value.map((item) => item.normalize("NFC").trim());
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

function validateWriteAuthorization(request: Request) {
  const expected = process.env.ETSY_DRAFT_WRITE_TOKEN?.trim();
  if (!expected) return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_AUTH_NOT_CONFIGURED" }, { status: 503 });
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  if (!supplied || !secureEqual(supplied, expected)) {
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_UNAUTHORIZED" }, { status: 401 });
  }
  return null;
}

export type AuthorizedActiveUpdateRuntime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
};

export async function handleAuthorizedActiveListingUpdate(
  body: Record<string, unknown>,
  request: Request,
  runtime: AuthorizedActiveUpdateRuntime = {}
) {
  if (process.env.PUBLISH_WRITES_ENABLED !== "true") {
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_WRITES_DISABLED" }, { status: 403 });
  }
  const authError = validateWriteAuthorization(request);
  if (authError) return authError;

  const operationId = bodyString(body, "operationId");
  const buildId = bodyString(body, "buildId");
  const buildFreezeSha256 = bodyString(body, "buildFreezeSha256").toLowerCase();
  const acceptanceCriteriaSha256 = bodyString(body, "acceptanceCriteriaSha256").toLowerCase();
  const candidateFingerprint = bodyString(body, "candidateFingerprint").toLowerCase();
  const expectedBeforeListingFingerprint = bodyString(body, "expectedBeforeListingFingerprint").toLowerCase();
  const expectedAfterListingFingerprint = bodyString(body, "expectedAfterListingFingerprint").toLowerCase();
  const shopId = bodyString(body, "shopId");
  const listingId = bodyString(body, "listingId");
  const channel = bodyString(body, "channel");
  const patch = isRecord(body.patch) ? body.patch : null;

  const sha = /^[a-f0-9]{64}$/;
  if (!operationId || !buildId || !sha.test(buildFreezeSha256) || !sha.test(acceptanceCriteriaSha256) || !sha.test(candidateFingerprint) || !sha.test(expectedBeforeListingFingerprint) || !sha.test(expectedAfterListingFingerprint) || !/^\d+$/.test(shopId) || !/^\d+$/.test(listingId) || channel !== "etsy" || !patch) {
    return NextResponse.json({ error: "INVALID_AUTHORIZED_ACTIVE_UPDATE_INPUT" }, { status: 400 });
  }

  const configuredShopId = process.env.ETSY_SHOP_ID?.trim() ?? "";
  if (!configuredShopId || shopId !== configuredShopId) {
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_SHOP_MISMATCH" }, { status: 409 });
  }

  const title = typeof patch.title === "string" ? patch.title.normalize("NFC").trim() : null;
  const description = typeof patch.description === "string" ? patch.description.normalize("NFC").trim() : null;
  const priceUsd = typeof patch.priceUsd === "number" && Number.isFinite(patch.priceUsd) && patch.priceUsd >= 0 ? patch.priceUsd : null;
  const quantity = typeof patch.quantity === "number" && Number.isSafeInteger(patch.quantity) && patch.quantity >= 0 ? patch.quantity : null;
  const taxonomyId = typeof patch.taxonomyId === "number" && Number.isSafeInteger(patch.taxonomyId) && patch.taxonomyId > 0 ? patch.taxonomyId : null;
  const whoMade = typeof patch.whoMade === "string" ? patch.whoMade.normalize("NFC").trim() : null;
  const whenMade = typeof patch.whenMade === "string" ? patch.whenMade.normalize("NFC").trim() : null;
  const tags = normalizeStringArray(patch.tags);

  if (!title || !description || priceUsd === null || quantity === null || taxonomyId === null || !whoMade || !whenMade || !tags) {
    return NextResponse.json({ error: "INVALID_ACTIVE_UPDATE_PATCH" }, { status: 400 });
  }

  const fetchImpl = runtime.fetchImpl ?? fetch;
  const getAccessToken = runtime.getAccessToken ?? getValidEtsyAccessToken;
  const accessToken = await getAccessToken();
  const readUrl = `https://api.etsy.com/v3/application/listings/${encodeURIComponent(listingId)}`;
  const patchUrl = `https://api.etsy.com/v3/application/shops/${encodeURIComponent(shopId)}/listings/${encodeURIComponent(listingId)}`;

  const beforeResponse = await fetchImpl(readUrl, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" });
  const before = await parseJson(beforeResponse);
  if (!beforeResponse.ok || !isRecord(before)) {
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_PREREAD_FAILED", statusCode: beforeResponse.status }, { status: 502 });
  }
  if (String(before.state ?? "").toLowerCase() !== "active") {
    return NextResponse.json({ error: "ETSY_TARGET_NOT_ACTIVE" }, { status: 409 });
  }

  const beforeIdentity = verifyEtsyReadBackIdentity(expectedBeforeListingFingerprint, { ...toObservation(before), state: "draft" });
  if (beforeIdentity.status !== "MATCH") {
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_PREIDENTITY_MISMATCH", operationId, buildId, beforeIdentity }, { status: 409 });
  }

  const patchBody = new URLSearchParams({
    title,
    description,
    price: priceUsd.toFixed(2),
    quantity: String(quantity),
    taxonomy_id: String(taxonomyId),
    who_made: whoMade,
    when_made: whenMade,
    type: "download",
    tags: tags.join(",")
  });

  const updateResponse = await fetchImpl(patchUrl, {
    method: "PATCH",
    headers: { ...etsyApiHeaders(accessToken), "content-type": "application/x-www-form-urlencoded" },
    body: patchBody,
    cache: "no-store"
  });
  const updateResult = await parseJson(updateResponse);
  if (!updateResponse.ok) {
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_REJECTED", statusCode: updateResponse.status, detail: updateResult, operationId, buildId }, { status: 502 });
  }

  const afterResponse = await fetchImpl(readUrl, { method: "GET", headers: etsyApiHeaders(accessToken), cache: "no-store" });
  const after = await parseJson(afterResponse);
  if (!afterResponse.ok || !isRecord(after)) {
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_POSTREAD_FAILED", statusCode: afterResponse.status, operationId, buildId }, { status: 502 });
  }
  if (String(after.state ?? "").toLowerCase() !== "active") {
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_STATE_MISMATCH", operationId, buildId }, { status: 409 });
  }

  const afterIdentity = verifyEtsyReadBackIdentity(expectedAfterListingFingerprint, { ...toObservation(after), state: "draft" });
  if (afterIdentity.status !== "MATCH") {
    return NextResponse.json({ error: "ETSY_ACTIVE_UPDATE_POSTIDENTITY_MISMATCH", operationId, buildId, afterIdentity }, { status: 409 });
  }

  return NextResponse.json({
    operation: "UPDATE_ACTIVE_LISTING",
    status: "UPDATED_AND_VERIFIED",
    operationId,
    buildId,
    buildFreezeSha256,
    acceptanceCriteriaSha256,
    candidateFingerprint,
    expectedBeforeListingFingerprint,
    expectedAfterListingFingerprint,
    shopId,
    listingId,
    channel,
    beforeIdentity,
    afterIdentity,
    providerReceipt: { updateStatusCode: updateResponse.status, readBackStatusCode: afterResponse.status }
  });
}
