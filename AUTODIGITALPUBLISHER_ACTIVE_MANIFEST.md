# AUTODIGITALPUBLISHER ACTIVE MANIFEST

STATUS: ACTIVE / PRODUCTION BASELINE / EXECUTABLE
VERSION: V1.1
AUTHORITY: THIS FILE ONLY

## Mission

Turn a verified digital product package into channel-specific publishing plans for Etsy, Gumroad and Payhip while preventing unverified product claims from reaching a marketplace.

## Executable workflow

INPUT
→ Product Truth Gate
→ Required-field validation
→ Channel selection
→ Channel payload generation
→ Etsy OAuth Authorization Gate
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
- Secrets must come from runtime environment variables only.
- No legacy manifest may supersede this file without an explicit version promotion.

## Current scope

ACTIVE:
- Dashboard
- Publish plan API
- Etsy OAuth 2.0 + PKCE authorization flow
- Etsy connection status endpoint
- Etsy plan adapter
- Gumroad plan adapter
- Payhip plan adapter
- Health endpoint
- CI build/typecheck

PENDING:
- Verified Etsy live create/update listing adapter
- Etsy token refresh lifecycle
- Persistent encrypted token/audit storage
- Asset upload automation
- Gumroad/Payhip live authentication
- Listing update/reconciliation
- Scheduled publishing queue
