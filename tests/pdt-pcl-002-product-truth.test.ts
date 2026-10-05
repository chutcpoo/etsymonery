import assert from "node:assert/strict";
import test from "node:test";

import {
  PDT_PCL_002_ETSY_COPY,
  PDT_PCL_002_PRODUCT_TRUTH,
  assertPdtPcl002CanonicalQa
} from "../lib/pdt-pcl-002-product-truth";

test("PDT-PCL-002 canonical truth is locked to 11/12/10/6/4", () => {
  assert.deepEqual(
    {
      templateSheets: PDT_PCL_002_PRODUCT_TRUTH.templateSheets,
      exampleSheets: PDT_PCL_002_PRODUCT_TRUTH.exampleSheets,
      printablePdfPages: PDT_PCL_002_PRODUCT_TRUTH.printablePdfPages,
      userGuidePages: PDT_PCL_002_PRODUCT_TRUTH.userGuidePages,
      buyerFileCount: PDT_PCL_002_PRODUCT_TRUTH.buyerFileCount
    },
    {
      templateSheets: 11,
      exampleSheets: 12,
      printablePdfPages: 10,
      userGuidePages: 6,
      buyerFileCount: 4
    }
  );
});

test("PDT-PCL-002 QA gate passes only the canonical buyer package counts", () => {
  assert.equal(
    assertPdtPcl002CanonicalQa({
      templateSheets: 11,
      exampleSheets: 12,
      printablePdfPages: 10,
      userGuidePages: 6,
      buyerFileCount: 4
    }),
    true
  );

  assert.throws(
    () =>
      assertPdtPcl002CanonicalQa({
        templateSheets: 11,
        exampleSheets: 12,
        printablePdfPages: 11,
        userGuidePages: 4,
        buyerFileCount: 5
      }),
    /PDT_PCL_002_SOURCE_MISMATCH/
  );
});

test("PDT-PCL-002 Etsy copy uses only truth-safe package counts", () => {
  assert.deepEqual(PDT_PCL_002_ETSY_COPY, {
    template: "11-Sheet Template",
    example: "12-Sheet Example",
    printable: "10-Page A4 Printable PDF",
    userGuide: "6-Page User Guide",
    buyerPackage: "4 Digital Files Included"
  });
});
