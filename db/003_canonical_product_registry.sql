CREATE TABLE IF NOT EXISTS canonical_product_registry (
  product_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  registry_revision BIGINT NOT NULL CHECK (registry_revision >= 1),
  source_drive_file_id TEXT NOT NULL,
  record_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS canonical_product_registry_source_idx
  ON canonical_product_registry (source_drive_file_id, product_id);
