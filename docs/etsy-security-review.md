# Etsy security and policy review · 20 November 2026

[PR #288 and its checks](https://github.com/chutcpoo/etsymonery/pull/288/checks). Baseline `a2d148444c4e3316a3eeb371c76f73dc953204e0`. Reviewed the tracked file inventory, PR changes, Next entry points, shared auth, storage, provider call sites, dashboards, operator scripts and workflow triggers. A static scan of tracked text found no references to the external AI/advertising endpoints checked, embedded private-key headers or the tested provider-secret formats. This does not verify external logs, backups, Git history or secret custody. The route-inventory regression enumerates all 73 API files and seven HTTP methods. Product-specific historical adapters have mock tests and are unreachable through the operator allowlist.

| Item | Outcome | Evidence or outstanding requirement |
| --- | --- | --- |
| Anonymous and cross-role access | PASS in tests | [Inventory](../tests/etsy-exact-post-middleware.test.ts), [auth](../tests/etsy-operator-auth.test.ts), [built-app smoke](../tests/operator-smoke.mjs). Health is public. Unknown operations fail closed. |
| Product plans, build and approval | PASS in tests | [Role integration](../tests/plan-access-integration.test.ts). Production requires durable storage. API builds require a frozen approved plan including for legacy IDs. The seller approves a revision under a transaction lock. Independent item QC and seller release approval are additional steps. |
| OAuth and token handling | PASS in code / BLOCKED for actual grant | New grants and refresh are locked. The live reader accepts only listings_r and a fresh grant bound to the reviewed shop and user. It selects no refresh token. Secrets stay server-side. Authenticated encryption round-trip, tampering, wrong key and malformed envelope checks use synthetic secrets. Actual grant, operator identities and key custody require owner evidence. [Reader](../lib/etsy-live-count.ts) |
| Rate limits and live count | PASS in mocks / BLOCKED for live | One uncached, shop-specific active count request with bounded GET retries and Retry-After. The response timestamp is visible. Missing consent, stale grants, quota errors, malformed or mismatched results produce null. No inventory enumeration or fallback to historical numbers. The dashboard hides a count after 60 seconds. Production quota and shared capacity have not been measured. [Mock reads](../tests/etsy-live-count.test.ts), [rate-limit tests](../tests/etsy-http.test.ts) |
| Etsy data, analytics and privacy | PASS for code lock / BLOCKED for legal and operational evidence | Automated data use requires applicable Etsy permission. No reviewed permission is configured. Analytics, AI use paths and browser trackers are disabled. The dashboard carries Etsy’s required trademark notice. Live reads also require a configured support mailbox. Obtain accepted seller terms, privacy notice, retention/deletion evidence and proof that the mailbox is monitored. Historical data and backups have not been inspected or deleted. [Request policy](../middleware.ts), [layout](../app/layout.tsx) |
| Item policy and independent QC | PASS in mocks / BLOCKED for actual product | [Gate](../lib/etsy-policy.ts), [tests](../tests/etsy-policy.test.ts). A reviewed server record must bind exact shop, product, immutable candidate and operation. It records evidence of originality, rights, human contribution, eligible digital content, disclosure where applicable, buyer-file and preview hashes, independent QC and seller approval. The approved evidence register is empty. |
| Draft, publish, release and token changes | PASS for software lock | Authenticated historical GET/POST paths are denied before handlers. CLI entry points stop before transport. Manual release workflows are disabled. A successful evidence evaluation has no write capability. |
| Dependencies | PASS in local advisory check | Next.js 15.5.27 initially had critical/high advisories. Updated to 15.5.29 and refreshed vulnerable lint dependencies. Full npm audit reported zero after remediation. |
| Production deployment, current shop and first item | BLOCKED | No production or Etsy account verification was performed. CI cannot approve a shop or an item. Confirm the head SHA and completed CI jobs in the PR. |

## Official references reviewed before implementation

- [Etsy API Terms, updated 5 November 2026](https://www.etsy.com/legal/api/) — approved app purpose and updates, support, seller terms and privacy, purpose limitation, minimum access, written permission for automated access and analytics/ML, retention and display freshness.
- [Creativity Standards](https://www.etsy.com/legal/creativity/), [Seller Policy](https://www.etsy.com/legal/sellers/), [Etsy guidance on AI creations](https://www.etsy.com/seller-handbook/article/1275449912004) — original work and individual human creative input, disclosure in the description, restrictions on bot-generated items, AI prompt bundles and AI-generated functional instructions.
- [Listing Image Requirements](https://www.etsy.com/legal/policy/listing-image-requirements/253962679005), [IP Policy](https://www.etsy.com/legal/ip/), [Prohibited Items](https://www.etsy.com/legal/prohibited/). Review the actual buyer files and previews for the particular product type. An overall QC score cannot establish ownership or an exception.
- [OAuth](https://developers.etsy.com/documentation/essentials/authentication/), [rate limits](https://developers.etsy.com/documentation/essentials/rate-limits/). Role separation, independent QC, immutable file hashes and separate draft/publish approval are project controls.

## Before deployment

- [ ] Recheck this PR's exact SHA, CI, branch deployment exclusion and all write locks. Obtain explicit release authorization.
- [ ] Obtain Etsy acceptance of the app purpose and relevant update. Document permitted shop, endpoints and intended uses. Keep analytics and AI data flows closed absent express written Etsy authorization.
- [ ] Record developer identity, monitored support address, published terms including applicable disclaimer, privacy notice, enforceable seller acceptance, retention schedule, deletion procedure, backup treatment and incident owner. For suspected or actual member-data compromise, the response procedure must meet Etsy's 24-hour notification deadline.
- [ ] Verify the dedicated shop database, encryption/key custody, secret isolation, each named human role, log redaction, least privilege, quotas and pressure across concurrent instances. Verify exact shop and narrowly scoped grant separately under owner authorization. Never place token values in review evidence.
- [ ] Verify the approved custom domain, HTTPS, unauthorized responses and private no-store behavior under separately authorized release procedures. Require a separate authorization before changing any Vercel setting.

## Before the first product

- [ ] Collect original editable source, licenses for every third-party component, creator identity and dated, item-specific evidence of human decisions. Classify the finished product and reject prohibited digital items.
- [ ] Record AI involvement and inspect the exact disclosure in the buyer-facing description. For visual digital downloads inspect a preview of the actual file. Apply Etsy's product-specific image requirements and exceptions, including real unedited photos where applicable.
- [ ] Freeze and hash final buyer files, preview images, listing copy and candidate manifest. Have an independent reviewer open the files and compare them with the promised contents, formats and images.
- [ ] Verify shop owner and independent reviewer identities, review their evidence and bind seller approval to this shop, exact product, revision and draft operation. Any changed file or copy requires a new review. Publish requires separate approval of the final draft.
- [ ] Keep the marketplace lock closed. Any future implementation enabling a write requires a separate reviewed change and explicit authorization.

## Candidate SHA-256 integrity finding and repair · 20 November 2026

The prior `computePlanSha256` used `JSON.stringify(plan, Object.keys(plan).sort())`.
A property-name replacer applies to *every* nested object, so unrelated nested
buyer-file, image and listing fields were omitted from the approval digest.
This allowed distinct plan contents to produce the same SHA-256 input.

The draft PR now canonicalizes keys recursively while preserving nested values and array order.
Re-running plan QC also invalidates seller approval if the plan digest changes or QC fails.
Offline regression tests cover nested mutations, key-order stability, build rejection and
approval invalidation. Previously stored plan approvals made with the old algorithm must
be considered **stale** and re-reviewed before any release; no automatic migration or
re-authorization is permitted. Marketplace writes remain blocked.
