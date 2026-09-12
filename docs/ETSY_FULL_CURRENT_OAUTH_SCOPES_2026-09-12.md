# Etsy Open API v3 — Full Current OAuth Scope Set

Date: 2026-09-12

Purpose: request every OAuth scope listed as currently available in Etsy Open API v3 Authentication documentation, while preserving the existing exact-operation governance for all mutations.

Requested scopes:
- address_r
- address_w
- email_r
- listings_d
- listings_r
- listings_w
- profile_r
- profile_w
- shops_r
- shops_w
- transactions_r
- transactions_w

Safety boundary:
- OAuth capability does not authorize a marketplace mutation.
- No generic unrestricted Etsy write endpoint is introduced by this change.
- Existing Tester / Final QC / protected-state / explicit authorization / exact-operation / replay-guard gates remain controlling.
- Existing PDT-BOBA-001 ZIP recovery operation is unchanged.
- A fresh OAuth authorization code flow is required after deployment; refresh tokens cannot gain scopes absent from their original grant.
