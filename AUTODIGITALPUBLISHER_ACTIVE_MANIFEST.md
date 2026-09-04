# AUTODIGITALPUBLISHER ACTIVE MANIFEST

STATUS: ACTIVE / PRODUCTION BASELINE / EXECUTABLE
VERSION: V1.4 DRAFT-FIRST GATE-SAFE CANDIDATE
AUTHORITY: THIS FILE ONLY

## Mission

Turn a verified canonical digital product package into channel-specific publishing plans, read-only Etsy sales evidence, and explicitly authorized non-production Etsy Draft metadata candidates while preventing unverified product claims or un-gated live marketplace changes.

## Executable workflow

INPUT
→ Product Truth Gate
→ Required-field validation
→ Channel selection
→ Channel payload generation
→ Etsy candidate + listing fingerprint generation
→ Production Build Freeze Gate
→ Etsy OAuth Authorization Gate
→ Shop Identity Test
→ Read-only Listing Test
→ Sales Control Center evidence
→ Shop Stats evidence capture when Open API evidence is insufficient
→ Draft-first plan
→ Explicit Draft-write feature gate + write-token authorization
→ Non-production Etsy Draft metadata create/read-back when authorized
→ Tester
→ Independent Final QC
→ Production Authorization boundary
→ Live marketplace adapter only when separately implemented and authorized
→ Publish result + audit log

## Hard gates

- PRODUCT_TRUTH_VERIFIED must be true.
- Title, description, price and at least one buyer file are mandatory.
- Unknown or unsupported claims must be omitted.
- Etsy candidates require validated title/tags/taxonomy/quantity/maker/date fields and a frozen Production Build.
- Etsy candidate identity and Etsy listing-metadata identity are separate SHA-256 fingerprints.
- Etsy non-production Draft writes require all of: valid Etsy OAuth, `ETSY_DRAFT_WRITES_ENABLED=true`, configured `ETSY_DRAFT_WRITE_TOKEN`, and the matching `x-autodigitalpublisher-write-token` request header.
- `ETSY_DRAFT_WRITES_ENABLED` defaults to false.
- `PUBLISH_WRITES_ENABLED` defaults to false and does not by itself create a live-state operation.
- No Etsy active-state publish/update operation is implemented in V1.4.
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
- Etsy Draft-first validation, release-state gating, candidate fingerprint and listing fingerprint
- Authenticated non-production Etsy Draft metadata adapter implemented behind default-OFF feature gate
- Fresh Etsy Draft metadata read-back with listing-only persistence semantics
- CI typecheck/build plus gate-safe API smoke tests, including malformed-input and write-authorization coverage
- Health endpoint

PENDING / NOT AUTHORIZED:
- Explicit external Etsy Draft-write persistence exercise against a real non-production Draft
- Etsy listing image upload automation
- Etsy buyer-file upload automation from the authorized Google Drive source
- Full candidate persistence verification including buyer assets
- Live Etsy create/update/activate adapter
- Auto-Tune live PATCH operations
- Persistent audit-log storage
- Persistent Etsy Shop Stats evidence ingestion/storage
- Exact search-impression/click evidence for CTR when available
- Gumroad/Payhip live authentication
- Listing update/reconciliation
- Scheduled publishing queue

## Release rule

Production Build → Tester → independent Final QC → PASS → Production.

A metadata Draft read-back PASS is not Production Authorization and is not permission to publish.
