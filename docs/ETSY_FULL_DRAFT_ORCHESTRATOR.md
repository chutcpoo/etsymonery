# Etsy Full Draft Orchestrator

High-level fail-closed service that creates a digital Draft listing **and** uploads all approved images + buyer files in a single operation.

**Location:** `lib/etsy-full-draft-orchestrator.ts`

## Safety Guarantees

- Composes existing gated services (`createGenericDraftPostHandler` + `createEtsyDriveAssetBridgeHandler`).
- All existing feature flags, exact-approval env vars, QC checks, and write tokens still apply.
- Does **not** publish or activate the listing.
- Sequential uploads: if any asset fails, the operation stops and returns the partial state for reconciliation.
- Default-off. Requires explicit operator authorization via `x-autodigitalpublisher-write-token`.

## Required Environment Gates (all must be true for EXECUTE)

| Variable | Purpose |
|----------|---------|
| `ETSY_DRAFT_WRITES_ENABLED=true` | Master draft write gate |
| `ETSY_GENERIC_DRAFT_WRITES_ENABLED=true` | Allows generic draft create |
| `ETSY_DRIVE_ASSET_WRITES_ENABLED=true` | Allows Drive → Etsy asset upload |
| Exact product / candidate / listing fingerprint approvals | Must match the request |
| Independent QC server approval | Via existing `hasServerVerifiedQc` |
| Valid Google Drive service account + source root | For asset download |

## Request Shape (POST)

```json
{
  "action": "PREFLIGHT" | "EXECUTE",
  "operationId": "unique-op-id",
  "shopId": 23582741,
  "productId": "PDT-EXAMPLE-001",
  "candidateId": "...",
  "candidateFingerprint": "<64-char sha256>",
  "expectedListingFingerprint": "<64-char sha256>",
  "listing": {
    "title": "...",
    "description": "...",
    "priceUsd": 4.99,
    "tags": ["tag1", "... exactly 13 tags"],
    "quantity": 999,
    "taxonomy_id": 12478,
    "who_made": "i_did",
    "when_made": "2020_2026",
    "type": "download",
    "state": "draft"
  },
  "assets": [
    {
      "kind": "UPLOAD_IMAGE",
      "driveFileId": "...",
      "assetName": "hero.jpg",
      "expectedSha256": "...",
      "expectedBytes": 123456,
      "rank": 1
    },
    {
      "kind": "UPLOAD_FILE",
      "driveFileId": "...",
      "assetName": "product.zip",
      "expectedSha256": "...",
      "expectedBytes": 78901,
      "rank": 1
    }
  ],
  "qc": {
    "state": "QC_PASSED",
    "productTruthVerified": true,
    "testerFingerprint": "<same as candidateFingerprint>",
    "independentFinalQcFingerprint": "<same as candidateFingerprint>"
  }
}
```

## Recommended Usage Flow

1. Call with `action: "PREFLIGHT"` — validates shape and returns counts (zero writes).
2. Ensure all gates and independent QC evidence are in place.
3. Call with `action: "EXECUTE"` and the write token header.
4. On success, receive `draftListingId` + asset counts. Listing remains a **Draft**.
5. Perform separate independent verification / QC before any publish authorization.

## Current Limitations / Future Work

- Video upload is not yet included (Etsy has a separate video endpoint).
- Batch upload is sequential (safer for rate limits and reconciliation).
- Stronger post-upload content verification (beyond resource existence) can be added later.
- This is a candidate orchestrator — product-specific executors remain the recommended path until this passes full QC.

## Status

**CANDIDATE** — Not production-authorized. Opened as Draft PR for review and independent QC.
