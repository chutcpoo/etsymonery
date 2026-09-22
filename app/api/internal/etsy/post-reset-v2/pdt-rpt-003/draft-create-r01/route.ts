import { timingSafeEqual } from "node:crypto";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createCandidateFingerprint, createListingFingerprint } from "../../../../../../../lib/candidate-fingerprint";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "../../../../../../../lib/etsy-readback-normalizer";
import { getEtsySellerStateSnapshot } from "../../../../../../../lib/etsy-seller-state-reconciliation";
import { beginOperation, NeonOperationLedgerRepository, recordOperationResult } from "../../../../../../../lib/operation-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = 23582741;
const AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-RPT-003-V1-ETSY-DRAFT-CREATE-R01-20260922 EXACT SCOPE ONLY" as const;
const OPERATION_ID =
  "PDT-RPT-003-V1-ETSY-DRAFT-CREATE-R01-20260922" as const;
const EXECUTION_NONCE =
  "PDT-RPT-003-R01-20260922-NONCE-4F7C9A2D" as const;

const DESCRIPTION = [
  "Rental Property Tracker Excel workbook for small landlords and short-term rental hosts.",
  "",
  "Track rental income, cash expenses, long-term rent status, Airbnb/STR occupancy, and per-property performance in one formula-driven Excel workflow.",
  "",
  "WHAT'S INCLUDED",
  "• 1 SAMPLE Excel workbook with fictional populated data",
  "• 1 CLEAN START Excel workbook for your own records",
  "• 8 tabs in each file: START HERE, PROPERTIES, INCOME, EXPENSES, RENT ROLL, STR OCCUPANCY, ANNUAL SUMMARY, DASHBOARD",
  "",
  "WHAT YOU CAN TRACK",
  "• Up to 20 property records",
  "• Rental income and other cash income",
  "• Cash expenses by category and cash-flow class",
  "• Expected rent vs. actual rent received",
  "• Paid / Partial / Unpaid rent status",
  "• STR available nights and booked nights",
  "• Occupancy %",
  "• Gross booking revenue",
  "• ADR",
  "• Revenue per available night",
  "• Gross income, total cash expenses, and net cash flow",
  "• Simple cash-on-cash return using your own Cash Invested amount",
  "• Annual per-property summary",
  "• Portfolio dashboard with monthly review",
  "",
  "HOW IT WORKS",
  "Register each property once. Enter actual income in the INCOME tab and cash expenses in EXPENSES. RENT ROLL pulls long-term rent received from the income log, while STR OCCUPANCY pulls booking revenue from the same log. Annual Summary and Dashboard calculate review metrics from your entries.",
  "",
  "FORMAT",
  "• Microsoft Excel .xlsx",
  "• No macros",
  "• No VBA",
  "• No external data connections",
  "• Currency: USD",
  "• SAMPLE data is fictional",
  "",
  "IMPORTANT",
  "This workbook is a manual operations and cash-flow tracker. It is not accounting software, tax preparation software, legal advice, accounting advice, tax advice, or investment advice. It does not determine deductibility, calculate depreciation, collect rent, screen tenants, connect to bank feeds, or connect automatically to Airbnb, Vrbo, or property-management systems.",
  "",
  "Google Sheets compatibility has not been verified for the exact final workbook, so this listing does not claim Google Sheets compatibility.",
  "",
  "Digital product. No physical item is shipped.",
  "",
  "AI DISCLOSURE",
  "This digital workbook and listing assets were created with AI-assisted tools under seller direction and were reviewed and tested before release."
].join("\n");

const TAGS = Object.freeze([
  "rental property",
  "landlord tracker",
  "rental spreadsheet",
  "airbnb spreadsheet",
  "property tracker",
  "rental income",
  "expense tracker",
  "landlord excel",
  "airbnb tracker",
  "rental dashboard",
  "property expenses",
  "rent roll tracker",
  "real estate excel"
] as const);

const LISTING = Object.freeze({
  title:
    "Rental Property Tracker Excel | Landlord Income Expense | Airbnb Spreadsheet Dashboard",
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
  productId: "PDT-RPT-003",
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

function runtimeCommit() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? "";
}

function gateEnabled() {
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

function sellerStateFingerprint(
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

function baselineSafe(
  state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
) {
  if (state.total !== state.listings.length) return false;
  return !state.listings.some(
    (item) => (item.title ?? "").normalize("NFC").trim() === LISTING.title
  );
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
    throw new Error("RPT_LISTING_READ_HTTP_" + String(response.status));
  }
  const value = await parseJson(response);
  if (!isRec(value)) throw new Error("RPT_LISTING_READ_INVALID");
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
    throw new Error("RPT_DRAFT_LIST_READ_FAILED");
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
    throw new Error("RPT_DRAFT_COLLISION");
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
    throw new Error("RPT_DRAFT_CREATE_AMBIGUOUS");
  }

  if (response.status >= 500) {
    const reconciled = await exactDraftMatches(token);
    if (reconciled.length === 1) {
      return { listingId: reconciled[0], reconciled: true };
    }
    throw new Error("RPT_DRAFT_CREATE_AMBIGUOUS_" + String(response.status));
  }

  if (!response.ok) {
    throw new Error("RPT_DRAFT_CREATE_REJECTED_" + String(response.status));
  }

  const payload = await parseJson(response);
  const listingId = isRec(payload) ? Number(payload.listing_id) : NaN;
  if (!Number.isSafeInteger(listingId) || listingId <= 0) {
    const reconciled = await exactDraftMatches(token);
    if (reconciled.length === 1) {
      return { listingId: reconciled[0], reconciled: true };
    }
    throw new Error("RPT_DRAFT_CREATE_RECEIPT_INVALID");
  }

  const detail = await fetchListing(token, listingId);
  const identity = verifyEtsyReadBackIdentity(
    LISTING_FINGERPRINT,
    toObservation(detail)
  );
  if (identity.status !== "MATCH" || detail.state !== "draft") {
    throw new Error("RPT_DRAFT_CREATE_READBACK_MISMATCH");
  }

  return { listingId, reconciled: false };
}

async function verifyFinalState(
  token: string,
  listingId: number,
  before: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
) {
  const detail = await fetchListing(token, listingId);
  const identity = verifyEtsyReadBackIdentity(
    LISTING_FINGERPRINT,
    toObservation(detail)
  );
  if (identity.status !== "MATCH" || detail.state !== "draft") {
    throw new Error("RPT_FINAL_LISTING_IDENTITY_MISMATCH");
  }

  const after = await getEtsySellerStateSnapshot({
    shopId: SHOP_ID,
    accessToken: token
  });

  if (
    after.total !== before.total + 1 ||
    after.counts.active !== before.counts.active ||
    after.counts.draft !== before.counts.draft + 1 ||
    after.counts.inactive !== before.counts.inactive ||
    after.counts.sold_out !== before.counts.sold_out ||
    after.counts.expired !== before.counts.expired
  ) {
    throw new Error("RPT_FINAL_SELLER_COUNTS_MISMATCH");
  }

  for (const existing of before.listings) {
    const row = after.listings.find(
      (item) => item.listingId === existing.listingId
    );
    if (
      !row ||
      row.state !== existing.state ||
      row.title !== existing.title
    ) {
      throw new Error(
        "RPT_PROTECTED_LISTING_DRIFT_" + String(existing.listingId)
      );
    }
  }

  const created = after.listings.find((item) => item.listingId === listingId);
  if (
    !created ||
    created.state !== "draft" ||
    created.title !== LISTING.title
  ) {
    throw new Error("RPT_FINAL_DRAFT_STATE_MISMATCH");
  }

  return {
    total: after.total,
    sellerCounts: after.counts,
    listingId,
    listingFingerprint: identity.actualFingerprint
  };
}

function planPayload(
  state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>
) {
  return {
    status: "PLAN_ONLY",
    mode: "PDT_RPT_003_METADATA_ONLY_DRAFT_CREATE_R01",
    operationId: OPERATION_ID,
    productId: "PDT-RPT-003",
    productVersion: "V1.0",
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    listingFingerprint: LISTING_FINGERPRINT,
    baselineSafe: baselineSafe(state),
    protectedStateFingerprint: sellerStateFingerprint(state),
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
    if (!gateEnabled()) throw new Error("RPT_DRAFT_GATE_DISABLED");
    if (process.env.VERCEL_ENV !== "production") {
      throw new Error("RPT_PRODUCTION_RUNTIME_REQUIRED");
    }

    const authorizationText =
      url.searchParams.get("authorizationText")?.normalize("NFC").trim() ?? "";
    if (!secureEqual(authorizationText, AUTHORIZATION_TEXT)) {
      throw new Error("RPT_AUTHORIZATION_INVALID");
    }

    const nonce = url.searchParams.get("nonce")?.trim() ?? "";
    if (!secureEqual(nonce, EXECUTION_NONCE)) {
      throw new Error("RPT_NONCE_INVALID");
    }

    const commit = url.searchParams.get("commit")?.trim().toLowerCase() ?? "";
    const deploymentCommit = runtimeCommit();
    if (
      !/^[a-f0-9]{40}$/.test(commit) ||
      !/^[a-f0-9]{40}$/.test(deploymentCommit) ||
      !secureEqual(commit, deploymentCommit)
    ) {
      throw new Error("RPT_GIT_VERCEL_COMMIT_MISMATCH");
    }

    const suppliedProtectedState =
      url.searchParams.get("protectedStateFingerprint")?.trim().toLowerCase() ?? "";
    if (!/^[a-f0-9]{64}$/.test(suppliedProtectedState)) {
      throw new Error("RPT_PROTECTED_STATE_FINGERPRINT_INVALID");
    }

    const token = await getValidEtsyAccessToken();
    const before = await getEtsySellerStateSnapshot({
      shopId: SHOP_ID,
      accessToken: token
    });

    if (!baselineSafe(before)) {
      return NextResponse.json(
        {
          status: "BLOCKED_FAIL_CLOSED",
          error: "RPT_BASELINE_UNSAFE",
          sellerCounts: before.counts,
          total: before.total,
          listingIds: before.listings.map((item) => item.listingId),
          publishPerformed: false,
          ETSY_WRITE_COUNT: 0
        },
        { status: 409, headers: { "cache-control": "no-store" } }
      );
    }

    const actualProtectedState = sellerStateFingerprint(before);
    if (!secureEqual(actualProtectedState, suppliedProtectedState)) {
      throw new Error("RPT_PROTECTED_STATE_DRIFT");
    }

    const contract = {
      authorizationText: AUTHORIZATION_TEXT,
      operationId: OPERATION_ID,
      productId: "PDT-RPT-003",
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
        { headers: { "cache-control": "no-store" } }
      );
    }
    if (existing) {
      throw new Error("RPT_OPERATION_ALREADY_CLAIMED_DO_NOT_RETRY");
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
          { headers: { "cache-control": "no-store" } }
        );
      }
      throw new Error("RPT_OPERATION_ALREADY_CLAIMED_DO_NOT_RETRY");
    }

    parentStarted = true;
    parentRequestHash = begun.record.requestHash;

    writeAttempts += 1;
    const created = await createDraft(token);
    const verified = await verifyFinalState(token, created.listingId, before);

    const done = await recordOperationResult(
      repository,
      OPERATION_ID,
      parentRequestHash,
      "SUCCEEDED",
      new Date().toISOString(),
      {
        receipt: {
          authorizationText: AUTHORIZATION_TEXT,
          productId: "PDT-RPT-003",
          candidateFingerprint: CANDIDATE_FINGERPRINT,
          listingFingerprint: LISTING_FINGERPRINT,
          protectedStateFingerprint: actualProtectedState,
          deploymentCommit,
          draftListingId: created.listingId,
          reconciled: created.reconciled,
          verified,
          publishPerformed: false,
          ETSY_WRITE_COUNT: writeAttempts
        }
      }
    );

    return NextResponse.json(
      {
        status: "DRAFT_CREATED_METADATA_VERIFIED",
        operationId: done.operationId,
        requestHash: done.requestHash,
        productId: "PDT-RPT-003",
        draftListingId: created.listingId,
        candidateFingerprint: CANDIDATE_FINGERPRINT,
        listingFingerprint: LISTING_FINGERPRINT,
        metadataOnly: true,
        imageCount: 0,
        buyerFileCount: 0,
        verified,
        publishPerformed: false,
        ETSY_WRITE_COUNT: writeAttempts
      },
      { headers: { "cache-control": "no-store" } }
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
        publishPerformed: false,
        ETSY_WRITE_COUNT: writeAttempts
      },
      {
        status: parentStarted ? 202 : 409,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}
