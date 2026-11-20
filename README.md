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

## Canonical PoonthaiDigital Commerce Stack

For the PoonthaiDigital project, use the following mapping as the canonical commerce stack for selling digital products on Etsy:

- **Google Drive** — operational Product Truth, buyer files, final listing assets, release evidence, and source documents.
- **GitHub** — `chutcpoo/etsymonery` (`https://github.com/chutcpoo/etsymonery`) is the canonical code/config repository for Etsy sales and publishing automation.
- **Vercel** — project `autodigitalpublisher` in team `shopee-affiliate-ai` (`https://vercel.com/shopee-affiliate-ai/autodigitalpublisher`) is the canonical deployment target for this commerce application.
- **Etsy** — PoonthaiDigital's marketplace endpoint for live product listings and buyer delivery.

Canonical flow:

`Google Drive Product Truth → GitHub etsymonery → Vercel autodigitalpublisher → Etsy PoonthaiDigital`

Do not substitute `poonthaidigital-tools` as the primary GitHub/Vercel stack for Etsy commerce unless a task explicitly requires it.

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

## Operator access protection (pre-deploy setup)

Sensitive Etsy seller/financial GET APIs, OAuth status and initiation, operator
dashboards, and control-center API routes require a dedicated
`ETSY_OPERATOR_READ_TOKEN` with at least 32 unpredictable characters.
The guard applies at the Next.js middleware layer, including custom domains
that are excluded from Vercel Authentication.

- **Vercel Environment Variables:** configure the token in every environment
  that serves the operator console, before deploying this security change.
  No Etsy API key, OAuth token or write credential is reused.
- **Browser:** visit `/connect/etsy` or `/commerce`; when prompted, enter
  username `operator` and the operator token as the password.
- **API:** send `Authorization: Bearer <ETSY_OPERATOR_READ_TOKEN>` over HTTPS.
  Never put secrets in query strings, client bundles, repository files or logs.
- **Fail closed:** missing/short token returns HTTP 503; invalid/missing
  credentials return HTTP 401 before the route handler can read shop data.
- **Existing scope-specific APIs:** `/api/etsy/listing-sales` and
  `/api/etsy/reconcile-listings` keep their existing, independent Bearer-token
  gates. The OAuth callback is exempt from the operator header check because
  Etsy redirects cannot carry this header; it still requires the short-lived
  HttpOnly `state` + PKCE cookie pair created by the protected OAuth start.
- **CI/safety:** the protected endpoints are read-only. Original marketplace
  mutation gates remain unchanged. The PR branch is excluded from automatic
  Vercel Git deployments by `vercel.json`; main is not excluded.
