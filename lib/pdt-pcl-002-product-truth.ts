export const PDT_PCL_002_PRODUCT_TRUTH = Object.freeze({
  productId: "PDT-PCL-002",
  productName: "Professional Cleaning Checklist",
  templateSheets: 11,
  exampleSheets: 12,
  printablePdfPages: 10,
  userGuidePages: 6,
  buyerFileCount: 4,
  listingImageCount: 10,
  listingVideoCount: 1,
  primaryEnvironment: "Microsoft Excel Desktop",
  workflowType: "manual",
  macros: false,
  vba: false,
  crm: false,
  calendarSync: false,
  automatedReminders: false
} as const);

export type PdtPcl002QaActual = {
  templateSheets: number;
  exampleSheets: number;
  printablePdfPages: number;
  userGuidePages: number;
  buyerFileCount: number;
};

export function assertPdtPcl002CanonicalQa(actual: PdtPcl002QaActual) {
  const expected = PDT_PCL_002_PRODUCT_TRUTH;
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
  if (actual.buyerFileCount !== expected.buyerFileCount) {
    mismatches.push(`buyerFileCount expected ${expected.buyerFileCount}, got ${actual.buyerFileCount}`);
  }

  if (mismatches.length > 0) {
    throw new Error(`PDT_PCL_002_SOURCE_MISMATCH: ${mismatches.join("; ")}`);
  }

  return true;
}

export const PDT_PCL_002_ETSY_COPY = Object.freeze({
  template: "11-Sheet Template",
  example: "12-Sheet Example",
  printable: "10-Page A4 Printable PDF",
  userGuide: "6-Page User Guide",
  buyerPackage: "4 Digital Files Included"
} as const);
