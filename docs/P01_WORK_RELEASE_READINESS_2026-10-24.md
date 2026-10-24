# P01 Work release readiness — 2026-10-24 Asia/Bangkok

Decision: **HOLD**. This is an automated technical audit, not independent human approval, Merge authorization, or permission to create/upload/publish a listing.

## Fresh evidence

- Shop PoonthaiDigital, ID 23582741: publisher `/api/etsy/seller-state` HTTP 200, PASS, generatedAt `2026-10-24T01:25:21.540Z` (08:25 ICT). Active, inactive, sold_out, draft, expired are each 0; total 0. This is a fresh server-side Etsy API readback; GitHub direct CHECK remains NOT TESTED. The endpoint's write count 0 is its application projection, not a global Etsy account audit.
- PR #282 was open/unmerged at `a7f252fa5c5ea0b2924953f5f59827fb78d903da`. CI [39988990908](https://github.com/chutcpoo/etsymonery/actions/runs/39988990908) and safety [39988990467](https://github.com/chutcpoo/etsymonery/actions/runs/39988990467) succeeded at that SHA. Vercel Preview remained pending; do not summarize every check as green. Later commits require their own CI.
- GitHub Environment `etsy-p01-draft`: branch policy `main`; required reviewer `chutcpoo`; `prevent_self_review=false`. This does not establish independent review. Secrets API_KEY and SHARED_SECRET are present by NAME only; `P01_ETSY_OAUTH_REFRESH_TOKEN` is absent. Currency USD; `P01_DIRECT_DRAFT_WRITES_ENABLED=false`. Seven obsolete/write workflows remain disabled; CI and offline safety are active.
- [Issue #283](https://github.com/chutcpoo/etsymonery/issues/283) was open with zero comments/signatures at initial read. No independent reviewer has approved the package. An automated preparation comment is not a human signature.

## Actual Drive package and verifier repair

Downloaded [the canonical ZIP](https://drive.google.com/file/d/1hz1jOSlunHsVm0sjuZgDpJly8qieKCQY/view) again through authenticated Google Drive, 3,182,431 bytes. SHA256 `42ab0e9282db763331c5d87fac3d14b70d22c33b2293b86e2d3689e497e16315`; ZIP CRC PASS. All ten delivered assets match the source lock's byte counts and SHA256 values. Candidate fingerprint independently recomputes to `04cf97646f850d571ebd9776b622b03ed44870986036ab2b86d9622745ebe007`.

The original Python verifier failed on this real package because `LISTING_PREVIEWS` contains seven JPGs plus the declared MP4. It counted the MP4 as an eighth JPG and never verified video bytes. The repair checks the exact declared asset inventory, verifies MP4 bytes/hash and container signature, and still rejects missing, extra, tampered or invalid video. It supports earlier packages without a declared video. No product, ZIP, metadata, or source lock bytes changed. Three Python regression tests pass, including the new video cases; 24 direct runner/workflow/evidence tests pass locally.

Fresh structural inspection: both PDFs have 12 pages, correct A4/Letter dimensions, and zero form fields. Seven JPEGs decode at 2500×2000. This does not establish visual legibility, professional quality, printing results, full video playback, or buyer/non-owner flow PASS. Those remain for the independent reviewer. The seller's prior physical-print evidence need not be repeated or relabeled as independent observation.

See machine-readable evidence under `docs/releases/P01_WORK_AUDIT_2026-10-24/`.

## Taxonomy and listing metadata

Read provider evidence `P01_ETSY_TAXONOMY_LIVE_2026-10-23.json`: HTTP 200 Seller Taxonomy and Properties, Planner Templates leaf ID 12476, 20 properties and zero required properties. This audit did not repeat those credentialed taxonomy calls; that evidence retains its original date. Proposed category fit is not seller approval.

Recomputed the canonical LISTING fingerprint from the current proposed JSON: `055a66908f108a474d722cbd82c98d2bde7444c1319fc352053410be20303c0f`. Expected/approved fingerprint remains null. Exact description, maker `i_did`, date bucket `2020_2026`, quantity 999 and taxonomy still need seller approval. Historical source-lock price approval is USD 3.90 for Draft only.

## OAuth and owner action

**ไม่มี Refresh Token ที่เข้าถึงและตรวจสอบได้สำหรับตั้งค่า GitHub ในรอบนี้**. The existing publisher connection reports a server-side encrypted OAuth grant; that does not make its token available locally. The local repo has neither a refresh token nor TOKEN_ENCRYPTION_KEY. The authenticated on-device attempt to read the known Vercel project's environment inventory returned HTTP 403. No bypass, credential guessing, token output, or plaintext token file was used. Existing GitHub secrets cannot be read back.

If the credential custodian already has a dedicated valid refresh token for autodigitalpublisher, run `/Users/chutcpoo/.config/p01-etsy/secure-enroll.sh` in the owner's interactive Mac Terminal. It prompts invisibly, pipes the value to the exact GitHub Environment secret and preserves existing secrets. Do not paste tokens, authorization codes, callback URLs containing codes, or PKCE verifiers into a chat or issue. Secret name presence alone is not validation.

If the owner has no token, a dedicated OAuth Authorization Code + PKCE enrollment must be completed by the owner: confirm autodigitalpublisher's exact registered HTTPS callback, generate a new one-use state/verifier, request only necessary scopes, and let the owner consent as the PoonthaiDigital account. The callback must exchange and route the returned refresh token directly to the approved secure custodian/Environment. Existing `/connect/etsy` reconnects the production vault; **clicking Reconnect alone does not enroll GitHub**. A dedicated callback-to-GitHub handoff or authorized vault migration is still BLOCKED; do not request consent as if that missing handoff were ready. No consent was submitted in this audit.

Rotation plan: use a single refresh-token custodian and serialize refreshes. Do not let Vercel and GitHub independently refresh copies of one grant. Capture any replacement refresh token, persist it atomically in the approved vault/Environment before reporting success, and record only timestamps/status/scope/shop identity. The current direct runner discards the refresh response's refresh token; repeated unattended operation is not rotation-ready. Do not grant a broad repo PAT to the workflow to work around this. On storage failure, ambiguous refresh, invalid_grant or scope/identity mismatch, stop and reconcile or have the owner reauthorize. Keep Draft writes false throughout credential validation. See [Etsy authentication](https://developers.etsy.com/documentation/essentials/authentication/).

## Exact staged release sequence

1. Credential handoff and rotation readiness; confirm Environment protections and closed write flag. Obtain independent code review, then request **separate explicit seller Merge approval** on the reviewed commit. No merge has occurred.
2. After the reviewed direct workflow is available on main and explicitly enabled for CHECK, run manual `action=CHECK`, exact source fingerprint, empty create confirmation. Approve only this protected read-only job. Verify shop ID/name/currency and all listing states, and store the run URL. No Draft flag change is needed. Current workflow is disabled and main still has the older relay; do not dispatch that older workflow or expose secrets to this PR branch.
3. Independent human Final QC must record PASS on the exact ZIP/source fingerprint in #283, with reviewer identity, timestamp/timezone, method and immutable report. Seller approves exact listing payload/fingerprint. Only then request exact Draft-only approval, configure approved evidence variables and open the Draft flag for the single authorized operation. Verify one draft ID and full metadata, then close the flag. No automatic POST retry on uncertain outcomes.
4. Separately authorize asset upload to that exact verified draft. Use the upload plan JSON: two PDF buyer files, seven JPGs in ranks 1–7, one MP4. Never upload seller ZIP, QA, generator scripts or listing Markdown as buyer files. Reverify every local hash immediately before upload. Persist returned provider asset IDs and read back names/ranks/media processing status before continuing. On ambiguous POST, read back and reconcile before any retry. The current direct runner does **not** implement this uploader; execution remains NOT READY.
5. Review final draft through a genuine non-owner/buyer method where available. Record any unavailable test as BLOCKED/NOT TESTED. Request separate Publish approval tied to the exact listing ID, source, metadata and verified assets. Publishing uses an explicit `updateListing` state change to active; it must not be bundled into upload or retry. Read back active state and public listing after authorization. Publish implementation and approval remain pending.

Upload and publish API contracts were checked against the [official API reference](https://developers.etsy.com/documentation/reference/) and [listing tutorial](https://developers.etsy.com/documentation/tutorials/listings/). This plan is review material, not an executable approval. No paid service, Vercel Pro upgrade, permanent deletion, Merge, Draft, upload or Publish was performed.
