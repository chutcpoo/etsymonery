# AutoDigitalPublisher — Owner-only OAuth migration runbook
Updated 20 November 2026 · **PREPARED, NOT EXECUTED**

## Immutable boundaries

- One human owner, one Etsy shop (PoonthaiDigital). Four technical operator
  credentials are independent privileges, not additional human users.
- No product draft, media upload, sale, listing edit or publication is enabled
  by this migration. Marketplace write routes stay at HTTP 403.
- Do not use the old production `/api/etsy/oauth/start`: the deployed legacy
  code still requests twelve scopes. Do not revoke any Connected Apps grant
  until its effect is separately verified.
- Do not assert approval simply because Etsy shows "Personal Access" or a
  matching callback; verify actual purpose and shop authorization evidence.

## 0. Pre-release gate

Required before ANY owner-initiated OAuth step:

1. Owner authorizes the **exact PR commit** and separate production release.
   Independently validate production app purpose, scope and policies.
2. In Vercel Production verify by key names or an owner-controlled audit,
   WITHOUT decrypting/printing values: `DATABASE_URL`,
   `TOKEN_ENCRYPTION_KEY`, `ETSY_API_KEY`, `ETSY_SHARED_SECRET`,
   `ETSY_SHOP_ID`, `ETSY_REDIRECT_URI`, `APP_SUPPORT_EMAIL`,
   `ETSY_OPERATOR_READ_TOKEN`, `ETSY_SELLER_APPROVER_TOKEN`,
   `ETSY_PLAN_EDITOR_TOKEN`, `ETSY_QC_REVIEWER_TOKEN`.
   The Vercel metadata listing observed previously was partly truncated,
   and it cannot prove these values are configured.
3. Verify all marketplace write flags OFF, including legacy flags. Capture
   an independent snapshot of the current primary grant metadata only:
   `user_id`, `shop_id`, scope, expiry and updated time; never expose
   access/refresh tokens or DB URL. The expected owner user ID must equal
   this authoritative primary `user_id`. Shop ID must equal the stored
   `shop_id`. No data is inferred or guessed.
4. Use the existing registered
   `https://publisher.poonthaidigital.com/api/etsy/oauth/callback`
   (subject to rechecking the registration), and start OAuth at that SAME
   HTTPS origin. Do not start on `autodigitalpublisher.vercel.app` and
   redirect to the custom hostname: the PKCE/state cookie is host-scoped.
5. `APP_SUPPORT_EMAIL` is to be a monitored mailbox identified by the owner:
   `chutcpoo@hotmail.com` (receipt not independently verified).
6. Keep all new flags OFF: `ETSY_OAUTH_MIGRATION_ENABLED=false`,
   `ETSY_OAUTH_MIGRATION_PROMOTION_ENABLED=false`,
   `ETSY_READ_TOKEN_REFRESH_ENABLED=false`. Never use dummy evidence refs.

## 1. Stage only — explicit owner decision required

Only AFTER release approval, operator evidence and a verified backup/
recovery procedure, set
`ETSY_OAUTH_MIGRATION_ENABLED=true`,
`ETSY_OAUTH_MIGRATION_OWNER_APPROVAL_REF=<real-reviewed-reference>`,
`ETSY_OAUTH_MIGRATION_EXPECTED_USER_ID=<verified-existing-user-id>`,
and exact `ETSY_REDIRECT_URI`/shop ID. The application creates separate
PostgreSQL migration tables on first use, so its DB identity needs DDL rights
or an operator must pre-create the same schema after review.

Owner signs into
`https://publisher.poonthaidigital.com/api/etsy/oauth/start`
using Basic username `operator` and the seller-approver password. The
application requests only `listings_r` via PKCE S256. Etsy prompts the
owner for consent; nothing is granted merely by preparing the code.

Callback must return from the same host with the state cookie; the session
is atomically consumed once. The server validates the exact token type,
`listings_r` scope, existing owner user ID, expiry and one shop-scoped GET,
then stages encrypted credentials in `etsy_oauth_migration_candidates`.
**The current primary token row remains untouched.**

Owner reads `GET /api/etsy/oauth/migration/status` using seller Basic auth.
The response shows a candidate ID, shop/user IDs, scope, expiry and status,
but NEVER token values. If anything is not exact, keep the candidate
unpromoted and return to OFF.

## 2. Promote — separately approved, exact candidate

The owner reviews the candidate against the recorded primary metadata and
authorizes the exact candidate ID in a SECOND approval. Only then can an
operator temporarily set
`ETSY_OAUTH_MIGRATION_PROMOTION_ENABLED=true`,
`ETSY_OAUTH_MIGRATION_PROMOTION_APPROVAL_REF=<second-real-evidence-ref>`
and `ETSY_OAUTH_MIGRATION_PROMOTION_CANDIDATE_ID=<reviewed-uuid>`.

An authenticated POST to `/api/etsy/oauth/migration/promote` MUST use
the seller-approver **Bearer** credential (not Basic) and an `If-Match`
header containing the quoted approved candidate UUID. Avoid exposing
secrets through process arguments or shell history. The server performs
one SQL transaction that locks the candidate and primary rows, confirms
the same user/shop, and replaces the primary encrypted grant only if
the candidate is unexpired, `STAGED`, exactly `listings_r`, and has more
than 5 minutes remaining. It marks the candidate `PROMOTED` and erases
its staged ciphertext in the same transaction.

Immediately disable BOTH migration flags after a successful promotion,
and verify `/api/etsy/status` metadata and a fresh authenticated
shop count. Never reactivate broad scopes through automatic rollback.

## 3. Optional continuity for 1-hour access tokens

Without token refresh, the new access token expires and live counts fall
back to `Unknown`. If the owner separately approves minimal-grant refresh,
set `ETSY_READ_TOKEN_REFRESH_ENABLED=true` and
`ETSY_READ_TOKEN_REFRESH_APPROVAL_REF=<real-evidence-ref>` AFTER the
shop-specific read authorization evidence refs are confirmed.
The read-refresh helper requires exact `listings_r`, correct bound shop,
valid user prefix, monitored support contact, and near-expiry state.
The refresh endpoint is the Etsy OAuth endpoint, not a marketplace write.
A PostgreSQL compare-and-swap prevents stale refresh workers overwriting
a newly rotated grant. On failure, the UI remains blocked/unknown rather
than inventing a count or granting more scopes.

## 4. Abort / rollback

- If identity, state, scope, response, shop or candidate mismatches, stop.
  Do not promote. Keep release marketplace writes OFF.
- No staging failure alters the primary grant.
- If promotion has completed, do not silently restore an older twelve-scope
  grant; recovery is a new owner-approved authorization or a separately
  reviewed operational recovery step.
- Etsy Connected Apps revoke may affect the app's new grant too; do not
  revoke automatically. Revoking the prior broad grant and deployment
  rollback are different decisions requiring their own review.
- Deleting/revoking an Etsy grant is not performed by any code in this PR.

## 5. Evidence and release acceptance

- CI lint/audit/unit/TypeScript/build/smoke and P01 offline safety must
  pass on the EXACT proposed release SHA.
- Verify production env keys and values via the owner's secure Vercel UI
  (do not paste secrets), callback registration, primary shop/user identity,
  durable storage, middleware role isolation and all marketplace flags OFF.
- Verify real Etsy read status after authorized migration. A successful CI
  fixture is NOT a production OAuth verification.
- Do not create a Draft or Publish a listing until its independent
  original-rights/QC and item-specific seller approvals are complete.
