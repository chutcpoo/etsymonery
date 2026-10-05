import { neon } from "@neondatabase/serverless";
import { type FrozenProductPlan, type ProductCreationPlan, type PlanQCResult, type PlanStatus } from "./types";
import { type ProductCreationPlanRepository } from "./repository";

function getSql(customUrl?: string) {
  const databaseUrl = (customUrl || process.env.DATABASE_URL)?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL_NOT_CONFIGURED");
  return neon(databaseUrl);
}

interface DbPlanRow {
  plan_id: string;
  product_id: string;
  plan_version: number;
  status: string;
  plan_sha256: string;
  approved_at: string | null;
  qc_result_json: PlanQCResult;
  plan_json: ProductCreationPlan;
  created_at: string;
  updated_at: string;
}

export class NeonProductCreationPlanRepository implements ProductCreationPlanRepository {
  private ensured = false;

  constructor(private readonly connectionUrl?: string) {}

  private async ensureTable(): Promise<void> {
    if (this.ensured) return;
    const sql = getSql(this.connectionUrl);
    await sql`
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
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_product_creation_plans_product_id 
        ON product_creation_plans (product_id);
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_product_creation_plans_product_version 
        ON product_creation_plans (product_id, plan_version);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_product_creation_plans_status 
        ON product_creation_plans (status);
    `;
    this.ensured = true;
  }

  private mapRow(row: DbPlanRow): FrozenProductPlan {
    return {
      planId: row.plan_id,
      planVersion: row.plan_version,
      productId: row.product_id,
      status: row.status as PlanStatus,
      planSha256: row.plan_sha256,
      approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
      qcResult: typeof row.qc_result_json === "string" ? JSON.parse(row.qc_result_json) : row.qc_result_json,
      plan: typeof row.plan_json === "string" ? JSON.parse(row.plan_json) : row.plan_json
    };
  }

  async save(record: FrozenProductPlan): Promise<void> {
    await this.ensureTable();
    const sql = getSql(this.connectionUrl);
    const qcResultJson = JSON.stringify(record.qcResult);
    const planJson = JSON.stringify(record.plan);
    const now = new Date().toISOString();

    await sql`
      INSERT INTO product_creation_plans (
        plan_id, product_id, plan_version, status, plan_sha256,
        approved_at, qc_result_json, plan_json, created_at, updated_at
      ) VALUES (
        ${record.planId}, ${record.productId}, ${record.planVersion}, ${record.status}, ${record.planSha256},
        ${record.approvedAt ? record.approvedAt : null}, ${qcResultJson}::jsonb, ${planJson}::jsonb, ${now}, ${now}
      )
      ON CONFLICT (plan_id) DO UPDATE SET
        product_id = EXCLUDED.product_id,
        plan_version = EXCLUDED.plan_version,
        status = EXCLUDED.status,
        plan_sha256 = EXCLUDED.plan_sha256,
        approved_at = EXCLUDED.approved_at,
        qc_result_json = EXCLUDED.qc_result_json,
        plan_json = EXCLUDED.plan_json,
        updated_at = EXCLUDED.updated_at;
    `;
  }

  async load(planId: string): Promise<FrozenProductPlan | null> {
    await this.ensureTable();
    const sql = getSql(this.connectionUrl);
    const rows = await sql`
      SELECT plan_id, product_id, plan_version, status, plan_sha256, approved_at, qc_result_json, plan_json, created_at, updated_at
      FROM product_creation_plans
      WHERE plan_id = ${planId}
      LIMIT 1;
    `;
    if (!rows || rows.length === 0) return null;
    return this.mapRow(rows[0] as unknown as DbPlanRow);
  }

  async loadByProductId(productId: string): Promise<FrozenProductPlan | null> {
    await this.ensureTable();
    const sql = getSql(this.connectionUrl);
    const rows = await sql`
      SELECT plan_id, product_id, plan_version, status, plan_sha256, approved_at, qc_result_json, plan_json, created_at, updated_at
      FROM product_creation_plans
      WHERE product_id = ${productId}
      ORDER BY plan_version DESC, updated_at DESC
      LIMIT 1;
    `;
    if (!rows || rows.length === 0) return null;
    return this.mapRow(rows[0] as unknown as DbPlanRow);
  }

  async list(): Promise<FrozenProductPlan[]> {
    await this.ensureTable();
    const sql = getSql(this.connectionUrl);
    const rows = await sql`
      SELECT plan_id, product_id, plan_version, status, plan_sha256, approved_at, qc_result_json, plan_json, created_at, updated_at
      FROM product_creation_plans
      ORDER BY product_id ASC, plan_version DESC;
    `;
    return (rows as unknown as DbPlanRow[]).map(r => this.mapRow(r));
  }
}
