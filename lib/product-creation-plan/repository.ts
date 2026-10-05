import { type FrozenProductPlan, computePlanSha256 } from "./types";
import { evaluateProductCreationPlanQC } from "./qc-engine";

export interface ApprovalTestHooks {
  injectedFailure?:
    | "READBACK_FAIL"
    | "SHA_MISMATCH"
    | "PRODUCT_MISMATCH"
    | "VERSION_MISMATCH"
    | "APPROVED_AT_MISSING"
    | "BEFORE_COMMIT";
}

export interface ProductCreationPlanRepository {
  save(record: FrozenProductPlan): Promise<void>;
  load(planId: string): Promise<FrozenProductPlan | null>;
  loadByProductId(productId: string): Promise<FrozenProductPlan | null>;
  list(): Promise<FrozenProductPlan[]>;
  approveAtomic(planId: string, hooks?: ApprovalTestHooks): Promise<FrozenProductPlan>;
}

export class MemoryProductCreationPlanRepository implements ProductCreationPlanRepository {
  private readonly records = new Map<string, FrozenProductPlan>();

  async save(record: FrozenProductPlan): Promise<void> {
    this.records.set(record.planId, structuredClone(record));
  }

  async load(planId: string): Promise<FrozenProductPlan | null> {
    const found = this.records.get(planId);
    return found ? structuredClone(found) : null;
  }

  async loadByProductId(productId: string): Promise<FrozenProductPlan | null> {
    // Find highest version or latest record for productId
    const matches = [...this.records.values()]
      .filter((r) => r.productId === productId)
      .sort((a, b) => b.planVersion - a.planVersion);
    return matches.length > 0 ? structuredClone(matches[0]) : null;
  }

  async list(): Promise<FrozenProductPlan[]> {
    return [...this.records.values()]
      .sort((a, b) => a.planId.localeCompare(b.planId, "en"))
      .map((r) => structuredClone(r));
  }

  /**
   * Memory atomic approval with transactional snapshot rollback.
   * If any step fails or an assertion fails, the repository state is rolled back
   * to the exact snapshot before the transaction, leaving NO PLAN_APPROVED
   * or PLAN_APPROVAL_PENDING residue.
   */
  async approveAtomic(planId: string, hooks?: ApprovalTestHooks): Promise<FrozenProductPlan> {
    // 1. BEGIN transaction snapshot
    const snapshot = new Map<string, FrozenProductPlan>();
    for (const [k, v] of this.records.entries()) {
      snapshot.set(k, structuredClone(v));
    }

    const rollback = () => {
      this.records.clear();
      for (const [k, v] of snapshot.entries()) {
        this.records.set(k, structuredClone(v));
      }
    };

    try {
      // 2. SELECT current plan FOR UPDATE (row-level lock simulation)
      const current = this.records.get(planId);
      if (!current) {
        throw new Error(`PRODUCT_PLAN_NOT_FOUND:${planId}`);
      }

      // 3. Re-run QC
      const qcResult = evaluateProductCreationPlanQC(current.plan);
      if (!qcResult.passed) {
        throw new Error(
          `CANNOT_APPROVE_PLAN: QC status is ${qcResult.status}. ${qcResult.issues.map((i) => i.message).join(" | ")}`
        );
      }

      // 4. Compute canonical SHA
      const canonicalSha = computePlanSha256(current.plan);

      // 5. Write: PLAN_APPROVAL_PENDING
      const pendingRecord: FrozenProductPlan = {
        ...structuredClone(current),
        qcResult,
        planSha256: canonicalSha,
        status: "PLAN_APPROVAL_PENDING",
        approvedAt: null
      };
      this.records.set(planId, pendingRecord);

      // 6. Write: PLAN_APPROVED
      const approvedAt = new Date().toISOString();
      const approvedRecord: FrozenProductPlan = {
        ...structuredClone(pendingRecord),
        status: "PLAN_APPROVED",
        approvedAt
      };
      this.records.set(planId, approvedRecord);

      // 7. Readback verification in SAME transaction
      let readback = this.records.get(planId);
      if (hooks?.injectedFailure === "READBACK_FAIL") {
        readback = undefined;
      }
      if (!readback || readback.status !== "PLAN_APPROVED") {
        throw new Error("PLAN_APPROVAL_VERIFICATION_FAILED:STATUS_MISMATCH_OR_EMPTY");
      }

      if (hooks?.injectedFailure === "SHA_MISMATCH" || readback.planSha256 !== canonicalSha) {
        throw new Error("PLAN_APPROVAL_VERIFICATION_FAILED:SHA_MISMATCH");
      }

      if (hooks?.injectedFailure === "PRODUCT_MISMATCH" || readback.productId !== current.productId) {
        throw new Error("PLAN_APPROVAL_VERIFICATION_FAILED:PRODUCT_MISMATCH");
      }

      if (hooks?.injectedFailure === "VERSION_MISMATCH" || readback.planVersion !== current.planVersion) {
        throw new Error("PLAN_APPROVAL_VERIFICATION_FAILED:VERSION_MISMATCH");
      }

      if (hooks?.injectedFailure === "APPROVED_AT_MISSING" || !readback.approvedAt) {
        throw new Error("PLAN_APPROVAL_VERIFICATION_FAILED:APPROVED_AT_MISSING");
      }

      if (hooks?.injectedFailure === "BEFORE_COMMIT") {
        throw new Error("PLAN_APPROVAL_INJECTED_FAILURE:BEFORE_COMMIT");
      }

      // 8. COMMIT (snapshot confirmed, return approved plan)
      return structuredClone(readback);
    } catch (err) {
      // ROLLBACK on any failure
      rollback();
      throw err;
    }
  }

  clear(): void {
    this.records.clear();
  }
}

