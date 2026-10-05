# Generic Etsy Release Engine — Preview validation handoff

This revision introduces a manifest-driven prepare engine alongside all existing
product-specific routes. Nothing is deployed or merged. HTTP publish execution is
unconditionally disabled, including productionAuthorized=true and environment flags.
Production prepare is also blocked. No Etsy credentials were copied into this checkout.

## API contract

All three endpoints require `x-autodigitalpublisher-release-token`, compared in constant
time against server-only `ETSY_GENERIC_RELEASE_TOKEN`. Do not put this secret in the
manifest, URL, browser bundle, or logs.

- `POST /api/releases/prepare`: multipart `releaseId` plus a File part named by each
  manifest assetId. Client-supplied manifests and attestations are not trusted. Loads
  `<releaseId>.json` from `ETSY_RELEASE_MANIFEST_DIRECTORY`, an administrator-controlled,
  read-only source. Validation and source byte hashes precede the first seller write.
  Requires **both** `VERCEL_ENV=preview` and `ETSY_GENERIC_PREPARE_ENABLED=true`.
- `GET /api/releases/{releaseId}/status`: persisted release state, operation receipts,
  completed/not-started/reconciliation-required operations, lastVerifiedAt, and
  `observation=PERSISTED_SNAPSHOT`. This is not a fresh Etsy observation. Expired locks
  and changed authoritative manifest hashes invalidate readiness.
- `POST /api/releases/{releaseId}/publish`: always returns
  `GENERIC_PRODUCTION_PUBLISH_DISABLED`; never creates a provider or touches OAuth/DB.
  Missing API authentication fails before execution. The transaction integration is
  exercised only with an explicit mock provider under NODE_ENV=test.

Prepare success returns READY_TO_PUBLISH with releaseId, productId, candidateId,
draftListingId, candidateFingerprint, listingFingerprint, imageCount, buyerFileCount,
videoCount, qcResult, operationReceipts, draftDisposition, reconciled, correlationId,
trace, and livePublishPerformed=false. Failures return BLOCKED_FAIL_CLOSED or
RECONCILIATION_REQUIRED and HTTP 409. Call status after disconnects/timeouts, and resume
using the identical releaseId, immutable manifest, and source files.

## Manifest and trust boundary

See ProductManifest in lib/etsy-release-manifest.ts. Fields include schemaVersion,
releaseId, productId, candidateId, title, description, price (two decimal places),
quantity, taxonomyId, exactly 13 unique tags, whoMade, whenMade, shopId/userId,
listingImages (1–10), buyerFiles (1–5), optional video (0–1), productionAuthorized,
productTruth, releaseLock, authoritativeCandidate, testerPass, finalQcPass, and
protectedSellerState. Each asset has source-neutral assetId, filename, SHA256,
sizeBytes, MIME type, contiguous rank, and image alt text. Video is deliberately
restricted to MP4 up to 100 MiB; buyer files are limited to 20 MiB. Source signatures
are checked for PNG/JPEG/MP4. This engine does not invent Product Truth/QC evidence.
An authorized upstream reviewer must supply the immutable, reviewed server manifest.

`releaseFingerprints` computes the normalized listing and complete candidate identity.
The candidate binds product/candidate identity, listing, source assets, authenticated
shop, Product Truth evidence, and approved seller baseline. Attestations and lock
expiry are excluded from their own attested hash. The full manifest is separately
hashed in the release ledger, so changing gates on an existing release is blocked.
The shared authoritative-candidate-binding module checks tester/final-QC hashes.
Legacy Drive-specific bindings are preserved unchanged.

The protectedSellerState array enumerates every pre-existing listing with listingId,
state and snapshotHash. An empty array means an approved empty shop, not “ignore seller
state”. Compute snapshotHash with EtsyReleaseContext.protectedHash: normalized listing
identity, inventory, image IDs/rank/alt text, file IDs/rank/name/size and video IDs/state.
Fresh seller pagination and protected content are compared before every mutation and
at final readback. Any additional seller listing outside this baseline and the exact
candidate draft blocks preparation. Existing production listings are only read.

## Reused architecture

- publisher.validateProductPack for established truth/freeze/QC/title/tag gates.
- candidate-fingerprint and authoritative-candidate-binding for immutable binding.
- etsy-auth, etsy, etsy-http and etsy-readback-normalizer for scoped OAuth, API headers,
  read-only retry and identity checks. Generic writes request listings_r/listings_w;
  commerce/order readers now request transactions_r.
- EtsyDraftAssetProvider for multipart image/file transport, including rank/alt text.
  Fresh execution/authority/shop/seller/listing/asset-baseline guards intercept each POST.
- operation-ledger (atomic claim, durable Neon repository, existing schema) for release,
  global listing fingerprint reservations and per-asset operations.
- etsy-seller-state-reconciliation for complete GET-only seller enumeration.
- end-to-end-correlation for release validation and QC audit events.
- authorized-publish-transaction and EtsyAuthorizedPublishProvider for the future gated
  publish boundary; transaction success is tested with mocks only.

Product registry/event-log contracts were inspected. They describe evidenced catalog
observations and have separate revision rules; preparing a draft does not silently
change registry lifecycle or issue a publish authorization. Registry lifecycle updates
remain an upstream integration, with explicit evidence and revision control.

Draft creation extracts the scan/create/readback pattern from pdt-cpr-003/draft-create-r01.
Generic video extracts multipart upload and bounded active-state polling from
pdt-bipc-003/video-r01, with no product/Drive/listing constants. It requires an empty
video baseline, sets is_multi_video=false, and confirms two stable active observations.
Official Etsy reference: https://developer.etsy.com/documentation/reference/
Listing tutorial: https://developer.etsy.com/documentation/tutorials/listings/
The API is transitioning multi-video defaults in 2026; our contract intentionally
retains one video and explicit empty-baseline protection.

## At-most-once and recovery

The existing executeReconciledWrite permits apply on some PENDING/FAILED replays.
It is left intact for backward compatibility. The new executeReleaseOperation uses
the same ledger but **all replays are read-only**, even crash-before-write cases.
Atomic creation reservation is keyed globally by shop + listing fingerprint; changing
releaseId cannot bypass it. Different candidate identities sharing that reservation
fail payload matching. Assets are keyed by shop + candidate fingerprint + kind/rank.
Baseline/resource IDs are saved before mutation and after a parseable response.

Fresh verified drafts reconcile after timeout/5xx or response parsing ambiguity.
Multiple matching drafts block. Assets with a durable resource ID can resume readback
without uploading again. Without a durable resource receipt, remote rank/count alone
cannot prove original bytes: Etsy transcodes images/videos and exposes no source SHA256.
The engine leaves RECONCILIATION_REQUIRED and requires reviewed external evidence;
it never invents a remote SHA match or automatically resets/deletes ledger entries.
Source SHA evidence is local verified bytes + the bound upload/receipt; remote proof
covers resource ID, rank, filename/size where available, alt text and active video state.

An interrupted release resumes successful operations and continues untouched later
operations. An interrupted operation whose write occurrence is unknowable holds the
release. Ready replays also re-read Etsy and reject drift; readiness is not cached as
permission to publish. Prepare can stop at the serverless time limit and resume, using
the same durable DB and sources. No ledger migration is required.

## Validation and remaining work

The test command preloads a network guard rejecting every unmocked Etsy fetch before
network access. All engine tests use injected fetch/token/ledger providers. There are
30 new tests covering the requested 18 categories plus API authentication/runtime,
concurrent claims, persisted receipt recovery, revoked authority, asset sequence
interruption and unexpected seller state. No production Etsy writes are executed.
Existing routes and middleware exceptions are not removed or broadened.

Before any real Preview preparation:

1. Review/import an immutable manifest and fresh complete seller baseline from real
   Product Truth, tester/QC evidence, OAuth scopes and authenticated shop identity.
2. Provision the trusted manifest store, durable Neon ledger and route token through
   an approved secret workflow; this revision does not provision them.
3. Start with mocked Preview HTTP validation while generic prepare remains disabled.
4. Obtain explicit approval for the exact draft/assets in the real Etsy shop before
   enabling prepare. **Etsy Preview requests still mutate the real shop**; Etsy does
   not provide a separate sandbox API hostname.
5. Vercel multipart request limits may prevent larger real assets. The engine exposes
   resolveAsset so an approved server-side asset-store adapter can be added; no public
   arbitrary URL fetching or local file-path input is accepted by this HTTP API.
6. Verify pagination, processing delays, runtime interruption, Neon concurrent claims
   and fresh seller/media readback using the exact Preview configuration. No live
   staging evidence has been produced in this change.

Production publish needs a separately approved implementation: trusted persisted
single-use grants, runtime/environment authorization, full fresh prepare QC, seller
identity gates immediately before PATCH, fresh post-publish readback and independently
reviewed production enablement. Do not enable it by simply changing NODE_ENV or adding
a flag. Production remains blocked in the exported HTTP handler.

## Migration plan

Keep legacy routes until generic parity is independently proven with fixtures and
approved Preview readback. Candidate migrations are pdt-cpr-003/pdt-pcl-002/pdt-csch-001
create + complete, pdt-ipt-001/pdt-fcmp-002 create/upload, and pdt-bipc-003 video-r01.
First translate product constants and artifact evidence into reviewed manifests;
then compare dry-run fingerprints, payloads, scopes, media ordering and seller gates.
Move one draft-only route at a time behind the unchanged exact authorization boundary.
Publish routes migrate only after separate explicit approval and transaction parity.
There is no route deletion, main merge, deployment or real publish in this revision.

## Local verification — 2026-10-05

- npm test: **408 passed, 0 failed** (30 new engine/API safety tests).
- npm run typecheck: **PASS**.
- npm run build: **PASS**; all three new dynamic API routes appear in the build.
- Standalone lint script: not configured. Build's lint/type validation completed;
  existing CSS autoprefixer warning remains at app/p/public-products.module.css:216.
- git diff --check: **PASS**; staged added-line credential-pattern scan: **PASS**.
- npm audit: existing Next/PostCSS dependency vulnerabilities, moderate 1/high 1.
  The suggested fix changes the Next major version and is outside this refactor.
- Production Etsy writes: **0**. No deployment, publish, merge or push performed.

Ready for mocked Preview validation. Real seller draft validation is pending approved
manifest/evidence, trusted source provisioning, durable DB and explicit seller-write
approval. Production execution is not ready and remains disabled.

## Branch-only Preview stub validation

The `feat/generic-etsy-release-engine` branch supports the three release APIs with
`x-autodigitalpublisher-preview-stub: synthetic-fixture-only`. This is a public
synthetic fixture selector, never a real API credential. It works only when
VERCEL_ENV=preview, VERCEL_GIT_COMMIT_REF is this exact branch, and real generic
prepare is disabled. No Preview environment secrets or Etsy credentials need to be
provisioned. All OAuth/header/HTTP/ledger dependencies are injected stub implementations
with no global fetch, token store, or DB fallback. Source fixtures are signature-only
synthetic data, not real buyer files or Product Truth evidence.

Responses identify validationMode=PREVIEW_STUB_ONLY, mockMutationCount (4 for synthetic
draft/image/file/video), ETSY_WRITE_COUNT=0 and livePublishPerformed=false. Publish
still returns GENERIC_PRODUCTION_PUBLISH_DISABLED for absent and forged authorization.
The real generic prepare runtime is hard-blocked on this Preview branch even if its
write flag is enabled. Middleware rejects all legacy Etsy routes, including GET execute
URLs, on this branch regardless of inherited route gates.

The mock ledger is PROCESS_LOCAL_TEST_ONLY: a separate Vercel function/cold start can
show NOT_STARTED on status. This is explicit and is not proof of remote durable Neon
recovery. The real durable ledger remains unchanged and unused in this validation.
`node --import tsx scripts/generic-preview-smoke.ts` exercises prepare, replay, status,
publish rejection, forged authorization, real prepare denial, and legacy GET denial;
set PREVIEW_SMOKE_URL for the deployed Preview. Never target a production URL.

Additional local verification: 412 tests PASS, typecheck/build PASS, full HTTP stub
smoke PASS. Remote CI uses a draft PR into main to trigger the existing CI workflow;
no workflow permission expansion or production deployment is introduced.
