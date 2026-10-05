import { type FrozenProductPlan } from "./types";

export interface ProductCreationPlanRepository {
  save(record: FrozenProductPlan): Promise<void>;
  load(planId: string): Promise<FrozenProductPlan | null>;
  loadByProductId(productId: string): Promise<FrozenProductPlan | null>;
  list(): Promise<FrozenProductPlan[]>;
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

  clear(): void {
    this.records.clear();
  }
}
