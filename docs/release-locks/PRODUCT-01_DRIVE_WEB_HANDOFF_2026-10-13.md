# Product 01 — Public website integration handoff

Date: 2026-10-13
Release status: HOLD / no production change.

Canonical code: chutcpoo/etsymonery. Vercel project: autodigitalpublisher, team shopee-affiliate-ai.

Verified production /p responds HTTP 200 but renders 0 active products. lib/public-product.ts filters catalogTracked entries with productId; lib/catalog-channel-index.ts lists historical Etsy IDs rather than the current Product 01 draft. Its recorded canonical registry is not accessible (Drive 404 and no title search match).

Product 01 Etsy draft: 4594365366. Do not expose as an active sales page before the Etsy listing is actually active. Existing public detail handler correctly rejects draft listings.

Required integration: reconcile the current operational Master with a reviewed Product_ID-to-Listing_ID projection, retain active-state gating, render actual Etsy gallery/price, and keep checkout and delivery on Etsy. Verify the exact public preview before production approval. Do not add buyer files, Canva owner URLs or buyer template links to public GitHub.

Drive now holds source manifest, listing media handoff, buyer guide and QC evidence. PNG exports/video are not yet available; sign-in/export and buyer gates remain blockers. No production release requested by this record.
