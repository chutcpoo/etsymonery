# Add GET-only Etsy reconciliation for Products 04–15

Master and Product Truth are reconciled to LISTING_QC for Products 04–15; Etsy listing mapping remains unresolved pending authenticated evidence. This adds /api/etsy/reconcile-listings to collect authenticated marketplace evidence without changing Etsy, Drive, registry data, scopes or write locks.

The route reuses encrypted OAuth token storage, GET retries, seller-state pagination and registry SELECT reads. It verifies PoonthaiDigital identity, restricts targets/methods/transport, excludes protected products, matches exact identities and fails closed on missing scopes, expired tokens, partial reads or ambiguity. It never refreshes tokens or calls write helpers.

Validation: 460 tests pass; typecheck and local Next build checked. Live readback remains blocked because local Etsy credentials/database configuration are unavailable. Local smoke returns sanitized 503 DATABASE_URL_NOT_CONFIGURED; this is not marketplace PASS.

No Production deployment, secret provisioning or Etsy operation is requested by this change. Draft PR #258 is open for review; branch is pushed, not merged, and no Production deployment or Etsy mutation is authorized by this document.
