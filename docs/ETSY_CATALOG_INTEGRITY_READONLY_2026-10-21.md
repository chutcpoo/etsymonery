# Etsy catalog integrity — read-only diagnostics (2026-10-21)

## Goal

Avoid treating an old Product_ID–Etsy Listing_ID index as current Google Drive
Product Truth. Use live Etsy seller-state evidence to flag out-of-date mappings
without ever creating or modifying a listing.

The source comparison uses the dated identifier projection in
`lib/catalog-channel-index.ts`. **It does not reread the current Google Drive
Master.** Treat every output as diagnostic evidence only.

## API

`GET /api/etsy/catalog-integrity` (read-only; no-store)

- Reads the configured Etsy shop's active, draft, inactive, sold_out and expired
  listings through the existing authenticated Etsy client.
- Requires one complete and self-consistent five-state snapshot.
- Rejects cross-shop identities, repeated listing IDs, mismatched state counts
  and duplicate Product_ID/Listing_ID identifiers in the projection.
- Returns counts, observed dated pointers, projected pointers absent from the
  five-state Etsy readback, and live Etsy listing IDs absent from the dated index.
- Returns `REVIEW_REQUIRED` when there is a gap, `PROJECTION_ONLY` when
  pointers line up, or `BLOCKED` (HTTP 503) when reliable evidence is unavailable.
- Even `PROJECTION_ONLY` **never means Product Truth verified, QC passed or
  publish approved**. Both successful states report `publishAuthorized: false`,
  `productTruthUpdated: false`, and `ETSY_WRITE_COUNT: 0`.
- No buyer PII, tokens, credentials, provider errors or product source files
  are returned. POST/PUT/PATCH/DELETE return HTTP 405.

`GET /api/platform/status` continues providing the legacy
`liveCatalogCount` key for compatibility but exposes
`catalogProjectionCount`, `liveEtsyCount: null`, and the frozen source date
to prevent consumers from interpreting the old field as an Etsy readback.

The Control Center and Factory dashboards now label the count as a
**Dated Drive projection** and the Control Center links to the audit endpoint.

## Review before changing any Etsy listing

1. Fetch the current Google Drive Master / Product Truth from the owner-approved
   document and verify source identities and revisions independently.
2. Fetch the live Etsy five-state snapshot and confirm which Product IDs truly
   correspond to the observed Listing IDs. **Never infer Product IDs from titles
   alone.**
3. Prepare a separately reviewed Product Truth correction or mapping migration
   with before/after evidence and preserved history. Never auto-overwrite a
   canonical Google Drive document based on this API.
4. For any product release: complete real buyer-file QA, independent final QC,
   approved candidate hashes, provider draft and assets readback, and an
   exact seller authorization. Keep write flags OFF until then.
5. Verify the intended GitHub commit, Vercel Preview status, tests, and release
   policy before contemplating a production merge.

## Scope and test coverage

Unit tests cover mixed active/draft state, unmatched mappings, exact matching
with non-authoritative source, duplicate product/listing identity, cross-shop
readback, count truncation and unknown states.

**No changes** to publishing gates, OAuth scopes, Environment Variables,
Etsy listings, Google Drive files, Neon database schema or billing.

## Hosting/commercial-use gate

The currently linked Vercel Team is on Hobby. Review Vercel's current plan
terms and migrate to a commercial-use-compatible plan or host before operating
this business-facing application commercially. A code PR does not upgrade the
plan or incur a purchase.
