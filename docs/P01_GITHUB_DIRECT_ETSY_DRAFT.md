# P01 — GitHub Actions → Etsy Open API directly, without Vercel

**Status:** IMPLEMENTATION ONLY. Etsy Draft creation has **NOT** been executed. The separate photo/PDF/video upload procedure remains unresolved. This is not a Publish mechanism.

## Confirmed seller evidence

- Screenshot supplied on 2026-10-22: shop `PoonthaiDigital` Etsy **listing currency is USD**. The runner also reads `getShop` and requires `currency_code=USD`, shop ID `23582741` and shop name before any Etsy Listing POST.
- Product `P01` v1.2.1, source manifest and 10 asset SHA256 values are pinned in `docs/releases/P01_CANDIDATE_SOURCE_LOCK_2026-10-22.json` and `docs/releases/P01_EXACT_DRAFT_EVIDENCE_2026-10-22.json`.
- USD `$3.90` is the proposed introductory price. **Seller must explicitly approve it before filling the price approval variable.** This workflow does not interpret a currency screenshot as price approval.
- Seller self-reported completion of physical A4/US Letter tests and sign-off. Signed independent evidence was not verified from the QA folder; seller's own report must not be silently represented as independent reviewer approval.

## Security and operator workflow

1. In the **public** repository `chutcpoo/etsymonery`, navigate to **Settings → Environments** and create `etsy-p01-direct-draft`. Require a reviewer and restrict deployment branches to `main`. If GitHub reviewers cannot be enforced on your current account, stop rather than creating an unprotected secret-bearing environment.
2. Configure **Environment secrets** (do not put values in PRs, Actions inputs, files committed to GitHub, logs or chat):
   - `ETSY_API_KEY`: existing approved Etsy app's keystring;
   - `ETSY_SHARED_SECRET`: associated shared secret;
   - `ETSY_OAUTH_REFRESH_TOKEN`: Etsy seller OAuth refresh grant with `listings_r` and `listings_w` for the same shop. **The existing Vercel token store is not automatically shared with GitHub.** Establish this grant securely using the registered Etsy app and OAuth consent; do not paste it in chat;
   - `P01_APPROVED_DESCRIPTION`: the final buyer-facing English description, compared and signed off against the canonical listing draft in Drive.
3. Configure **Environment variables** after actual seller review (non-secrets):
   - `P01_APPROVED_SHOP_CURRENCY=USD` (shop setting verified by owner screenshot and runtime getShop);
   - `P01_SELLER_APPROVED_PRICE_USD=3.90` (ONLY after explicit seller price sign-off);
   - `P01_QC_APPROVED_SOURCE_FINGERPRINT=04cf97646f850d571ebd9776b622b03ed44870986036ab2b86d9622745ebe007` (ONLY after independent source review);
   - `P01_QC_APPROVED_REPORT_SHA256=3b6838c2103e35641569c738fc33015a4b14b9014ccac09bd5c0015ddc49becd` (ONLY after reviewing that exact report/Drive ID `1HW1KNQ66_8h4XWclXs5nhNM_KT3L96UL`);
   - `P01_QC_REVIEWED=P01_V1_2_1_APPROVED` (ONLY on reviewer approval of physical/seller and digital QC evidence);
   - `P01_APPROVED_TAXONOMY_ID` as a real Etsy Seller Taxonomy ID for the digital printable; do not guess;
   - `P01_APPROVED_QUANTITY` as seller-approved positive integer;
   - `P01_APPROVED_WHO_MADE` as seller-confirmed enum (`i_did`, `someone_else`, or `collective`);
   - `P01_APPROVED_WHEN_MADE` as seller-confirmed Etsy-current enum (for example, `2020_2026` if accurate);
   - `P01_APPROVED_LISTING_FINGERPRINT` as the actual canonical hash of exact `title,description,priceUsd,tags,quantity,taxonomy_id,who_made,when_made,type=download,state=draft` using the repo's candidate-fingerprint.v1 method. Compute only after final fields are approved; don't use a placeholder.
4. From **Actions → Etsy - P01 direct Draft (no Vercel) → Run workflow**, on `main`, run `mode=CHECK`. Await protected environment review. It uses Etsy Open API directly and performs no Etsy listing mutation; OAuth refresh POST is authentication only. It verifies shop and complete seller listing scan (draft and other selling states) to prevent duplicate titles.
5. ONLY when the source evidence, seller price and independent QC, category data, secure OAuth secrets and approved fingerprint have been reviewed, manually run `mode=CREATE_DRAFT`, `confirmation=CREATE_P01_DRAFT_ONLY`. The operator sends **one** Etsy `createDraftListing` POST. It reads back the new Etsy Listing ID from Etsy, verifies state `draft`, `listing_type=download`, title, price, tags, maker, category and description. A contradictory or ambiguous result **stops, never retries automatically**.
6. Review the Draft Listing ID and prepare a **separately approved** asset-upload workflow for 2 verified PDFs, 7 listing JPG and 1 listing video. GitHub repository is public; **do not commit raw buyer PDF/JPG/video files or place OAuth credentials in the repository**. Avoid GitHub Actions uploads until a secure source transport is approved. Do not activate/publish P01 without another explicit seller approval.

## Operational notes

- This replaces the previous P01-specific `.github/workflows/etsy-p01-draft-create.yml` that sent authenticated calls to Vercel. It is a new **direct Etsy provider path**, not a reconfiguration of Vercel Hobby.
- GitHub Actions job concurrency serializes direct P01 runs, and a paginated duplicate-title read prevents an obvious second Draft. Etsy does not expose our local operation ID; if connection drops after the single create POST, reconcile directly from Etsy before authorizing any new run. No blind repeat.
- Etsy access tokens have short lifetimes, refresh tokens longer; operator uses a new in-memory access token from Etsy via refresh grant. GitHub does not save token response, and **refresh-token rotation may require the environment owner to update the stored secret** securely after a run.
- Metadata Draft only: **no uploaded buyer files, no photos, no video, no Publish**.
- No GitHub connector action in this conversation has administrative Environment/Secrets provisioning or `workflow_dispatch`. Environment creation, seller OAuth provisioning and manual workflow review/dispatch are not performed by adding this code.

## Etsy and GitHub references

- Etsy: https://developers.etsy.com/documentation/tutorials/listings/
- Etsy OAuth: https://developers.etsy.com/documentation/essentials/oauth2/
- Etsy API schema: https://developers.etsy.com/documentation/reference/
- GitHub environments: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments