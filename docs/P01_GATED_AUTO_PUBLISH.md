# P01: GitHub -> Vercel -> Etsy exact auto-publish

Status: **IMPLEMENTED AS AN APPROVAL-GATED RUNNER; NOT ARMED / NOT PUBLISHED.**

This uses the existing Vercel application and its \`POST /api/etsy/release\`
handler. No new Etsy client, Etsy OAuth token copy, or generic listing PATCH
endpoint is created. The workflow is *manual dispatch*; once the separate
reviewer approval is granted, a single run performs server-side preflight,
exact listing publish, and readback without manual Shop Manager clicks.
This is not unattended, unauthorized publication of new inventory.

## Paths

- \`.github/workflows/etsy-p01-gated-auto-publish.yml\`
- \`scripts/etsy-p01-exact-release.mjs\`
- \`tests/etsy-p01-exact-release.test.mjs\`
- Existing \`/api/etsy/release\` and \`/api/etsy/seller-state\` remain authoritative.

## Hard limits

- Etsy Shop ID: **23582741**, Product ID: **P01**. The runner cannot choose another shop/product.
- Only the *pre-approved* existing P01 Draft ID; its exact Candidate and Listing fingerprints are pinned.
- Exactly **7 listing images** and **2 customer PDFs**:
  - \`Home_Maintenance_Starter_A4.pdf\`
  - \`Home_Maintenance_Starter_US_Letter.pdf\`
- The listing is **non-fillable, print-and-write**, US Letter & A4, 12 pages per size.
- Proposed P01 price: **USD 3.90**, to be independently confirmed on the actual Etsy Draft and included in the server-verified listing fingerprint.
- Preflight never publishes. Wrong counts, filenames, price/listing fingerprint, or approved asset-set SHA blocks publishing.
- The server additionally enforces QC report, approved plan, exact seller approval, frozen Etsy Draft identity, and idempotent transaction ledger. Any mismatch must fail closed.
- Never enable a bulk/generic Etsy publish bypass.

## What is still required before a real publish

1. Create the Etsy **P01 Draft** using the *separately authorized* generic Draft workflow. Confirm the returned Listing ID and USD 3.90 price. There is no confirmed P01 Draft ID yet.
2. Upload the 7 image previews and only 2 buyer PDFs to **that Draft**. Review exact final file identity; the internal Seller ZIP is not a buyer download.
3. Perform the final seller/physical-print review. Independently verify the corrected P01 v1.2.1 QA ZIP, manifest, current Drive QA report, and buyer files.
4. Ensure a **PLAN_APPROVED** P01 Product Creation Plan exists in the configured durable plan store. The repository's legacy exemptions do not include P01.
5. Ask \`POST /api/etsy/release\` to run \`PREFLIGHT\` first, with the existing operator credential. Capture the returned **assetSetSha256**. Verify the approved asset set and Etsy price; don't approve an arbitrary hash from an unverified listing.
6. Configure a GitHub environment named **etsy-p01-readonly** for the read-only preflight job; the environment receives the exact P01 metadata (below). Use a **different environment named etsy-p01-publish** with a **required human reviewer** and restrict deployment branches to \`main\`. Note that required reviewer controls may depend on repository plan/visibility.
7. Configure GitHub **environment variables** (non-secret):
   - \`P01_DRAFT_LISTING_ID\`: confirmed Etsy P01 Draft ID.
   - \`P01_CANDIDATE_ID\`: exact approved candidate ID.
   - \`P01_CANDIDATE_FINGERPRINT\`: 64-character lowercase SHA-256.
   - \`P01_LISTING_FINGERPRINT\`: frozen fingerprint for the verified USD 3.90 digital Draft metadata.
   - For **etsy-p01-publish only**: \`P01_APPROVED_ASSET_SET_SHA256\` from the reviewed preflight and \`P01_PUBLISH_ENABLE=YES_FOR_THIS_LISTING\`.
8. Configure GitHub **environment secrets** (never commit or print these):
   - \`ETSY_DRAFT_WRITE_TOKEN\`: the existing Vercel operator bearer, provided securely by an authorized operator; do not retrieve it into chat.
   - For **etsy-p01-publish only**: \`P01_RELEASE_AUTHORIZATION_JSON\`: the exact current, time-bounded seller-approved \`PublishAuthorizationGrant\` for that one Candidate/Shop/Draft, never a reusable blanket approval.
9. In **Vercel Production**, ensure seller-approved exact pins: \`ETSY_QC_APPROVED_*\` (current reviewed QA), \`ETSY_EXACT_PUBLISH_PRODUCT_ID=P01\`, \`ETSY_EXACT_PUBLISH_CANDIDATE_FINGERPRINT\`, \`ETSY_EXACT_PUBLISH_DRAFT_ID\`, \`ETSY_EXACT_PUBLISH_ASSET_SET_SHA256\`, \`ETSY_EXACT_PUBLISH_AUTHORIZATION_ID\` and \`ETSY_SHOP_ID=23582741\`. Only for the authorized exact release, set **both** \`PUBLISH_WRITES_ENABLED=true\` and \`ETSY_EXACT_PUBLISH_WRITES_ENABLED=true\`. Do not enable the generic Draft or asset-upload flags for publishing.
10. Vercel environment-variable changes require a **new deployment** to affect runtime. Validate on Preview with mocked provider calls and all real write flags OFF before any production arming. After production activation, run status and authenticated preflight, then choose the GitHub Actions **P01** workflow \`publish\` and type \`PUBLISH_P01_ONLY\`. GitHub's protected environment reviewer separately approves the exact run.
11. Confirm \`PUBLISHED_VERIFIED\` with the actual listing ID and unchanged unrelated listing states. If the release is ambiguous, inspect read-back/ledger; do **not** re-run with a different operation ID. After success, revoke/disable the one-time authorization and production publish flags, and deploy the disabled state.

## Current limitations and security boundary

- GitHub Actions, Vercel and Etsy connectors do not automatically share operator secrets. The current Make relay has a generic URL input and no Vercel operator bearer. **Do not paste a reusable Vercel write token into that arbitrary-URL relay**.
- No actual P01 listing has been published by adding this automation. Merely merging code or changing the workflow does not turn on Etsy write access.
- A generic automatic schedule is deliberately omitted: public listings must always have a fresh, separately approved release grant.
- \`/api/etsy/release\` checks file *names/count and Etsy asset IDs*, not Etsy-hosted PDF byte-level SHA; source-side QA/hash evidence remains mandatory.
- If the P01 Draft does not exist, seller approvals/production pins are absent, or required GitHub environment protection is unavailable, publishing **must remain BLOCKED**.

## Test commands

\`\`\`sh
node --test tests/etsy-p01-exact-release.test.mjs
npm test
npm run typecheck
npm run build
\`\`\`

The tests mock seller state, the Vercel release preflight, and the publish response; no test contacts or alters the Etsy shop.
