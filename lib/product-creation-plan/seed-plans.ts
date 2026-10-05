import { computePlanSha256, type FrozenProductPlan, type ProductCreationPlan } from "./types";
import { evaluateProductCreationPlanQC } from "./qc-engine";
import { type ProductCreationPlanRepository } from "./repository";

export function createValidSmokeTestPlan(): ProductCreationPlan {
  return {
    productId: "NEW-PRODUCT-001",
    productName: "New Product Spreadsheet System",
    productType: "SPREADSHEET_SCHEDULE",
    targetBuyer: "Independent business owners and operators seeking structured models.",
    buyerProblem: "Business owners struggle with chaotic operational tracking, uncalculated capacity, and unclear metrics.",
    coreOutcome: "A structured operational roadmap that models quarterly revenue targets and labor hours.",
    primaryUseCase: "Used during annual and quarterly business planning sessions as well as weekly review.",
    whyBuyReason: "Provides an all-in-one pre-built Excel framework with zero setup friction and full formulas.",
    differentiation: "Combines financial forecasting with labor hour modeling instead of generic templates.",
    scopeClarity: "Includes exactly 4 customer-ready files: master Excel workbook, example, PDF printable, user guide.",
    priceTargetUsd: 9.99,
    automationStatus: "MANUAL",
    compatibility: [
      "Microsoft Excel Desktop 2016+ (Windows & Mac)",
      "Google Sheets (manual standard formulas)"
    ],
    limitations: [
      "Manual data entry required",
      "No automated bank sync or CRM integration",
      "No VBA macros included"
    ],
    buyerFiles: [
      {
        rank: 1,
        filename: "buyer.xlsx",
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        purpose: "Reusable blank operational workbook with formulas",
        editable: true,
        printable: false,
        required: true
      },
      {
        rank: 2,
        filename: "Example.xlsx",
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        purpose: "Completed reference workbook showing a sample business",
        editable: true,
        printable: false,
        required: true
      },
      {
        rank: 3,
        filename: "Worksheet.pdf",
        type: "application/pdf",
        purpose: "Printable planning worksheets for offline review",
        editable: false,
        printable: true,
        required: true
      },
      {
        rank: 4,
        filename: "UserGuide.pdf",
        type: "application/pdf",
        purpose: "Step-by-step setup guide with screenshots and FAQ",
        editable: false,
        printable: true,
        required: true
      }
    ],
    workbookPlan: {
      sheetCount: 5,
      sheets: [
        { name: "01_Executive_Dashboard", purpose: "High level KPI overview of revenue, labor capacity, and net margin", requiredColumns: ["Metric", "Target", "Actual", "Variance"], formulas: ["SUM", "AVERAGE", "IF"], dropdowns: ["Quarter", "Year"], editableAreas: ["Quarter Selector", "Notes"], protectedAreas: ["KPI Cards", "Formulas"] },
        { name: "02_Revenue_Model", purpose: "Monthly revenue projection by client recurring tiers", requiredColumns: ["Client Tier", "Monthly Fee", "Active Clients", "Total"], formulas: ["PRODUCT", "SUM"], dropdowns: ["Service Frequency"], editableAreas: ["Client Counts", "Tier Pricing"], protectedAreas: ["Revenue Summaries"] },
        { name: "03_Labor_Capacity_Planner", purpose: "Cleaner hour availability vs weekly contracted cleaning hours", requiredColumns: ["Staff Name", "Available Hours", "Assigned Hours", "Utilization %"], formulas: ["DIVIDE", "SUM"], dropdowns: ["Role Type"], editableAreas: ["Staff Roster", "Available Hours"], protectedAreas: ["Utilization Metrics"] },
        { name: "04_Pricing_Calculator", purpose: "Cost-per-sqft and gross margin calculator for prospective bids", requiredColumns: ["Room Type", "SqFt", "Estimated Minutes", "Direct Cost", "Quote Price"], formulas: ["SUM", "ROUNDUP"], dropdowns: ["Cleaning Tier"], editableAreas: ["Dimensions", "Hourly Wage Assumption"], protectedAreas: ["Calculated Bid"] },
        { name: "05_Annual_Budget", purpose: "Operating expense schedule and net income forecast", requiredColumns: ["Expense Category", "Jan", "Feb", "Mar", "Q1 Total"], formulas: ["SUM", "SUBTRACT"], dropdowns: ["Expense Type"], editableAreas: ["Expense Line Items"], protectedAreas: ["Net Profit Row"] }
      ]
    },
    pdfPlan: {
      pageCountTarget: 4,
      orientation: "portrait",
      printIntent: "High-resolution clean print A4 and US Letter",
      editable: false,
      printable: true,
      hasDisclaimer: true,
      hasFooter: true,
      hasPageNumbering: true,
      pages: [
        { page: 1, purpose: "Cover page with branding and workbook index" },
        { page: 2, purpose: "Quarterly goal setting and target checklist" },
        { page: 3, purpose: "Capacity bottleneck diagnostic flowchart" },
        { page: 4, purpose: "Operating policies summary and copyright notice" }
      ]
    },
    listingImagePlan: Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      objective: `Image ${i + 1} showcase`,
      headline: `Headline for slide ${i + 1}`,
      keyClaim: `Key claim for slide ${i + 1}`,
      evidenceSource: `Approved mockup ${i + 1}`,
      productScreenshotRequired: true,
      mobileSafeZone: true,
      shopDnaLayout: "HERO_SPLIT_LAYOUT",
      buyerQuestionAnswered: `Buyer question for slide ${i + 1}`
    })),
    videoPlan: {
      required: true,
      durationTarget: 10,
      scenes: [
        { start: 0, end: 3, purpose: "Hook buyer", sourceAsset: "01.mp4", textOverlay: "Title", claim: "Claim", evidence: "Evidence" },
        { start: 3, end: 7, purpose: "Walkthrough", sourceAsset: "02.mp4", textOverlay: "Title", claim: "Claim", evidence: "Evidence" },
        { start: 7, end: 10, purpose: "Endcard", sourceAsset: "03.mp4", textOverlay: "Title", claim: "Claim", evidence: "Evidence" }
      ]
    },
    supportedClaims: [
      { claim: "Calculates weekly cleaner utilization percentages", status: "VERIFIED", evidenceSource: "Sheet 03 formulas" }
    ],
    prohibitedClaims: ["Automated accounting software"],
    buyerExpectations: {
      isDigitalDownload: true,
      noPhysicalItem: true,
      primarySoftware: "Microsoft Excel Desktop 2016+ (or Google Sheets)",
      automationType: "Manual spreadsheet with standard formulas (no VBA)",
      editableAreasSummary: "All data entry cells in light background are editable; calculation totals protected",
      printableAreasSummary: "Quarterly review worksheet is formatted for standard A4 and US Letter printing",
      limitationsSummary: "Requires manual entry; does not sync to bank accounts or third party software",
      expectedFileCount: 4,
      expectedSheetsOrPagesSummary: "5 worksheets in Excel; 4 pages in PDF guide"
    },
    shopDnaProfile: {
      profileId: "SHOP_DNA_CORE_NAVY_SLATE",
      canvas: "2000x2000",
      background: "#0F172A",
      typography: "Outfit, Inter, system-ui",
      headlineSize: "48px bold",
      brandPlacement: "Top center discreet logo badge",
      badgeStyle: "Rounded pill badge with subtle glassmorphism",
      spacing: "32px grid padding",
      safeMargins: "80px outer safe margin for mobile thumbnails",
      footer: "PoonthaiDigital Verified Operational System",
      ctaStyle: "Subtle clean text badge",
      mobileOverlaySafeZones: "Bottom 140px and Top 80px kept clear of critical text",
      layoutFamily: "SPREADSHEET"
    },
    etsyPlan: {
      taxonomyId: 1001,
      titleStrategy: "New Product Spreadsheet, Business Planning & Operations Calculator, Excel & PDF",
      thirteenTags: Array.from({ length: 13 }, (_, i) => `tag ${i + 1}`),
      priceTarget: 9.99,
      primaryKeyword: "new product spreadsheet",
      secondaryKeywords: ["business planner spreadsheet"],
      positioning: "Operations planning workbook model",
      digitalProductDisclosure: "Instant digital download only. No physical item will be shipped.",
      compatibilityDisclosure: "Requires Microsoft Excel or Google Sheets. Standard spreadsheet formulas.",
      limitationsDisclosure: "Manual workbook model. Does not integrate with automated accounting or CRM systems."
    },
    acceptanceCriteria: {
      buyerFilesExactly: 4,
      listingImagesExactly: 10,
      videoRequired: true,
      brokenFormulasAllowed: 0,
      missingFilesAllowed: 0,
      claimMismatchAllowed: 0,
      highBuyerExpectationRisksAllowed: 0,
      policyCriticalIssuesAllowed: 0
    },
    planRisks: [
      { category: "COMPATIBILITY", description: "Google Sheets differences", severity: "LOW", mitigation: "Standard formulas", resolved: true }
    ]
  };
}

export function seedSmokeTestPlan(repo: ProductCreationPlanRepository): void {
  const plan = createValidSmokeTestPlan();
  const planSha256 = computePlanSha256(plan);
  const qcResult = evaluateProductCreationPlanQC(plan);

  const frozenRecord: FrozenProductPlan = {
    planId: "PLAN-NEW-PRODUCT-001-V1",
    planVersion: 1,
    productId: "NEW-PRODUCT-001",
    status: "PLAN_APPROVED",
    planSha256,
    approvedAt: new Date().toISOString(),
    qcResult: {
      ...qcResult,
      status: "PLAN_APPROVED"
    },
    plan
  };

  void repo.save(frozenRecord);
}
