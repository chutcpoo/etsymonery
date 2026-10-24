# P01 — direct GitHub Actions to Etsy, without Vercel relay

2026-10-23. DRAFT CODE ONLY / NO ETSY WRITES / P01 HOLD.

## Existing behavior and precise fix

The repository has a complete P01-specific direct runner at .github/scripts/etsy-p01-draft-direct.mjs with CHECK (read-only) and CREATE_DRAFT (one metadata Listing POST, readback, never Publish), plus offline tests. However, .github/workflows/etsy-p01-draft-create.yml previously invoked a different script, etsy-p01-draft.mjs, that relayed the write to the Vercel production server.

This feature branch changes the *existing* workflow to use the direct runner. It does not add another competing create-Draft workflow and does not require any Vercel deployment or subscription change. It is manual workflow_dispatch only, restricted to refs/heads/main and protected GitHub Environment etsy-p01-draft, serial per-P01. Branch and environment protection controls require verification by an authorized repo administrator before use.

## Workflow inputs

- action: CHECK (default) or CREATE_DRAFT
- source_fingerprint: must match canonical P01 fingerprint 04cf97646f850d571ebd9776b622b03ed44870986036ab2b86d9622745ebe007 (read from the existing Source Lock)
- confirmation: CREATE_P01_DRAFT_ONLY, only for exact separately approved Draft creation

CHECK requests a fresh Etsy access token through the OAuth refresh endpoint and issues only Etsy Listing GETs, verifying shop ID/name/currency and no duplicate title. CREATE_DRAFT requires all existing independent QC, seller price, source fingerprint, listing fingerprint and taxonomy/maker/date/quantity gates before at-most-one Etsy Listing POST. Its final readback does not prove buyer assets were uploaded. Never retry an ambiguous create with a new operation ID.

## Protected environment prerequisites (unverified)

Use GitHub Environment encrypted secrets for P01_ETSY_API_KEY, P01_ETSY_SHARED_SECRET and P01_ETSY_OAUTH_REFRESH_TOKEN, and P01_APPROVED_DESCRIPTION. Existing Vercel OAuth does not automatically populate these GitHub secrets. Never expose credential values in GitHub source, workflow inputs or chat. Require actual independent reviewer approvals and a main-only Environment restriction.

Use GitHub Environment vars for approved USD price 3.90, shop currency USD, canonical source/report fingerprints, P01_QC_REVIEWED, Etsy-provider-verified taxonomy ID, positive quantity, maker/date and exact Listing Fingerprint. Do not set P01_QC_REVIEWED merely from the seller's own physical print attestation: Independent Final QC remains separately pending. Do not invent taxonomy or attributes.

## Known operational risk

Etsy refresh-token responses can provide a replacement token, and the current direct script does not update its GitHub Environment secret with that replacement. Repeated unattended operation is NOT certified until token lifecycle/storage is robust. This branch prepares a safe exact-P01 direct path, not an always-on multi-product publisher.

The direct runner creates a metadata Draft only. Separate authenticated image, video and two customer-PDF upload/reconciliation steps remain to be implemented and authorized. No source ZIP goes to customers.

## Review sequence

1. Inspect the code and CI/offline safety suite, including .github/scripts/etsy-p01-direct-workflow.test.mjs. PR #276 and PR #281 remain independent.
2. Verify GitHub Environment protected reviewers, main-only restriction and secrets without disclosing values.
3. Obtain exact seller-taxonomy and shop identity from authenticated read-only Etsy API evidence; freeze listing metadata and fingerprint.
4. Obtain independent Final QC evidence bound to the ten exact source hashes.
5. Separately approve merge to main; execute a protected read-only CHECK.
6. Separately authorize one exact P01 CREATE_DRAFT, verify Etsy Draft ID and state.
7. Validate separate buyer files, gallery and video upload automation prior to any separate Publish decision.

Nothing in this branch authorizes a GitHub merge, Production deployment, Etsy Draft, file upload, Publish, new credentials, or paid service.

## Additional default-off marketplace write gate (added during merge-readiness review)

GitHub Environment variable `P01_DIRECT_DRAFT_WRITES_ENABLED` defaults to unset/false. For action `CREATE_DRAFT`, the direct runner explicitly requires the exact string `true` before any OAuth network request; neither a workflow_dispatch confirmation nor the presence of credentials alone can open the Draft path. Action `CHECK` is unchanged. Never enable this variable until independent final QC, exact listing fingerprints, environment protection and separate seller Draft authorization have all been confirmed. A verified default-off test is included in the protected offline safety suite.

## Current inspection limits

The GitHub connector in this session exposes PR diffs, Actions CI, code and reviews but does not provide repository Environment configuration or Secret inventory endpoints. The GitHub public resource fetcher rejects `/environments`; therefore existence, protection reviewers, main-only policy and Secrets cannot be asserted from a workflow file. The required Secrets are scoped credential names, not evidence they are configured. No OAuth tokens or other Secrets were retrieved. A successful CI mock test does not prove authenticated Etsy CHECK can run.
