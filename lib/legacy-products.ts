import { LEGACY_ETSY_CHANNEL_INDEX } from "./catalog-channel-index";

const legacyProductIds = new Set([
  ...LEGACY_ETSY_CHANNEL_INDEX.map(({ productId }) => productId),
  // Historical release locks and Image01 release targets.
  "PD-CLEAN-004", "PD-COFFEE-002", "PD-REST-003", "PD-STOCK-005",
  "PDT-BOBA-001", "PDT-BPSC-001", "PDT-CPR-003", "PDT-PCSO-001",
  "PDT-PCL-002", "PDT-POGO-001", "PDT-CS-001",
  // Former draft batch.
  "PDT-ABT-013", "PDT-CBP-004", "PDT-CCP-007", "PDT-CFB-014",
  "PDT-CIF-010", "PDT-CIP-011", "PDT-CMK-015", "PDT-CQE-008",
  "PDT-CRM-012", "PDT-CSC-009", "PDT-DCL-005", "PDT-MCL-006",
]);

export function isLegacyProduct(productId: string): boolean {
  return legacyProductIds.has(productId);
}
