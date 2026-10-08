# Catalog reconciliation — 2026-10-08

## Objective
Reconcile Google Drive Product Truth, GitHub release-state mirrors, Vercel runtime evidence, and Etsy marketplace state after the owner withdrew Products 05–15 because buyer-file QC exposed recurring Excel recovery/compatibility failures and other defects.

## Authenticated Etsy evidence
- Shop ID: 23582741
- Mode: READ_ONLY
- Active: 3
- Draft: 0
- Inactive: 0
- Sold out: 0
- Expired: 0
- Total listings returned: 3
- Active listing IDs: 4587646332, 4588681044, 4588738623
- ETSY_WRITE_COUNT: 0

## Canonical catalog decision
- Products 01–03: ACTIVE / PROTECTED / NO CHANGES.
- Product 04: internal LISTING_QC; current Etsy listing identity is null because the former draft 4589549763 is absent from authenticated seller-state. Re-creation requires a new exact-operation authorization.
- Products 05–15: WITHDRAWN_FROM_RELEASE / NOT FOR SALE. Existing artifacts and former draft IDs are historical only. Re-entry requires Plan → QC → Approve → Build → Listing QC → Release Review.
- Product 16: not started.

## Google Drive reconciliation
- Product 04 Product Truth updated to preserve LISTING_QC while clearing current Etsy ID/URL and recording former draft 4589549763 as historical.
- Product Truth for Products 05–15 updated to WITHDRAWN_FROM_RELEASE, Etsy ID/URL null, artifact status HISTORICAL/WITHDRAWN.
- No buyer file was repaired or promoted by this reconciliation.

## GitHub reconciliation
- Release locks updated to mirror current catalog state.
- Product 01 release lock reconciled to active Etsy listing 4587646332.
- Release lock index updated with authenticated marketplace snapshot and withdrawal state for Products 05–15.
- This change is documentation/release-state metadata only; no marketplace mutation code, authorization gate, or write flag is changed.

## Production safety
- Etsy mutation performed: NO
- Publish/activate performed: NO
- Product 01–03 marketplace content modified: NO
- Production write flags modified: NO
- Expected marketplace write state after deploy: LOCKED / marketplaceWritesEnabled=false

## Verification required after merge
1. Verify exact merged GitHub SHA.
2. Verify Vercel Production deployment is READY on that exact SHA.
3. Verify `/api/health` returns marketplaceWritesEnabled=false.
4. Verify authenticated `/api/etsy/seller-state` still returns active=3, draft=0, ETSY_WRITE_COUNT=0.
5. Update Google Drive Master Project Brief with the final GitHub/Vercel evidence.
