# AutoDigitalPublisher / Etsy Sales Control Center

A gated Etsy commerce control center for diagnosing sales problems before changing listings.

## Current candidate

The current software candidate adds a read-only Etsy Sales Control Center on top of the encrypted OAuth persistence branch.

### Evidence layers

- Canonical Catalog identifier reconciliation
- Etsy Shop Identity
- Exact six live Etsy Listing records
- Listing title / tags / image / favorite evidence
- Sales transaction counts when `transactions_r` has been granted
- Funnel diagnosis: discovery → click-through → engagement → conversion
- Root Cause state that remains `NOT_YET_CONFIRMED` when evidence is insufficient

### Etsy API limitation

The Etsy Open API v3 endpoints used by this project do not expose Etsy Shop Stats views, visits, search terms or click-through rate. The application therefore marks those fields as unavailable/unknown instead of fabricating metrics.

Conversion rate is not calculated without an authoritative visit denominator.

### Canonical Product Truth

`DIGITAL_PRODUCT_CATALOG_MASTER.xlsx` on Google Drive remains the sole canonical Catalog.

The repository contains only a derived, read-only Product_ID ↔ Etsy Listing_ID identifier projection required for runtime reconciliation. It is not Product Truth and cannot override the Catalog.

### Safety

- Marketplace writes remain disabled by default.
- Sales Control Center endpoints are GET/read-only.
- Any controlled Listing fix must still follow Product Truth → ETSY GROWTH OS adaptation → Production Build → Tester → independent QC → Production authorization.
- A material candidate change invalidates stale Tester/QC evidence.

## Required environment

See `.env.example`.

For persistent OAuth:
- `DATABASE_URL`
- `TOKEN_ENCRYPTION_KEY`

For Etsy:
- `ETSY_API_KEY`
- `ETSY_SHARED_SECRET`
- `ETSY_REDIRECT_URI`
- optional `ETSY_SHOP_ID`

Keep:
- `PUBLISH_WRITES_ENABLED=false`

After this candidate is deployed, re-authorize Etsy once because the requested scope set adds `transactions_r`.
