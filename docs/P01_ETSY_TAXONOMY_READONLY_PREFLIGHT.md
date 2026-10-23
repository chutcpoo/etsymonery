# P01 Etsy Seller Taxonomy — protected, read-only preflight (2026-10-23)

Status: FEATURE BRANCH ONLY / NOT RELEASED / NO ETSY WRITES. P01 remains HOLD.

## Purpose
Collect Etsy seller taxonomy/category and category properties evidence without inventing IDs or changing listings. Etsy Open API v3:
- GET https://openapi.etsy.com/v3/application/seller-taxonomy/nodes
- GET https://openapi.etsy.com/v3/application/seller-taxonomy/nodes/{taxonomy_id}/properties

Application endpoint: GET /api/etsy/taxonomy. Not a Draft/Publish endpoint. No OAuth refresh and no marketplace mutation method.

## Authorization
Protected by a separate server-side secret ETSY_TAXONOMY_READ_TOKEN, required in Authorization: Bearer header. Configure via Vercel secret-management controls, not GitHub code, query parameters or chat. Missing/mismatched token fails closed before requesting Etsy.

Requires the existing server credentials ETSY_API_KEY and ETSY_SHARED_SECRET for authenticated API-key GET requests. Preview is intentionally not configured with production credentials.

## Request contract
- GET /api/etsy/taxonomy?q=forms — provider-derived matches by taxonomy node name, at most 40, including names, IDs, ancestor paths and truncation flags.
- GET /api/etsy/taxonomy?taxonomy_id=PROVIDER_VERIFIED_POSITIVE_ID — provider-derived property definitions and possible values with explicit truncation metadata.

Exactly one parameter required. Other parameters, duplicate params and invalid IDs rejected. Responses are bounded and not cached. POST, PUT, PATCH, DELETE rejected with 405. No values from mocks or truncated results should be treated as final official category evidence.

## Tests and gate
- tests/etsy-taxonomy-preflight.test.ts covers authentication, query safety, provider validation, GET-only behavior and no secret leaks using mocked Etsy responses. Mocks are NOT live Etsy taxonomy evidence.
- Review GitHub CI and deployment Preview. Without configured dedicated read token the endpoint MUST respond BLOCKED, never PASS.
- Before Production: review code and obtain separate Merge/Deploy authorization; resolve Vercel Hobby commercial-use restriction. Configure token through secrets manager only after that release gate.

## Product workflow
1. Invoke protected taxonomy GET on approved and compliant deployment; preserve real Etsy API-derived categories and properties with query/time evidence.
2. Reconcile shop identity with live Etsy readback. Freeze the correct P01 taxonomy_id, maker/date, quantity, title, complete description, 13 tags, type=download, state=draft and approved Draft-only price USD 3.90.
3. Generate exact listing fingerprint using lib/candidate-fingerprint.ts on the actual payload.
4. Independent Final QC and exact server pins are still required. The seller's physical print self-attestation is acknowledged, not independent signoff.
5. Obtain separate Draft authorization. No Etsy data is written by this preflight and no general-purpose Publish authorization is implied.
