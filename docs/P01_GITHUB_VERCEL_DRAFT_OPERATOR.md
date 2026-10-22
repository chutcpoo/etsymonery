> SUPERSEDED (2026-10-22): P01 Draft workflow now calls Etsy Open API directly via GitHub Actions, without Vercel. See `docs/P01_GITHUB_DIRECT_ETSY_DRAFT.md`. Historical instructions below must not be executed.

# P01 Draft-only GitHub → Vercel → Etsy operator

**Status: NOT EXECUTED.** No Draft created by this change. Nothing here authorizes Publish, an all-product write flag, or production deployment.

This is a manually dispatched one-shot operator, not a scheduled/auto-triggered job. It reuses the existing `/api/etsy/drafts` endpoint and its exact candidate fingerprint, independently server-pinned QC, product plan, OAuth grant and Neon operation ledger. Only the listing metadata is created. Uploaded photos, video, and buyer PDFs must be handled by a separate approved asset upload path after a verified Draft ID is returned.

## Before running

1. Verify Google Drive v1.2.1 byte hashes for 2 PDFs, 7 JPG, 1 MP4 against manifest, canonical QA markdown and ZIP; record independent QC and seller signoff. User self-attestation is not a server-side QC pin.
2. Confirm Etsy shop 23582741, digital listing taxonomy, `who_made`, `when_made`, quantity, 13 approved tags, description, shop currency and specifically approved USD 3.90; freeze a real P01 Candidate fingerprint and canonical Listing fingerprint using `lib/candidate-fingerprint.ts`. No placeholder hashes.
3. Set protected GitHub environment **variables** `P01_DRAFT_PRICE_APPROVED_USD=3.90` and `P01_DRAFT_SHOP_CURRENCY_VERIFIED=USD` **only after seller price approval and an independent Etsy shop currency check**. The script fails before network calls if absent or different.
4. Secure and review the exact `P01_DRAFT_REQUEST_JSON` matching `parseGenericDraftRequest` with `action=CREATE_DRAFT`, unique operation ID `P01-DRAFT-*`, exact Candidate/Listing fingerprints, `qc.state=QC_PASSED`. Put it in the **protected** GitHub Environment `etsy-p01-draft` secret. An erroneous payload MUST be fixed BEFORE dispatch; do not re-dispatch with a new operationId if Etsy outcome was uncertain.
5. Configure **GitHub Environment** `etsy-p01-draft`: required reviewers and branch restriction `main`; secret `P01_DRAFT_OPERATOR_TOKEN` separately sourced through an approved secure secret management process (never pasted into chat or committed). Operator secret must be the same as the server-side `ETSY_DRAFT_WRITE_TOKEN` but is never read back or transferred by this PR.
6. Independently review Vercel production app/plan/license conditions, required approved product plan and exact `ETSY_QC_APPROVED_*`, `ETSY_GENERIC_DRAFT_APPROVED_*`, `ETSY_SHOP_ID` pins. Enable **only** `ETSY_DRAFT_WRITES_ENABLED` and `ETSY_GENERIC_DRAFT_WRITES_ENABLED` for the controlled single action once all approval gates are satisfied. Keep `PUBLISH_WRITES_ENABLED=false`, `ETSY_EXACT_PUBLISH_WRITES_ENABLED=false`; do not broaden product allowlists. Production environment changes may require a redeployment and explicit user authorization.
7. Require deployment `READY`, exact approved SHA and `GET /api/etsy/release` reporting production + that exact SHA; `GET /api/etsy/status` must show draftWritesEnabled true, sellerWriteGrantReady true, publish false. `GET /api/etsy/drafts` genericDraftWritesEnabled must be true.
8. Manually dispatch workflow `Etsy - P01 exact draft create (never publish)` with `deployment_sha` + exact phrase `CREATE_P01_DRAFT_ONLY`; complete GitHub protected-environment approval. It performs read-only shop and duplicate scan, syntax-only POST PREFLIGHT, exact CREATE_DRAFT, then authenticated GET seller readback. Workflow contains **no Publish**, PATCH, DELETE, or asset POST operations.
9. Review receipt and exact Listing ID; **disable draft write gates immediately** via approved Vercel environment-change procedure after confirmed state. Reconcile ambiguous result using the same operation ID; do not retry with a new ID.
10. For buyer PDFs/images/video upload and independent Etsy readback, use a separately authorized operator with canonical Google Drive bytes. This workflow does **not** upload assets.

### Current blockers

- As of 2026-10-22 live production: both draft write gates are `false`, `PUBLISH_WRITES_ENABLED` is false; shop seller snapshot has 0 Drafts.
- Exact final Listing/Candidate fingerprints and approved product plan are not verified in current pre-release evidence.
- Required protected GitHub environment secrets/reviewer policy are not verified.
- Vercel team is Hobby; review Vercel's non-commercial plan restrictions before using Vercel as a seller-facing commercial publisher. This PR is source-only and does not authorize a use that violates those terms.
- Deploy/merge to `main` would be a separate production code change; do not merge this PR without explicit approval.

No secret values in repo, GitHub Actions inputs, PR comments, user messages, or logs.