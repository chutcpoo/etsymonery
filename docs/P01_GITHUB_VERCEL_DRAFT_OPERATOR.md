# P01 Draft-only: GitHub Actions → existing Vercel OAuth → Etsy

**Status (2026-10-22): RESTORATION PROPOSAL ONLY.** This workflow reuses Etsy OAuth tokens already stored securely in Vercel. The seller does not need to connect Etsy OAuth again or copy Etsy API key/refresh token to GitHub.

- P01 exact target: shop ID 23582741, title "Home Repair & Maintenance Tracker PDF | Repair to Warranty Log Kit | A4 & US Letter Printable".
- Seller screenshot confirms Etsy shop listing currency **USD**. Proposed introductory price is **USD 3.90**, but final seller approval of that price is still not independently established.
- 10 raw P01 source asset hashes and the deterministic source fingerprint are frozen in `docs/releases/P01_CANDIDATE_SOURCE_LOCK_2026-10-22.json`.
- The seller reported that physical print tests and seller signoff were completed; the independently reviewed current proof and server-side QC approval pins have not been verified.
- Current live Vercel production already has Etsy OAuth, but `ETSY_DRAFT_WRITES_ENABLED=false`, `ETSY_GENERIC_DRAFT_WRITES_ENABLED=false`, and Publish writes remain OFF.

## What changes in this PR

Restore the pre-PR-279 manual `.github/workflows/etsy-p01-draft-create.yml` and its fail-closed Vercel Draft-only operator. The GitHub runner calls Vercel `POST /api/etsy/drafts` with the **separately protected operator authorization**. The Vercel server—not GitHub—uses its stored Etsy OAuth tokens to access Etsy. Do not store Etsy OAuth refresh tokens or API credentials in GitHub for this route.

## Remaining exact Draft gates (not bypassed)

1. Independently verify the approved plan, actual A4/Letter test and seller signoff evidence against the frozen source hashes; pin `ETSY_QC_APPROVED_*` and exact `ETSY_GENERIC_DRAFT_APPROVED_*` to the current candidate/listing identities on the server.
2. Confirm the exact Etsy digital taxonomy, `who_made`, `when_made`, quantity, final English description, the 13 tags, USD 3.90 seller-approved price, and calculate `expectedListingFingerprint` from the exact request using `lib/candidate-fingerprint.ts`. No invented values.
3. Verify the protected `etsy-p01-draft` GitHub Environment with mandatory reviewers and `main`-only branch restriction. The GitHub runner **still requires** a protected `P01_DRAFT_OPERATOR_TOKEN` that matches Vercel `ETSY_DRAFT_WRITE_TOKEN`, plus `P01_DRAFT_REQUEST_JSON` and exact price/currency vars. These are operator authorization values, not Etsy OAuth; their presence has not been verified. No secrets in chat or source control.
4. Before activating Vercel write gates for a commercial seller operation, use a deployment path that satisfies Vercel's plan terms; Hobby does not authorize commercial use just because a Draft route is technically available.
5. Only after all gates: turn on **Draft-only** exact flags for the controlled operation, run a read-only seller/duplicate preflight, dispatch the protected GitHub workflow once, verify Etsy Draft listing ID/state, then immediately close both Draft write gates. **Never enable Publish** as part of Draft creation.

## Important

GitHub Actions cannot inherit a Vercel secret just by using the same GitHub repository, and the ChatGPT Vercel read-only fetch tool cannot send a private authorized POST. Restoring the old workflow avoids re-connecting Etsy OAuth but does **not** by itself complete the authorizations, configure operator credentials, or create an Etsy Draft.

There is currently no verified P01 Etsy Draft ID, and buyer PDFs/images/video still require a separately approved upload operation after Draft creation. Do not rerun an uncertain Etsy write with a new operation ID.
