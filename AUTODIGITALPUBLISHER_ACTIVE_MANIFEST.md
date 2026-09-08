# AUTODIGITALPUBLISHER ACTIVE MANIFEST

STATUS: ACTIVE / PRODUCTION BASELINE / EXECUTABLE
VERSION: V1.5 QC-PASSED INTAKE GATE
AUTHORITY: THIS FILE ONLY

## Mission

Operate as the downstream publisher only after the exact Etsy candidate has reached QC_PASSED. Read-only Etsy evidence endpoints remain available independently, but publishing intake, validation, planning, candidate staging, Draft persistence, and live execution are fail-closed before QC_PASSED.

## Executable workflow

READ-ONLY EVIDENCE PLANE
→ Shop Identity Test / Listing Detail / Sales Control Center / Shop Stats (NO WRITE)

PUBLISHING PLANE
QC_PASSED INPUT ONLY
→ Exact Product ID + candidate/fingerprint validation
→ Required-field validation
→ Channel payload generation
→ Optional non-production Draft staging/read-back when separately authorized
→ Production Authorization boundary
→ Live marketplace adapter only when separately implemented and explicitly authorized
→ Post-release read-back + audit/correlation evidence

## Hard gates

- **PUBLISHER INTAKE GATE:** Etsy publishing intake is rejected unless the exact candidate has `testerPass=true` and `finalQcPass=true` (normalized top-level lifecycle = `QC_PASSED` or later). This applies to PLAN, validation, candidate generation, staging/Draft persistence, and execution paths.
- Read-only Etsy evidence endpoints are exempt because they perform no publishing intake or marketplace mutation.
- PRODUCT_TRUTH_VERIFIED must be true.
- Title, description, price and at least one buyer file are mandatory.
- Unknown or unsupported claims must be omitted.
- Etsy candidates require validated title/tags/taxonomy/quantity/maker/date fields and a frozen Production Build.
- Etsy candidate identity and Etsy listing-metadata identity are separate SHA-256 fingerprints.
- Etsy non-production Draft writes require all of: valid Etsy OAuth, `ETSY_DRAFT_WRITES_ENABLED=true`, configured `ETSY_DRAFT_WRITE_TOKEN`, and the matching `x-autodigitalpublisher-write-token` request header.
- `ETSY_DRAFT_WRITES_ENABLED` defaults to false.
- `PUBLISH_WRITES_ENABLED` defaults to false and does not by itself create a live-state operation.
- The only implemented active-listing update is the exact B01 operation for Etsy Listing `4560696421`; it requires the write token, write flag, canonical request-hash allowlist, active-state fingerprint checks, and an atomic operation-ledger claim.
- `UPDATE_ACTIVE_LISTING` is available only from its dedicated endpoint and must not be dispatched through Draft-create or Publish routes.
- Metadata read-back must never be reported as full candidate persistence while buyer files/images are not uploaded and verified.
- The Etsy Sales Control Center and Shop Stats capture are read-only and must not perform listing writes.
- Shop Stats values that are not available from the Etsy Open API must remain UNKNOWN and must not be inferred.
- Secrets must come from runtime environment variables only.
- No legacy manifest may supersede this file without an explicit version promotion.

## Current scope

ACTIVE:
- Dashboard and Publish Plan API
- Etsy OAuth 2.0 + PKCE, encrypted persistent token storage and refresh lifecycle
- Shop Identity Test and Read-only Listing Test
- Etsy Sales Control Center and local Shop Stats evidence capture/export
- Read-only transaction-count evidence via `transactions_r`
- Read-only canonical Catalog identifier projection using exact Drive ID `1XoIRHCVGGG81ddMhLfyP4TBE9mCgbOft`
- Etsy/Gumroad/Payhip plan adapters
- Etsy QC_PASSED-only publishing intake, release-state gating, candidate fingerprint and listing fingerprint
- Authenticated non-production Etsy Draft metadata adapter implemented behind default-OFF feature gate
- Fresh Etsy Draft metadata read-back with listing-only persistence semantics
- Dedicated, default-off B01 active-listing update endpoint with exact request binding, at-most-once execution, read-back reconciliation, correlation hash, and receipt
- CI typecheck/build plus gate-safe API smoke tests, including malformed-input and write-authorization coverage
- Health endpoint

PENDING / NOT AUTHORIZED:
- Explicit external Etsy Draft-write persistence exercise against a real non-production Draft
- Etsy listing image upload automation
- Etsy buyer-file upload automation from the authorized Google Drive source
- Full candidate persistence verification including buyer assets
- General-purpose live Etsy create/update/activate adapters
- Auto-Tune live PATCH operations
- Persistent audit-log storage
- Persistent Etsy Shop Stats evidence ingestion/storage
- Exact search-impression/click evidence for CTR when available
- Gumroad/Payhip live authentication
- General-purpose listing update/reconciliation outside the exact B01 operation
- Scheduled publishing queue

## Release rule

Production Build → Tester → independent Final QC → QC_PASSED → Publisher intake → Production Authorization → Production.

A metadata Draft read-back PASS is not Production Authorization and is not permission to publish.
