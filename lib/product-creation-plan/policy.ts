export const LEGACY_EXEMPT_PRODUCTS = Object.freeze([
  "PDT-CS-001",
  "PDT-CSCH-001",
  "PDT-PCL-002",
  "PDT-CPR-003",
  "PDT-IPT-001",
  "PDT-FCMP-002",
  "PDT-HBOP-001",
  "PDT-PMC-008",
  "PDT-RPT-003",
  "PDT-CBEO-004",
  "PDT-BIPC-003",
  "NEW-PRODUCT-001"
] as const);

export type LegacyExemptProductId = (typeof LEGACY_EXEMPT_PRODUCTS)[number];

const legacyExemptSet = new Set<string>(LEGACY_EXEMPT_PRODUCTS);

/**
 * Checks whether a given product requires an approved Product Creation Plan.
 * Rule:
 * 1. If explicit manifest/flag overrides `planRequired: boolean`, that wins.
 * 2. If product is in LEGACY_EXEMPT_PRODUCTS (Product 01, 02, 03, etc.), it is exempt (false).
 * 3. Product 04 onwards (e.g. PDT-CBP-004, PDT-DCL-005, etc.) and all new products require a plan (true).
 * 4. Can be globally enforced via process.env.PRODUCT_PLAN_GATE_REQUIRED.
 */
export function isProductPlanRequired(
  productId: string,
  options?: { planRequired?: boolean }
): boolean {
  if (typeof options?.planRequired === "boolean") {
    return options.planRequired;
  }

  const normalized = productId.trim().toUpperCase();

  // Explicit exemption for verified historical legacy products
  if (legacyExemptSet.has(normalized)) {
    return false;
  }

  // All other products (including Product 04+) strictly require an approved plan
  return true;
}
