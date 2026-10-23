# P01 automation preflight addendum — 2026-10-23 (Asia/Bangkok)

Scope: P01 v1.2.1 only. Source-of-truth baseline: docs/releases/P01_READINESS_2026-10-23.md at commit 38996c540204b238ebf21752c7a9f3be14234686 and frozen manifest/source lock. Evidence log, **not** production authorization.

## Human physical print check
The seller states in the current conversation on 2026-10-23 that they themselves completed the physical print test. Record as `SELLER_SELF_ATTESTED_COMPLETED` only. This statement does not constitute an independently signed Final QC record, does not identify an independent reviewer, and does not prove exact file-hash linkage. Do not re-request that the seller reprint the worksheets solely to repeat this step. Final QC remains PENDING until its separate evidence gate is genuinely satisfied.

## GitHub and Vercel observations
- Repository: chutcpoo/etsymonery. Production main SHA: bce554b46db20887947b288804f82a14ec56a686.
- GitHub PR #276: OPEN, DRAFT, not merged; source SHA 2a55594cb119da1f43b53f936a2b81bb1da72b34.
- PR CI run 39700086572: success. No submitted PR reviews found on fresh read.
- Existing PR preview: dpl_98UVMqna6ert6YYUL4CrUMeAvuHg, READY, exact PR SHA. No new preview deployment necessary for this commit.
- The PR preview /api/etsy/status has no configured Etsy token store, API credentials or shop ID. This is expected for isolated preview and cannot be used to validate live seller listing metadata.
- Production: dpl_ERDDRg9ZG9atN8oDT1pToY4QLHf8, READY, exact main SHA.
- Production GET /api/etsy/status reports OAuth connected with recorded scopes; token status became UNEXPIRED after a successful seller-state read; flags draftWritesEnabled=false, publishWritesEnabled=false, postResetV2WritesEnabled=false. Note: /status is metadata-only.
- Production GET /api/etsy/seller-state returned PASS, shopId 23582741, zero records for active/inactive/sold_out/draft/expired, ETSY_WRITE_COUNT=0. Source inspection confirms the handler calls getValidEtsyAccessToken() then getEtsySellerStateSnapshot(), which makes actual Etsy GET requests for each seller state and fails on invalid provider responses. This is stronger than a static zero projection, but does not itself verify shop name or the correctness of the chosen shop ID against a separately verified seller identity.
- Vercel team shopee-affiliate-ai is on Hobby; no commercial executor approval. No runtime errors reported in the last 24h.

## Automated path only (seller explicitly rejected manual Etsy listing)
1. Keep the protected GitHub/Vercel exact Draft pathway. Do not substitute a manual Etsy Shop Manager listing.
2. Use a **read-only** Etsy API preflight to verify live shop identity and retrieve seller taxonomy nodes and category properties. Official API: GET /v3/application/seller-taxonomy/nodes and GET /v3/application/seller-taxonomy/nodes/{taxonomy_id}/properties. Taxonomy ID and attributes must come from provider responses; never invent them. Separate code/review/deployment approval required for any new production read endpoint.
3. Lock the final digital listing payload, including title, complete description, 13 tags, price USD 3.90 (Draft-only approval), maker/date fields, quantity, confirmed taxonomy, and type=download/state=draft. Compute listing fingerprint using lib/candidate-fingerprint.ts from this **exact** payload.
4. Bind the product plan and independent QC evidence to frozen hashes. The user-reported print check alone cannot satisfy independentFinalQcFingerprint or server-side QC pins.
5. Check GitHub protected Environment and operator-token readiness without copying secrets to repo, chat or logs. PR #276 requires independent code review before any merge, and its preview already passed build.
6. Commercial execution on Vercel Hobby remains prohibited: resolve with separate seller-approved compatible hosting choice or service plan before production Draft automation.
7. Only with fresh exact authorization: separately merge/deploy approved code, enable narrowly scoped Draft-only gates, issue one protected CREATE_DRAFT, read back identity and buyer assets, close the gates. Publishing requires an additional seller approval.

## Gate state
- DIGITAL_ASSETS: PASS 10/10 per frozen evidence, not re-scored here.
- PRINT: SELLER_SELF_ATTESTED_COMPLETED (unverified signature/hash binding).
- INDEPENDENT_FINAL_QC: PENDING.
- LIVE_SELLER_STATE_READ: PASS (actual Etsy GET through production handler, 0 results).
- LIVE_SHOP_NAME: PENDING.
- TAXONOMY_AND_ATTRIBUTES: PENDING.
- LISTING_FINGERPRINT: PENDING.
- PR: DRAFT / CI SUCCESS / preview READY.
- PRODUCTION_COMMERCIAL_HOST: BLOCKED (Hobby).
- MARKETPLACE_WRITE_GATES: LOCKED.
- ETSY_DRAFT/PUBLISH: NOT EXECUTED.

Decision: HOLD. No marketplace write authorization; no merge, production deploy, paid upgrade, or feature-gate change is granted by this evidence.
