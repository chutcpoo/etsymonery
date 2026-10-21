# Digital product roles & safe Etsy buyer delivery (2026-10-21)

## Architecture (the controlling intent)

1. **ChatGPT — creator of the actual sellable product.** Research, seller-led
   original design, generate final customer PDFs/ZIPs (plus genuine preview
   images), inspect pages, audit the contents, and deliver artifacts to the
   seller's private canonical Google Drive product folder. Do **not** hand
   digital-product generation over to GitHub/Vercel.
2. **Private Google Drive — product source of truth.** Store final byte-exact
   files, revision identity, independent QC evidence and original creator
   instructions. GitHub and Vercel should store only hashes and safe metadata;
   do not put buyer-product binaries in the public GitHub repository.
3. **GitHub — release control + repeatable QC.** Version validators, tests,
   immutable manifest schema and review gates. Code CI passing is a check of
   the validator implementation, **not a buyer-product QC pass**.
4. **Vercel — online protected validation and Etsy API operator.** Accept
   ChatGPT-generated files via a private authenticated transport, validate
   bytes and checksums, compare exact expected Listing/asset identities, upload
   independently approved assets to an Etsy Draft only when dedicated gates
   permit, and finally publish only with exact seller consent and a fresh
   Etsy readback. Do not create or host buyer files for buyers.
5. **Etsy — marketplace checkout and buyer download.** For instant digital
   products, upload the actual buyer files to the Etsy listing before publish;
   Etsy provides purchase/download links. Customers do not need GitHub, Vercel
   or private Drive access.

## What the new metadata preflight does, and what it cannot do

`GET /api/etsy/chatgpt-handoff-qc`: public read-only readiness.

`POST /api/etsy/chatgpt-handoff-qc`: authenticated read-only JSON preflight.
Use the separate `ETSY_CHAT_SOURCE_PREFLIGHT_TOKEN` provided **only** through
a privileged operator/connection, never through chat, a public client or repo.

The request declares the creator's handoff but **does not send file bytes**.
No URL downloads, Etsy calls, Drive writes or marketplace mutations. A valid
declaration returns `METADATA_REVIEW_REQUIRED`, not `QC_PASSED`, and
`ETSY_WRITE_COUNT: 0`.

Example JSON (all hashes MUST be computed from actual buyer files; placeholders
below are deliberately invalid and are not a passing QA claim):

```json
{
  "schemaVersion": "1.0.0",
  "origin": "CHATGPT_PRODUCED",
  "productId": "ABC-ADVENTURE-V3",
  "deliveryType": "INSTANT_DOWNLOAD",
  "listing": {
    "title": "Original ABC Adventure Printable Worksheets",
    "description": "Downloadable alphabet worksheets. This design was created with the assistance of AI.",
    "sellerOriginalDesignAsserted": true,
    "aiUsed": true,
    "aiDisclosureText": "This design was created with the assistance of AI."
  },
  "buyerFiles": [
    {"filename":"ABC_Adventure_A4.pdf","expectedBytes":0,"sha256":"REPLACE_WITH_REAL_SHA256"},
    {"filename":"ABC_Adventure_Letter.pdf","expectedBytes":0,"sha256":"REPLACE_WITH_REAL_SHA256"}
  ],
  "gallery": [
    {"filename":"01_Preview.jpg","expectedBytes":0,"sha256":"REPLACE_WITH_REAL_SHA256"}
  ],
  "buyerInstructions":"Print at actual size (100%), use the matching A4 or Letter file."
}
```

### Static policy checks

- Instant Download requires **1–5 actual buyer files**, size max 20 MB/file
  (validator deliberately uses a conservative 20,000,000-byte threshold).
- Etsy buyer filenames: **at most 70** alphanumeric, period, underscore or
  hyphen characters, with an Etsy-supported direct-download extension.
  `.xlsx` is **not** on Etsy's supported direct file list: send a correctly
  packaged `.zip` containing the real workbook only after ZIP QA.
- Buyer filenames must be unique ignoring case. No path traversal, spaces,
  unsupported extension, missing hashes, missing size or zero-byte files.
- Final buyer-facing filenames must **not have internal revision suffixes**
  such as `_v1`, `-V2` or `_v1.2.1` before the extension. Version tracking
  belongs in the private manifest and production/archive metadata only.
- **Do not create a new buyer ZIP as an early build step.** First independently
  confirm the exact candidate PDF bytes, content, filenames, hashes and page
  rendering via the GitHub-controlled QA and protected Vercel validation.
  Passing repository CI or a Vercel Preview build is **not** product-byte QC.
  Only after both file-QC checkpoints pass should any buyer ZIP be assembled.
  The newly created ZIP must then be independently rechecked, and it must
  contain **only customer-facing assets**, never seller-only QA or media files.
  Packaging and validation are not authorization to create/publish an Etsy
  Listing. Follow the separately authorized exact-Draft-and-Publish gate.
- One or more JPEG/PNG gallery images declared; preview assets do not become
  buyer files. A metadata check cannot prove images depict the buyer product.
- Declared original seller design and AI usage are mandatory; if AI was used,
  require explicit AI disclosure **inside** the actual Listing description.
  A client assertion is not independent policy or copyright verification.
- The existing authenticated file-byte preflight
  `POST /api/etsy/chat-assets/source-preflight` checks hash, byte size,
  file signature and MIME for one original ChatGPT-produced buyer PDF/ZIP or
  preview image. Its existing 3 MiB/file limit is **stricter** than Etsy's
  20 MB; exceeding that limit needs another safe authorized transport.
- The release checkpoint now enforces Etsy-safe buyer filenames and checks
  the **actual names and counts reported back by Etsy**, together with draft
  identity and gallery count.

Source policies, verified 2026-10-21:
- https://help.etsy.com/hc/en-us/articles/115015628347-How-to-Manage-Your-Digital-Listings
- https://www.etsy.com/legal/creativity
- https://www.etsy.com/legal/sellers/

## Byte-level inspection added to existing authorized source intake

The existing ChatGPT source-intake routes
`POST /api/etsy/chat-assets/source-preflight` and
`POST /api/etsy/chat-assets` now reject malformed PDF header/EOF markers
and ZIP archives with invalid directory records, corrupted member CRCs,
unsafe traversal/absolute Windows paths, duplicate member names, encrypted
members, symlinks, unsupported compression, overlapping members, and large
unpacked payloads. ZIP checks use a bounded DEFLATE implementation and
verify **actual decompressed bytes**, never merely a supplied filename or CRC.

A passing PDF byte check is deliberately reported as
`PDF_HEADER_EOF_ONLY`. **It does NOT parse all PDF pages, render pages,
inspect links or embedded JavaScript, prove readable text, or prove print
dimensions.** The actual PDF must still be rendered and inspected by an
independent reviewer before any product is marked QC_PASSED.

A ZIP `ZIP_CRC_PATH_AND_SIZE` result is evidence that the container
and its members are structurally intact and bounded, **not** evidence
that nested XLSX formulas, PDF pages, copyrights, or listing promises
are correct. ZIP members need their own document-specific QC.

The existing private source handler is limited to 3 MiB per file.
These checks are a fail-closed **additional safeguard**, not a new public
upload endpoint, and not a substitute for seller approval. Unit tests include
valid ZIPs, CRC corruption, truncated central directory, traversal, casefold
duplicates, encrypted files, symlinks, decompression limits, and PDF
header/EOF failures.

## Actual buyer delivery: independent QC checklist

All these must be independently checked **on the final immutable files**,
not inferred from a valid metadata handoff:

- Byte SHA256 and size for each file, PDF structure, readable rendered pages,
  no clipping, layout/margins, correct A4/Letter sizes, no blank/duplicate pages.
- ZIP integrity/CRC, no corrupted members, safe paths and real enclosed files.
  For XLSX inside ZIP, formulas and workbook opening must be tested.
- Buyer can follow real download/open/print instructions, all claimed formats
  and counts are present and matches the product listing.
- Gallery accurately shows **the actual buyer product**; no deceptive previews,
  copyrighted artwork, unauthorized materials or unreviewed AI content.
- Independent seller/human compliance review; user approves exact product,
  Etsy Draft, final listing title/description/price/tags and asset hashes.
- Authorized Draft upload of actual **buyer files** (not only listing pictures).
  Read back Etsy Draft plus buyer names/counts and gallery/images.
- `POST /api/etsy/release` authenticated `PREFLIGHT` gives a
  `READY_FOR_SELLER_REVIEW` snapshot only. Publishing requires separate
  exact seller authorization, production pin, protected GitHub action and
  strict hash, shop, listing and asset-set readback.
- After publish, independently confirm the exact Listing ID is Active and
  inspect Etsy file attachments. Etsy handles checkout/download delivery.

### Fail closed

`METADATA_REVIEW_REQUIRED` is **not** `QC_PASSED`, Etsy legal approval,
buyer download verified, seller authorization, or permission to publish.
The handoff API performs **zero marketplace writes** and does not
auto-enable flags.

The default Etsy flags remain **OFF**. Vercel Hobby is not approved for
commercial use; confirm compliant hosting before business operations. Keep
all payment/plan changes subject to separate authorization.

## Open dependencies / status

- Current Google Drive buyer ZIP/PDF identity and original bytes for ABC V3
  have **not** been read or tested by this change.
- Ordinary Chat Mode cannot authenticate and send multipart files to the
  protected backend. Use an appropriately authorized Work/operator transport,
  **not** a public upload or bearer secrets pasted into chat.
- A complete end-to-end ChatGPT artifact -> independently verified QC ->
  Draft files/images -> Etsy activation -> real buyer download remains
  **unverified**. No product has been published by this change.
- Existing Etsy listing workflows and authorization gates stay unchanged.

This is a **safe incremental enforcement layer**, not a claim the whole
sale pipeline has been completed.
