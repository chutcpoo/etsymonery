export const PDT_CPR_003_PRODUCT_TRUTH = Object.freeze({
  productId: "PDT-CPR-003",
  productName: "Cleaning Service Proposal System",
  templateSheets: 6,
  exampleSheets: 6,
  printablePdfPages: 8,
  userGuidePages: 6,
  intakeSheetPages: 2,
  buyerFileCount: 5,
  listingImageCount: 10,
  listingVideoCount: 1,
  primaryEnvironment: "Microsoft Excel Desktop",
  workflowType: "manual",
  macros: false,
  vba: false,
  automatedBidEngine: false,
  checkboxes: false
} as const);

export type PdtCpr003QaActual = {
  templateSheets: number;
  exampleSheets: number;
  printablePdfPages: number;
  userGuidePages: number;
  intakeSheetPages: number;
  buyerFileCount: number;
};

export function assertPdtCpr003CanonicalQa(actual: PdtCpr003QaActual) {
  const expected = PDT_CPR_003_PRODUCT_TRUTH;
  const mismatches: string[] = [];

  if (actual.templateSheets !== expected.templateSheets) {
    mismatches.push(`templateSheets expected ${expected.templateSheets}, got ${actual.templateSheets}`);
  }
  if (actual.exampleSheets !== expected.exampleSheets) {
    mismatches.push(`exampleSheets expected ${expected.exampleSheets}, got ${actual.exampleSheets}`);
  }
  if (actual.printablePdfPages !== expected.printablePdfPages) {
    mismatches.push(`printablePdfPages expected ${expected.printablePdfPages}, got ${actual.printablePdfPages}`);
  }
  if (actual.userGuidePages !== expected.userGuidePages) {
    mismatches.push(`userGuidePages expected ${expected.userGuidePages}, got ${actual.userGuidePages}`);
  }
  if (actual.intakeSheetPages !== expected.intakeSheetPages) {
    mismatches.push(`intakeSheetPages expected ${expected.intakeSheetPages}, got ${actual.intakeSheetPages}`);
  }
  if (actual.buyerFileCount !== expected.buyerFileCount) {
    mismatches.push(`buyerFileCount expected ${expected.buyerFileCount}, got ${actual.buyerFileCount}`);
  }

  if (mismatches.length > 0) {
    throw new Error(`PDT_CPR_003_SOURCE_MISMATCH: ${mismatches.join("; ")}`);
  }

  return true;
}

export const PDT_CPR_003_ETSY_COPY = Object.freeze({
  template: "6-Sheet Template",
  example: "6-Sheet Example",
  printable: "8-Page Proposal Example",
  userGuide: "6-Page User Guide",
  intakeSheet: "2-Page Facility Intake Sheet",
  buyerPackage: "5 Digital Files Included"
} as const);

/** Forbidden claims that must never appear in any Etsy copy */
export const PDT_CPR_003_FORBIDDEN_CLAIMS = Object.freeze([
  "win high-value recurring contracts",
  "winning proposal in under 15 minutes",
  "full cross-platform compatibility across Windows, Mac, iPad, and Google Sheets",
  "Automated Bid Engine",
  "Checkboxes",
  "8-Page User Guide",
  "attorney-structured",
  "legally binding"
] as const);
