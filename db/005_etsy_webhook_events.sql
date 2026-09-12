CREATE TABLE IF NOT EXISTS etsy_webhook_events (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'etsy' CHECK (provider = 'etsy'),
  event_type TEXT NOT NULL,
  provider_event_type TEXT NOT NULL,
  webhook_id TEXT NOT NULL,
  event_timestamp TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  shop_id BIGINT,
  receipt_id BIGINT,
  listing_ids BIGINT[] NOT NULL DEFAULT '{}',
  processing_state TEXT NOT NULL CHECK (
    processing_state IN ('PROCESSING', 'PROCESSED', 'UNSUPPORTED_EVENT')
  ),
  verification_state TEXT NOT NULL CHECK (
    verification_state = 'SIGNATURE_VERIFIED'
  ),
  readback_state TEXT NOT NULL CHECK (
    readback_state IN ('PENDING', 'VERIFIED', 'NOT_AVAILABLE', 'FAILED_READ_ONLY')
  ),
  correlation_id UUID NOT NULL,
  duplicate_count BIGINT NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  last_duplicate_at TIMESTAMPTZ,
  readback_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, webhook_id)
);

CREATE INDEX IF NOT EXISTS etsy_webhook_events_received_idx
  ON etsy_webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS etsy_webhook_events_type_received_idx
  ON etsy_webhook_events (event_type, received_at DESC);

CREATE INDEX IF NOT EXISTS etsy_webhook_events_receipt_idx
  ON etsy_webhook_events (shop_id, receipt_id)
  WHERE receipt_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS etsy_webhook_health (
  provider TEXT PRIMARY KEY CHECK (provider = 'etsy'),
  signature_failure_count BIGINT NOT NULL DEFAULT 0 CHECK (signature_failure_count >= 0),
  last_signature_failure_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO etsy_webhook_health (provider)
VALUES ('etsy')
ON CONFLICT (provider) DO NOTHING;

COMMENT ON TABLE etsy_webhook_events IS
  'PII-minimized Etsy webhook event ledger. Raw webhook and Etsy receipt payloads are intentionally not stored.';

