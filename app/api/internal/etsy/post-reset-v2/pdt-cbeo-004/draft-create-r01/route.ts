import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createCandidateFingerprint, createListingFingerprint } from "../../../../../../../lib/candidate-fingerprint";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "../../../../../../../lib/etsy-readback-normalizer";
import { getEtsySellerStateSnapshot } from "../../../../../../../lib/etsy-seller-state-reconciliation";
import {
  beginOperation,
  NeonOperationLedgerRepository,
  recordOperationResult
} from "../../../../../../../lib/operation-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = 23582741;
const AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-CBEO-004-V1-ETSY-DRAFT-CREATE-R01-20260922 EXACT SCOPE ONLY" as const;
const OPERATION_ID =
  "PDT-CBEO-004-V1-ETSY-DRAFT-CREATE-R01-20260922" as const;
const NONCE_SHA256 =
  "2196de67ec0070102901fc9069743dce8ebb4dfd11c6c471dd9588725519be0e" as const;

const EXISTING = Object.freeze([
  {
    listingId: 4579068925,
    state: "active",
    title: "Recipe Cost Calculator | Restaurant Food Cost & Menu Pricing Excel Template"
  },
  {
    listingId: 4578945050,
    state: "active",
    title:
      "Invoice Payment Tracker Excel | Accounts Receivable Aging & Follow-Up Spreadsheet for Small Business"
  },
  {
    listingId: 4579470012,
    state: "draft",
    title: "Bar Inventory Spreadsheet | Liquor Stock & Pour Cost Tracker"
  }
] as const);

const DESCRIPTION = [
  "This Excel-based Banquet Event Order template helps independent caterers organize event details, menu and service items, staffing and equipment requirements, payments, and a BEO-style operational summary in one connected workbook.",
  "",
  "WHAT YOU GET",
  "• 1 SAMPLE workbook with fictional demonstration data",
  "• 1 CLEAN START workbook for your own events",
  "• Microsoft Excel .xlsx files",
  "• 8 connected tabs:",
  "  01 START HERE",
  "  02 EVENTS",
  "  03 EVENT DETAILS",
  "  04 MENU & SERVICES",
  "  05 STAFF & EQUIPMENT",
  "  06 PAYMENTS",
  "  07 BEO OUTPUT",
  "  08 DASHBOARD",
  "",
  "WHAT IT HELPS YOU TRACK",
  "• Client and event details",
  "• Event date, venue, guest count, service times, and status",
  "• Menu and service line items",
  "• Staff, equipment, rental, and AV requirements",
  "• User-entered tax, service fee, and deposit settings",
  "• Deposits, payments, refunds, net paid, and balance due",
  "• A selectable BEO-style operational event summary",
  "• Upcoming events and practical dashboard rollups",
  "",
  "HOW IT WORKS",
  "Create a unique Event ID, enter the event facts, add menu/service items, record operational requirements and payment activity, then select the Event ID in the BEO OUTPUT tab. The workbook pulls the connected records into one readable event-order summary and rolls current records into the dashboard.",
  "",
  "GOOD FIT FOR",
  "• Independent caterers and small catering companies",
  "• Restaurant operators with catering or private-event service",
  "• Small banquet/event teams managing food-service-led events",
  "• Private chefs managing multi-detail catered events",
  "",
  "IMPORTANT PRODUCT BOUNDARIES",
  "• Built and tested for Microsoft Excel desktop",
  "• Google Sheets compatibility is not claimed in V1",
  "• Manual data entry; no CRM, POS, calendar, email, accounting, or payment integrations",
  "• Does not process or transmit payments",
  "• Staff/equipment sections track requirements only; they are not scheduling or inventory systems",
  "• Tax and service-fee calculations use rates entered by the user and do not provide tax advice",
  "• BEO OUTPUT is an operational summary, not a legal contract, invoice, e-signature document, or payment-processing system",
  "",
  "Digital product. No physical item is shipped.",
  "",
  "AI DISCLOSURE",
  "This digital workbook was created with AI-assisted tools under seller direction and was reviewed and tested before release."
].join("\n");

const TAGS = Object.freeze([
  "banquet event order",
  "catering event form",
  "catering planner",
  "BEO template",
  "catering spreadsheet",
  "event order template",
  "banquet order form",
  "catering workflow",
  "event detail tracker",
  "deposit tracker",
  "event service sheet",
  "private chef planner",
  "catering excel"
] as const);

const LISTING = Object.freeze({
  title:
    "Banquet Event Order Template | Catering BEO & Event Tracker | Excel Spreadsheet",
  description: DESCRIPTION,
  priceUsd: 9.99,
  tags: [...TAGS],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2026",
  taxonomy_id: 12476,
  type: "download",
  state: "draft"
});

const LISTING_FINGERPRINT = createListingFingerprint(LISTING);
const CANDIDATE_FINGERPRINT = createCandidateFingerprint({
  operationId: OPERATION_ID,
  productId: "PDT-CBEO-004",
  productVersion: "V1.0",
  scope: "METADATA_ONLY_DRAFT_CREATE",
  listing: LISTING,
  publishAuthorized: false,
  imageUploadAuthorized: false,
  buyerFileUploadAuthorized: false
});

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseJson(response: Response) {
  const body = await response.text();
  if (!body) return {};
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return {};
  }
}

function records(value: unknown) {
  return isRec(value) && Array.isArray(value.results)
    ? value.results.filter(isRec)
    : null;
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function nonceOk(value: string) {
  const actual = createHash("sha256").update(value, "utf8").digest("hex");
  return secureEqual(actual, NONCE_SHA256);
}

function runtimeCommit() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? "";
}

function gateEnabled() {
  // R01 was consumed by the one Etsy draft-create attempt on 2026-09-22.
  // Keep PLAN/readback available, but fail closed for any further execute request.
  return false;
}

function toObservation(value: Rec): EtsyReadBackObservation {
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

function baselineMatches(
  state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
) {
  if (
    state.total !== 3 ||
    state.counts.active !== 2 ||
    state.counts.draft !== 1 ||
    state.counts.inactive !== 0 ||
    state.counts.sold_out !== 0 ||
    state.counts.expired !== 0 ||
    state.listings.length !== 3
  ) {
    return false;
  }

  for (const expected of EXISTING) {
    const row = state.listings.find((item) => item.listingId === expected.listingId);
    if (
      !row ||
      row.state !== expected.state ||
      row.title !== expected.title
    ) {
      return false;
    }
  }

  return !state.listings.some((item) => item.title === LISTING.title);
}

function protectedFingerprint(
  state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
) {
  const payload = JSON.stringify({
    operationId: OPERATION_ID,
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    listingFingerprint: LISTING_FINGERPRINT,
    counts: state.counts,
    listings: state.listings
      .map((item) => ({
        listingId: item.listingId,
        state: item.state,
        title: item.title
      }))
      .sort((a, b) => a.listingId - b.listingId)
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

async function fetchListing(token: string, listingId: number) {
  const response = await fetch(
    "https://api.etsy.com/v3/application/listings/" + String(listingId),
    {
      method: "GET",
      headers: etsyApiHeaders(token),
      cache: "no-store"
    }
  );
  if (!response.ok) {
    throw new Error("CBEO_LISTING_READ_HTTP_" + String(response.status));
  }
  const value = await parseJson(response);
  if (!isRec(value)) throw new Error("CBEO_LISTING_READ_INVALID");
  return value;
}

async function exactDraftMatches(token: string) {
  const response = await fetch(
    "https://api.etsy.com/v3/application/shops/" +
      String(SHOP_ID) +
      "/listings?state=draft&limit=100",
    {
      method: "GET",
      headers: etsyApiHeaders(token),
      cache: "no-store"
    }
  );
  const value = await parseJson(response);
  const rows = records(value);
  if (!response.ok || !rows) {
    throw new Error("CBEO_DRAFT_LIST_READ_FAILED");
  }

  const matches: number[] = [];
  for (const row of rows) {
    const listingId = Number(row.listing_id);
    if (!Number.isSafeInteger(listingId) || listingId <= 0) continue;
    const detail = await fetchListing(token, listingId);
    const identity = verifyEtsyReadBackIdentity(
      LISTING_FINGERPRINT,
      toObservation(detail)
    );
    if (identity.status === "MATCH" && detail.state === "draft") {
      matches.push(listingId);
    }
  }
  return matches;
}

async function createDraft(token: string) {
  if ((await exactDraftMatches(token)).length !== 0) {
    throw new Error("CBEO_DRAFT_COLLISION");
  }

  const body = new URLSearchParams({
    quantity: String(LISTING.quantity),
    title: LISTING.title,
    description: LISTING.description,
    price: LISTING.priceUsd.toFixed(2),
    who_made: LISTING.who_made,
    when_made: LISTING.when_made,
    taxonomy_id: String(LISTING.taxonomy_id),
    type: LISTING.type,
    tags: LISTING.tags.join(",")
  });

  let response: Response;
  try {
    response = await fetch(
      "https://api.etsy.com/v3/application/shops/" +
        String(SHOP_ID) +
        "/listings",
      {
        method: "POST",
        headers: {
          ...etsyApiHeaders(token),
          "content-type": "application/x-www-form-urlencoded"
        },
        body,
        cache: "no-store"
      }
    );
  } catch {
    const reconciled = await exactDraftMatches(token);
    if (reconciled.length === 1) {
      return { listingId: reconciled[0], reconciled: true };
    }
    throw new Error("CBEO_DRAFT_CREATE_AMBIGUOUS");
  }

  if (response.status >= 500) {
    const reconciled = await exactDraftMatches(token);
    if (reconciled.length === 1) {
      return { listingId: reconciled[0], reconciled: true };
    }
    throw new Error("CBEO_DRAFT_CREATE_AMBIGUOUS_" + String(response.status));
  }

  if (!response.ok) {
    throw new Error("CBEO_DRAFT_CREATE_REJECTED_" + String(response.status));
  }

  const payload = await parseJson(response);
  const listingId = isRec(payload) ? Number(payload.listing_id) : NaN;
  if (!Number.isSafeInteger(listingId) || listingId <= 0) {
    const reconciled = await exactDraftMatches(token);
    if (reconciled.length === 1) {
      return { listingId: reconciled[0], reconciled: true };
    }
    throw new Error("CBEO_DRAFT_CREATE_RECEIPT_INVALID");
  }

  const detail = await fetchListing(token, listingId);
  const identity = verifyEtsyReadBackIdentity(
    LISTING_FINGERPRINT,
    toObservation(detail)
  );
  if (identity.status !== "MATCH" || detail.state !== "draft") {
    throw new Error("CBEO_DRAFT_CREATE_READBACK_MISMATCH");
  }

  return { listingId, reconciled: false };
}

async function verifyFinalState(token: string, listingId: number) {
  const detail = await fetchListing(token, listingId);
  const identity = verifyEtsyReadBackIdentity(
    LISTING_FINGERPRINT,
    toObservation(detail)
  );
  if (identity.status !== "MATCH" || detail.state !== "draft") {
    throw new Error("CBEO_FINAL_LISTING_IDENTITY_MISMATCH");
  }

  const seller = await getEtsySellerStateSnapshot({
    shopId: SHOP_ID,
    accessToken: token
  });

  if (
    seller.total !== 4 ||
    seller.counts.active !== 2 ||
    seller.counts.draft !== 2 ||
    seller.counts.inactive !== 0 ||
    seller.counts.sold_out !== 0 ||
    seller.counts.expired !== 0
  ) {
    throw new Error("CBEO_FINAL_SELLER_COUNTS_MISMATCH");
  }

  for (const expected of EXISTING) {
    const row = seller.listings.find((item) => item.listingId === expected.listingId);
    if (
      !row ||
      row.state !== expected.state ||
      row.title !== expected.title
    ) {
      throw new Error("CBEO_PROTECTED_LISTING_DRIFT_" + String(expected.listingId));
    }
  }

  const created = seller.listings.find((item) => item.listingId === listingId);
  if (
    !created ||
    created.state !== "draft" ||
    created.title !== LISTING.title
  ) {
    throw new Error("CBEO_FINAL_DRAFT_STATE_MISMATCH");
  }

  return {
    sellerCounts: seller.counts,
    total: seller.total,
    listingId,
    listingFingerprint: identity.actualFingerprint
  };
}

function planPayload(
  state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
) {
  return {
    status: "PLAN_ONLY",
    mode: "PDT_CBEO_004_METADATA_ONLY_DRAFT_CREATE_R01",
    operationId: OPERATION_ID,
    productId: "PDT-CBEO-004",
    productVersion: "V1.0",
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    listingFingerprint: LISTING_FINGERPRINT,
    baselineMatches: baselineMatches(state),
    protectedStateFingerprint: protectedFingerprint(state),
    sellerCounts: state.counts,
    total: state.total,
    listingIds: state.listings.map((item) => item.listingId),
    priceUsd: LISTING.priceUsd,
    quantity: LISTING.quantity,
    taxonomyId: LISTING.taxonomy_id,
    metadataOnly: true,
    imageUploadAuthorized: false,
    buyerFileUploadAuthorized: false,
    publishAuthorized: false,
    authorizationRequired: AUTHORIZATION_TEXT,
    deploymentCommit: runtimeCommit(),
    ETSY_WRITE_COUNT: 0
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.get("action") !== "execute_relay") {
    try {
      const token = await getValidEtsyAccessToken();
      const seller = await getEtsySellerStateSnapshot({
        shopId: SHOP_ID,
        accessToken: token
      });
      return NextResponse.json(planPayload(seller), {
        headers: { "cache-control": "no-store" }
      });
    } catch (error) {
      return NextResponse.json(
        {
          status: "PLAN_BLOCKED",
          error: error instanceof Error ? error.message : "UNKNOWN",
          ETSY_WRITE_COUNT: 0
        },
        {
          status: 409,
          headers: { "cache-control": "no-store" }
        }
      );
    }
  }

  let writeAttempts = 0;
  const repository = new NeonOperationLedgerRepository();
  let parentStarted = false;
  let parentRequestHash = "";

  try {
    if (!gateEnabled()) {
      throw new Error("CBEO_DRAFT_GATE_DISABLED");
    }

    if (process.env.VERCEL_ENV !== "production") {
      throw new Error("CBEO_PRODUCTION_RUNTIME_REQUIRED");
    }

    const authorizationText =
      url.searchParams.get("authorizationText")?.normalize("NFC").trim() ?? "";
    if (!secureEqual(authorizationText, AUTHORIZATION_TEXT)) {
      throw new Error("CBEO_AUTHORIZATION_INVALID");
    }

    const nonce = url.searchParams.get("nonce")?.trim() ?? "";
    if (!nonce || !nonceOk(nonce)) {
      throw new Error("CBEO_NONCE_INVALID");
    }

    const commit = url.searchParams.get("commit")?.trim().toLowerCase() ?? "";
    const deploymentCommit = runtimeCommit();
    if (
      !/^[a-f0-9]{40}$/.test(commit) ||
      !/^[a-f0-9]{40}$/.test(deploymentCommit) ||
      !secureEqual(commit, deploymentCommit)
    ) {
      throw new Error("CBEO_GIT_VERCEL_COMMIT_MISMATCH");
    }

    const suppliedProtectedState =
      url.searchParams.get("protectedStateFingerprint")?.trim().toLowerCase() ?? "";
    if (!/^[a-f0-9]{64}$/.test(suppliedProtectedState)) {
      throw new Error("CBEO_PROTECTED_STATE_FINGERPRINT_INVALID");
    }

    const token = await getValidEtsyAccessToken();
    const before = await getEtsySellerStateSnapshot({
      shopId: SHOP_ID,
      accessToken: token
    });

    if (!baselineMatches(before)) {
      return NextResponse.json(
        {
          status: "BLOCKED_FAIL_CLOSED",
          error: "CBEO_BASELINE_MISMATCH",
          sellerCounts: before.counts,
          total: before.total,
          listingIds: before.listings.map((item) => item.listingId),
          publishPerformed: false,
          ETSY_WRITE_COUNT: 0
        },
        {
          status: 409,
          headers: { "cache-control": "no-store" }
        }
      );
    }

    const actualProtectedState = protectedFingerprint(before);
    if (!secureEqual(actualProtectedState, suppliedProtectedState)) {
      throw new Error("CBEO_PROTECTED_STATE_DRIFT");
    }

    const contract = {
      authorizationText: AUTHORIZATION_TEXT,
      operationId: OPERATION_ID,
      productId: "PDT-CBEO-004",
      productVersion: "V1.0",
      candidateFingerprint: CANDIDATE_FINGERPRINT,
      listingFingerprint: LISTING_FINGERPRINT,
      protectedStateFingerprint: actualProtectedState,
      deploymentCommit,
      scope: "METADATA_ONLY_DRAFT_CREATE",
      priceUsd: LISTING.priceUsd,
      quantity: LISTING.quantity,
      taxonomyId: LISTING.taxonomy_id,
      imageUploadAuthorized: false,
      buyerFileUploadAuthorized: false,
      publishAuthorized: false
    };

    const existing = await repository.load(OPERATION_ID);
    if (existing?.status === "SUCCEEDED") {
      return NextResponse.json(
        {
          status: "REPLAY",
          operationId: existing.operationId,
          requestHash: existing.requestHash,
          receipt: existing.receipt,
          publishPerformed: false,
          ETSY_WRITE_COUNT: 0
        },
        {
          headers: { "cache-control": "no-store" }
        }
      );
    }
    if (existing) {
      throw new Error("CBEO_OPERATION_ALREADY_CLAIMED_DO_NOT_RETRY");
    }

    const begun = await beginOperation(
      repository,
      OPERATION_ID,
      contract,
      new Date().toISOString()
    );
    if (begun.status === "REPLAY") {
      if (begun.record.status === "SUCCEEDED") {
        return NextResponse.json(
          {
            status: "REPLAY",
            operationId: begun.record.operationId,
            requestHash: begun.record.requestHash,
            receipt: begun.record.receipt,
            publishPerformed: false,
            ETSY_WRITE_COUNT: 0
          },
          {
            headers: { "cache-control": "no-store" }
          }
        );
      }
      throw new Error("CBEO_OPERATION_ALREADY_CLAIMED_DO_NOT_RETRY");
    }

    parentStarted = true;
    parentRequestHash = begun.record.requestHash;

    writeAttempts += 1;
    const created = await createDraft(token);
    const verified = await verifyFinalState(token, created.listingId);

    const done = await recordOperationResult(
      repository,
      OPERATION_ID,
      parentRequestHash,
      "SUCCEEDED",
      new Date().toISOString(),
      {
        receipt: {
          authorizationText: AUTHORIZATION_TEXT,
          productId: "PDT-CBEO-004",
          candidateFingerprint: CANDIDATE_FINGERPRINT,
          listingFingerprint: LISTING_FINGERPRINT,
          protectedStateFingerprint: actualProtectedState,
          deploymentCommit,
          draftListingId: created.listingId,
          reconciled: created.reconciled,
          scope: "METADATA_ONLY_DRAFT_CREATE",
          imageUploadPerformed: false,
          buyerFileUploadPerformed: false,
          publishPerformed: false,
          verified,
          ETSY_WRITE_COUNT: writeAttempts
        }
      }
    );

    return NextResponse.json(
      {
        status: "DRAFT_CREATED_AND_PERSISTENCE_VERIFIED",
        mode: "PDT_CBEO_004_METADATA_ONLY_DRAFT_CREATE_R01",
        operationId: done.operationId,
        requestHash: done.requestHash,
        draftListingId: created.listingId,
        candidateFingerprint: CANDIDATE_FINGERPRINT,
        listingFingerprint: LISTING_FINGERPRINT,
        metadataOnly: true,
        imageUploadPerformed: false,
        buyerFileUploadPerformed: false,
        publishPerformed: false,
        verified,
        ETSY_WRITE_COUNT: writeAttempts
      },
      {
        headers: { "cache-control": "no-store" }
      }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";

    if (parentStarted && parentRequestHash) {
      try {
        await recordOperationResult(
          repository,
          OPERATION_ID,
          parentRequestHash,
          "RECONCILIATION_REQUIRED",
          new Date().toISOString(),
          {
            recoveryPoint: code,
            receipt: {
              metadataOnly: true,
              imageUploadPerformed: false,
              buyerFileUploadPerformed: false,
              publishPerformed: false,
              ETSY_WRITE_COUNT: writeAttempts
            }
          }
        );
      } catch {
        // Preserve original fail-closed error.
      }
    }

    return NextResponse.json(
      {
        status: parentStarted
          ? "RECONCILIATION_REQUIRED"
          : "BLOCKED_FAIL_CLOSED",
        error: code,
        operationId: OPERATION_ID,
        metadataOnly: true,
        imageUploadPerformed: false,
        buyerFileUploadPerformed: false,
        publishPerformed: false,
        ETSY_WRITE_COUNT: writeAttempts
      },
      {
        status: parentStarted ? 202 : 400,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
