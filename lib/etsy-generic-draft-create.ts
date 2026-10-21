import { timingSafeEqual } from "node:crypto";
import { hasServerVerifiedQc } from "./etsy-server-qc-gate";
import { NextResponse } from "next/server";
import { createListingFingerprint } from "./candidate-fingerprint";
import {
  executeReconciledWrite,
  ProviderAmbiguousResultError,
  type ProviderReceipt,
  type ReconciledWriteProvider
} from "./draft-upload-reconciliation";
import { etsyApiHeaders } from "./etsy";
import { getValidEtsyAccessToken } from "./etsy-auth";
import { getEtsyDraftListingSummaries } from "./etsy-draft-reconciliation";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "./etsy-readback-normalizer";
import { NeonOperationLedgerRepository, type OperationLedgerRepository } from "./operation-ledger";
import { verifyBuildPrerequisites } from "./product-creation-plan";

const SHA = /^[a-f0-9]{64}$/;
const HEADER = "x-autodigitalpublisher-write-token";

type DigitalListing = {
  title: string; description: string; priceUsd: number;
  tags: string[]; quantity: number; taxonomy_id: number;
  who_made: string; when_made: string; type: "download"; state: "draft";
};
type DraftRequest = {
  action: "PREFLIGHT" | "CREATE_DRAFT";
  operationId: string;
  shopId: number;
  productId: string;
  candidateId: string;
  candidateFingerprint: string;
  expectedListingFingerprint: string;
  listing: DigitalListing;
  qc: {
    state: "QC_PASSED";
    productTruthVerified: true;
    testerFingerprint: string;
    independentFinalQcFingerprint: string;
  };
};

function fail(code: string): never { throw new Error(code); }
function str(v: unknown, code: string) {
  if (typeof v !== "string" || !v.trim()) return fail(code);
  return v.normalize("NFC").trim();
}
function pos(v: unknown, code: string) {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1) return fail(code);
  return v;
}
function obj(v: unknown, code: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return fail(code);
  return v as Record<string, unknown>;
}
function equal(left: string, right: string) {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function requireOperator(request: Request) {
  const expected = process.env.ETSY_DRAFT_WRITE_TOKEN?.trim();
  if (!expected) return NextResponse.json({
    status: "BLOCKED", error: "OPERATOR_AUTH_NOT_CONFIGURED", ETSY_WRITE_COUNT: 0
  }, { status: 503 });
  const actual = request.headers.get(HEADER)?.trim() ?? "";
  if (!actual || !equal(actual, expected)) return NextResponse.json({
    status: "BLOCKED", error: "OPERATOR_AUTH_REQUIRED", ETSY_WRITE_COUNT: 0
  }, { status: 401 });
  return null;
}

export function parseGenericDraftRequest(raw: unknown): DraftRequest {
  const x = obj(raw, "INVALID_DRAFT_CREATE_BODY");
  const action = str(x.action, "INVALID_DRAFT_CREATE_ACTION");
  if (action !== "PREFLIGHT" && action !== "CREATE_DRAFT") fail("INVALID_DRAFT_CREATE_ACTION");
  const l = obj(x.listing, "INVALID_DRAFT_LISTING");
  const tags = l.tags;
  if (!Array.isArray(tags) || tags.length !== 13 ||
      tags.some(t => typeof t !== "string" || !t.trim() || t.trim().length > 20) ||
      new Set(tags.map(t => String(t).normalize("NFC").trim().toLowerCase())).size !== 13) {
    fail("INVALID_DRAFT_TAGS");
  }
  const title = str(l.title, "INVALID_DRAFT_TITLE");
  const description = str(l.description, "INVALID_DRAFT_DESCRIPTION");
  const price = l.priceUsd;
  if (title.length > 140 || description.length > 13000 ||
      typeof price !== "number" || !Number.isFinite(price) ||
      price < 0.2 || price > 99999 || Math.round(price * 100) !== price * 100) {
    fail("INVALID_DRAFT_PRICE_OR_TEXT");
  }
  const quantity = pos(l.quantity, "INVALID_DRAFT_QUANTITY");
  const taxonomy_id = pos(l.taxonomy_id, "INVALID_DRAFT_TAXONOMY");
  const who_made = str(l.who_made, "INVALID_DRAFT_WHO_MADE");
  const when_made = str(l.when_made, "INVALID_DRAFT_WHEN_MADE");
  if (l.type !== "download" || l.state !== "draft") fail("DIGITAL_DRAFT_ONLY");
  const productId = str(x.productId, "INVALID_DRAFT_PRODUCT");
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(productId)) fail("INVALID_DRAFT_PRODUCT");
  const candidateFingerprint = str(x.candidateFingerprint, "INVALID_DRAFT_CANDIDATE_FINGERPRINT");
  const expectedListingFingerprint = str(x.expectedListingFingerprint, "INVALID_DRAFT_LISTING_FINGERPRINT");
  if (!SHA.test(candidateFingerprint) || !SHA.test(expectedListingFingerprint)) fail("INVALID_DRAFT_FINGERPRINT");
  const qc = obj(x.qc, "QC_EVIDENCE_REQUIRED");
  if (qc.state !== "QC_PASSED" || qc.productTruthVerified !== true ||
      qc.testerFingerprint !== candidateFingerprint ||
      qc.independentFinalQcFingerprint !== candidateFingerprint) {
    fail("QC_CURRENT_FINGERPRINT_NOT_PASSED");
  }
  const listing: DigitalListing = {
    title, description, priceUsd: price, tags: (tags as string[]).map(t => t.normalize("NFC").trim()),
    quantity, taxonomy_id, who_made, when_made, type: "download", state: "draft"
  };
  if (createListingFingerprint(listing) !== expectedListingFingerprint) {
    fail("LISTING_FINGERPRINT_MISMATCH");
  }
  return {
    action, productId, listing,
    operationId: str(x.operationId, "INVALID_DRAFT_OPERATION_ID"),
    shopId: pos(x.shopId, "INVALID_DRAFT_SHOP_ID"),
    candidateId: str(x.candidateId, "INVALID_DRAFT_CANDIDATE_ID"),
    candidateFingerprint, expectedListingFingerprint,
    qc: {
      state: "QC_PASSED", productTruthVerified: true,
      testerFingerprint: candidateFingerprint,
      independentFinalQcFingerprint: candidateFingerprint
    }
  };
}

function rawObservation(x: Record<string, unknown>): EtsyReadBackObservation {
  return {
    title: x.title, description: x.description, price: x.price as EtsyReadBackObservation["price"],
    tags: x.tags, quantity: x.quantity, who_made: x.who_made,
    when_made: x.when_made, taxonomy_id: x.taxonomy_id,
    type: x.listing_type ?? x.type, state: x.state
  };
}
function id(x: unknown): number {
  const value = Number(x);
  if (!Number.isSafeInteger(value) || value < 1) fail("ETSY_DRAFT_ID_INVALID");
  return value;
}
function asRecord(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== "object" || Array.isArray(x)) fail("ETSY_DRAFT_RESPONSE_INVALID");
  return x as Record<string, unknown>;
}

export class GenericDigitalDraftProvider implements ReconciledWriteProvider {
  private readonly baselineIds = new Set<number>();
  private baselineCaptured = false;
  constructor(
    private readonly input: DraftRequest,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}
  private async readDrafts() {
    const state = await getEtsyDraftListingSummaries({
      shopId: this.input.shopId, accessToken: this.token,
      dependencies: { fetchImpl: this.fetchImpl }
    });
    if (state.truncated) fail("ETSY_DRAFT_SCAN_TRUNCATED");
    return state.drafts;
  }
  private async readDetail(listingId: number) {
    const result = await this.fetchImpl(
      `https://api.etsy.com/v3/application/listings/${listingId}`, {
        method: "GET", headers: etsyApiHeaders(this.token), cache: "no-store"
      }
    );
    if (!result.ok) fail(`ETSY_DRAFT_DETAIL_HTTP_${result.status}`);
    return asRecord(await result.json());
  }
  private async findMatchingNewDraft() {
    const current = await this.readDrafts();
    const candidates = current.filter(
      item => !this.baselineIds.has(item.listingId) &&
      item.title?.normalize("NFC").trim() === this.input.listing.title
    );
    const matches: number[] = [];
    for (const item of candidates) {
      const result = await this.readDetail(item.listingId);
      if (result.state !== "draft") continue;
      const identity = verifyEtsyReadBackIdentity(
        this.input.expectedListingFingerprint, rawObservation(result)
      );
      if (identity.status === "MATCH") matches.push(item.listingId);
    }
    return matches.length === 1 ? matches[0] : null;
  }
  async apply(): Promise<ProviderReceipt> {
    const existing = await this.readDrafts();
    for (const item of existing) this.baselineIds.add(item.listingId);
    this.baselineCaptured = true;
    if (existing.some(x => x.title?.normalize("NFC").trim() === this.input.listing.title)) {
      fail("ETSY_DRAFT_TITLE_ALREADY_EXISTS");
    }
    const listing = this.input.listing;
    const body = new URLSearchParams({
      title: listing.title, description: listing.description, price: listing.priceUsd.toFixed(2),
      quantity: String(listing.quantity), taxonomy_id: String(listing.taxonomy_id),
      who_made: listing.who_made, when_made: listing.when_made,
      type: "download", tags: listing.tags.join(",")
    });
    let response: Response;
    try {
      response = await this.fetchImpl(
        `https://api.etsy.com/v3/application/shops/${this.input.shopId}/listings`, {
          method: "POST",
          headers: { ...etsyApiHeaders(this.token), "content-type": "application/x-www-form-urlencoded" },
          body, cache: "no-store"
        }
      );
    } catch { throw new ProviderAmbiguousResultError(); }
    if (response.status >= 500) throw new ProviderAmbiguousResultError();
    if (!response.ok) fail(`ETSY_CREATE_DRAFT_REJECTED:${response.status}`);
    let result: Record<string, unknown>;
    try { result = asRecord(await response.json()); }
    catch { throw new ProviderAmbiguousResultError(); }
    let listingId: number;
    try { listingId = id(result.listing_id); }
    catch { throw new ProviderAmbiguousResultError(); }
    const detail = await this.readDetail(listingId);
    if (detail.state !== "draft" ||
        verifyEtsyReadBackIdentity(this.input.expectedListingFingerprint, rawObservation(detail)).status !== "MATCH") {
      throw new ProviderAmbiguousResultError();
    }
    return { providerResourceId: String(listingId), kind: "CREATE_DRAFT", metadata: { state: "draft" } };
  }
  async reconcile(): Promise<ProviderReceipt | null> {
    if (!this.baselineCaptured) return null;
    try {
      const found = await this.findMatchingNewDraft();
      return found === null ? null : {
        providerResourceId: String(found), kind: "CREATE_DRAFT",
        metadata: { state: "draft", reconciled: true }
      };
    } catch { return null; }
  }
}

type DraftDependencies = {
  getAccessToken?: (scopes: readonly string[]) => Promise<string>;
  fetchImpl?: typeof fetch;
  ledger?: OperationLedgerRepository;
  verifyBuild?: typeof verifyBuildPrerequisites;
};

function gate(input: DraftRequest) {
  if (process.env.ETSY_GENERIC_DRAFT_WRITES_ENABLED !== "true" ||
      process.env.ETSY_DRAFT_WRITES_ENABLED !== "true") return "ETSY_GENERIC_DRAFT_WRITES_DISABLED";
  if (!hasServerVerifiedQc(input)) return "INDEPENDENT_QC_SERVER_APPROVAL_REQUIRED";
  if (process.env.ETSY_GENERIC_DRAFT_APPROVED_PRODUCT_ID !== input.productId ||
      process.env.ETSY_GENERIC_DRAFT_APPROVED_CANDIDATE_FINGERPRINT !== input.candidateFingerprint ||
      process.env.ETSY_GENERIC_DRAFT_APPROVED_LISTING_FINGERPRINT !== input.expectedListingFingerprint ||
      process.env.ETSY_SHOP_ID !== String(input.shopId)) {
    return "EXACT_DRAFT_CREATE_AUTHORIZATION_REQUIRED";
  }
  return null;
}

export function createGenericDraftPostHandler(dependencies: DraftDependencies = {}) {
  const tokenGetter = dependencies.getAccessToken ?? getValidEtsyAccessToken;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const ledger = dependencies.ledger ?? new NeonOperationLedgerRepository();
  const verifyBuild = dependencies.verifyBuild ?? verifyBuildPrerequisites;
  return async (request: Request) => {
    const denied = requireOperator(request);
    if (denied) return denied;
    let data: DraftRequest;
    try { data = parseGenericDraftRequest(await request.json()); }
    catch (error) {
      return NextResponse.json({
        status: "BLOCKED",
        error: error instanceof Error ? error.message : "INVALID_JSON",
        ETSY_WRITE_COUNT: 0
      }, { status: 400 });
    }
    if (data.action === "PREFLIGHT") return NextResponse.json({
      status: "METADATA_VALID",
      mode: "READ_ONLY",
      productId: data.productId, candidateId: data.candidateId,
      expectedListingFingerprint: data.expectedListingFingerprint,
      independentQcEvidenceVerified: false,
      publishAuthorized: false, ETSY_WRITE_COUNT: 0
    }, { headers: { "cache-control": "no-store" } });
    const blocked = gate(data);
    if (blocked) return NextResponse.json({
      status: "BLOCKED", error: blocked, ETSY_WRITE_COUNT: 0
    }, { status: 403 });
    try {
      const plan = await verifyBuild({ productId: data.productId, builder: "ETSY_GENERIC_DRAFT_CREATE" });
      if (!plan.allowed || plan.status !== "BUILD_PERMITTED") {
        return NextResponse.json({
          status: "BLOCKED", error: "EXPLICIT_APPROVED_PRODUCT_PLAN_REQUIRED",
          ETSY_WRITE_COUNT: 0
        }, { status: 409 });
      }
      const token = await tokenGetter(["listings_r", "listings_w"]);
      const provider = new GenericDigitalDraftProvider(data, token, fetchImpl);
      const result = await executeReconciledWrite(ledger, provider, {
        operationId: data.operationId,
        kind: "CREATE_DRAFT",
        payload: {
          shopId: data.shopId, productId: data.productId,
          candidateId: data.candidateId, candidateFingerprint: data.candidateFingerprint,
          listingFingerprint: data.expectedListingFingerprint,
          listing: data.listing
        },
        now: new Date().toISOString()
      });
      return NextResponse.json({
        ...result, productId: data.productId, candidateId: data.candidateId,
        publishAuthorized: false, livePublishPerformed: false,
        ETSY_WRITE_COUNT: result.status === "APPLIED" ? 1 : result.status === "REPLAY" ? 0 : "UNKNOWN"
      }, { status: result.status === "RECONCILIATION_REQUIRED" ? 409 : 200 });
    } catch(error) {
      return NextResponse.json({
        status: "BLOCKED",
        error: error instanceof Error ? error.message : "ETSY_CREATE_DRAFT_ERROR",
        publishAuthorized: false, ETSY_WRITE_COUNT: "UNKNOWN"
      }, { status: 409 });
    }
  };
}
