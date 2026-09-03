# AUTODIGITALPUBLISHER ACTIVE MANIFEST

STATUS: ACTIVE / PRODUCTION BASELINE / EXECUTABLE
VERSION: V1.2
AUTHORITY: THIS FILE ONLY

## Mission

Turn a verified digital product package into channel-specific publishing plans and read-only Etsy sales evidence for Etsy, Gumroad and Payhip while preventing unverified product claims from reaching a marketplace.

## Executable workflow

INPUT
→ Product Truth Gate
→ Required-field validation
→ Channel selection
→ Channel payload generation
→ Etsy OAuth Authorization Gate
→ Shop Identity Test
→ Read-only Listing Test
→ Sales Control Center evidence
→ Publish Plan
→ Human/API authorization boundary
→ Marketplace adapter
→ Publish result + audit log

## Hard gates

- PRODUCT_TRUTH_VERIFIED must be true.
- Title, description, price and at least one buyer file are mandatory.
- Unknown or unsupported claims must be omitted.
- Etsy live writes require valid Etsy Open API v3 OAuth authorization.
- Marketplace writes remain disabled unless PUBLISH_WRITES_ENABLED=true.
- The Etsy Sales Control Center is read-only and must not perform listing writes.
- Shop Stats values that are not available from the Etsy Open API must remain UNKNOWN and must not be inferred.
- Secrets must come from runtime environment variables only.
- No legacy manifest may supersede this file without an explicit version promotion.

## Current scope

ACTIVE:
- Dashboard
- Publish plan API
- Etsy OAuth 2.0 + PKCE authorization flow
- Etsy connection status endpoint
- Persistent encrypted Etsy OAuth token storage
- Etsy token refresh lifecycle
- Shop Identity Test
- Read-only Listing Test
- Etsy Sales Control Center API
- Etsy Sales Control Center dashboard
- Read-only sales transaction-count evidence via transactions_r
- Read-only canonical Catalog identifier projection using exact Drive ID 1XoIRHCVGGG81ddMhLfyP4TBE9mCgbOft
- Etsy plan adapter
- Gumroad plan adapter
- Payhip plan adapter
- Health endpoint
- CI build/typecheck

PENDING:
- Verified Etsy live create/update listing adapter
- Persistent audit log storage
- Etsy Shop Stats ingestion for views, visits, search terms and CTR
- Asset upload automation
- Gumroad/Payhip live authentication
- Listing update/reconciliation
- Scheduled publishing queue
