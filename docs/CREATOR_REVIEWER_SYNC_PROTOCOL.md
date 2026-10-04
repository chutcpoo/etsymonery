# PoonthaiDigital Creator ↔ Reviewer Sync Protocol

This protocol prevents the file creator and the independent reviewer from using different Product Truth values.

## Single shared contract

For each product, both roles must read the same machine-readable release lock before doing any work. For Product 03 the canonical lock is:

`config/pdt-cpr-003-release-lock.json`

Google Drive remains the source of truth for buyer files and release assets. GitHub stores only the sanitized release contract, expected counts, required/forbidden claims, sizes, and hashes.

## Creator rules

1. Read the release lock before build/rebuild.
2. Build only from current Google Drive Product Truth.
3. Never change expected counts or claims locally without updating Product Truth first.
4. After any output file changes, regenerate size/SHA-256 values and mark QC stale.
5. Do not self-approve FINAL QC.
6. Do not publish Etsy; publish authority remains with the user.

## Reviewer rules

1. Read the same release lock before QC.
2. Fetch the actual current Google Drive artifacts, not old chat attachments or cached copies.
3. Validate filename, byte size, SHA-256, page/sheet counts, required claims, forbidden claims, ZIP contents, and listing asset counts.
4. Never infer missing expected values and never copy the creator's PASS result without independent verification.
5. If any hash, count, claim, or package member differs, return `FINAL QC: FAIL / SOURCE MISMATCH`.
6. A PASS applies only to the exact hashes in the release lock.

## Invalidation rule

Any material change to a buyer file, PDF, ZIP, listing claim, page count, sheet count, or compatibility statement invalidates prior QC immediately. The creator must rebuild the release lock and the reviewer must rerun independent QC.

## Product 03 locked baseline

- Product ID: `PDT-CPR-003`
- Template: 6 sheets
- Example: 6 sheets
- Printable: 8 pages
- User Guide: 6 pages
- Buyer package: 4 files
- Listing images: 10
- Etsy publish: user-controlled

Current independent QC status is `PASS` only for the exact artifacts and SHA-256 hashes recorded in `config/pdt-cpr-003-release-lock.json`.

## Handoff status vocabulary

Use only these states between creator and reviewer:

- `BUILD_READY` — creator has produced files but reviewer has not verified them.
- `QC_IN_PROGRESS` — reviewer is checking the exact locked artifacts.
- `FINAL_QC_PASS` — exact hashes and all gates match.
- `FINAL_QC_FAIL` — at least one gate failed.
- `SOURCE_MISMATCH` — reviewer received a different file/hash/version than the creator locked.
- `QC_STALE` — a material file or claim changed after the last PASS.

Never use `PASS`, `READY`, or `FINAL` without the product ID and release-lock identity.
