CREATE TABLE IF NOT EXISTS product_registry_event_log (
  event_id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  sequence BIGINT NOT NULL CHECK (sequence >= 1),
  event_type TEXT NOT NULL CHECK (event_type IN ('REGISTRY_RECORDED', 'REGISTRY_REVISED')),
  expected_revision BIGINT NOT NULL CHECK (expected_revision >= 0),
  occurred_at TIMESTAMPTZ NOT NULL,
  record_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, sequence)
);

CREATE INDEX IF NOT EXISTS product_registry_event_log_product_idx
  ON product_registry_event_log (product_id, sequence);

CREATE OR REPLACE FUNCTION reject_product_registry_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'PRODUCT_REGISTRY_EVENT_LOG_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS product_registry_event_log_no_update
  ON product_registry_event_log;
CREATE TRIGGER product_registry_event_log_no_update
  BEFORE UPDATE ON product_registry_event_log
  FOR EACH ROW EXECUTE FUNCTION reject_product_registry_event_mutation();

DROP TRIGGER IF EXISTS product_registry_event_log_no_delete
  ON product_registry_event_log;
CREATE TRIGGER product_registry_event_log_no_delete
  BEFORE DELETE ON product_registry_event_log
  FOR EACH ROW EXECUTE FUNCTION reject_product_registry_event_mutation();

-- canonical_product_registry remains the materialized read projection.
