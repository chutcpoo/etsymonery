# Etsy exact-approved auto-publish (GitHub + Vercel)

This workflow enables a **single, exact Etsy Draft** to be published from a protected GitHub Actions job after seller approval. It does not authorize publishing by itself, and it does not create Drafts or upload digital files.

## Safety contract

- The existing Vercel `POST /api/etsy/release` route remains the only release executor.
- The new GitHub workflow is `Etsy - Exact approved listing publish` (`workflow_dispatch`).
- The workflow must use GitHub Environment `etsy-production-release` with required reviewers and a branch policy restricted to `main`. Configure the environment protections before adding any release secrets.
- GitHub environment secrets required: `ETSY_RELEASE_OPERATOR_TOKEN`, `ETSY_RELEASE_REQUEST_JSON`, `ETSY_RELEASE_ASSET_SET_SHA256`. Do **not** put credentials in workflow inputs, code, repository files, chat, or logs.
- `ETSY_RELEASE_REQUEST_JSON` contains an exact `PUBLISH` authorization grant for only the product, candidate, shop, and existing Draft Listing ID. Use a unique `operationId` for each new release, but retry the *same* operationId when reconciling an uncertain result.
- Vercel must separately have an active production approval for the same product/candidate/listing/image-file asset set. Server-side flags `PUBLISH_WRITES_ENABLED` and `ETSY_EXACT_PUBLISH_WRITES_ENABLED` remain **false by default**. Never enable them without exact current QC, a verified Draft and seller authorization.
- Vercel must have a configured, private `ETSY_DRAFT_WRITE_TOKEN` matching the GitHub secret, and exact server-side QC and release pins. GitHub secrets do not override Vercel authorization.
- Github workflow inputs: exact `product_id`, `listing_id`, deployed `deployment_sha` and exact phrase `PUBLISH_EXACT_LISTING`.
- The job compares the SHA against the `deployedCommitSha` from Vercel's read-only GET status before sending any POST. It performs a read-only `PREFLIGHT` and requires an exact, pinned image/file hash before sending one `PUBLISH`.
- Only `PUBLISHED`, `RECONCILED`, or `REPLAY` with a matching listing ID and confirmed active/published state counts as success.
- If the operation returns an ambiguous result, **do not rerun with a new operationId**; reconcile it from live Etsy data and the operation ledger first.
- No automatic publish trigger is enabled for all products. One seller-authorized release is required per Listing ID.

## To activate after QA and seller approval

1. Finish the physical print check and store independent final QC for the exact current artifact hashes.
2. Create the Draft via the existing gated Vercel Draft route; upload and verify the two actual buyer PDFs and all seven listing images. Read back the Etsy Draft ID, price (USD 3.90 for P01), title, tags, image count and buyer file names.
3. Run authenticated `/api/etsy/release` `PREFLIGHT` on the exact Draft and obtain `assetSetSha256`.
4. Configure Vercel's exact server-side release approval and GitHub Environment required reviewers and per-listing secrets. Do not enable broad writes for other listings.
5. Ensure Vercel deployment is READY and matches the approved GitHub SHA.
6. Dispatch `Etsy - Exact approved listing publish` with the exact listing/product/commit and phrase. Review the environment approval gate.
7. Verify the workflow's Etsy Listing ID and independently read back the listing as Active.
8. Disable the exact release flags/pins and rotate or remove per-release GitHub environment secrets.

## Current status of P01

At preparation time the P01 product had no Etsy Draft Listing ID, and physical print QA was pending. Its Publish authorization was **not** granted. This workflow addition must not change existing Etsy listings.

## Additional P01 integrity lock

For Product ID `P01`, the existing GitHub release runner now rejects a release **before any network request** unless `shopId=23582741`, `expectedImageCount=7`, and the buyer filename set is exactly `Home_Maintenance_Starter_A4.pdf` plus `Home_Maintenance_Starter_US_Letter.pdf`. It also requires a v1.0.0 seller grant with `channel=etsy`. After authenticated Vercel preflight, the runner independently checks the buyer filenames reported by Etsy, not merely the image count and asset-set fingerprint. These checks do not replace the exact Vercel server-side QC and authorization pins. Keep the price at the specifically approved P01 **USD $3.90** in the final frozen listing fingerprint, and confirm Etsy's draft price before approval.

This change does **not** create the P01 Draft, activate Vercel flags, configure GitHub environment secrets, or publish any listing. Use the existing `.github/workflows/etsy-exact-auto-publish.yml` workflow only; do not create a parallel P01 publish workflow.
