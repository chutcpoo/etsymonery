import { createCandidateFingerprint, createListingFingerprint } from "./candidate-fingerprint";

export const PDT_BIPC_003_V1_OPERATION_ID = "PDT-BIPC-003-V1-ETSY-PUBLISH-R02" as const;
export const PDT_BIPC_003_V1_AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-BIPC-003-V1-ETSY-PUBLISH-R02-20260921 EXACT SCOPE ONLY" as const;
export const PDT_BIPC_003_V1_CANDIDATE_ID =
  "ETSY-LISTING-CANDIDATE-PDT-BIPC-003-V1-20260921-R02" as const;

export const PDT_BIPC_003_V1_DESCRIPTION = [
  "Bar Inventory Spreadsheet for Excel — track beverage counts, purchases, actual usage, buyer-set par levels, reorder quantities, pour cost, and actual-vs-theoretical variance in one 8-tab workflow.",
  "",
  "WHAT YOU GET",
  "• SAMPLE Excel workbook (.xlsx) with fictional demonstration data",
  "• CLEAN START Excel workbook (.xlsx) for your own entries",
  "• 8 tabs: START HERE, SETTINGS, BEVERAGE ITEMS, PURCHASES, COUNT & USAGE, PAR & REORDER, POUR COST & VARIANCE, DASHBOARD",
  "",
  "WHAT IT DOES",
  "• Tracks liquor, beer, wine, and other beverage items",
  "• Records purchases and calculates purchase totals",
  "• Calculates actual usage: opening count + purchases − closing count",
  "• Supports decimal counts for partial bottles or containers",
  "• Uses your own par levels to calculate reorder quantity",
  "• Estimates reorder cost from workbook inputs",
  "• Calculates cost per mL, cost per standard serving, and pour cost %",
  "• Compares pour cost % with a user-set target",
  "• Calculates actual-vs-theoretical usage variance in mL, units, and cost",
  "• Shows operational KPIs, reorder items, and variance-review signals on a dashboard",
  "",
  "HOW TO USE",
  "1. Review SETTINGS.",
  "2. Add beverages in BEVERAGE ITEMS.",
  "3. Record purchases.",
  "4. Enter opening and closing counts for a consistent period.",
  "5. Review usage and reorder.",
  "6. Enter servings sold if you want variance analysis.",
  "7. Review POUR COST & VARIANCE.",
  "8. Review DASHBOARD.",
  "",
  "IMPORTANT",
  "• Microsoft Excel .xlsx only in V1",
  "• Manual data entry — no POS import or automatic sales import",
  "• No supplier price sync or automatic ordering",
  "• No bottle scanning or automatic bottle measurement",
  "• Variance is a review signal. It does not prove theft, overpour, waste, spillage, breakage, comps, or any specific cause.",
  "• Google Sheets compatibility is not included or claimed for V1.",
  "• Digital download only. No physical item will be shipped.",
  "",
  "The SAMPLE workbook uses fictional data only to demonstrate how the workflow and formulas work.",
  "",
  "AI DISCLOSURE",
  "",
  "AI tools were used to assist with planning, visual presentation, and workflow refinement. The final workbook files were reviewed, edited, and prepared by PoonthaiDigital."
].join("\n");

export const PDT_BIPC_003_V1_TAGS = Object.freeze([
  "liquor inventory","bar inventory","pour cost tracker","bar par sheet","liquor stock sheet",
  "beverage inventory","bar reorder tracker","inventory sheet","bar inventory excel","liquor spreadsheet",
  "pour cost sheet","bar cost tracker","restaurant bar tool"
] as const);

export type PdtBipcV1Asset = {
  kind: "UPLOAD_IMAGE" | "UPLOAD_FILE";
  rank: number;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  driveId: string;
  mimeType: string;
  altText?: string;
};

export const PDT_BIPC_003_V1_GALLERY = Object.freeze([
  {kind:"UPLOAD_IMAGE",rank:1,fileName:"PDT-BIPC-003_01_hero.png",sizeBytes:240007,sha256:"8eca08ce59f31ebe76a6ac6d1d240fdac351f018bd52805379febd42ee865653",driveId:"17CHl93N_AOXLNsYGHnDEudPC2DImu-Ja",mimeType:"image/png",altText:"Bar Inventory & Pour Cost Tracker Excel workbook with actual sample dashboard preview, showing stock, reorder, usage and variance-review workflow."},
  {kind:"UPLOAD_IMAGE",rank:2,fileName:"PDT-BIPC-003_02_dashboard.png",sizeBytes:333135,sha256:"c6fa7b086801df16353b4e542f741e58a7460cd24d20720c478a98fb01725b8c",driveId:"1w_27crMHp-24zX0G2Pw4c84-JRR74bfl",mimeType:"image/png",altText:"Actual SAMPLE dashboard from Bar Inventory & Pour Cost Tracker showing fictional on-hand value, reorder cost, usage cost and review lists."},
  {kind:"UPLOAD_IMAGE",rank:3,fileName:"PDT-BIPC-003_03_count_usage.png",sizeBytes:114789,sha256:"f276215cd22e46e7303f4133dd2e51a2f9700af50ce527794d7b78020b520cd9",driveId:"1PEiO08eLVRj7BpuDb7VXc-t0Jbbk-DMy",mimeType:"image/png",altText:"Infographic showing Opening Count plus Purchases minus Closing Count equals Actual Usage, with blank and zero handling."},
  {kind:"UPLOAD_IMAGE",rank:4,fileName:"PDT-BIPC-003_04_reorder.png",sizeBytes:109156,sha256:"c3bfd29199b69513466c733e8d1bbb8614d6997be6ad734a0d50bc88eec03bac",driveId:"1VQhKxaqssVtl9uFIsFkPTATgfnPHCF7C",mimeType:"image/png",altText:"Par and reorder workflow showing current on-hand, buyer-entered par level, reorder quantity and estimated reorder cost."},
  {kind:"UPLOAD_IMAGE",rank:5,fileName:"PDT-BIPC-003_05_pour_cost.png",sizeBytes:119185,sha256:"8eb3a61a3b17c6161cc7424d74aa0247f85ca101464f91279ea96e0dbe84d74d",driveId:"1apSdzk1FnpsCanzZIjS4Bo6raB8rPK3p",mimeType:"image/png",altText:"Pour cost workflow showing package cost to unit cost, cost per mL, cost per serving and pour cost percentage."},
  {kind:"UPLOAD_IMAGE",rank:6,fileName:"PDT-BIPC-003_06_variance.png",sizeBytes:113754,sha256:"7c34987b68ed4c87dec17e0c0323aea91e4a9ee2c903972b09d71d22ec341c6a",driveId:"1dST3b_A4mbBIii29zdm995nij0591Q0J",mimeType:"image/png",altText:"Variance review infographic comparing actual usage and theoretical usage, stating variance is a review signal and not a cause."},
  {kind:"UPLOAD_IMAGE",rank:7,fileName:"PDT-BIPC-003_07_partial_counts.png",sizeBytes:74094,sha256:"2e055d470e5d6cc77bdd839ae676b925a7287c96676d3da3e3027ecf128944b5",driveId:"1bWsNw_sApn3hLnI2-iXBV97JshyeY7--",mimeType:"image/png",altText:"Partial bottle count illustration showing decimal container counts such as 0.25, 0.50, 0.75 and 1.00."},
  {kind:"UPLOAD_IMAGE",rank:8,fileName:"PDT-BIPC-003_08_tabs.png",sizeBytes:97125,sha256:"1b42942d2896cdae47b79014667a9c133397cea060403693f403ddfbe8f57ee5",driveId:"1L4nW_E3KgmeIy1R5W1U1M1H7WQX2apCK",mimeType:"image/png",altText:"Eight-tab Excel workflow: Start Here, Settings, Beverage Items, Purchases, Count & Usage, Par & Reorder, Pour Cost & Variance, Dashboard."},
  {kind:"UPLOAD_IMAGE",rank:9,fileName:"PDT-BIPC-003_09_what_you_get.png",sizeBytes:99047,sha256:"3d1c8d8640b3bdab11a517cb99528939a55937f0c4f0519a297ff05ac23ca602",driveId:"1kz3LhbMCnHpmqw-StImAsE6DvfXOkfNj",mimeType:"image/png",altText:"Two Excel files included: SAMPLE workbook with fictional data and CLEAN START workbook for buyer data."},
  {kind:"UPLOAD_IMAGE",rank:10,fileName:"PDT-BIPC-003_10_boundaries.png",sizeBytes:152997,sha256:"4edecea18cd33d3f9b1a0ffd6789ca17783346d1495ddbd84444decc647a8ed5",driveId:"1WnLRMV5g0pdnweSa2yNuppLKHwz3QilW",mimeType:"image/png",altText:"Included and not included summary for Bar Inventory & Pour Cost Tracker, including no POS integration, supplier sync or Google Sheets V1."}
] as const satisfies readonly PdtBipcV1Asset[]);

export const PDT_BIPC_003_V1_BUYER_FILES = Object.freeze([
  {kind:"UPLOAD_FILE",rank:1,fileName:"PDT-BIPC-003_V1_Bar_Inventory_Pour_Cost_Tracker_SAMPLE.xlsx",sizeBytes:126257,sha256:"5c36d25ce98e35e729c3449fdbb555a4f84762e2195d7735ecae3c12980cf1b8",driveId:"1dTJW7IzcKIBcj43KGqkeW7yUOlFJ3RWK",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
  {kind:"UPLOAD_FILE",rank:2,fileName:"PDT-BIPC-003_V1_Bar_Inventory_Pour_Cost_Tracker_CLEAN_START.xlsx",sizeBytes:123515,sha256:"aba1eba1fa26f907edcd4e039104c164ea20c58d73842013a12ac95e752fa8ef",driveId:"1jV6Xus2iAqdoLOCALWAtVj-Lg5VRh3w9",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
] as const satisfies readonly PdtBipcV1Asset[]);

export const PDT_BIPC_003_V1_LISTING_IDENTITY = Object.freeze({
  title:"Bar Inventory Spreadsheet | Liquor Stock & Pour Cost Tracker",
  description:PDT_BIPC_003_V1_DESCRIPTION,
  priceUsd:11.99,
  tags:[...PDT_BIPC_003_V1_TAGS],
  quantity:999,
  who_made:"i_did",
  when_made:"2020_2026",
  taxonomy_id:12476,
  type:"download",
  state:"draft"
});

const CANDIDATE_PAYLOAD = Object.freeze({
  candidateId:PDT_BIPC_003_V1_CANDIDATE_ID,
  operationId:PDT_BIPC_003_V1_OPERATION_ID,
  productId:"PDT-BIPC-003",
  productVersion:"V1.0",
  listing:PDT_BIPC_003_V1_LISTING_IDENTITY,
  gallery:PDT_BIPC_003_V1_GALLERY.map((a)=>({...a})),
  buyerFiles:PDT_BIPC_003_V1_BUYER_FILES.map((a)=>({...a}))
});

export const PDT_BIPC_003_V1_LISTING_FINGERPRINT =
  createListingFingerprint(PDT_BIPC_003_V1_LISTING_IDENTITY);
export const PDT_BIPC_003_V1_CANDIDATE_FINGERPRINT =
  createCandidateFingerprint(CANDIDATE_PAYLOAD);

export const PDT_BIPC_003_V1_FROZEN_LISTING_FINGERPRINT =
  "e802cb1a4fa5d7aaf4be2e173e2b911fdc3e70343dfa8763c3597bfb5244492d" as const;
export const PDT_BIPC_003_V1_FROZEN_CANDIDATE_FINGERPRINT =
  "c22abf2e37ba254b113774651b7c7da785cffe218cf0bd6f1125712342259d85" as const;

export function assertPdtBipc003V1RepairedManifestFrozen(){
  if(PDT_BIPC_003_V1_LISTING_FINGERPRINT!==PDT_BIPC_003_V1_FROZEN_LISTING_FINGERPRINT)
    throw new Error("PDT_BIPC_V1_LISTING_FINGERPRINT_DRIFT");
  if(PDT_BIPC_003_V1_CANDIDATE_FINGERPRINT!==PDT_BIPC_003_V1_FROZEN_CANDIDATE_FINGERPRINT)
    throw new Error("PDT_BIPC_V1_CANDIDATE_FINGERPRINT_DRIFT");
  if(PDT_BIPC_003_V1_GALLERY.length!==10||PDT_BIPC_003_V1_BUYER_FILES.length!==2)
    throw new Error("PDT_BIPC_V1_ASSET_COUNT_DRIFT");
  return true;
}
