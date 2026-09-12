# Etsy Real-Time Event System P1

## Security boundary

- The receiver is `POST /api/webhooks/etsy` on the Node.js runtime.
- The exact raw request bytes are captured before JSON parsing.
- Verification follows Etsy's documented construction:
  `webhook-id.webhook-timestamp.raw-body` signed with HMAC-SHA256 using the
  base64-decoded bytes after the `whsec_` prefix.
- Only versioned `v1,<base64>` signature entries are considered, and comparison
  uses Node.js constant-time equality.
- `ETSY_WEBHOOK_SIGNING_SECRET` is runtime-only. Missing or malformed signing
  configuration fails with HTTP 503.
- `ETSY_WEBHOOK_TOLERANCE_SECONDS` defaults to 300 and is clamped to 60..600.
- Raw webhook payloads and fresh Etsy receipt payloads are never persisted or
  logged. Buyer email, name, and postal-address fields are never projected.
- The receipt callback is reconstructed from validated shop and receipt IDs;
  the payload URL is never fetched directly.
- Receipt verification uses Etsy `GET` only and has an eight-second request
  timeout. `ETSY_WRITE_COUNT = 0`.

## Idempotency and processing

`webhook-id` is the immutable event identity. Migration
`db/005_etsy_webhook_events.sql` adds a unique `(provider, webhook_id)`
constraint. A single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` statement
atomically claims a new event or increments its duplicate counter. The conflict
update is permitted only when the raw-body SHA-256 matches the original event;
an identity collision with different bytes fails closed.

Only the successful first claim can start readback. Concurrent retries return
the stable `ALREADY_PROCESSED` acknowledgement and cannot start a second Etsy
read. Unsupported signed events are recorded as `UNSUPPORTED_EVENT` without any
downstream action.

## Persistence and deployment

Apply `db/005_etsy_webhook_events.sql` with the direct, non-pooled Neon
connection before enabling traffic. The migration is additive and idempotent;
it does not alter existing tables. Application traffic continues to use the
pooled `DATABASE_URL`.

The ledger stores event identity, normalized event type, timestamps, body hash,
shop/receipt/listing IDs, verification/readback/processing states, correlation,
and duplicate counts. A separate aggregate row stores signature-failure counts.

Do not create or activate a live Etsy webhook subscription until the production
deployment is READY, the real signing secret is configured, and the exact Etsy
callback configuration has been independently verified.
