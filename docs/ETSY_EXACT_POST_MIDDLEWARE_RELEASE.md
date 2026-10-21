# Exact post-reset Etsy POST routing (2026-10-21)

**Root cause:** the legacy catalog-reset `middleware.ts` intercepted every
non-GET request to `/api/etsy/*` and returned `HTTP 410 CATALOG_RESET`,
including modern gated Draft, Release and Chat assets POST handlers. A successful
GET readiness response never proved any POST handler was reachable.

**Minimal change:** exactly four paths are allowed through on `POST` only:
- `/api/etsy/chat-assets/source-preflight` — always read-only, separate operator bearer.
- `/api/etsy/chat-assets` — exact source bytes, approved file manifest, independent QC,
  explicit Candidate/Draft pin and two write flags (default OFF).
- `/api/etsy/drafts` — exact approved plan/QC/Candidate and two draft flags (default OFF).
- `/api/etsy/release` — read-only preflight or separately authorized exact publish;
  two publish flags default OFF.

The middleware **still returns 410** for every other legacy/unknown POST and for
other mutation methods. Handler authorization/flags remain necessary. The rollout
is not authorization to create Drafts, upload Etsy assets or publish P01.

To validate on deployed Production:
1. `GET /api/etsy/chat-assets/source-preflight`: root and separate preflight bearer
   configured (no Etsy writes).
2. Authenticated `POST` with the real Drive PDF bytes, exact size, filename,
   SHA-256 and declared MIME. Expected `200 SOURCE_BYTES_VERIFIED`,
   `ETSY_WRITE_COUNT:0`, `draftCreated:false`.
3. Wrong bearer must return `401`, wrong SHA `409`, not middleware `410`.
4. Read-only seller-state before and after must show unchanged listing counts.
5. Legacy `POST /api/etsy/draft-assets` must still return `410`.

**Do not send the operator bearer to the chat or commit it to GitHub.**
