import assert from "node:assert/strict";
import test from "node:test";

import {
  PDT_CPR_003_ETSY_COPY,
  PDT_CPR_003_PRODUCT_TRUTH,
  PDT_CPR_003_FORBIDDEN_CLAIMS,
  assertPdtCpr003CanonicalQa
} from "../lib/pdt-cpr-003-product-truth";

test("PDT-CPR-003 canonical truth is locked to 6/6/8/6/2/5", () => {
  assert.deepEqual(
    {
      templateSheets: PDT_CPR_003_PRODUCT_TRUTH.templateSheets,
      exampleSheets: PDT_CPR_003_PRODUCT_TRUTH.exampleSheets,
      printablePdfPages: PDT_CPR_003_PRODUCT_TRUTH.printablePdfPages,
      userGuidePages: PDT_CPR_003_PRODUCT_TRUTH.userGuidePages,
      intakeSheetPages: PDT_CPR_003_PRODUCT_TRUTH.intakeSheetPages,
      buyerFileCount: PDT_CPR_003_PRODUCT_TRUTH.buyerFileCount
    },
    {
      templateSheets: 6,
      exampleSheets: 6,
      printablePdfPages: 8,
      userGuidePages: 6,
      intakeSheetPages: 2,
      buyerFileCount: 5
    }
  );
});

test("PDT-CPR-003 QA gate passes only canonical buyer package counts", () => {
  assert.equal(
    assertPdtCpr003CanonicalQa({
      templateSheets: 6,
      exampleSheets: 6,
      printablePdfPages: 8,
      userGuidePages: 6,
      intakeSheetPages: 2,
      buyerFileCount: 5
    }),
    true
  );

  assert.throws(
    () =>
      assertPdtCpr003CanonicalQa({
        templateSheets: 6,
        exampleSheets: 6,
        printablePdfPages: 10,
        userGuidePages: 8,
        intakeSheetPages: 2,
        buyerFileCount: 5
      }),
    /PDT_CPR_003_SOURCE_MISMATCH/
  );
});

test("PDT-CPR-003 Etsy copy uses truth-safe package counts and has forbidden claims", () => {
  assert.deepEqual(PDT_CPR_003_ETSY_COPY, {
    template: "6-Sheet Template",
    example: "6-Sheet Example",
    printable: "8-Page Proposal Example",
    userGuide: "6-Page User Guide",
    intakeSheet: "2-Page Facility Intake Sheet",
    buyerPackage: "5 Digital Files Included"
  });

  assert.ok(PDT_CPR_003_FORBIDDEN_CLAIMS.length >= 5);
});
