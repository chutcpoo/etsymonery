# PoonthaiDigital Creator ↔ Reviewer Sync Protocol

This protocol applies to the entire PoonthaiDigital project, not only Product 03.

## Project-wide single source of truth

Both the creator and the independent reviewer must start from the same canonical Google Drive root:

`https://drive.google.com/drive/folders/1gSNJPipVI4RWuvp-k13I0LSixG63fGbz`

Project-wide source mapping is stored in:

`config/poonthaidigital-project-source.json`

The canonical Drive root contains the project structure for Project Overview, Brand & Visual Identity, Etsy Store Setup, Product Roadmap, Market Research, Listing Assets, and Archive.

Google Drive is the primary operational Product Truth for source files, buyer files, listing assets, release evidence, and current product state. GitHub stores derived code, sanitized release contracts, product locks, tests, and automation logic. Vercel deploys the GitHub application. Etsy remains the marketplace endpoint controlled by the user.

Canonical flow:

`Google Drive PoonthaiDigital Root → GitHub chutcpoo/etsymonery → Vercel shopee-affiliate-ai/autodigitalpublisher → Etsy PoonthaiDigital`

## Conflict rule

If any Creator copy, Reviewer copy, GitHub value, Vercel value, chat attachment, local file, report, or previous QC result disagrees with the current file or metadata under the canonical Google Drive root, the current Google Drive version wins.

The reviewer must return `QC_STALE` or `SOURCE_MISMATCH` until the exact current Drive artifacts are independently verified.

## Creator rules

1. Start every product task from the canonical Drive root and locate the product under the project structure.
2. Read the current Product Truth and actual source files before creating or rebuilding output.
3. Never use an old chat attachment or local copy as authoritative when Drive has a newer version.
4. After any material output change, update the relevant per-product release lock derived from the current Drive artifacts.
5. Record exact filenames, counts, byte sizes, hashes, claims, compatibility statements, and other product-specific gates where applicable.
6. Mark prior QC stale after any material artifact or claim change.
7. Do not self-approve FINAL QC.
8. Do not publish Etsy; publish authority remains with the user.

## Reviewer rules

1. Start every QC task from the same canonical Drive root.
2. Refetch the current Drive artifacts before FINAL QC; do not rely on the creator's report alone.
3. Use the relevant product-specific release lock only as a derived expectation contract; verify that it still matches Drive.
4. Validate the actual product-specific facts: filenames, byte sizes, SHA-256 hashes, page counts, sheet counts, formulas, validation rules, required/forbidden claims, ZIP contents, listing asset counts, video, compatibility wording, and legal/sample labeling where applicable.
5. Never invent missing expected values.
6. Never copy the creator's PASS without independent verification.
7. If Drive and the release lock differ, Drive wins and the result is `SOURCE_MISMATCH` or `QC_STALE`.
8. FINAL_QC_PASS applies only to the exact current Drive artifacts verified in that QC run.

## Per-product release locks

Every product may have its own release lock, for example:

`config/<product-id>-release-lock.json`

A product-specific lock is not an independent source of truth. It must always be derived from and reconciled against the canonical Google Drive root. Product 03's existing lock is therefore only the current release contract for PDT-CPR-003, not the project-wide authority.

## Invalidation rule

Any material change in Google Drive to a buyer file, source file, PDF, spreadsheet, ZIP, listing image, video, listing claim, page count, sheet count, formula, validation rule, compatibility statement, or Product Truth invalidates prior QC for that affected product immediately.

The creator rebuilds or updates the derived release lock. The reviewer then refetches Drive and reruns independent QC.

## Handoff status vocabulary

Use only these states between creator and reviewer:

- `BUILD_READY` — creator has produced files but reviewer has not independently verified the current Drive artifacts.
- `QC_IN_PROGRESS` — reviewer is checking the exact current Drive artifacts.
- `FINAL_QC_PASS` — current Drive artifacts and all applicable product gates match.
- `FINAL_QC_FAIL` — at least one applicable product gate failed.
- `SOURCE_MISMATCH` — creator/reviewer/release-lock artifacts differ from current Drive.
- `QC_STALE` — a material Drive file or claim changed after the last PASS.

Never use `PASS`, `READY`, or `FINAL` without the Product ID and the current verified release identity.
