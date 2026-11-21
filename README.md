# AutoDigitalPublisher

Single-shop Etsy operator console and product-planning service. The dashboard reports the observed active-listing total, its timestamp and any reason the read is blocked. With the reviewed permissions currently on file, the live total is unknown. The branch contains no approved release candidate.

## Access

| Function | Independent credential |
| --- | --- |
| Dashboard, shop and OAuth metadata, single-shop plan reads | `ETSY_OPERATOR_READ_TOKEN` |
| Create a local plan, prepare a candidate or check a build | `ETSY_PLAN_EDITOR_TOKEN` |
| Evaluate plan QC | `ETSY_QC_REVIEWER_TOKEN` |
| Approve the exact reviewed plan revision | `ETSY_SELLER_APPROVER_TOKEN` and a quoted SHA-256 in `If-Match` |

Send credentials as Bearer headers over HTTPS. Browser reads also support Basic authentication with username `operator`. Each role requires its own unpredictable secret of at least 32 characters. Plan records belong to this single shop and require a dedicated durable database in production. Granting a role to the same person as another role does not establish independent human review. A plan approval permits local build work only.

**Single-user setup:** The app is for its owner only; the four role-specific secrets are separate security capabilities, not four application accounts. Local plan approval and independent item QC remain distinct steps. The current dashboard deliberately shows an unknown count until the operator supplies verified, shop-specific references through `ETSY_READ_APPROVED_SHOP_ID`, `ETSY_READ_APP_PERMISSION_REF`, and `ETSY_READ_SELLER_AGREEMENT_REF`, plus a monitored `APP_SUPPORT_EMAIL` and an unexpired, exactly scoped `listings_r` grant. These values are unset by default. Setting them does not authorize marketplace writes or grant changes. The prior broad OAuth grant is not silently migrated.

The public health check is `/api/health`. Marketplace operations, OAuth grant changes, external tracking, historical public catalog pages, sales analytics and market research are locked. Marketplace write flags cannot unlock these paths. See the [review, official policies, and release checklists](docs/etsy-security-review.md).

## Validation

Use Node 22 and the checked-in lockfile. Run `npm ci`, `npm run lint`, `npm audit`, `npm test`, `node --require ./tests/offline.cjs --test .github/scripts/*.test.mjs`, `python3 -m unittest discover -s tests -p test_verify_p01_seller_zip.py`, `npm run typecheck`, `npm run build` and `node tests/operator-smoke.mjs`. The smoke suite starts the built application on loopback with fixture credentials. No Etsy account is needed.

The canonical code repository is [chutcpoo/etsymonery](https://github.com/chutcpoo/etsymonery). The canonical Vercel project is [autodigitalpublisher](https://vercel.com/shopee-affiliate-ai/autodigitalpublisher). PR #288 has an explicit branch-specific Git deployment exclusion in `vercel.json`.

## Owner-only Etsy OAuth migration (disabled by default)

The legacy production authorization requested twelve scopes. PR #288 requires
only `listings_r` and will not silently reuse or narrow that historical grant.
A separate, opt-in Authorization Code + PKCE flow is available under
`/api/etsy/oauth/start` only after explicit, audited owner configuration.
The exact HTTPS host of the start request must match the registered
`ETSY_REDIRECT_URI`; the callback stays blocked until the migration flag is
on. The start route requires the **seller** operator credential (Basic sign-in
with username `operator` for an interactive browser); the callback requires
a same-host HttpOnly state cookie and a one-use PostgreSQL session.

The callback stages an encrypted `listings_r` grant in an isolated table; it
**never overwrites the existing primary token**. Owner-only
`GET /api/etsy/oauth/migration/status` exposes only candidate metadata.
Promotion via `POST /api/etsy/oauth/migration/promote` requires a separate
promotion flag, specific reviewed candidate ID, approval reference, seller
**Bearer** credential and an exact quoted `If-Match`. Promotion atomically
checks shop/user identity against the locked current primary row. All Etsy
listing Draft/Publish operations remain blocked.

After promotion, read-only token refresh is available only under the separately
reviewed `ETSY_READ_TOKEN_REFRESH_ENABLED` gate. It preserves `listings_r`,
uses compare-and-swap token replacement, and never grants new scopes. The
default is disabled. See
[the detailed operator runbook](docs/etsy-oauth-migration-runbook.md).
