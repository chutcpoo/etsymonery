# Digital Products Studio — MVP operating contract

**Scope:** Read-only project and asset registry for future Etsy digital products. Does not change existing PoonthaiDigital listings or canonical Product Truth.

## Connected service responsibilities

- **Drive**: Etsy - Digital Products Studio folder (ID: 1pAm6Mhr7jQtuzfP0RTDo1scKQzis-bAy) contains source artworks, original file backups, QA evidence and future product template. Drive permissions are unchanged.
- **GitHub**: chutcpoo/etsymonery is the code repository. Studio snapshot is defined in lib/digital-studio.ts. Changes must be made via a reviewed PR.
- **Vercel**: autodigitalpublisher remains the deployed Next.js app. The new /studio page is read-only; use PR preview prior to merging. Do not merge to main automatically.
- **Etsy**: existing OAuth/publisher runs separately and requires its own exact QC/authorization gates. The connected Etsy chat app is marketplace discovery, not a seller write API.

## Product P001 (studio namespace, NOT canonical Catalog ID)

Rainy Reading Nooks, approved image prototypes only. On 2026-10-29 Drive folder and four original backups were verified:
- Image 01: PNG 1AWnGEVV6eiM9gadslPN8f8rMCBH9qVs0; PDF 1g3wb8JiVEXC_LuTS974ibMkmLtLuZect
- Image 02: PNG 19Lx7MLdGz_s7Vn2S9YDkIVgC-gpL-id6; PDF 1shibUjeYs3_nrpTny3eexUm3dJHGwBnL
- Registry: 11GZL7bl29qelXXcNaZNYrmcBx6VRQVaM
- Folder: 13bj3f6f8tz0uw9t-AyzOn3NJqFsQRKBe

**Explicitly not done:** physical print validation, buyer package approval, catalog registration, listing copy signoff, Tester PASS, independent QC, production authorization, Etsy listing creation.

## Product lifecycle and gating

STUDIO_DRAFT → STYLE_PROTOTYPE_APPROVED → PRINT_TEST_PASSED → BUYER_FILES_QC → CANONICAL_PRODUCT_TRUTH_VERIFIED → TESTER_PASS → INDEPENDENT_QC_PASS → PRODUCTION_AUTHORIZATION → PUBLISHER INTAKE → CONTROLLED ETSY RELEASE.

Artwork style approval alone NEVER authorizes a product sale. No background synchronization, Drive OAuth, Etsy listing write, price recommendation or order ingestion occurs in this feature. It is a manually curated snapshot with the last verified date clearly displayed.

## Future products

1. Create a new Drive product folder using _NEW_PRODUCT_TEMPLATE under 01_Products. Do not overwrite originals.
2. Add project-specific files and verified Drive IDs.
3. Add the next record (STUDIO-P002 etc.) in lib/digital-studio.ts with null catalogProductId, null etsyListingId and every approval field default false.
4. Run typecheck, tests and build. Review a PR.
5. Import into canonical Product Truth only via the separate approved catalog workflow. **Never treat this studio snapshot as the canonical Catalog.**
6. After print test / QA / exact authorization and publisher gates pass, stage any Etsy actions through the existing controlled publisher. No silent Etsy writes.

## Future integration work (NOT implemented)

- Secure Google Drive runtime OAuth + per-project readback with file hashes and revision checks.
- Authenticated back-office UI for product status mutations (server-side audit log).
- Canonical Catalog identity and version reconciliation.
- Etsy seller OAuth identity binding for individual candidate / shop and read-only listing status.
- Automated gate proofs, full buyer-file QC and independent QC workflow.

## Security

No credentials or private buyer data in the registry. /studio is a read-only view and may be exposed if the Vercel app is public; do not put confidential art bytes, shared secrets or buyer PII in the manifest. No app-side mutation endpoints. All existing Etsy write flags must stay OFF unless separately authorized.
