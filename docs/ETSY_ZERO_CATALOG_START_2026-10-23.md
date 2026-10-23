# Etsy zero-catalog restart baseline — 2026-10-23 (Asia/Bangkok)

## Scope, safety and precise meaning of "start at zero"

Shop: **PoonthaiDigital**, Etsy Shop ID **23582741**.

On 2026-10-23, a current authenticated read-only publisher endpoint (`GET /api/etsy/seller-state`) reported `status=PASS`, generatedAt `2026-10-23T16:15:27.050Z`, counts active=0, draft=0, inactive=0, sold_out=0, expired=0, total=0 and `ETSY_WRITE_COUNT=0`. `GET /api/etsy/status` reported `READ_ONLY`, seller OAuth connected, Draft/Publish gates disabled and Etsy API live status marked `NOT_TESTED`. This is an **API projection of an empty listing catalog** at that moment, not proof that order history, finances, tax, billing, or all seller account data were deleted or reset. No listing deletion was necessary or executed. Confirm in Etsy Shop Manager before claiming a total-account reset.

The user wants a fresh seller catalog without carrying outdated operator instructions forward. Retain current original customer assets, QA hashes, releases, past approval evidence and prior version history for audit; do not permanently delete these or silently carry stale authorizations to new products.

## Only current intended draft architecture (not yet deployed)

- Development in [PR #282](https://github.com/chutcpoo/etsymonery/pull/282) replaces the existing GitHub Actions P01 Draft workflow's **Vercel relay** with GitHub Actions -> Etsy Open API v3 directly.
- The single Draft workflow is `.github/workflows/etsy-p01-draft-create.yml`. It is manual dispatch only, default CHECK, main-only, protected Environment `etsy-p01-draft`, exact source fingerprint and default-off `P01_DIRECT_DRAFT_WRITES_ENABLED`.
- GitHub Actions direct executor does not require a Vercel paid plan. Existing Vercel read-only endpoints are evidence sources, not Etsy Draft writing dependencies.
- **DO NOT dispatch Etsy CREATE_DRAFT or Publish.** PR #282 is not merged or explicitly approved. The existing main-branch workflow still uses the older Vercel relay until a separately approved code review/merge.
- `.github/workflows/etsy-exact-auto-publish.yml` is an older separate Publish workflow. It remains present and is not authorized for this new zero-catalog flow; do not invoke it merely because it exists.

## Current gaps before an authenticated direct Etsy CHECK

Authenticated GitHub CLI inspection found GitHub Environment `etsy-p01-draft` with a required owner reviewer and only `main` allowed; the write gate is **false**. Environment secret *names* include `P01_ETSY_API_KEY` and `P01_ETSY_SHARED_SECRET`, but **not** `P01_ETSY_OAUTH_REFRESH_TOKEN`. Existing encrypted OAuth in the Vercel server cannot automatically be used in GitHub Actions. No secret values were retrieved. The authorized credential owner can privately enroll the missing value on their Mac with `zsh ~/.config/p01-etsy/secure-enroll.sh`; no secrets should be put in chat, source control or workflow inputs.

## P01 v1.2.1 is a candidate, not an active catalog listing

Retain current P01 frozen source ZIP SHA-256 `42ab0e9282db763331c5d87fac3d14b70d22c33b2293b86e2d3689e497e16315`, candidate fingerprint `04cf97646f850d571ebd9776b622b03ed44870986036ab2b86d9622745ebe007`, ten-asset set fingerprint `c5e371750e6cade6182d011c9226f31e99dcffa49ffcd0937492227a52cc89f6`. Technical QA 10/10 PASS; the seller's physical-print attestation is preserved.

Authenticated Etsy Developer Portal evidence reports app `autodigitalpublisher` Personal Access; authorized Seller Taxonomy and properties GET returned HTTP 200. The proposed leaf `Planner Templates` taxonomy ID **12476** must receive exact seller listing approval. Proposed Listing Fingerprint `055a66908f108a474d722cbd82c98d2bde7444c1319fc352053410be20303c0f` recomputes exactly but is **not** an approved release fingerprint. Proposed maker/date/quantity, exact description and seller listing approval are not frozen. Independent human Final QC issue [#283](https://github.com/chutcpoo/etsymonery/issues/283) remains unsigned. No Etsy Draft ID, asset upload receipt or Publish is verified.

## Retired and archived documentation

The following **historical instructions have been moved to archival copies** with their original bytes intact. Active-path content has been replaced with an archival redirect to avoid giving conflicting live operator instructions:

- `docs/P01_GITHUB_VERCEL_DRAFT_OPERATOR.md` -> `docs/archive/etsy-legacy-2026-10-23/P01_GITHUB_VERCEL_DRAFT_OPERATOR.md`
- `docs/P01_GITHUB_DIRECT_ETSY_DRAFT.md` -> `docs/archive/etsy-legacy-2026-10-23/P01_GITHUB_DIRECT_ETSY_DRAFT.md`
- `docs/ETSY_GLOBAL_RESET_2026-09-20.md` -> `docs/archive/etsy-legacy-2026-10-23/ETSY_GLOBAL_RESET_2026-09-20.md`

Other old routes, code and release documentation have **not** been deleted and should not be treated as newly authorized. The full Git history remains available.

Local Mac cleanup was performed separately: clean and unused local checkouts `etsymonery-generic-release`, `etsymonery-readonly-reconciliation` plus two old generic-release handoff Markdown files were moved into `~/Projects/_ETSY_LEGACY_ARCHIVE_2026-10-23/`. Archive manifest records old/new paths, repo HEADs and file SHA-256. Main local checkout `~/Projects/etsymonery` remains unchanged. This is a reversible archival action, not permanent destruction.

## Release gates and next genuine external dependencies

1. Complete protected GitHub OAuth refresh secret enrollment **without exposing values**; verify Environment protection stays on and the direct write gate remains false.
2. After separate merge authorization and final code review, use protected GitHub `CHECK` only, reconcile Etsy shop and current catalog read-only.
3. Get genuine independent human review for P01's exact ZIP and signed QC in #283; do not represent technical QA as human QC.
4. Approve Etsy category 12476 or select a different verified leaf; approve exact description, maker, creation date, quantity, then freeze expected Listing Fingerprint. Do not invent metadata.
5. Separately authorize Draft creation, then separately design/test/authorize upload of exactly two buyer PDFs, seven JPG and one MP4. **Publish requires another separate approval**.

**Decision: SHOP CATALOG EMPTY PER API; CODE AND ARCHIVE CLEANUP STAGED IN PR; MARKETPLACE RELEASE HOLD. No Merge, Etsy listing write, Publish or secret migration performed.**
