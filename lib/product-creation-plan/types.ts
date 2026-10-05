import { createHash } from "node:crypto";

export const PRODUCT_CREATION_PLAN_VERSION = "1.0.0" as const;

export type ProductFamily =
  | "SPREADSHEET_SCHEDULE"
  | "PRINTABLE_CHECKLIST"
  | "PROPOSAL_DOCUMENT"
  | "CALCULATOR"
  | "TRACKER"
  | "PLANNER";

export type AutomationStatus = "MANUAL" | "AUTOMATED" | "HYBRID";

export type PlanStatus =
  | "DRAFT"
  | "PLAN_APPROVED"
  | "PLAN_APPROVAL_PENDING"
  | "PLAN_BLOCKED"
  | "PLAN_REVIEW_REQUIRED"
  | "PLAN_STALE";

export type RiskSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type RiskCategory =
  | "TECHNICAL"
  | "COMPATIBILITY"
  | "POLICY"
  | "BUYER_CONFUSION"
  | "LEGAL_WORDING"
  | "IP"
  | "PRODUCTION_COMPLEXITY"
  | "FILE_SIZE"
  | "PRINT_LAYOUT"
  | "MOBILE_LISTING";

export interface BuyerFilePlanItem {
  rank: number;
  filename: string;
  type: string; // e.g. "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" or "application/pdf"
  purpose: string;
  editable: boolean;
  printable: boolean;
  required: boolean;
}

export interface WorkbookSheetPlan {
  name: string;
  purpose: string;
  requiredColumns: string[];
  formulas: string[];
  dropdowns: string[];
  editableAreas: string[];
  protectedAreas: string[];
  printArea?: string;
}

export interface WorkbookPlan {
  sheetCount: number;
  sheets: WorkbookSheetPlan[];
}

export interface PdfPagePlan {
  page: number;
  purpose: string;
}

export interface PdfPlan {
  pageCountTarget: number;
  orientation: "portrait" | "landscape";
  printIntent: string;
  editable: boolean;
  printable: boolean;
  hasDisclaimer: boolean;
  hasFooter: boolean;
  hasPageNumbering: boolean;
  pages: PdfPagePlan[];
}

export interface ListingImagePlanItem {
  rank: number; // 1 to 10
  objective: string;
  headline: string;
  keyClaim: string;
  evidenceSource: string;
  productScreenshotRequired: boolean;
  mobileSafeZone: boolean;
  shopDnaLayout: string;
  buyerQuestionAnswered: string;
}

export interface VideoScenePlan {
  start: number;
  end: number;
  purpose: string;
  sourceAsset: string;
  textOverlay: string;
  claim: string;
  evidence: string;
  transition?: string;
  audio?: string;
}

export interface VideoPlan {
  required: boolean;
  durationTarget?: number;
  scenes?: VideoScenePlan[];
}

export interface ClaimPlanItem {
  claim: string;
  status: "VERIFIED" | "REQUIRES_TEST";
  evidenceSource?: string;
}

export interface BuyerExpectationPlan {
  isDigitalDownload: boolean;
  noPhysicalItem: boolean;
  primarySoftware: string;
  automationType: string;
  editableAreasSummary: string;
  printableAreasSummary: string;
  limitationsSummary: string;
  expectedFileCount: number;
  expectedSheetsOrPagesSummary: string;
}

export interface ShopDnaPlan {
  profileId: string;
  canvas: string;
  background: string;
  typography: string;
  headlineSize: string;
  brandPlacement: string;
  badgeStyle: string;
  spacing: string;
  safeMargins: string;
  footer: string;
  ctaStyle: string;
  mobileOverlaySafeZones: string;
  layoutFamily: string;
}

export interface EtsyPlan {
  taxonomyId: number;
  titleStrategy: string;
  thirteenTags: string[];
  priceTarget: number;
  primaryKeyword: string;
  secondaryKeywords: string[];
  positioning: string;
  digitalProductDisclosure: string;
  compatibilityDisclosure: string;
  limitationsDisclosure: string;
}

export interface AcceptanceCriteria {
  buyerFilesExactly: number;
  listingImagesExactly: number;
  videoRequired: boolean;
  brokenFormulasAllowed: number;
  missingFilesAllowed: number;
  claimMismatchAllowed: number;
  highBuyerExpectationRisksAllowed: number;
  policyCriticalIssuesAllowed: number;
}

export interface PlanRiskItem {
  category: RiskCategory;
  description: string;
  severity: RiskSeverity;
  mitigation?: string;
  resolved: boolean;
}

export interface ProductCreationPlan {
  productId: string;
  productName: string;
  productType: ProductFamily;
  targetBuyer: string;
  buyerProblem: string;
  coreOutcome: string;
  primaryUseCase: string;
  whyBuyReason: string;
  differentiation: string;
  scopeClarity: string;
  buyerFiles: BuyerFilePlanItem[];
  workbookPlan?: WorkbookPlan;
  pdfPlan?: PdfPlan;
  listingImagePlan: ListingImagePlanItem[];
  videoPlan?: VideoPlan;
  compatibility: string[];
  limitations: string[];
  automationStatus: AutomationStatus;
  priceTargetUsd: number;
  supportedClaims: ClaimPlanItem[];
  prohibitedClaims: string[];
  buyerExpectations: BuyerExpectationPlan;
  shopDnaProfile: ShopDnaPlan;
  etsyPlan: EtsyPlan;
  acceptanceCriteria: AcceptanceCriteria;
  planRisks?: PlanRiskItem[];
}

export interface PlanQCIssue {
  rule: string;
  severity: "BLOCKING" | "REVIEW_REQUIRED" | "INFO";
  message: string;
}

export interface PlanScoreBreakdown {
  productClarity: number;
  buyerValue: number;
  productArchitecture: number;
  filePlan: number;
  workbookPdfPlan: number;
  listingImagePlan: number;
  videoPlan: number;
  shopDnaFit: number;
  policyFit: number;
  buyerExpectationClarity: number;
  buildFeasibility: number;
  overallScore: number;
}

export interface PlanQCResult {
  status: "PLAN_APPROVED" | "PLAN_BLOCKED" | "PLAN_REVIEW_REQUIRED";
  passed: boolean;
  issues: PlanQCIssue[];
  scores: PlanScoreBreakdown;
  evaluatedAt: string;
}

export interface FrozenProductPlan {
  planId: string;
  planVersion: number;
  productId: string;
  status: PlanStatus;
  planSha256: string;
  approvedAt: string | null;
  qcResult: PlanQCResult;
  plan: ProductCreationPlan;
}

export function computePlanSha256(plan: ProductCreationPlan): string {
  // Canonical stable JSON stringify
  const canonical = JSON.stringify(plan, Object.keys(plan).sort());
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
