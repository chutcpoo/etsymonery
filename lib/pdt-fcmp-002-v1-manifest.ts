import { createCandidateFingerprint, createListingFingerprint } from "./candidate-fingerprint";

export const PDT_FCMP_002_V1_OPERATION_ID = "PDT-FCMP-002-V1-ETSY-DRAFT-R01" as const;
export const PDT_FCMP_002_V1_AUTHORIZATION_ID =
  "PDT-FCMP-002-V1-ETSY-DRAFT-R01-AUTH-20260920-01" as const;
export const PDT_FCMP_002_V1_AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-FCMP-002-V1-ETSY-DRAFT-R01-20260920 EXACT SCOPE ONLY" as const;
export const PDT_FCMP_002_V1_CANDIDATE_ID =
  "ETSY-LISTING-CANDIDATE-PDT-FCMP-002-V1-20260920-R01" as const;

const DESCRIPTION = [
  "Recipe Cost Calculator & Menu Pricing Spreadsheet for Excel — know your true cost per serving and the price you should charge.",
  "",
  "Stop guessing your prices. This done-for-you Excel workbook turns what you pay for ingredients into a clear cost per serving, food cost %, and a suggested menu price for every item — so you can protect your margins.",
  "",
  "Built for: independent restaurants, cafes, bakeries, caterers, food trucks, and small food businesses.",
  "",
  "HOW IT WORKS (4 simple steps)",
  "1. Ingredient Master — enter what you buy (package cost, quantity, yield %). Usable cost per unit is calculated for you.",
  "2. Recipe Costing — build each recipe from a dropdown; get batch cost and cost per serving automatically.",
  "3. Menu Pricing — enter your selling price and target food cost %; see your food cost % and a suggested target menu price.",
  "4. Dashboard — every item flagged RAISE PRICE, OK, or OK–ROOM at a glance.",
  "",
  "WHAT YOU RECEIVE",
  "- 1 Excel workbook (.xlsx) with 6 ready-to-use tabs",
  "- START HERE instructions",
  "- Ingredient Master · Recipe Costing · Menu Pricing · Dashboard",
  "- A filled SAMPLE tab showing a worked example",
  "- Real working formulas — clean-start file ready for your menu",
  "",
  "IMPORTANT — please read",
  "- Instant digital download. No physical item is shipped.",
  "- Built and tested for Microsoft Excel (.xlsx). Google Sheets is not officially supported.",
  "- This is a manual-entry calculator: you enter your own costs and prices.",
  '- It does NOT guarantee profit or a "correct" price, does not connect to a POS, does not sync supplier prices, does not track inventory automatically, and is not tax/accounting software. Price suggestions are math based on your inputs.',
  "",
  "Questions before you buy? Send a message — happy to help."
].join("\n");

const TAGS = Object.freeze([
  "recipe cost sheet",
  "food cost calculator",
  "food cost template",
  "menu pricing",
  "recipe costing",
  "cafe cost sheet",
  "cost per serving",
  "cafe spreadsheet",
  "food cost excel",
  "menu price sheet",
  "catering pricing",
  "food business tool",
  "restaurant excel"
] as const);

export type PdtFcmpV1Asset = {
  kind: "UPLOAD_IMAGE" | "UPLOAD_FILE";
  rank: number;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  driveId: string;
  mimeType: string;
  altText?: string;
};

export const PDT_FCMP_002_V1_GALLERY = Object.freeze([
  {
    kind: "UPLOAD_IMAGE", rank: 1, fileName: "PDT-FCMP-002_01_hero.png", sizeBytes: 50696,
    sha256: "1e485470caecf4509f7a573976e76078ed828602a97037f772b0cead588872de",
    driveId: "1T0_R2jDc_1pz_Tt521kVkf-6KjwWK7Zf", mimeType: "image/png",
    altText: "Restaurant recipe cost and menu pricing calculator Excel template title cover PoonthaiDigital"
  },
  {
    kind: "UPLOAD_IMAGE", rank: 2, fileName: "PDT-FCMP-002_02_dashboard.png", sizeBytes: 59959,
    sha256: "016e962f65ba9bff92db6e6520e29061b1ae9b33b434101ac2cd3d1a7a289f8b",
    driveId: "13jC78hPEPAsuA9oan3jkvKxmM2deR4Xi", mimeType: "image/png",
    altText: "Menu health dashboard showing food cost percent and raise price flags for each menu item"
  },
  {
    kind: "UPLOAD_IMAGE", rank: 3, fileName: "PDT-FCMP-002_03_ingredient.png", sizeBytes: 51212,
    sha256: "f40002009da20eaa341c5e43ccc64a0d70602bebe87d67e802cb242ae444d914",
    driveId: "1G5cpYhhz5bJJ9RyVu31E_xz81z3QXsTM", mimeType: "image/png",
    altText: "Ingredient master tab entering package cost quantity and yield to get usable cost per unit"
  },
  {
    kind: "UPLOAD_IMAGE", rank: 4, fileName: "PDT-FCMP-002_04_recipe.png", sizeBytes: 50884,
    sha256: "947cdb9a57e8eed67a1b505cab139747f7aa38ea4d9356416e1b4471bd8d4978",
    driveId: "1DTsmOtkLFOrn50KaFvs_0wO-8k8lsSMO", mimeType: "image/png",
    altText: "Recipe costing tab calculating batch cost and cost per serving for a butter croissant"
  },
  {
    kind: "UPLOAD_IMAGE", rank: 5, fileName: "PDT-FCMP-002_05_cps.png", sizeBytes: 37414,
    sha256: "02031d3e21ffab6619dc72e6a392189967cb0716838921d5281809c7970ce4da",
    driveId: "1mZxvUT-0kurCLPrJeth6bdoUGXJXkvNQ", mimeType: "image/png",
    altText: "Cost per serving result of seventy five cents for a butter croissant batch of twelve"
  },
  {
    kind: "UPLOAD_IMAGE", rank: 6, fileName: "PDT-FCMP-002_06_fcpct.png", sizeBytes: 49884,
    sha256: "f920dcaecae4e7bf9e962fd1f4569e7441a03103481f2f5f5863e49c83be7055",
    driveId: "1sHQOjyRWu1chh2Peu8D8WyNMHZxWfM-y", mimeType: "image/png",
    altText: "Food cost percentage screen showing thirty percent versus twenty eight percent target"
  },
  {
    kind: "UPLOAD_IMAGE", rank: 7, fileName: "PDT-FCMP-002_07_target.png", sizeBytes: 43603,
    sha256: "95b9f8ecd32644348a9e63c86c4d84de4ce4d9ee81ef2d4bc742b73bd4db4b60",
    driveId: "1cVZEgdDyxD-U-Y0jXAqZThN1IKyPoUCE", mimeType: "image/png",
    altText: "Suggested target menu price of two dollars sixty nine cents for a twenty eight percent food cost target"
  },
  {
    kind: "UPLOAD_IMAGE", rank: 8, fileName: "PDT-FCMP-002_08_workflow.png", sizeBytes: 50825,
    sha256: "4503f46fdee97fd0b4502961b5913575b2661775f1b7344170265f8073463103",
    driveId: "1I9QrSduCNwlEal-De0oE5FvIllS6_DXc", mimeType: "image/png",
    altText: "Four step workflow ingredient master recipe costing menu pricing and dashboard"
  },
  {
    kind: "UPLOAD_IMAGE", rank: 9, fileName: "PDT-FCMP-002_09_receive.png", sizeBytes: 54276,
    sha256: "8e3e66111c49fb3083d310be8ca4c5056524eddec234ec9e1b690063ca7882fb",
    driveId: "1hbinGGNrzPtpPIwiwC2Xn3A9Ek0YhtyG", mimeType: "image/png",
    altText: "What you receive list of Excel workbook tabs instructions and sample data"
  },
  {
    kind: "UPLOAD_IMAGE", rank: 10, fileName: "PDT-FCMP-002_10_boundaries.png", sizeBytes: 55007,
    sha256: "8fb94fbcfa19d0eef8262ebbcd5c3fd6b6ccdbda90fe485b3538569494d38410",
    driveId: "1rH-IXeTsixtaOLf2xuFzayzLjXWtLJSt", mimeType: "image/png",
    altText: "Compatibility and boundaries Microsoft Excel manual entry calculator honest disclaimers"
  }
] as const satisfies readonly PdtFcmpV1Asset[]);

export const PDT_FCMP_002_V1_BUYER_FILES = Object.freeze([
  {
    kind: "UPLOAD_FILE", rank: 1,
    fileName: "PoonthaiDigital_Restaurant_Recipe_Cost_Menu_Pricing_Calculator_PDT-FCMP-002_V1.xlsx",
    sizeBytes: 18603,
    sha256: "4e26be518f70a41607017d4de93d71f6c3158725bfde6e344abf8731b2c6ab03",
    driveId: "1xxdF1OMBYmy36IebpzSz6QFSJMGl_6pZ",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }
] as const satisfies readonly PdtFcmpV1Asset[]);

export const PDT_FCMP_002_V1_LISTING_IDENTITY = Object.freeze({
  title: "Restaurant Recipe Cost Calculator | Food Cost Spreadsheet & Menu Pricing Calculator for Excel | Cafe Caterer Cost Per Serving Template",
  description: DESCRIPTION,
  priceUsd: 9.99,
  tags: [...TAGS],
  quantity: 999,
  who_made: "i_did",
  when_made: "2020_2026",
  taxonomy_id: 12476,
  type: "download",
  state: "draft"
});

const CANDIDATE_PAYLOAD = Object.freeze({
  candidateId: PDT_FCMP_002_V1_CANDIDATE_ID,
  operationId: PDT_FCMP_002_V1_OPERATION_ID,
  productId: "PDT-FCMP-002",
  productVersion: "V1.0",
  listing: PDT_FCMP_002_V1_LISTING_IDENTITY,
  gallery: PDT_FCMP_002_V1_GALLERY.map((asset) => ({ ...asset })),
  buyerFiles: PDT_FCMP_002_V1_BUYER_FILES.map((asset) => ({ ...asset }))
});

export const PDT_FCMP_002_V1_LISTING_FINGERPRINT =
  createListingFingerprint(PDT_FCMP_002_V1_LISTING_IDENTITY);

export const PDT_FCMP_002_V1_CANDIDATE_FINGERPRINT =
  createCandidateFingerprint(CANDIDATE_PAYLOAD);

export const PDT_FCMP_002_V1_FROZEN_LISTING_FINGERPRINT =
  "272d97930332816515a8350ad8b99cd13b63ac1a8826d2033f2605f3f64f4b42" as const;

export const PDT_FCMP_002_V1_FROZEN_CANDIDATE_FINGERPRINT =
  "d549f6e456b681c2dd45e7bb520dec8831b9f66c062bde1ceaa3b32b5bb962db" as const;

export const PDT_FCMP_002_V1_DRAFT = Object.freeze({
  operationId: PDT_FCMP_002_V1_OPERATION_ID,
  authorizationId: PDT_FCMP_002_V1_AUTHORIZATION_ID,
  authorizationText: PDT_FCMP_002_V1_AUTHORIZATION_TEXT,
  productId: "PDT-FCMP-002",
  productVersion: "V1.0",
  shopId: 23582741,
  candidateId: PDT_FCMP_002_V1_CANDIDATE_ID,
  candidateFingerprint: PDT_FCMP_002_V1_CANDIDATE_FINGERPRINT,
  listingFingerprint: PDT_FCMP_002_V1_LISTING_FINGERPRINT,
  listing: PDT_FCMP_002_V1_LISTING_IDENTITY,
  gallery: PDT_FCMP_002_V1_GALLERY,
  buyerFiles: PDT_FCMP_002_V1_BUYER_FILES,
  publishAuthorized: false
});

export function assertPdtFcmp002V1ManifestFrozen() {
  if (PDT_FCMP_002_V1_LISTING_FINGERPRINT !== PDT_FCMP_002_V1_FROZEN_LISTING_FINGERPRINT) {
    throw new Error("PDT_FCMP_V1_LISTING_FINGERPRINT_DRIFT");
  }
  if (PDT_FCMP_002_V1_CANDIDATE_FINGERPRINT !== PDT_FCMP_002_V1_FROZEN_CANDIDATE_FINGERPRINT) {
    throw new Error("PDT_FCMP_V1_CANDIDATE_FINGERPRINT_DRIFT");
  }
  if (PDT_FCMP_002_V1_GALLERY.length !== 10 || PDT_FCMP_002_V1_BUYER_FILES.length !== 1) {
    throw new Error("PDT_FCMP_V1_ASSET_COUNT_DRIFT");
  }
  return true;
}
