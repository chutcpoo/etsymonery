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
  approvePlan(planId: string, hooks?: import("./repository").ApprovalTestHooks): Promise<FrozenProductPlan>;
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
   * BLOCKER 2 — REAL TRANSACTIONAL ATOMIC APPROVAL (FAIL-CLOSED):
   *
   * Executes atomic approval within a single transaction boundary:
   *   BEGIN -> SELECT ... FOR UPDATE -> QC check -> SHA computation ->
   *   write PLAN_APPROVAL_PENDING -> write PLAN_APPROVED ->
   *   in-transaction readback verification -> COMMIT / ROLLBACK.
   *
   * If ANY assertion, check, or step fails: ROLLBACK is executed.
   * Durable state is NEVER left as PLAN_APPROVED or partial PLAN_APPROVAL_PENDING residue.
   */
  async approvePlan(planId: string, hooks?: import("./repository").ApprovalTestHooks): Promise<FrozenProductPlan> {
    const existing = await this.repository.load(planId);
    if (!existing) {
      throw new Error(`PRODUCT_PLAN_NOT_FOUND:${planId}`);
    }
    assertNoSecretFields(existing.plan);

    return this.repository.approveAtomic(planId, hooks);
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
