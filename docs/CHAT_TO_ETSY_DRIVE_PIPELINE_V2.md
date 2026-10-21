# Chat → Google Drive → Etsy: asset bridge v2 (2026-10-21)

## Current implementation (additive, not a replacement)

Existing systems remain authoritative:
- Google Drive Product Truth, customer assets and independent QC
- `lib/product-creation-plan` approved-plan build gate
- `lib/etsy-draft-assets-api.ts`, `EtsyDraftAssetProvider`, and Neon operation ledger
- `lib/authorized-publish-api.ts` exact authorization, and the protected live publish gate

New: `/api/etsy/drive-assets` accepts exact Drive file identity and relays bytes to the
**existing** Etsy draft upload handler, after independent source verification.
No credentials are embedded in code, tokens never appear in responses.
No production flag is enabled by this change.

## One-time Google Drive setup

ChatGPT-connected Google Drive authorizes ChatGPT tools, **not the Vercel application**.
Set `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` as a Vercel **sensitive secret** with a
dedicated, read-only Google Cloud service account (the full JSON, never in GitHub).
Set `GOOGLE_DRIVE_SOURCE_ROOT_ID` to the canonical Product Truth folder ID.
Share only that root and required children with the service account's
`client_email`. Test that the account can download blob PDF/ZIP/JPG/PNG assets.
Google-native Docs/Sheets need explicit reviewed exports to blob files first.
Do not reuse an old or inaccessible canonical root. If the approved root cannot
be accessed, stop rather than silently changing identity.

The bridge uses the OAuth JWT assertion grant for Drive `drive.readonly`, checks
that the Drive file is within the approved root, checks filename, byte count and
SHA-256, and then passes the exact bytes to the already tested Etsy uploader.
Images are limited to 10 MiB (JPG/PNG), customer PDF/ZIP files to 20 MiB.

## API

`GET /api/etsy/drive-assets`: read-only configuration readiness (no secrets).

`POST /api/etsy/drive-assets` with
`x-autodigitalpublisher-write-token: <existing secure operator token>` and JSON:

```json
{
  "action": "PREFLIGHT",
  "operationId": "APPROVED-EXACT-OPERATION-ID",
  "productId": "PDT-EXAMPLE-001",
  "candidateId": "CAND-EXAMPLE-001",
  "candidateFingerprint": "<sha256>",
  "expectedListingFingerprint": "<sha256>",
  "shopId": 23582741,
  "draftListingId": 1234567890,
  "kind": "UPLOAD_FILE",
  "driveFileId": "<canonical Drive file ID>",
  "assetName": "customer.pdf",
  "expectedSha256": "<actual SHA-256 of Drive bytes>",
  "expectedBytes": 10240,
  "rank": 1,
  "qc": {
    "productTruthVerified": true,
    "testerFingerprint": "<candidate sha256>",
    "independentFinalQcFingerprint": "<candidate sha256>",
    "state": "QC_PASSED"
  }
}
```

`PREFLIGHT` reads Drive only and returns `ASSET_VERIFIED` with
`ETSY_WRITE_COUNT: 0`. Its QC fields are assertions, **not independently
verified** by preflight. Never treat a preflight PASS as approval to sell.

Change `action` to `UPLOAD` **only** for a separately approved candidate and
draft, after QC independent verification, and after explicitly setting all:
- `ETSY_DRAFT_WRITES_ENABLED=true`
- `ETSY_DRIVE_ASSET_WRITES_ENABLED=true`
- `ETSY_DRIVE_APPROVED_PRODUCT_ID=<exact product>`
- `ETSY_DRIVE_APPROVED_CANDIDATE_FINGERPRINT=<exact candidate hash>`
- `ETSY_DRIVE_APPROVED_DRAFT_LISTING_ID=<exact existing draft ID>`
- Valid `ETSY_DRAFT_WRITE_TOKEN`, `ETSY_SHOP_ID`, Etsy `listings_w`

For `UPLOAD` the build plan must also be `PLAN_APPROVED` and **cannot**
rely on the legacy exemption. The existing provider re-verifies that Etsy
listing is still a draft and matches the frozen listing fingerprint, then
uploads one source-verified image or file and reads back the resource ID.
Operation IDs are single-use/idempotent; ambiguous failures require read-only
reconciliation, never blind retry.

## Remaining gates to a full chat-driven one-click publishing experience

1. Confirm the **same** canonical Drive root is accessible to the service account.
2. Have independent QC review the actual final files and bind stored QC evidence,
   not just user-supplied `qc` JSON assertions.
3. Build the generic metadata `CREATE_DRAFT` executor, using existing Neon ledger
   and exact Candidate/Shop approval; still default OFF.
4. Confirm every buyer file and gallery asset exists remotely, not merely its
   returned upload receipt. Etsy API cannot provide authoritative file-byte SHA.
5. Require separate seller authorization for the exact final publish operation.
6. Wire an authorized ChatGPT Work/browser or equivalent client executor to POST
   the Vercel endpoint; the ordinary Etsy app only supports listing discovery.
7. Keep `PUBLISH_WRITES_ENABLED=false` until those checks and explicit
   seller approval.

Do not claim the integration is completely production-ready while any of the
above are missing. Preview tests must use fixtures and all write flags OFF.
