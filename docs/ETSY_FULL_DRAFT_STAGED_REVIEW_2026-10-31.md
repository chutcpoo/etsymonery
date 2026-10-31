# Staged Etsy Full Draft v0.3.0 — review only

No merge, production deployment, Etsy Draft mutation, listing publish, or paid hosting change is authorized by this pull request.

The new modules split listing creation from image/file uploads, preserve existing independent human QC and exact approval gates, and add a GET-only verification stage.

Stages: PREFLIGHT → CREATE_DRAFT → explicit seller approval of exact Draft ID and manifest SHA-256 → UPLOAD_APPROVED_ASSETS → VERIFY_DRAFT_ASSETS.

Source inventory is hashed before draft creation; upload uses the existing guarded Google Drive bridge and reconciliation ledger. Etsy readback cannot verify original asset SHA-256, so the final result is metadata-only evidence and is NOT independent human Final QC.

**Release HOLD:** Issue #283 remains open; no live OAuth, GitHub Actions credentials, full CI or Etsy write is approved by this change. Existing GitHub/Vercel/Etsy remain unchanged until separate approval.
