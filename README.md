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

The public health check is `/api/health`. Marketplace operations, OAuth grant changes, external tracking, historical public catalog pages, sales analytics and market research are locked. Marketplace write flags cannot unlock these paths. See the [review, official policies, and release checklists](docs/etsy-security-review.md).

## Validation

Use Node 22 and the checked-in lockfile. Run `npm ci`, `npm run lint`, `npm audit`, `npm test`, `node --require ./tests/offline.cjs --test .github/scripts/*.test.mjs`, `python3 -m unittest discover -s tests -p test_verify_p01_seller_zip.py`, `npm run typecheck`, `npm run build` and `node tests/operator-smoke.mjs`. The smoke suite starts the built application on loopback with fixture credentials. No Etsy account is needed.

The canonical code repository is [chutcpoo/etsymonery](https://github.com/chutcpoo/etsymonery). The canonical Vercel project is [autodigitalpublisher](https://vercel.com/shopee-affiliate-ai/autodigitalpublisher). PR #288 has an explicit branch-specific Git deployment exclusion in `vercel.json`.
