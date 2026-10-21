# ChatGPT-connected Google Drive → PoonthaiDigital asset handoff (without Service Account)

Added 2026-10-21. This is an ALTERNATIVE to the existing
`/api/etsy/drive-assets` backend-pull mode. It **does not require**
`GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`.

## What is proven vs not proven

- Google Drive connected to ChatGPT can read the canonical ETSY DIGITAL root and
  hand off exact original PDF/JPG bytes via connected files / a capable operator.
- `POST /api/etsy/chat-assets` accepts multipart bytes with `manifest` JSON
  and `asset` file, rechecks filename, byte size, SHA-256 and file signature.
- `PREFLIGHT` never calls Etsy; it is safe without write gates.
- **No claim that backend validated the Google Drive file ID.** The file ID
  supplied by the client is an assertion. The server requires a separately pinned,
  independently reviewed exact asset allowlist before an Etsy upload.
- The full upload path reuses existing `lib/etsy-draft-assets-api.ts`,
  Etsy draft readback, fingerprints and Neon operation ledger.
- `PUBLISH` is separate and disabled until exact seller authorization.
- Existing Chat Mode Google Drive tool reads files but cannot itself issue an
  authenticated multipart POST to an arbitrary URL. To perform the action
  end-to-end FROM CHAT, a connected private action plugin or Work/browser
  operator with appropriately scoped backend authorization is still needed.
  A public endpoint or bearer token pasted into chat is NOT an alternative.

## Exact API

`GET /api/etsy/chat-assets`: safe read-only readiness without secrets.

`POST /api/etsy/chat-assets`:
- Header: `x-autodigitalpublisher-write-token`, provided by an authorized operator
  (not exposed to the chat or the browser client).
- Body: `multipart/form-data`
- `manifest`: JSON with the same shape as `/api/etsy/drive-assets` POST;
  action `PREFLIGHT` or `UPLOAD`. Product/Candidate/Listing SHA-256 and
  independent QC assertions must agree.
- `asset`: an actual file matching `assetName`, `expectedSha256`,
  `expectedBytes`, expected MIME and file signature.
- Current hard limit: 3 MiB/file and 4 MiB/request (P01 PDFs/JPGs fit).
- Preflight returns `SOURCE_BYTES_VERIFIED`, `ETSY_WRITE_COUNT=0`,
  `sourceDriveIdVerifiedByServer=false`. No seller approval implied.

`UPLOAD` is fail-closed unless ALL of:
- `ETSY_CHAT_ASSET_WRITES_ENABLED=true`, `ETSY_DRAFT_WRITES_ENABLED=true`.
- `ETSY_SHOP_ID` matches exact payload.
- Exact `ETSY_CHAT_APPROVED_PRODUCT_ID`,
  `ETSY_CHAT_APPROVED_CANDIDATE_FINGERPRINT`,
  `ETSY_CHAT_APPROVED_DRAFT_LISTING_ID`.
- Independently reviewed QC pins (existing `hasServerVerifiedQc`).
- `ETSY_CHAT_APPROVED_ASSETS_JSON` is a server-only reviewed snapshot of the
  exact root, product, candidate, listing fingerprint and approved file hashes.
- Existing approved Product Creation Plan is `BUILD_PERMITTED`.
- Existing draft uploader verifies remote draft state, exact fingerprint,
  idempotent ledger and provider resource readback.

## P01 source manifest

Use Product Truth: `ETSY DIGITAL` Drive root
`1F2c8J04_Crv1GzN0KBMwlChxvBaYo7px`. Verified inventory:
2 separate customer PDFs and 7 JPG listing images. Verified file IDs,
names, sizes and hashes are in the stored P01 source approval and verification
reports in `05_QA_AND_TEST_REPORTS/P01_HOME_MAINTENANCE`.
P01 seller review and independent final QC are pending. Do not set any
upload/write flags for P01 until a draft and exact authorization exist.

## Production rollout

The current implementation is staged on a feature branch. Validate CI,
Preview GET, read-only upload-rejection tests and a real source-byte
preflight via an authenticated transport. Do not make the branch a
general-purpose unauthenticated file upload service.

## Source-only preflight (new)

`GET /api/etsy/chat-assets/source-preflight` reports readiness and whether
operator authentication and the source root are configured. It does not
read files or make Etsy calls.

`POST /api/etsy/chat-assets/source-preflight` is an **authenticated read-only**
multipart endpoint for P01 before a Candidate Fingerprint or Etsy Draft ID exists.
The `manifest` JSON requires only:
`action="SOURCE_PREFLIGHT"`, `sourceRootId`, `productId`, `driveFileId`,
`assetName`, `expectedSha256`, `expectedBytes`, `kind` and `rank`.
The `asset` field contains the exact original PDF/JPG bytes.
The route validates operator auth, pre-approved configured root, file identity,
filename, byte count, declared MIME, magic number and SHA-256. It **never** calls
Etsy, never stages a draft, and always reports `ETSY_WRITE_COUNT=0`.
The Drive file ID is **client asserted**, not API-verified by Vercel.
Run this from a properly authenticated Work/connector operator. A Google Drive
Service Account is not needed.

Operator token must be set separately as a Vercel secret, never sent to ChatGPT
or stored in the bundle. The ordinary Chat Mode connector still cannot call
arbitrary authenticated multipart endpoints, so a capable operator is required.
