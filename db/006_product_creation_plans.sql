-- Migration 006: Product Creation Plans Durable Persistence
-- Supports: Product Creation Plan QC & Build Gate Enforcement

CREATE TABLE IF NOT EXISTS product_creation_plans (
  plan_id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  plan_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  plan_sha256 TEXT NOT NULL,
  approved_at TIMESTAMPTZ,
  qc_result_json JSONB NOT NULL,
  plan_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by product ID
CREATE INDEX IF NOT EXISTS idx_product_creation_plans_product_id 
  ON product_creation_plans (product_id);

-- Enforce unique versioning per product
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_creation_plans_product_version 
  ON product_creation_plans (product_id, plan_version);

-- Fast lookup by lifecycle status (e.g. PLAN_APPROVED)
CREATE INDEX IF NOT EXISTS idx_product_creation_plans_status 
  ON product_creation_plans (status);
