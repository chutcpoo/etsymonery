/**
 * LEGACY_EXEMPT_PRODUCTS — narrow, evidence-based allowlist.
 *
 * Only historical products that:
 *   1. Existed before the Product Creation Plan QC gate was introduced,
 *   2. Have a frozen Release Lock on disk under docs/release-locks/, AND
 *   3. Are fully published or in a stable state that cannot be re-created
 *      through new build automation.
 *
 * Products 04+ are NOT on this list.
 * Generic / test / NEW-* IDs are NOT on this list.
 * Unknown product IDs default to planRequired = true.
 *
 * Evidence:
 *   PDT-CS-001 / PDT-CSCH-001  — Release Lock: docs/release-locks/PDT-CSCH-001.json  (FINAL_QC_PASS, published)
 *   PDT-PCL-002                — Release Lock: docs/release-locks/PDT-PCL-002.json    (FINAL_QC_PASS, published)
 *   PDT-CPR-003                — Release Lock: docs/release-locks/PDT-CPR-003.json    (FINAL_QC_PASS, published)
 *   PDT-IPT-001                — Release Lock: docs/release-locks/PDT-IPT-001.json    (FINAL_QC_PASS, published)
 *   PDT-FCMP-002               — Release Lock: docs/release-locks/PDT-FCMP-002.json   (FINAL_QC_PASS, published)
 *   PDT-HBOP-001               — Release Lock: docs/release-locks/PDT-HBOP-001.json   (FINAL_QC_PASS, published)
 *   PDT-PMC-008                — Release Lock: docs/release-locks/PDT-PMC-008.json    (FINAL_QC_PASS, published)
 *   PDT-RPT-003                — Release Lock: docs/release-locks/PDT-RPT-003.json    (FINAL_QC_PASS, published)
 *   PDT-BIPC-003               — Release Lock: docs/release-locks/PDT-BIPC-003.json   (FINAL_QC_PASS, published)
 *
 * REMOVED from prior list (no legacy evidence; must follow plan gate):
 *   PDT-CBEO-004  — Product 04; NOT exempt; plan required.
 *   NEW-PRODUCT-001 — Generic test/placeholder ID; NOT exempt; plan required.
 */
export const LEGACY_EXEMPT_PRODUCTS = Object.freeze([
  "PDT-CS-001",   // Canonical alias for PDT-CSCH-001 (same product, legacy short-form ID)
  "PDT-CSCH-001", // Content Scheduling Workbook — Release Lock: PDT-CSCH-001.json
  "PDT-PCL-002",  // Product Cost & Pricing Log — Release Lock: PDT-PCL-002.json
  "PDT-CPR-003",  // Client Proposal & Retainer — Release Lock: PDT-CPR-003.json
  "PDT-IPT-001",  // Invoice Payment Tracker — Release Lock: PDT-IPT-001.json
  "PDT-FCMP-002", // Food Cost & Menu Pricing — Release Lock: PDT-FCMP-002.json
  "PDT-HBOP-001", // Home-Based Operations Planner — Release Lock: PDT-HBOP-001.json
  "PDT-PMC-008",  // Pricing & Margin Calculator — Release Lock: PDT-PMC-008.json
  "PDT-RPT-003",  // Rental Property Tracker — Release Lock: PDT-RPT-003.json
  "PDT-BIPC-003"  // Bar Inventory & Pour Cost — Release Lock: PDT-BIPC-003.json
] as const);

export type LegacyExemptProductId = (typeof LEGACY_EXEMPT_PRODUCTS)[number];

const legacyExemptSet = new Set<string>(LEGACY_EXEMPT_PRODUCTS);

/**
 * Returns true when a product requires an approved Product Creation Plan
 * before any build/release action can proceed.
 *
 * Evaluation order:
 *   1. Explicit caller override (`options.planRequired`) wins.
 *   2. Products in LEGACY_EXEMPT_PRODUCTS are exempt (false) — these have
 *      evidence-based, frozen Release Locks and cannot be re-created by
 *      new build automation.
 *   3. All other products — including Product 04+, NEW-* IDs, and any
 *      unknown ID — default to plan required (true).
 */
export function isProductPlanRequired(
  productId: string,
  options?: { planRequired?: boolean }
): boolean {
  if (typeof options?.planRequired === "boolean") {
    return options.planRequired;
  }

  const normalized = productId.trim().toUpperCase();

  // Explicit exemption for verified historical legacy products only
  if (legacyExemptSet.has(normalized)) {
    return false;
  }

  // Default: plan required for all unknown, new, and Product 04+ IDs
  return true;
}
