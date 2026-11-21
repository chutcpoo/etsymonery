# Etsy Live Read — Production Authorization and Technical Audit
Date: 2026-11-22 (Asia/Bangkok)
Scope: PoonthaiDigital Publisher; evidence review and safe read-only UI QA only.
**Disposition: BLOCKED for live Etsy API calls. No marketplace mutations executed.**

## 1. Evidence and approval
- `docs/etsy-security-review.md` (20 Nov 2026) explicitly says no reviewed Etsy app permission is configured, and its configurable read-only gate is empty by default.
- `docs/etsy-oauth-migration-runbook.md` requires independent confirmation of the Etsy app purpose, seller terms/privacy evidence, exact shop, and production environment before authorization changes.
- Connected Drive searches for `ETSY_READ_APP_PERMISSION_REF`, `ETSY_READ_SELLER_AGREEMENT_REF`, Etsy app approval and seller consent found no document demonstrating the required reviewed approval. General product QA documents are not authorization evidence.
- Targeted connected Gmail searches for Etsy API/developer approvals returned no matching messages. This does not prove that an approval does not exist elsewhere.
- Etsy API documentation: https://developers.etsy.com/documentation/essentials/authentication/ ; Etsy API Terms: https://www.etsy.com/legal/api/ .
- **Action:** Obtain actual Etsy developer portal app-purpose approval/eligibility evidence and the shop owner's accepted application terms and relevant privacy notice, with dates and verifiable document locations. Review against the app's current actual purpose. Do not create approval references from hypothetical or mock evidence.

## 2. Vercel Production environment
- Vercel project: `autodigitalpublisher` / `prj_jieHLVXCaOWAH4tvQlKMYdND07Km`.
- Metadata endpoint returned 100 entries with truncation markers, and no cursor. It cannot conclusively establish absence of unreturned keys.
- Observed Production metadata: `ETSY_READ_TOKEN_REFRESH_ENABLED` present and value true; `ETSY_READ_TOKEN_REFRESH_APPROVAL_REF` present, syntactically valid, **not substantiated by original approval evidence**; `ETSY_OAUTH_MIGRATION_ENABLED=false`; `ETSY_OAUTH_MIGRATION_PROMOTION_ENABLED=false`; `APP_SUPPORT_EMAIL` present and syntactically valid; operator read key present.
- The truncated results do **not** confirm `ETSY_SHOP_ID`, `ETSY_READ_APPROVED_SHOP_ID`, `ETSY_READ_APP_PERMISSION_REF`, `ETSY_READ_SELLER_AGREEMENT_REF`, Production `DATABASE_URL`, or Production `TOKEN_ENCRYPTION_KEY`.
- **Action:** Review the complete Production env-key inventory inside the owner's Vercel authenticated UI or a fully paginated authorized API; never disclose secret values. Verify the actual Production database binding and all required key names, targets, and authorization evidence before any change.

## 3. Database metadata (read-only SQL, no secret/token fields fetched)
**Important: The actual Production DATABASE_URL-to-project binding is NOT VERIFIED.**
- Neon project `dark-sky-42252396` (named `autodigitalpublisher`): primary Etsy row contains stored shop ID `23582741`, user ID `87097672`, exact scope `listings_r`, token type Bearer, encrypted access and refresh fields present. Access expiry: `2026-11-21T01:58:20.210Z` (expired at audit). A `listings_r` migration candidate was previously marked `PROMOTED`.
- Neon project `polished-art-22453451` (named `autodigitalpublisher-production-v2-20261109`): a separate older Etsy primary row contains twelve scopes including write scopes, and its access token is expired. **Do not use, refresh, or automatically restore this broader grant.**
- A stored Shop ID is not a confirmation from the live Etsy API. A stored refresh ciphertext is not proof that the refresh token is currently valid.

## 4. Code gate and safe read flow
- `lib/etsy-live-count.ts` requires reviewed Etsy app permission and seller agreement reference, monitored support email, approved shop ID matching configured Etsy shop ID, a fresh exact `listings_r` grant bound to the same user/shop, and a successful live GET response.
- `lib/etsy-read-refresh.ts` also requires both real authorization references, valid approval evidence reference, exact shop identity and scope. With these guards unverified, do not perform token rotation.
- Live GET `/v3/application/shops/{shop_id}/listings?state=active&limit=1` was **NOT CALLED** due to unmet preconditions. Active count, listing titles, listing IDs, Etsy-confirmed shop identity: **NOT VERIFIED**.
- OAuth migration flags remain disabled; no OAuth reconnect, token refresh, grant promotion, or marketplace writes were performed.

## 5. Verified tests and UI correction
- The existing owner page `/connect/etsy` displayed `CONNECTED` when **only a stored ciphertext row** was present, even if the recorded access token had expired; it also displayed `Reconnect Etsy` while the migration route was disabled. This is misleading.
- In a separate worktree/feature branch, update the owner page to distinguish stored grant vs unexpired vs expired vs NOT VERIFIED, display shop ID specifically as *stored database metadata*, and suppress reconnect navigation while migration is disabled.
- Full offline test suite: 533 passed, 0 failed. TypeScript compile and production build passed for the isolated change. This is **not** live Etsy API verification.
- Anonymous Production smoke: `/demo` and `/api/health` respond 200; `/`, `/factory`, `/sales`, `/commerce`, `/api/platform/status` respond 401 without owner authentication. The live API is still gated.

## 6. Blockers and accountable action
1. **Etsy/developer account owner:** Provide actual app-purpose authorization/eligibility evidence covering the intended automated read-only shop access; determine from current terms whether any additional written permission is needed.
2. **Shop owner:** Approve and retain applicable seller terms/privacy/data-use evidence, preferably with record identifier and date; no inferred or fabricated acceptance.
3. **Vercel project owner / operator:** Confirm complete Production env inventory, exact database binding, approved Shop ID and reference values using the actual supporting documents.
4. **Authorized operator only after 1–3:** Confirm applicable refresh approval, refresh the *minimal* grant using the already gated code if permitted, then make a shop-scoped Etsy GET and compare returned shop/listings to configured identity; display only live-verified count and listings. Preserve all marketplace write locks.
5. **Release owner:** Promote only reviewed, tested code under release authorization; do not label the full dashboard COMPLETE until a real Etsy GET succeeds.

No approval-reference values or secrets were written to Vercel or the database during this audit.
