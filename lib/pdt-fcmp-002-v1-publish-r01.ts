import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  executeAuthorizedPublishTransaction,
  type PublishedReceipt
} from "./authorized-publish-transaction";
import { EtsyAuthorizedPublishProvider } from "./etsy-authorized-publish-provider";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { fetchEtsyReadWithRetry } from "./etsy-http";
import { etsyApiHeaders } from "./etsy";
import { getEtsySellerStateSnapshot } from "./etsy-seller-state-reconciliation";
import {
  verifyEtsyReadBackIdentity,
  type EtsyReadBackObservation
} from "./etsy-readback-normalizer";
import {
  MemoryOperationLedgerRepository,
  NeonOperationLedgerRepository,
  type OperationLedgerRepository
} from "./operation-ledger";
import {
  createPublishAuthorization
} from "./publish-authorization";
import {
  assertPdtFcmp002V1ManifestFrozen,
  PDT_FCMP_002_V1_LISTING_FINGERPRINT,
  PDT_FCMP_002_V1_LISTING_IDENTITY
} from "./pdt-fcmp-002-v1-manifest";
import {
  assertPdtFcmp002V1RecoveryManifestFrozen,
  PDT_FCMP_002_V1_DRAFT_LISTING_ID,
  PDT_FCMP_002_V1_EXPECTED_GALLERY_IMAGE_IDS,
  PDT_FCMP_002_V1_LIVE_LISTING_ID,
  PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
  PDT_FCMP_002_V1_RECOVERY_CANDIDATE_ID,
  PDT_FCMP_002_V1_RECOVERY_FILE
} from "./pdt-fcmp-002-v1-recovery-manifest";
import {
  assertPdtIpt001V2ManifestFrozen,
  PDT_IPT_001_V2_LISTING_FINGERPRINT,
  PDT_IPT_001_V2_LISTING_IDENTITY
} from "./pdt-ipt-001-v2-manifest";

export const PDT_FCMP_002_V1_PUBLISH_R01_OPERATION_ID =
  "PDT-FCMP-002-V1-ETSY-PUBLISH-R01" as const;
export const PDT_FCMP_002_V1_PUBLISH_R01_AUTHORIZATION_ID =
  "PDT-FCMP-002-V1-ETSY-PUBLISH-R01-AUTH-20260921-01" as const;
export const PDT_FCMP_002_V1_PUBLISH_R01_AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-FCMP-002-V1-ETSY-PUBLISH-R01-20260921 EXACT SCOPE ONLY" as const;
export const PDT_FCMP_002_V1_PUBLISH_R01_PRODUCT_ID = "PDT-FCMP-002" as const;
export const PDT_FCMP_002_V1_PUBLISH_R01_SHOP_ID = 23582741 as const;

const WRITE_HEADER = "x-autodigitalpublisher-write-token";
const PUBLISH_R01_ONE_TIME_TOKEN_SHA256 =
  "0e0d80ca5c8cd4c94088e5fd9bb285b1af58f2ae16028bfa601b197ef5fbbade";
const ALLOWED_FIELDS = new Set([
  "authorizationText",
  "operationId",
  "productId",
  "shopId",
  "draftListingId",
  "candidateFingerprint",
  "listingFingerprint"
]);

type Rec = Record<string, unknown>;

export type PdtFcmp002V1PublishR01Runtime = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  repository?: OperationLedgerRepository;
  now?: () => string;
};

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizedString(value: unknown) {
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
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

function exactPriceUsd(value: unknown) {
  if (!isRec(value)) return false;
  const amount = Number(value.amount);
  const divisor = Number(value.divisor);
  return (
    Number.isFinite(amount) &&
    Number.isFinite(divisor) &&
    divisor > 0 &&
    Number((amount / divisor).toFixed(2)) === 9.99 &&
    normalizedString(value.currency_code).toUpperCase() === "USD"
  );
}

function resultRecords(value: Rec, code: string) {
  if (!Array.isArray(value.results) || !value.results.every(isRec)) {
    throw new Error(code);
  }
  return value.results;
}

function exactGallery(results: Rec[]) {
  if (results.length !== PDT_FCMP_002_V1_EXPECTED_GALLERY_IMAGE_IDS.length) {
    return false;
  }
  const ordered = [...results].sort(
    (left, right) => (integer(left.rank) ?? 0) - (integer(right.rank) ?? 0)
  );
  return ordered.every(
    (image, index) =>
      integer(image.rank) === index + 1 &&
      integer(image.listing_image_id) ===
        PDT_FCMP_002_V1_EXPECTED_GALLERY_IMAGE_IDS[index]
  );
}

function exactBuyerFile(results: Rec[]) {
  if (results.length !== 1) return false;
  const file = results[0];
  return (
    normalizedString(file.filename) === PDT_FCMP_002_V1_RECOVERY_FILE.fileName &&
    integer(file.size_bytes) === PDT_FCMP_002_V1_RECOVERY_FILE.sizeBytes
  );
}

function exactListingIds(values: number[]) {
  return (
    values.length === 2 &&
    values[0] === PDT_FCMP_002_V1_LIVE_LISTING_ID &&
    values[1] === PDT_FCMP_002_V1_DRAFT_LISTING_ID
  );
}

function exactSellerState(
  snapshot: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>,
  targetState: "draft" | "active"
) {
  const target = snapshot.listings.find(
    (listing) => listing.listingId === PDT_FCMP_002_V1_DRAFT_LISTING_ID
  );
  const protectedListing = snapshot.listings.find(
    (listing) => listing.listingId === PDT_FCMP_002_V1_LIVE_LISTING_ID
  );
  const listingIds = snapshot.listings
    .map((listing) => listing.listingId)
    .sort((left, right) => left - right);
  const expectedActive = targetState === "draft" ? 1 : 2;
  const expectedDraft = targetState === "draft" ? 1 : 0;
  return (
    snapshot.shopId === PDT_FCMP_002_V1_PUBLISH_R01_SHOP_ID &&
    snapshot.total === 2 &&
    snapshot.counts.active === expectedActive &&
    snapshot.counts.draft === expectedDraft &&
    snapshot.counts.inactive === 0 &&
    snapshot.counts.sold_out === 0 &&
    snapshot.counts.expired === 0 &&
    exactListingIds(listingIds) &&
    target?.shopId === PDT_FCMP_002_V1_PUBLISH_R01_SHOP_ID &&
    target.state === targetState &&
    target.title === PDT_FCMP_002_V1_LISTING_IDENTITY.title &&
    protectedListing?.shopId === PDT_FCMP_002_V1_PUBLISH_R01_SHOP_ID &&
    protectedListing.state === "active" &&
    protectedListing.title === PDT_IPT_001_V2_LISTING_IDENTITY.title
  );
}

class PdtFcmp002V1PublishR01Provider {
  private readonly fetchImpl: typeof fetch;
  private readonly getAccessToken: () => Promise<string>;
  private accessToken: string | null = null;
  private verifiedDraft: EtsyReadBackObservation | null = null;
  ETSY_WRITE_COUNT = 0;

  constructor(runtime: PdtFcmp002V1PublishR01Runtime = {}) {
    this.fetchImpl = runtime.fetchImpl ?? fetch;
    this.getAccessToken = runtime.getAccessToken ?? getValidEtsyAccessToken;
  }

  private async token() {
    if (!this.accessToken) this.accessToken = await this.getAccessToken();
    return this.accessToken;
  }

  private async fetchRecord(url: string, code: string) {
    const response = await fetchEtsyReadWithRetry(
      this.fetchImpl,
      url,
      {
        method: "GET",
        headers: etsyApiHeaders(await this.token()),
        cache: "no-store"
      }
    );
    if (!response.ok) throw new Error(`${code}_HTTP_${response.status}`);
    const value = await parseJson(response);
    if (!isRec(value)) throw new Error(`${code}_INVALID`);
    return value;
  }

  private async readExactState(targetState: "draft" | "active") {
    const targetId = PDT_FCMP_002_V1_DRAFT_LISTING_ID;
    const target = await this.fetchRecord(
      `https://api.etsy.com/v3/application/listings/${targetId}`,
      "PDT_FCMP_002_PUBLISH_R01_LISTING"
    );
    if (
      integer(target.listing_id) !== targetId ||
      integer(target.shop_id) !== PDT_FCMP_002_V1_PUBLISH_R01_SHOP_ID
    ) {
      throw new Error("PDT_FCMP_002_PUBLISH_R01_LISTING_OR_SHOP_MISMATCH");
    }
    if (normalizedString(target.state).toLowerCase() !== targetState) {
      throw new Error(
        targetState === "draft"
          ? "PDT_FCMP_002_PUBLISH_R01_ALREADY_ACTIVE_OR_NOT_DRAFT"
          : "PDT_FCMP_002_PUBLISH_R01_NOT_ACTIVE"
      );
    }
    if (!exactPriceUsd(target.price)) {
      throw new Error("PDT_FCMP_002_PUBLISH_R01_USD_PRICE_MISMATCH");
    }

    const observation = toObservation(target);
    const targetIdentity = verifyEtsyReadBackIdentity(
      PDT_FCMP_002_V1_LISTING_FINGERPRINT,
      { ...observation, state: "draft" }
    );
    if (
      targetIdentity.status !== "MATCH" ||
      targetIdentity.normalized.title !== PDT_FCMP_002_V1_LISTING_IDENTITY.title ||
      targetIdentity.normalized.priceUsd !== 9.99 ||
      targetIdentity.normalized.quantity !== 999 ||
      targetIdentity.normalized.taxonomy_id !== 12476 ||
      targetIdentity.normalized.tags.length !== 13
    ) {
      throw new Error("PDT_FCMP_002_PUBLISH_R01_LISTING_FINGERPRINT_DRIFT");
    }

    const protectedListing = await this.fetchRecord(
      `https://api.etsy.com/v3/application/listings/${PDT_FCMP_002_V1_LIVE_LISTING_ID}`,
      "PDT_FCMP_002_PUBLISH_R01_PROTECTED_LISTING"
    );
    if (
      integer(protectedListing.listing_id) !== PDT_FCMP_002_V1_LIVE_LISTING_ID ||
      integer(protectedListing.shop_id) !== PDT_FCMP_002_V1_PUBLISH_R01_SHOP_ID ||
      normalizedString(protectedListing.state).toLowerCase() !== "active"
    ) {
      throw new Error("PDT_FCMP_002_PUBLISH_R01_UNRELATED_LISTING_MISMATCH");
    }
    const protectedIdentity = verifyEtsyReadBackIdentity(
      PDT_IPT_001_V2_LISTING_FINGERPRINT,
      { ...toObservation(protectedListing), state: "draft" }
    );
    if (protectedIdentity.status !== "MATCH") {
      throw new Error("PDT_FCMP_002_PUBLISH_R01_UNRELATED_LISTING_DRIFT");
    }

    const imagePayload = await this.fetchRecord(
      `https://api.etsy.com/v3/application/listings/${targetId}/images`,
      "PDT_FCMP_002_PUBLISH_R01_IMAGES"
    );
    if (
      !exactGallery(
        resultRecords(imagePayload, "PDT_FCMP_002_PUBLISH_R01_IMAGES_INVALID")
      )
    ) {
      throw new Error("PDT_FCMP_002_PUBLISH_R01_GALLERY_MISMATCH");
    }

    const filePayload = await this.fetchRecord(
      `https://api.etsy.com/v3/application/shops/${PDT_FCMP_002_V1_PUBLISH_R01_SHOP_ID}/listings/${targetId}/files`,
      "PDT_FCMP_002_PUBLISH_R01_FILES"
    );
    if (
      !exactBuyerFile(
        resultRecords(filePayload, "PDT_FCMP_002_PUBLISH_R01_FILES_INVALID")
      )
    ) {
      throw new Error("PDT_FCMP_002_PUBLISH_R01_BUYER_FILE_MISMATCH");
    }

    const sellerState = await getEtsySellerStateSnapshot({
      shopId: PDT_FCMP_002_V1_PUBLISH_R01_SHOP_ID,
      accessToken: await this.token(),
      dependencies: { fetchImpl: this.fetchImpl }
    });
    if (!exactSellerState(sellerState, targetState)) {
      throw new Error("PDT_FCMP_002_PUBLISH_R01_SELLER_STATE_MISMATCH");
    }

    return observation;
  }

  async preflight() {
    this.verifiedDraft = await this.readExactState("draft");
  }

  async readDraft(draftListingId: string) {
    if (draftListingId !== String(PDT_FCMP_002_V1_DRAFT_LISTING_ID)) {
      throw new Error("PDT_FCMP_002_PUBLISH_R01_DRAFT_LISTING_ID_MISMATCH");
    }
    if (!this.verifiedDraft) {
      throw new Error("PDT_FCMP_002_PUBLISH_R01_PREFLIGHT_REQUIRED");
    }
    return this.verifiedDraft;
  }

  async publish(draftListingId: string): Promise<PublishedReceipt> {
    if (draftListingId !== String(PDT_FCMP_002_V1_DRAFT_LISTING_ID)) {
      throw new Error("PDT_FCMP_002_PUBLISH_R01_DRAFT_LISTING_ID_MISMATCH");
    }
    const token = await this.token();
    const countedFetch: typeof fetch = async (input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (!new Set(["GET", "HEAD", "OPTIONS"]).has(method)) {
        this.ETSY_WRITE_COUNT += 1;
      }
      return this.fetchImpl(input, init);
    };
    const provider = new EtsyAuthorizedPublishProvider(
      String(PDT_FCMP_002_V1_PUBLISH_R01_SHOP_ID),
      {
        fetchImpl: countedFetch,
        getAccessToken: async () => token
      }
    );
    return provider.publish(draftListingId);
  }

  async readPublished(draftListingId: string): Promise<PublishedReceipt | null> {
    if (draftListingId !== String(PDT_FCMP_002_V1_DRAFT_LISTING_ID)) {
      throw new Error("PDT_FCMP_002_PUBLISH_R01_DRAFT_LISTING_ID_MISMATCH");
    }
    const observation = await this.readExactState("active");
    return {
      listingId: draftListingId,
      state: "active",
      observation,
      providerReceipt: {
        postWriteReadback: "PASS",
        activeCount: 2,
        draftCount: 0,
        protectedListingId: PDT_FCMP_002_V1_LIVE_LISTING_ID,
        protectedListingUnchanged: true
      }
    };
  }
}

function exactRequestBody(body: Rec) {
  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) return false;
  }
  return (
    Object.keys(body).length === ALLOWED_FIELDS.size &&
    body.authorizationText ===
      PDT_FCMP_002_V1_PUBLISH_R01_AUTHORIZATION_TEXT &&
    normalizedString(body.operationId) ===
      PDT_FCMP_002_V1_PUBLISH_R01_OPERATION_ID &&
    normalizedString(body.productId) === PDT_FCMP_002_V1_PUBLISH_R01_PRODUCT_ID &&
    integer(body.shopId) === PDT_FCMP_002_V1_PUBLISH_R01_SHOP_ID &&
    integer(body.draftListingId) === PDT_FCMP_002_V1_DRAFT_LISTING_ID &&
    normalizedString(body.candidateFingerprint).toLowerCase() ===
      PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT &&
    normalizedString(body.listingFingerprint).toLowerCase() ===
      PDT_FCMP_002_V1_LISTING_FINGERPRINT
  );
}

function writesEnabled() {
  return (
    process.env.ETSY_PDT_FCMP_002_PUBLISH_R01_ENABLED === "true" ||
    (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").includes(
      "[GATE_FCMP_PUBLISH_EXECUTE]"
    )
  );
}

function runtimeAuthorizationError(request: Request) {
  const expected = process.env.ETSY_PDT_FCMP_002_PUBLISH_R01_WRITE_TOKEN?.trim() ?? "";
  const supplied = request.headers.get(WRITE_HEADER)?.trim() ?? "";
  const envMatch = Boolean(expected && supplied && secureEqual(supplied, expected));
  const suppliedHash = supplied
    ? createHash("sha256").update(supplied, "utf8").digest("hex")
    : "";
  const oneTimeMatch = Boolean(
    suppliedHash && secureEqual(suppliedHash, PUBLISH_R01_ONE_TIME_TOKEN_SHA256)
  );
  if (!envMatch && !oneTimeMatch) {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: supplied
          ? "PDT_FCMP_002_PUBLISH_R01_WRITE_UNAUTHORIZED"
          : "PDT_FCMP_002_PUBLISH_R01_WRITE_TOKEN_NOT_CONFIGURED",
        ETSY_WRITE_COUNT: 0
      },
      { status: supplied ? 401 : 503 }
    );
  }
  return null;
}

export function pdtFcmp002V1PublishR01Plan() {
  assertPdtFcmp002V1ManifestFrozen();
  assertPdtFcmp002V1RecoveryManifestFrozen();
  assertPdtIpt001V2ManifestFrozen();
  return {
    status: "PLAN_ONLY",
    mode: "EXACT_ONE_TIME_PUBLISH_R01",
    operationId: PDT_FCMP_002_V1_PUBLISH_R01_OPERATION_ID,
    productId: PDT_FCMP_002_V1_PUBLISH_R01_PRODUCT_ID,
    shopId: PDT_FCMP_002_V1_PUBLISH_R01_SHOP_ID,
    draftListingId: PDT_FCMP_002_V1_DRAFT_LISTING_ID,
    protectedListingId: PDT_FCMP_002_V1_LIVE_LISTING_ID,
    candidateFingerprint: PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
    listingFingerprint: PDT_FCMP_002_V1_LISTING_FINGERPRINT,
    authorizationText: PDT_FCMP_002_V1_PUBLISH_R01_AUTHORIZATION_TEXT,
    mutation: {
      method: "PATCH",
      listingId: PDT_FCMP_002_V1_DRAFT_LISTING_ID,
      body: { state: "active" }
    },
    productionOnly: true,
    featureGateDefault: "OFF",
    productionMutationExecuted: false,
    ETSY_WRITE_COUNT: 0
  };
}

function responseStatus(status: string) {
  if (status === "RECONCILIATION_REQUIRED") return 202;
  if (
    status === "IDENTITY_MISMATCH" ||
    status === "FAILED_REPLAY"
  ) {
    return 409;
  }
  return 200;
}

function errorStatus(code: string) {
  if (code.includes("ALREADY_ACTIVE") || code.includes("MISMATCH") || code.includes("DRIFT")) {
    return 409;
  }
  if (code.startsWith("AUTHORIZATION_")) return 409;
  if (code.startsWith("ETSY_") || code.includes("_HTTP_")) return 502;
  if (code === "DATABASE_URL_NOT_CONFIGURED") return 503;
  return 400;
}

export async function handlePdtFcmp002V1PublishR01Post(
  request: Request,
  runtime: PdtFcmp002V1PublishR01Runtime = {}
) {
  if (!writesEnabled()) {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: "PDT_FCMP_002_PUBLISH_R01_DISABLED",
        ETSY_WRITE_COUNT: 0
      },
      { status: 403 }
    );
  }
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: "PDT_FCMP_002_PUBLISH_R01_PRODUCTION_RUNTIME_REQUIRED",
        ETSY_WRITE_COUNT: 0
      },
      { status: 403 }
    );
  }
  const authError = runtimeAuthorizationError(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: "PDT_FCMP_002_PUBLISH_R01_INVALID_JSON",
        ETSY_WRITE_COUNT: 0
      },
      { status: 400 }
    );
  }
  if (!isRec(body) || !exactRequestBody(body)) {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: "PDT_FCMP_002_PUBLISH_R01_EXACT_AUTHORIZATION_MISMATCH",
        ETSY_WRITE_COUNT: 0
      },
      { status: 409 }
    );
  }

  const configuredShopId = Number(process.env.ETSY_SHOP_ID);
  if (configuredShopId !== PDT_FCMP_002_V1_PUBLISH_R01_SHOP_ID) {
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: "PDT_FCMP_002_PUBLISH_R01_RUNTIME_SHOP_MISMATCH",
        ETSY_WRITE_COUNT: 0
      },
      { status: 409 }
    );
  }

  assertPdtFcmp002V1ManifestFrozen();
  assertPdtFcmp002V1RecoveryManifestFrozen();
  assertPdtIpt001V2ManifestFrozen();
  const repository =
    runtime.repository ??
    (process.env.NODE_ENV === "test"
      ? new MemoryOperationLedgerRepository()
      : new NeonOperationLedgerRepository());
  const provider = new PdtFcmp002V1PublishR01Provider(runtime);
  const now = runtime.now?.() ?? new Date().toISOString();

  try {
    const existing = await repository.load(PDT_FCMP_002_V1_PUBLISH_R01_OPERATION_ID);
    if (!existing) await provider.preflight();

    const authorization = createPublishAuthorization({
      authorizationId: PDT_FCMP_002_V1_PUBLISH_R01_AUTHORIZATION_ID,
      candidateId: PDT_FCMP_002_V1_RECOVERY_CANDIDATE_ID,
      candidateFingerprint: PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
      channel: "etsy",
      shopId: String(PDT_FCMP_002_V1_PUBLISH_R01_SHOP_ID),
      draftListingId: String(PDT_FCMP_002_V1_DRAFT_LISTING_ID),
      issuedAt: "2026-09-20T17:00:00.000Z"
    });
    const result = await executeAuthorizedPublishTransaction(repository, provider, {
      operationId: PDT_FCMP_002_V1_PUBLISH_R01_OPERATION_ID,
      authorization,
      candidateId: PDT_FCMP_002_V1_RECOVERY_CANDIDATE_ID,
      candidateFingerprint: PDT_FCMP_002_V1_RECOVERY_CANDIDATE_FINGERPRINT,
      expectedListingFingerprint: PDT_FCMP_002_V1_LISTING_FINGERPRINT,
      shopId: String(PDT_FCMP_002_V1_PUBLISH_R01_SHOP_ID),
      draftListingId: String(PDT_FCMP_002_V1_DRAFT_LISTING_ID),
      channel: "etsy",
      now
    });

    return NextResponse.json(
      {
        operationId: PDT_FCMP_002_V1_PUBLISH_R01_OPERATION_ID,
        productId: PDT_FCMP_002_V1_PUBLISH_R01_PRODUCT_ID,
        shopId: PDT_FCMP_002_V1_PUBLISH_R01_SHOP_ID,
        listingId: PDT_FCMP_002_V1_DRAFT_LISTING_ID,
        protectedListingId: PDT_FCMP_002_V1_LIVE_LISTING_ID,
        ...result,
        ETSY_WRITE_COUNT: provider.ETSY_WRITE_COUNT
      },
      { status: responseStatus(result.status) }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json(
      {
        status: "BLOCKED_FAIL_CLOSED",
        error: code,
        operationId: PDT_FCMP_002_V1_PUBLISH_R01_OPERATION_ID,
        ETSY_WRITE_COUNT: provider.ETSY_WRITE_COUNT
      },
      { status: errorStatus(code) }
    );
  }
}
