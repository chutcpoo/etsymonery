import { neon, Client } from "@neondatabase/serverless";
import { type FrozenProductPlan, type ProductCreationPlan, type PlanQCResult, type PlanStatus, computePlanSha256 } from "./types";
import { type ProductCreationPlanRepository, type ApprovalTestHooks } from "./repository";
import { evaluateProductCreationPlanQC } from "./qc-engine";

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

  /**
   * BLOCKER 2 — REAL POSTGRESQL TRANSACTION WITH ROW-LEVEL LOCKING:
   *
   * Flow:
   * 1. BEGIN transaction on dedicated client connection.
   * 2. SELECT current plan FOR UPDATE (row-level lock).
   * 3. Re-run QC on frozen plan.
   * 4. Compute canonical SHA.
   * 5. Write: PLAN_APPROVAL_PENDING.
   * 6. Write: PLAN_APPROVED with timestamp.
   * 7. Readback verification in SAME transaction:
   *    - status === 'PLAN_APPROVED'
   *    - plan_sha256 exact match
   *    - product_id exact match
   *    - plan_version exact match
   *    - approved_at not null
   * 8. If ANY check fails: ROLLBACK.
   * 9. COMMIT only after all checks pass.
   *
   * If failure occurs, rollback guarantees durable state is NEVER left
   * as PLAN_APPROVED or partial PLAN_APPROVAL_PENDING residue.
   */
  async approveAtomic(planId: string, hooks?: import("./repository").ApprovalTestHooks): Promise<FrozenProductPlan> {
    await this.ensureTable();
    const databaseUrl = (this.connectionUrl || process.env.DATABASE_URL)?.trim();
    if (!databaseUrl) throw new Error("DATABASE_URL_NOT_CONFIGURED");

    const client = new Client(databaseUrl);
    await client.connect();

    try {
      // 1. BEGIN transaction
      await client.query("BEGIN;");

      // 2. SELECT current plan FOR UPDATE
      const res = await client.query(
        `SELECT plan_id, product_id, plan_version, status, plan_sha256, approved_at, qc_result_json, plan_json, created_at, updated_at
         FROM product_creation_plans
         WHERE plan_id = $1
         FOR UPDATE;`,
        [planId]
      );

      if (!res.rows || res.rows.length === 0) {
        await client.query("ROLLBACK;");
        throw new Error(`PRODUCT_PLAN_NOT_FOUND:${planId}`);
      }

      const current = this.mapRow(res.rows[0] as DbPlanRow);

      // 3. Re-run QC
      const qcResult = evaluateProductCreationPlanQC(current.plan);
      if (!qcResult.passed) {
        await client.query("ROLLBACK;");
        throw new Error(
          `CANNOT_APPROVE_PLAN: QC status is ${qcResult.status}. ${qcResult.issues.map((i) => i.message).join(" | ")}`
        );
      }

      // 4. Compute canonical SHA
      const canonicalSha = computePlanSha256(current.plan);

      // 5. Write: PLAN_APPROVAL_PENDING
      const qcResultJson = JSON.stringify(qcResult);
      await client.query(
        `UPDATE product_creation_plans
         SET status = 'PLAN_APPROVAL_PENDING',
             plan_sha256 = $1,
             qc_result_json = $2::jsonb,
             updated_at = NOW()
         WHERE plan_id = $3;`,
        [canonicalSha, qcResultJson, planId]
      );

      // 6. Write: PLAN_APPROVED
      const approvedAt = new Date().toISOString();
      await client.query(
        `UPDATE product_creation_plans
         SET status = 'PLAN_APPROVED',
             approved_at = $1,
             updated_at = NOW()
         WHERE plan_id = $2;`,
        [approvedAt, planId]
      );

      // 7. Readback verification in SAME transaction
      let readbackRow: DbPlanRow | null = null;
      if (hooks?.injectedFailure === "READBACK_FAIL") {
        readbackRow = null;
      } else {
        const readbackRes = await client.query(
          `SELECT plan_id, product_id, plan_version, status, plan_sha256, approved_at, qc_result_json, plan_json, created_at, updated_at
           FROM product_creation_plans
           WHERE plan_id = $1;`,
          [planId]
        );
        readbackRow = readbackRes.rows && readbackRes.rows.length > 0 ? (readbackRes.rows[0] as DbPlanRow) : null;
      }

      if (!readbackRow || readbackRow.status !== "PLAN_APPROVED") {
        await client.query("ROLLBACK;");
        throw new Error("PLAN_APPROVAL_VERIFICATION_FAILED:STATUS_MISMATCH_OR_EMPTY");
      }

      if (hooks?.injectedFailure === "SHA_MISMATCH" || readbackRow.plan_sha256 !== canonicalSha) {
        await client.query("ROLLBACK;");
        throw new Error("PLAN_APPROVAL_VERIFICATION_FAILED:SHA_MISMATCH");
      }

      if (hooks?.injectedFailure === "PRODUCT_MISMATCH" || readbackRow.product_id !== current.productId) {
        await client.query("ROLLBACK;");
        throw new Error("PLAN_APPROVAL_VERIFICATION_FAILED:PRODUCT_MISMATCH");
      }

      if (hooks?.injectedFailure === "VERSION_MISMATCH" || Number(readbackRow.plan_version) !== current.planVersion) {
        await client.query("ROLLBACK;");
        throw new Error("PLAN_APPROVAL_VERIFICATION_FAILED:VERSION_MISMATCH");
      }

      if (hooks?.injectedFailure === "APPROVED_AT_MISSING" || !readbackRow.approved_at) {
        await client.query("ROLLBACK;");
        throw new Error("PLAN_APPROVAL_VERIFICATION_FAILED:APPROVED_AT_MISSING");
      }

      if (hooks?.injectedFailure === "BEFORE_COMMIT") {
        await client.query("ROLLBACK;");
        throw new Error("PLAN_APPROVAL_INJECTED_FAILURE:BEFORE_COMMIT");
      }

      // 8. COMMIT only after all checks pass
      await client.query("COMMIT;");
      return this.mapRow(readbackRow);
    } catch (err) {
      await client.query("ROLLBACK;").catch(() => {});
      throw err;
    } finally {
      await client.end().catch(() => {});
    }
  }
}

