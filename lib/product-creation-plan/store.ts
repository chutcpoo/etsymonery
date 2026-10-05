import fs from "node:fs";
import path from "node:path";
import {
  type ProductCreationPlan,
  type FrozenProductPlan,
  type PlanStatus,
  computePlanSha256
} from "./types";
import { evaluateProductCreationPlanQC } from "./qc-engine";

export interface PlanStorage {
  savePlan(plan: ProductCreationPlan, planId?: string): Promise<FrozenProductPlan>;
  getPlan(planId: string): Promise<FrozenProductPlan | null>;
  getPlanByProductId(productId: string): Promise<FrozenProductPlan | null>;
  runQC(planId: string): Promise<FrozenProductPlan>;
  approvePlan(planId: string): Promise<FrozenProductPlan>;
  checkStaleness(planId: string, currentPlanContent?: ProductCreationPlan): Promise<{ isStale: boolean; status: PlanStatus }>;
}

const PLANS_DOCS_DIR = path.join(process.cwd(), "docs", "product-plans");

export class MemoryAndDiskPlanStore implements PlanStorage {
  private readonly plans = new Map<string, FrozenProductPlan>();
  private readonly productIndex = new Map<string, string>(); // productId -> planId

  constructor(private readonly diskSync: boolean = true) {
    if (this.diskSync && !fs.existsSync(PLANS_DOCS_DIR)) {
      try {
        fs.mkdirSync(PLANS_DOCS_DIR, { recursive: true });
      } catch {
        // Ignored if permissions restrict
      }
    }
  }

  async savePlan(plan: ProductCreationPlan, customPlanId?: string): Promise<FrozenProductPlan> {
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

    this.plans.set(planId, record);
    this.productIndex.set(plan.productId, planId);

    return structuredClone(record);
  }

  async getPlan(planId: string): Promise<FrozenProductPlan | null> {
    const memory = this.plans.get(planId);
    if (memory) return structuredClone(memory);

    // Try disk
    if (this.diskSync) {
      const diskPath = path.join(PLANS_DOCS_DIR, `${planId}.json`);
      if (fs.existsSync(diskPath)) {
        try {
          const content = JSON.parse(fs.readFileSync(diskPath, "utf8")) as FrozenProductPlan;
          this.plans.set(planId, content);
          this.productIndex.set(content.productId, planId);
          return structuredClone(content);
        } catch {
          return null;
        }
      }
    }

    return null;
  }

  async getPlanByProductId(productId: string): Promise<FrozenProductPlan | null> {
    const planId = this.productIndex.get(productId);
    if (planId) {
      return this.getPlan(planId);
    }
    return null;
  }

  async runQC(planId: string): Promise<FrozenProductPlan> {
    const record = await this.getPlan(planId);
    if (!record) {
      throw new Error(`PRODUCT_PLAN_NOT_FOUND:${planId}`);
    }

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

    this.plans.set(planId, record);
    return structuredClone(record);
  }

  async approvePlan(planId: string): Promise<FrozenProductPlan> {
    const record = await this.getPlan(planId);
    if (!record) {
      throw new Error(`PRODUCT_PLAN_NOT_FOUND:${planId}`);
    }

    // Re-evaluate QC to ensure it is currently valid
    const qcResult = evaluateProductCreationPlanQC(record.plan);
    record.qcResult = qcResult;
    record.planSha256 = computePlanSha256(record.plan);

    if (!qcResult.passed) {
      record.status = qcResult.status;
      this.plans.set(planId, record);
      throw new Error(`CANNOT_APPROVE_PLAN: QC status is ${qcResult.status}. ${qcResult.issues.map(i => i.message).join(" | ")}`);
    }

    record.status = "PLAN_APPROVED";
    record.approvedAt = new Date().toISOString();

    this.plans.set(planId, record);
    this.productIndex.set(record.productId, planId);

    // Save to disk for version control
    if (this.diskSync) {
      try {
        const diskPath = path.join(PLANS_DOCS_DIR, `${planId}.json`);
        fs.writeFileSync(diskPath, JSON.stringify(record, null, 2), "utf8");
      } catch (err) {
        console.warn("Could not sync plan to disk:", err);
      }
    }

    return structuredClone(record);
  }

  async checkStaleness(
    planId: string,
    currentPlanContent?: ProductCreationPlan
  ): Promise<{ isStale: boolean; status: PlanStatus }> {
    const record = await this.getPlan(planId);
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

  clear() {
    this.plans.clear();
    this.productIndex.clear();
  }
}

// Singleton global instance
export const globalPlanStore = new MemoryAndDiskPlanStore(true);
