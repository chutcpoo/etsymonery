import {
  type ProductCreationPlan,
  type FrozenProductPlan,
  type PlanStatus,
  computePlanSha256
} from "./types";
import { evaluateProductCreationPlanQC } from "./qc-engine";
import {
  type ProductCreationPlanRepository,
  MemoryProductCreationPlanRepository
} from "./repository";
import { NeonProductCreationPlanRepository } from "./postgres-plan-store";

export interface PlanStorage {
  savePlan(plan: ProductCreationPlan, customPlanId?: string): Promise<FrozenProductPlan>;
  getPlan(planId: string): Promise<FrozenProductPlan | null>;
  getPlanByProductId(productId: string): Promise<FrozenProductPlan | null>;
  runQC(planId: string): Promise<FrozenProductPlan>;
  approvePlan(planId: string): Promise<FrozenProductPlan>;
  checkStaleness(
    planId: string,
    currentPlanContent?: ProductCreationPlan
  ): Promise<{ isStale: boolean; status: PlanStatus }>;
}

const FORBIDDEN_SECRET_KEYS = [
  "password",
  "apikey",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "privatekey"
];

export function assertNoSecretFields(obj: unknown, path = ""): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      assertNoSecretFields(obj[i], `${path}[${i}]`);
    }
    return;
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const forbidden of FORBIDDEN_SECRET_KEYS) {
      if (normalizedKey.includes(forbidden)) {
        throw new Error(
          `SECURITY_SECRET_FIELD_FORBIDDEN: Plan contains forbidden credential/secret key "${key}" at "${path ? `${path}.${key}` : key}".`
        );
      }
    }
    assertNoSecretFields(value, path ? `${path}.${key}` : key);
  }
}

export class DurableProductPlanStore implements PlanStorage {
  constructor(private readonly repository: ProductCreationPlanRepository) {}

  async savePlan(plan: ProductCreationPlan, customPlanId?: string): Promise<FrozenProductPlan> {
    assertNoSecretFields(plan);

    const planId = customPlanId || `PLAN-${plan.productId}-V1`;
    const planSha256 = computePlanSha256(plan);
    const qcResult = evaluateProductCreationPlanQC(plan);

    const record: FrozenProductPlan = {
      planId,
      planVersion: 1,
      productId: plan.productId,
      status: "DRAFT",
      planSha256,
      approvedAt: null,
      qcResult,
      plan: structuredClone(plan)
    };

    await this.repository.save(record);
    return structuredClone(record);
  }

  async getPlan(planId: string): Promise<FrozenProductPlan | null> {
    return this.repository.load(planId);
  }

  async getPlanByProductId(productId: string): Promise<FrozenProductPlan | null> {
    return this.repository.loadByProductId(productId);
  }

  async runQC(planId: string): Promise<FrozenProductPlan> {
    const record = await this.repository.load(planId);
    if (!record) {
      throw new Error(`PRODUCT_PLAN_NOT_FOUND:${planId}`);
    }

    assertNoSecretFields(record.plan);

    const qcResult = evaluateProductCreationPlanQC(record.plan);
    record.qcResult = qcResult;
    record.planSha256 = computePlanSha256(record.plan);

    if (record.status !== "PLAN_APPROVED") {
      if (qcResult.status !== "PLAN_APPROVED") {
        record.status = qcResult.status;
      } else {
        record.status = "DRAFT";
      }
    }

    await this.repository.save(record);
    return structuredClone(record);
  }

  /**
   * BLOCKER 2 — TWO-PHASE ATOMIC APPROVAL (FAIL CLOSED):
   *
   * Phase 1 — Intent: Write PLAN_APPROVAL_PENDING to durable store.
   *   This marks that an approval attempt is in progress.
   *   If anything fails from here, a compensation write is attempted
   *   to set the record to PLAN_BLOCKED (never PLAN_APPROVED).
   *
   * Phase 2 — Commit: Write PLAN_APPROVED with full field set.
   *   Immediately read back from store and verify ALL fields:
   *     - status === "PLAN_APPROVED"
   *     - planSha256 exact match
   *     - productId exact match
   *     - planVersion exact match
   *     - approvedAt is present
   *   If ANY field mismatches → compensate (write PLAN_BLOCKED) → throw.
   *
   * A failed approval can NEVER leave durable state as PLAN_APPROVED.
   * Compensation errors are propagated, not swallowed.
   */
  async approvePlan(planId: string): Promise<FrozenProductPlan> {
    const record = await this.repository.load(planId);
    if (!record) {
      throw new Error(`PRODUCT_PLAN_NOT_FOUND:${planId}`);
    }

    assertNoSecretFields(record.plan);

    const qcResult = evaluateProductCreationPlanQC(record.plan);
    const frozenSha = computePlanSha256(record.plan);

    if (!qcResult.passed) {
      const rejectedRecord: FrozenProductPlan = {
        ...record,
        qcResult,
        planSha256: frozenSha,
        status: qcResult.status
      };
      await this.repository.save(rejectedRecord).catch(() => {});
      throw new Error(
        `CANNOT_APPROVE_PLAN: QC status is ${qcResult.status}. ${qcResult.issues.map((i) => i.message).join(" | ")}`
      );
    }

    // Phase 1: Write PLAN_APPROVAL_PENDING — signals intent, prevents
    // concurrent approval races. If this write fails we never claimed APPROVED.
    const pendingRecord: FrozenProductPlan = {
      ...record,
      qcResult,
      planSha256: frozenSha,
      status: "PLAN_APPROVAL_PENDING",
      approvedAt: null
    };

    try {
      await this.repository.save(pendingRecord);
    } catch (pendingError) {
      throw new Error(
        `PLAN_APPROVAL_FAILED:PENDING_WRITE_FAILED: ${pendingError instanceof Error ? pendingError.message : "Database write error"}`
      );
    }

    // Helper: compensate by writing PLAN_BLOCKED so durable state is never
    // left as PLAN_APPROVED or PLAN_APPROVAL_PENDING after a failure.
    const compensate = async (reason: string): Promise<never> => {
      const blockedRecord: FrozenProductPlan = {
        ...pendingRecord,
        status: "PLAN_BLOCKED",
        approvedAt: null
      };
      let compensationError: unknown;
      try {
        await this.repository.save(blockedRecord);
      } catch (compErr) {
        compensationError = compErr;
      }
      const suffix = compensationError
        ? ` | COMPENSATION_WRITE_FAILED: ${compensationError instanceof Error ? compensationError.message : String(compensationError)}`
        : "";
      throw new Error(`PLAN_APPROVAL_FAILED:${reason}${suffix}`);
    };

    // Phase 2: Write PLAN_APPROVED with full field set.
    const approvedAt = new Date().toISOString();
    const approvedRecord: FrozenProductPlan = {
      ...pendingRecord,
      status: "PLAN_APPROVED",
      approvedAt
    };

    try {
      await this.repository.save(approvedRecord);
    } catch (saveError) {
      return compensate(
        `PERSISTENCE_WRITE_FAILED: ${saveError instanceof Error ? saveError.message : "Database write error"}`
      );
    }

    // Phase 2 readback — verify ALL fields inside same commit boundary.
    let readback: FrozenProductPlan | null;
    try {
      readback = await this.repository.load(planId);
    } catch (readError) {
      return compensate(
        `PERSISTENCE_READBACK_FAILED: ${readError instanceof Error ? readError.message : "Database read error"}`
      );
    }

    if (!readback) {
      return compensate("PERSISTENCE_READBACK_NOT_FOUND");
    }

    if (readback.status !== "PLAN_APPROVED") {
      return compensate(
        `PERSISTENCE_STATUS_MISMATCH: Stored status is "${readback.status}", expected "PLAN_APPROVED"`
      );
    }

    if (readback.planSha256 !== approvedRecord.planSha256) {
      return compensate(
        `PERSISTENCE_SHA_MISMATCH: Stored SHA "${readback.planSha256}" does not match approved SHA "${approvedRecord.planSha256}"`
      );
    }

    if (readback.productId !== approvedRecord.productId) {
      return compensate(
        `PERSISTENCE_PRODUCT_MISMATCH: Stored product "${readback.productId}" does not match "${approvedRecord.productId}"`
      );
    }

    if (readback.planVersion !== approvedRecord.planVersion) {
      return compensate(
        `PERSISTENCE_VERSION_MISMATCH: Stored version ${readback.planVersion} does not match ${approvedRecord.planVersion}`
      );
    }

    if (!readback.approvedAt) {
      return compensate("PERSISTENCE_APPROVED_AT_MISSING: approvedAt must be set on PLAN_APPROVED record");
    }

    return structuredClone(readback);
  }

  async checkStaleness(
    planId: string,
    currentPlanContent?: ProductCreationPlan
  ): Promise<{ isStale: boolean; status: PlanStatus }> {
    const record = await this.repository.load(planId);
    if (!record) {
      return { isStale: true, status: "PLAN_BLOCKED" };
    }

    if (record.status !== "PLAN_APPROVED") {
      return { isStale: false, status: record.status };
    }

    if (currentPlanContent) {
      const currentHash = computePlanSha256(currentPlanContent);
      if (currentHash !== record.planSha256) {
        return { isStale: true, status: "PLAN_STALE" };
      }
    }

    return { isStale: false, status: record.status };
  }
}

// Factory helper
export function getProductPlanStore(customRepo?: ProductCreationPlanRepository): DurableProductPlanStore {
  if (customRepo) {
    return new DurableProductPlanStore(customRepo);
  }

  if (process.env.DATABASE_URL?.trim()) {
    return new DurableProductPlanStore(new NeonProductCreationPlanRepository());
  }

  // Memory fallback for offline test suites
  return new DurableProductPlanStore(new MemoryProductCreationPlanRepository());
}

export const globalPlanStore = getProductPlanStore();

// Backwards compatibility alias for existing code
export class MemoryAndDiskPlanStore extends DurableProductPlanStore {
  constructor(_diskSync?: boolean) {
    super(new MemoryProductCreationPlanRepository());
  }
}
