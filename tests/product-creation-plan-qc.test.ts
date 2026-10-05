import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateProductCreationPlanQC,
  type ProductCreationPlan,
  type FrozenProductPlan,
  type ProductCreationPlanRepository,
  MemoryProductCreationPlanRepository,
  DurableProductPlanStore,
  verifyBuildPrerequisites,
  assertApprovedProductPlanForBuild,
  computePlanSha256,
  isProductPlanRequired,
  LEGACY_EXEMPT_PRODUCTS
} from "../lib/product-creation-plan";

function createValidBasePlan(): ProductCreationPlan {
  return {
    productId: "PDT-CBP-004",
    productName: "Cleaning Business Planning & Growth Workbook",
    productType: "SPREADSHEET_SCHEDULE",
    targetBuyer: "Independent cleaning business owners, solo cleaners looking to expand to teams, and janitorial service founders.",
    buyerProblem: "Cleaning business owners struggle with inconsistent revenue, uncalculated operational capacity, chaotic client scheduling, and unclear hiring metrics.",
    coreOutcome: "A structured operational roadmap that models quarterly revenue targets, calculates team cleaning capacity, and sets accurate service pricing.",
    primaryUseCase: "Used during annual and quarterly business planning sessions, as well as weekly review of staffing capacity and gross profit margins.",
    whyBuyReason: "Provides an all-in-one pre-built Excel framework with zero setup friction, designed specifically for commercial and residential cleaning operations.",
    differentiation: "Combines financial forecasting with room-by-room labor hour modeling instead of generic accounting templates.",
    scopeClarity: "Includes exactly 4 customer-ready files: master Excel workbook, completed reference example, printable planning worksheet PDF, and user guide PDF.",
    priceTargetUsd: 9.9,
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
        filename: "Cleaning Business Planning Workbook - Blank Template.xlsx",
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        purpose: "Reusable blank operational and financial model workbook with formulas",
        editable: true,
        printable: false,
        required: true
      },
      {
        rank: 2,
        filename: "Cleaning Business Planning Workbook - Fictional Example.xlsx",
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        purpose: "Completed fictional sample reference workbook showing a $180k/yr cleaning firm",
        editable: true,
        printable: false,
        required: true
      },
      {
        rank: 3,
        filename: "Cleaning Business Quarterly Review Printable - Premium Final.pdf",
        type: "application/pdf",
        purpose: "Printable worksheet for quarterly CEO check-in meetings",
        editable: false,
        printable: true,
        required: true
      },
      {
        rank: 4,
        filename: "Cleaning Business Planning User Guide - Premium Final.pdf",
        type: "application/pdf",
        purpose: "Step-by-step guidance on labor modeling, target pricing, and KPI metrics",
        editable: false,
        printable: true,
        required: true
      }
    ],
    workbookPlan: {
      sheetCount: 5,
      sheets: [
        {
          name: "01_Executive_Dashboard",
          purpose: "High level KPI overview of revenue, labor capacity, and net margin",
          requiredColumns: ["Metric", "Target", "Actual", "Variance"],
          formulas: ["SUM", "AVERAGE", "IF"],
          dropdowns: ["Quarter", "Year"],
          editableAreas: ["Quarter Selector", "Notes"],
          protectedAreas: ["KPI Cards", "Formulas"]
        },
        {
          name: "02_Revenue_Model",
          purpose: "Monthly revenue projection by client recurring tiers",
          requiredColumns: ["Client Tier", "Monthly Fee", "Active Clients", "Total"],
          formulas: ["PRODUCT", "SUM"],
          dropdowns: ["Service Frequency"],
          editableAreas: ["Client Counts", "Tier Pricing"],
          protectedAreas: ["Revenue Summaries"]
        },
        {
          name: "03_Labor_Capacity_Planner",
          purpose: "Cleaner hour availability vs weekly contracted cleaning hours",
          requiredColumns: ["Staff Name", "Available Hours", "Assigned Hours", "Utilization %"],
          formulas: ["DIVIDE", "SUM"],
          dropdowns: ["Role Type"],
          editableAreas: ["Staff Roster", "Available Hours"],
          protectedAreas: ["Utilization Metrics"]
        },
        {
          name: "04_Pricing_Calculator",
          purpose: "Cost-per-sqft and gross margin calculator for prospective bids",
          requiredColumns: ["Room Type", "SqFt", "Estimated Minutes", "Direct Cost", "Quote Price"],
          formulas: ["SUM", "ROUNDUP"],
          dropdowns: ["Cleaning Tier"],
          editableAreas: ["Dimensions", "Hourly Wage Assumption"],
          protectedAreas: ["Calculated Bid"]
        },
        {
          name: "05_Annual_Budget",
          purpose: "Operating expense schedule and net income forecast",
          requiredColumns: ["Expense Category", "Jan", "Feb", "Mar", "Q1 Total"],
          formulas: ["SUM", "SUBTRACT"],
          dropdowns: ["Expense Type"],
          editableAreas: ["Expense Line Items"],
          protectedAreas: ["Net Profit Row"]
        }
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
    listingImagePlan: [
      {
        rank: 1,
        objective: "Hero showcase with instant 2-3s comprehension",
        headline: "Cleaning Business Planning & Growth Workbook for Excel",
        keyClaim: "Plan Revenue, Team Capacity & Profit Margins with Precision",
        evidenceSource: "Approved Executive Dashboard mockup",
        productScreenshotRequired: true,
        mobileSafeZone: true,
        shopDnaLayout: "HERO_SPLIT_LAYOUT",
        buyerQuestionAnswered: "What is this tool and what key benefit does it give my cleaning business?"
      },
      {
        rank: 2,
        objective: "Package inventory breakdown",
        headline: "What You Receive: 4 Master Business Files",
        keyClaim: "2 Excel Workbooks + 2 Professional PDF Guides",
        evidenceSource: "Buyer file package inspection",
        productScreenshotRequired: true,
        mobileSafeZone: true,
        shopDnaLayout: "PACKAGE_GRID",
        buyerQuestionAnswered: "Exactly what files will I be able to download after purchase?"
      },
      {
        rank: 3,
        objective: "Executive Dashboard feature walkthrough",
        headline: "Real-Time Operational Dashboard",
        keyClaim: "Visual KPIs for Monthly Revenue, Staff Hours & Profit",
        evidenceSource: "Executive Dashboard screenshot",
        productScreenshotRequired: true,
        mobileSafeZone: true,
        shopDnaLayout: "FEATURE_CALLOUT",
        buyerQuestionAnswered: "Can I see what the main dashboard looks like in action?"
      },
      {
        rank: 4,
        objective: "Labor and team capacity engine showcase",
        headline: "Know Exactly When to Hire Your Next Cleaner",
        keyClaim: "Capacity Planner Prevents Overbooking and Burnout",
        evidenceSource: "Labor Capacity Planner screenshot",
        productScreenshotRequired: true,
        mobileSafeZone: true,
        shopDnaLayout: "WORKFLOW_GRID",
        buyerQuestionAnswered: "How does this help me manage cleaner schedules and hiring?"
      },
      {
        rank: 5,
        objective: "Service bidding and quote calculator showcase",
        headline: "Price Every Commercial and Residential Bid for Profit",
        keyClaim: "Calculates Margin Based on Real Labor Minutes and Supplies",
        evidenceSource: "Pricing Calculator screenshot",
        productScreenshotRequired: true,
        mobileSafeZone: true,
        shopDnaLayout: "FEATURE_CALLOUT",
        buyerQuestionAnswered: "Will this stop me from underbidding cleaning jobs?"
      },
      {
        rank: 6,
        objective: "Four-step planning workflow",
        headline: "Simple 4-Step Growth Framework",
        keyClaim: "Set Goals → Audit Capacity → Price Bids → Review Budget",
        evidenceSource: "User guide workflow diagram",
        productScreenshotRequired: false,
        mobileSafeZone: true,
        shopDnaLayout: "PROCESS_TIMELINE",
        buyerQuestionAnswered: "Is this easy to use if I'm not a financial expert?"
      },
      {
        rank: 7,
        objective: "Compatibility and system requirements",
        headline: "Built for Microsoft Excel & Google Sheets",
        keyClaim: "100% Formula-Driven, Zero VBA Macros, Instant Setup",
        evidenceSource: "Workbook specification manifest",
        productScreenshotRequired: false,
        mobileSafeZone: true,
        shopDnaLayout: "TECH_SPECS",
        buyerQuestionAnswered: "Will this open and function properly on my computer?"
      },
      {
        rank: 8,
        objective: "Fictional example case study preview",
        headline: "Includes Completed $180k Example Workbook",
        keyClaim: "See Real Numbers and Formulas Pre-Populated",
        evidenceSource: "Example workbook screenshot",
        productScreenshotRequired: true,
        mobileSafeZone: true,
        shopDnaLayout: "CASE_STUDY",
        buyerQuestionAnswered: "How do I know what numbers to put into the blank sheets?"
      },
      {
        rank: 9,
        objective: "Truthful limitations and digital download notice",
        headline: "Important Details & System Scope",
        keyClaim: "Instant Digital Download • Manual Workbook • No Physical Item",
        evidenceSource: "Product Truth Manifesto",
        productScreenshotRequired: false,
        mobileSafeZone: true,
        shopDnaLayout: "DISCLOSURE_PANEL",
        buyerQuestionAnswered: "What are the boundaries and delivery format of this purchase?"
      },
      {
        rank: 10,
        objective: "Collection synergy & cross-sell",
        headline: "PoonthaiDigital Cleaning Business Operations Suite",
        keyClaim: "Pairs Perfectly with Schedule and Proposal Systems",
        evidenceSource: "Etsy catalog cross-reference",
        productScreenshotRequired: true,
        mobileSafeZone: true,
        shopDnaLayout: "BUNDLE_BANNER",
        buyerQuestionAnswered: "What other matching tools exist for my cleaning business?"
      }
    ],
    videoPlan: {
      required: true,
      durationTarget: 10,
      scenes: [
        {
          start: 0,
          end: 3,
          purpose: "Hook buyer with Dashboard overview and clean aesthetic",
          sourceAsset: "01_dashboard_screencap.mp4",
          textOverlay: "Cleaning Business Planning Master Workbook",
          claim: "Clear Revenue & Capacity KPIs",
          evidence: "Dashboard tab screen capture"
        },
        {
          start: 3,
          end: 7,
          purpose: "Demonstrate dynamic pricing and capacity recalculation",
          sourceAsset: "02_calculator_flow.mp4",
          textOverlay: "Bid Accurately & Prevent Cleaner Overbooking",
          claim: "Dynamic Profit Margin Calculation",
          evidence: "Pricing tab formula reaction"
        },
        {
          start: 7,
          end: 10,
          purpose: "Display 4 included files and digital delivery badge",
          sourceAsset: "03_package_endcard.mp4",
          textOverlay: "Instant Digital Download • Microsoft Excel & Sheets",
          claim: "4 Complete Business Files",
          evidence: "Package inventory animation"
        }
      ]
    },
    supportedClaims: [
      {
        claim: "Calculates weekly cleaner utilization percentages",
        status: "VERIFIED",
        evidenceSource: "Sheet 03 formulas"
      },
      {
        claim: "Includes completed reference workbook with sample data",
        status: "VERIFIED",
        evidenceSource: "Cleaning Business Planning Workbook - Fictional Example.xlsx"
      },
      {
        claim: "Compatible with Microsoft Excel Desktop on Mac and PC",
        status: "VERIFIED",
        evidenceSource: "Formula compatibility audit"
      },
      {
        claim: "Contains 100% macro-free formulas",
        status: "VERIFIED",
        evidenceSource: "Workbook specification"
      }
    ],
    prohibitedClaims: [
      "Automated accounting software",
      "Connects to QuickBooks or Stripe",
      "Physical binder or printed book shipped to address",
      "Certified legal or CPA financial advice"
    ],
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
      taxonomyId: 12476,
      titleStrategy: "Cleaning Business Plan Template, Editable Excel & PDF, Revenue Forecasting, Cleaner Capacity, Pricing Calculator",
      thirteenTags: [
        "cleaning business",
        "cleaning planner",
        "cleaning template",
        "cleaning spreadsheet",
        "business plan excel",
        "janitorial business",
        "cleaning startup",
        "revenue forecast",
        "capacity planner",
        "pricing calculator",
        "cleaning operations",
        "cleaning budget",
        "cleaning quote"
      ],
      priceTarget: 9.9,
      primaryKeyword: "cleaning business plan template",
      secondaryKeywords: [
        "cleaning business spreadsheet",
        "janitorial capacity planner",
        "cleaning revenue forecast"
      ],
      positioning: "Commercial & residential cleaning company operational roadmap",
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
      {
        category: "COMPATIBILITY",
        description: "Google Sheets users might encounter array formula display differences",
        severity: "MEDIUM",
        mitigation: "Only use backward-compatible SUM and IF formulas without dynamic array dependencies",
        resolved: true
      },
      {
        category: "BUYER_CONFUSION",
        description: "Buyers might expect automated sync with bank accounts",
        severity: "HIGH",
        mitigation: "Highlight manual spreadsheet nature on Image 09 and in description header",
        resolved: true
      }
    ]
  };
}

// =============================================================
// SECTION 1: PERSISTENCE & FAIL-CLOSED (TASK 1 & TASK 2)
// =============================================================

test("Persistence 1: save plan persists in repository", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);

  assert.equal(saved.status, "DRAFT");
  const loaded = await repo.load(saved.planId);
  assert.ok(loaded);
  assert.equal(loaded?.planId, saved.planId);
  assert.equal(loaded?.productId, "PDT-CBP-004");
});

test("Persistence 2: approved plan persists in repository with status PLAN_APPROVED", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);
  const approved = await store.approvePlan(saved.planId);

  assert.equal(approved.status, "PLAN_APPROVED");
  assert.ok(approved.approvedAt);
  const loaded = await repo.load(saved.planId);
  assert.equal(loaded?.status, "PLAN_APPROVED");
  assert.equal(loaded?.planSha256, approved.planSha256);
});

test("Persistence 3: cross-function cold start / isolate simulation reads plan", async () => {
  const sharedRepo = new MemoryProductCreationPlanRepository();
  // Isolate 1: create and approve
  const storeInstance1 = new DurableProductPlanStore(sharedRepo);
  const plan = createValidBasePlan();
  const saved = await storeInstance1.savePlan(plan);
  const approved = await storeInstance1.approvePlan(saved.planId);

  // Isolate 2: completely new store instance reading from shared backing store
  const storeInstance2 = new DurableProductPlanStore(sharedRepo);
  const readback = await storeInstance2.getPlan(saved.planId);

  assert.ok(readback);
  assert.equal(readback?.planId, approved.planId);
  assert.equal(readback?.status, "PLAN_APPROVED");
  assert.equal(readback?.planSha256, approved.planSha256);
  assert.equal(readback?.approvedAt, approved.approvedAt);
});

test("Persistence 4: getPlanByProductId works after fresh store instance", async () => {
  const sharedRepo = new MemoryProductCreationPlanRepository();
  const store1 = new DurableProductPlanStore(sharedRepo);
  const plan = createValidBasePlan();
  await store1.savePlan(plan);
  await store1.approvePlan(`PLAN-${plan.productId}-V1`);

  const store2 = new DurableProductPlanStore(sharedRepo);
  const byProduct = await store2.getPlanByProductId("PDT-CBP-004");
  assert.ok(byProduct);
  assert.equal(byProduct?.productId, "PDT-CBP-004");
  assert.equal(byProduct?.status, "PLAN_APPROVED");
});

test("Persistence 5: DB failure blocks approval and rolls back (fail closed)", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);

  await assert.rejects(
    async () => store.approvePlan(saved.planId, { injectedFailure: "BEFORE_COMMIT" }),
    (err: Error) => err.message.includes("PLAN_APPROVAL_INJECTED_FAILURE:BEFORE_COMMIT")
  );

  const after = await store.getPlan(saved.planId);
  assert.equal(after?.status, "DRAFT", "Status must remain DRAFT after rolled back approval");
  assert.equal(after?.approvedAt, null);
});

test("Persistence 6: DB readback mismatch blocks approval and rolls back (fail closed)", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);

  await assert.rejects(
    async () => store.approvePlan(saved.planId, { injectedFailure: "SHA_MISMATCH" }),
    (err: Error) => err.message.includes("PLAN_APPROVAL_VERIFICATION_FAILED:SHA_MISMATCH")
  );

  const after = await store.getPlan(saved.planId);
  assert.equal(after?.status, "DRAFT", "Status must remain DRAFT after rolled back approval");
});


test("Persistence 7: stored SHA mismatch blocks build", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);
  const approved = await store.approvePlan(saved.planId);

  // Build gate called with wrong hash
  const result = await verifyBuildPrerequisites({
    productId: plan.productId,
    planId: approved.planId,
    planSha256: "deadbeef00000000000000000000000000000000000000000000000000000000",
    store
  });

  assert.equal(result.allowed, false);
  assert.equal(result.status, "BUILD_BLOCKED");
  assert.ok(result.reason.includes("PLAN_HASH_MISMATCH"));
});

// =============================================================
// SECTION 2: BUILD GATE LOGIC (TASK 4 & TASK 5)
// =============================================================

test("Build Gate 8: no plan → BLOCK", async () => {
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());
  const result = await verifyBuildPrerequisites({
    productId: "PDT-CBP-004",
    store
  });
  assert.equal(result.allowed, false);
  assert.equal(result.status, "BUILD_BLOCKED");
  assert.ok(result.reason.includes("NO_APPROVED_PLAN_FOUND"));
});

test("Build Gate 9: DRAFT plan → BLOCK", async () => {
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);

  const result = await verifyBuildPrerequisites({
    productId: plan.productId,
    planId: saved.planId,
    store
  });
  assert.equal(result.allowed, false);
  assert.equal(result.status, "BUILD_BLOCKED");
  assert.ok(result.reason.includes("PLAN_NOT_APPROVED"));
});

test("Build Gate 10: REVIEW_REQUIRED plan → BLOCK", async () => {
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());
  const plan = createValidBasePlan();
  plan.targetBuyer = "Cleaners"; // Vague buyer persona
  const saved = await store.savePlan(plan);
  await store.runQC(saved.planId);

  const result = await verifyBuildPrerequisites({
    productId: plan.productId,
    planId: saved.planId,
    store
  });
  assert.equal(result.allowed, false);
  assert.equal(result.status, "BUILD_BLOCKED");
  assert.ok(result.reason.includes("PLAN_NOT_APPROVED"));
});

test("Build Gate 11: PLAN_BLOCKED → BLOCK", async () => {
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());
  const plan = createValidBasePlan();
  plan.listingImagePlan = plan.listingImagePlan.slice(0, 5); // Invalid image count
  const saved = await store.savePlan(plan);
  await store.runQC(saved.planId);

  const result = await verifyBuildPrerequisites({
    productId: plan.productId,
    planId: saved.planId,
    store
  });
  assert.equal(result.allowed, false);
  assert.equal(result.status, "BUILD_BLOCKED");
});

test("Build Gate 12: PLAN_STALE → BLOCK", async () => {
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);
  const approved = await store.approvePlan(saved.planId);

  // Simulate internal plan drift
  approved.plan.priceTargetUsd = 99.99;
  await (store as any).repository.save(approved);

  const result = await verifyBuildPrerequisites({
    productId: plan.productId,
    planId: approved.planId,
    store
  });
  assert.equal(result.allowed, false);
  assert.equal(result.status, "BUILD_BLOCKED");
  assert.ok(result.reason.includes("PLAN_STALE"));
});

test("Build Gate 13: approved correct hash → ALLOW with evidence", async () => {
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);
  const approved = await store.approvePlan(saved.planId);

  const result = await verifyBuildPrerequisites({
    productId: plan.productId,
    planId: approved.planId,
    planSha256: approved.planSha256,
    builder: "AUTOMATED_TEST_RUNNER",
    store
  });

  assert.equal(result.allowed, true);
  assert.equal(result.status, "BUILD_PERMITTED");
  if (result.status === "BUILD_PERMITTED") {
    assert.equal(result.productId, plan.productId);
    assert.equal(result.planSha256, approved.planSha256);
    assert.ok(result.evidence);
    assert.equal(result.evidence.result, "BUILD_PERMITTED");
    assert.ok(result.evidence.buildCorrelationId.startsWith("BLD-PDT-CBP-004-"));
  }
});

test("Build Gate 14: wrong caller hash → BLOCK", async () => {
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);
  const approved = await store.approvePlan(saved.planId);

  const result = await verifyBuildPrerequisites({
    productId: plan.productId,
    planId: approved.planId,
    planSha256: "badhash",
    store
  });
  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes("PLAN_HASH_MISMATCH"));
});

test("Build Gate 15: unresolved HIGH risk → BLOCK", async () => {
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());
  const plan = createValidBasePlan();
  plan.planRisks?.push({
    category: "COMPATIBILITY",
    description: "Mac users missing Calibri fonts",
    severity: "HIGH",
    resolved: false
  });
  const saved = await store.savePlan(plan);

  await assert.rejects(
    async () => store.approvePlan(saved.planId),
    (err: Error) => err.message.includes("CANNOT_APPROVE_PLAN")
  );
});

test("Build Gate 16: unresolved CRITICAL risk → BLOCK", async () => {
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());
  const plan = createValidBasePlan();
  plan.planRisks?.push({
    category: "POLICY",
    description: "Contains copyrighted third-party bid formula",
    severity: "CRITICAL",
    resolved: false
  });
  const saved = await store.savePlan(plan);

  await assert.rejects(
    async () => store.approvePlan(saved.planId),
    (err: Error) => err.message.includes("CANNOT_APPROVE_PLAN")
  );
});

// =============================================================
// SECTION 3: GLOBAL ENFORCEMENT & POLICY (TASK 4, 6, 7)
// =============================================================

test("Global Enforcement 17: XLSX build path without plan → BLOCK via assertApprovedProductPlanForBuild", async () => {
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());
  await assert.rejects(
    async () => assertApprovedProductPlanForBuild({ productId: "PDT-CBP-004", builder: "XLSX_GENERATOR", store }),
    (err: Error) => err.message.includes("BUILD_BLOCKED")
  );
});

test("Global Enforcement 18: PDF build path without plan → BLOCK via assertApprovedProductPlanForBuild", async () => {
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());
  await assert.rejects(
    async () => assertApprovedProductPlanForBuild({ productId: "PDT-CBP-004", builder: "PDF_GENERATOR", store }),
    (err: Error) => err.message.includes("BUILD_BLOCKED")
  );
});

test("Global Enforcement 19: Image build path without plan → BLOCK via assertApprovedProductPlanForBuild", async () => {
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());
  await assert.rejects(
    async () => assertApprovedProductPlanForBuild({ productId: "PDT-CBP-004", builder: "IMAGE_GENERATOR", store }),
    (err: Error) => err.message.includes("BUILD_BLOCKED")
  );
});

test("Global Enforcement 20: Video build path without plan → BLOCK via assertApprovedProductPlanForBuild", async () => {
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());
  await assert.rejects(
    async () => assertApprovedProductPlanForBuild({ productId: "PDT-CBP-004", builder: "VIDEO_GENERATOR", store }),
    (err: Error) => err.message.includes("BUILD_BLOCKED")
  );
});

test("Global Enforcement 21: Etsy prepare route without plan → BLOCK", async () => {
  const { POST: prepareRoute } = await import("../app/api/products/prepare/route");
  const unapprovedProduct = {
    productId: "PDT-CBP-004",
    version: "V1",
    productName: "Cleaning Business Planner",
    canonicalDriveFileId: "drive-cbp-004",
    buyerFiles: ["planner.xlsx"],
    galleryFiles: ["01.png"],
    title: "Cleaning Business Planning Workbook",
    description: "Operational spreadsheet for cleaning businesses.",
    tags: Array.from({ length: 13 }, (_, i) => `tag ${i + 1}`),
    priceUsd: 9.9,
    productTruthVerified: true,
    testerPass: true,
    finalQcPass: true
  };

  const req = new Request("http://localhost/api/products/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(unapprovedProduct)
  });

  const res = await prepareRoute(req);
  assert.equal(res.status, 409);
  const json = await res.json() as { status: string };
  assert.equal(json.status, "BUILD_BLOCKED");
});

test("Global Enforcement 22: Etsy release candidate preparation without plan → BLOCK via central gate", async () => {
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());
  await assert.rejects(
    async () => assertApprovedProductPlanForBuild({
      productId: "PDT-DCL-005",
      builder: "ETSY_RELEASE_CANDIDATE_PREPARE",
      store
    }),
    (err: Error) => err.message.includes("BUILD_BLOCKED:NO_APPROVED_PLAN_FOUND")
  );
});

test("Global Enforcement 23: Legacy read-only routes still function without plan interference", async () => {
  const { GET: statusRoute } = await import("../app/api/etsy/status/route");
  const res = await statusRoute();
  assert.equal(res.status, 200);
  const json = await res.json() as { service: string; apiCredentialsConfigured: boolean };
  assert.equal(json.service, "etsy-open-api-v3");
});

test("Global Enforcement 24: Product 01–03 legacy compatibility maintained (isProductPlanRequired is false)", () => {
  assert.equal(isProductPlanRequired("PDT-CS-001"), false);
  assert.equal(isProductPlanRequired("PDT-PCL-002"), false);
  assert.equal(isProductPlanRequired("PDT-CPR-003"), false);
  assert.ok(LEGACY_EXEMPT_PRODUCTS.includes("PDT-CPR-003"));
});

test("Global Enforcement 25: Product 04+ bypass attempt blocked (isProductPlanRequired is true)", () => {
  assert.equal(isProductPlanRequired("PDT-CBP-004"), true);
  assert.equal(isProductPlanRequired("PDT-DCL-005"), true);
  assert.equal(isProductPlanRequired("PDT-MCL-006"), true);
  assert.equal(isProductPlanRequired("PDT-CMK-015"), true);
});

// =============================================================
// SECTION 4: DURABILITY, STALENESS & SECURITY (TASK 3, 8, 12)
// =============================================================

test("Durability 26: approve → new store instance → GET works", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store1 = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store1.savePlan(plan);
  await store1.approvePlan(saved.planId);

  // New store instance
  const store2 = new DurableProductPlanStore(repo);
  const fetched = await store2.getPlan(saved.planId);
  assert.ok(fetched);
  assert.equal(fetched?.status, "PLAN_APPROVED");
});

test("Durability 27: approve → new isolate simulation → build gate works", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store1 = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store1.savePlan(plan);
  const approved = await store1.approvePlan(saved.planId);

  // Fresh isolate / process simulation
  const freshStore = new DurableProductPlanStore(repo);
  const buildResult = await verifyBuildPrerequisites({
    productId: plan.productId,
    planId: approved.planId,
    planSha256: approved.planSha256,
    store: freshStore
  });

  assert.equal(buildResult.allowed, true);
  assert.equal(buildResult.status, "BUILD_PERMITTED");
});

test("Durability 28: restart preserves same SHA", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store1 = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store1.savePlan(plan);
  const approved = await store1.approvePlan(saved.planId);

  const initialSha = approved.planSha256;

  // Simulate server restart
  const restartedStore = new DurableProductPlanStore(repo);
  const loaded = await restartedStore.getPlan(saved.planId);

  assert.equal(loaded?.planSha256, initialSha);
});

test("Durability 29: plan mutation makes plan PLAN_STALE", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);
  await store.approvePlan(saved.planId);

  // Caller modifies plan
  const mutated = structuredClone(plan);
  mutated.buyerFiles = mutated.buyerFiles.slice(0, 3); // Changed files!

  const staleness = await store.checkStaleness(saved.planId, mutated);
  assert.equal(staleness.isStale, true);
  assert.equal(staleness.status, "PLAN_STALE");
});

test("Durability 30: re-approve produces new SHA and is accepted", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);
  const approved1 = await store.approvePlan(saved.planId);

  // Update plan with additional supported claim
  const plan2 = structuredClone(plan);
  plan2.supportedClaims.push({
    claim: "Tested on Excel for Mac 2021",
    status: "VERIFIED"
  });
  await store.savePlan(plan2, saved.planId);

  const approved2 = await store.approvePlan(saved.planId);
  assert.notEqual(approved2.planSha256, approved1.planSha256);

  // Build gate now succeeds with new SHA
  const buildCheck = await verifyBuildPrerequisites({
    productId: plan.productId,
    planId: saved.planId,
    planSha256: approved2.planSha256,
    store
  });
  assert.equal(buildCheck.allowed, true);
  assert.equal(buildCheck.status, "BUILD_PERMITTED");
});

test("Security 31: secret keys in plan JSON throw SECURITY_SECRET_FIELD_FORBIDDEN (TASK 12)", async () => {
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());
  const planWithSecret = createValidBasePlan();
  // Inject secret key
  (planWithSecret as any).apiKey = "secret-token-value-12345";

  await assert.rejects(
    async () => store.savePlan(planWithSecret),
    (err: Error) => err.message.includes("SECURITY_SECRET_FIELD_FORBIDDEN")
  );
});

// =============================================================
// SECTION 5: BLOCKER 2 — REAL TRANSACTIONAL FAIL-CLOSED APPROVAL TESTS
// =============================================================

test("Blocker 2 - Test 1: approved write succeeds + readback fails → DB not approved", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);

  await assert.rejects(
    async () => store.approvePlan(saved.planId, { injectedFailure: "READBACK_FAIL" }),
    (err: Error) => err.message.includes("PLAN_APPROVAL_VERIFICATION_FAILED")
  );

  const after = await store.getPlan(saved.planId);
  assert.notEqual(after?.status, "PLAN_APPROVED", "Durable DB must NEVER be PLAN_APPROVED when readback fails");
  assert.equal(after?.status, "DRAFT", "Durable DB must remain in previous safe status DRAFT");
});

test("Blocker 2 - Test 2: approved write succeeds + SHA mismatch → DB not approved", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);

  await assert.rejects(
    async () => store.approvePlan(saved.planId, { injectedFailure: "SHA_MISMATCH" }),
    (err: Error) => err.message.includes("PLAN_APPROVAL_VERIFICATION_FAILED:SHA_MISMATCH")
  );

  const after = await store.getPlan(saved.planId);
  assert.notEqual(after?.status, "PLAN_APPROVED", "Durable DB must NEVER be PLAN_APPROVED when SHA mismatches");
  assert.equal(after?.status, "DRAFT");
});

test("Blocker 2 - Test 3: approved write succeeds + product mismatch → DB not approved", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);

  await assert.rejects(
    async () => store.approvePlan(saved.planId, { injectedFailure: "PRODUCT_MISMATCH" }),
    (err: Error) => err.message.includes("PLAN_APPROVAL_VERIFICATION_FAILED:PRODUCT_MISMATCH")
  );

  const after = await store.getPlan(saved.planId);
  assert.notEqual(after?.status, "PLAN_APPROVED", "Durable DB must NEVER be PLAN_APPROVED on product mismatch");
  assert.equal(after?.status, "DRAFT");
});

test("Blocker 2 - Test 4: approved write succeeds + version mismatch → DB not approved", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);

  await assert.rejects(
    async () => store.approvePlan(saved.planId, { injectedFailure: "VERSION_MISMATCH" }),
    (err: Error) => err.message.includes("PLAN_APPROVAL_VERIFICATION_FAILED:VERSION_MISMATCH")
  );

  const after = await store.getPlan(saved.planId);
  assert.notEqual(after?.status, "PLAN_APPROVED", "Durable DB must NEVER be PLAN_APPROVED on version mismatch");
  assert.equal(after?.status, "DRAFT");
});

test("Blocker 2 - Test 5: approved write succeeds + approvedAt missing → DB not approved", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);

  await assert.rejects(
    async () => store.approvePlan(saved.planId, { injectedFailure: "APPROVED_AT_MISSING" }),
    (err: Error) => err.message.includes("PLAN_APPROVAL_VERIFICATION_FAILED:APPROVED_AT_MISSING")
  );

  const after = await store.getPlan(saved.planId);
  assert.notEqual(after?.status, "PLAN_APPROVED", "Durable DB must NEVER be PLAN_APPROVED when approvedAt is missing");
  assert.equal(after?.status, "DRAFT");
});

test("Blocker 2 - Test 6: injected failure before COMMIT → rollback confirmed", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);

  await assert.rejects(
    async () => store.approvePlan(saved.planId, { injectedFailure: "BEFORE_COMMIT" }),
    (err: Error) => err.message.includes("PLAN_APPROVAL_INJECTED_FAILURE:BEFORE_COMMIT")
  );

  const after = await store.getPlan(saved.planId);
  assert.equal(after?.status, "DRAFT", "Rollback confirmed: status rolled back to DRAFT");
  assert.equal(after?.approvedAt, null, "Rollback confirmed: approvedAt is null");
});

test("Blocker 2 - Test 7: fresh repository instance after failed approval → not approved", async () => {
  const sharedRepo = new MemoryProductCreationPlanRepository();
  const store1 = new DurableProductPlanStore(sharedRepo);
  const plan = createValidBasePlan();
  const saved = await store1.savePlan(plan);

  await assert.rejects(
    async () => store1.approvePlan(saved.planId, { injectedFailure: "BEFORE_COMMIT" }),
    (err: Error) => err.message.includes("BEFORE_COMMIT")
  );

  // Fresh repository instance / fresh store reader
  const freshStore = new DurableProductPlanStore(sharedRepo);
  const freshRecord = await freshStore.getPlan(saved.planId);
  assert.notEqual(freshRecord?.status, "PLAN_APPROVED", "Fresh instance must observe NOT APPROVED");
  assert.equal(freshRecord?.status, "DRAFT", "Fresh instance must observe previous safe state DRAFT");
});

test("Blocker 2 - Test 8: successful transaction → PLAN_APPROVED", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);

  const approved = await store.approvePlan(saved.planId);
  assert.equal(approved.status, "PLAN_APPROVED");
  assert.ok(approved.approvedAt, "approvedAt must be set");
  assert.ok(approved.planSha256, "planSha256 must be set");
  assert.equal(approved.productId, plan.productId);
  assert.equal(approved.planVersion, 1);

  const reloaded = await store.getPlan(saved.planId);
  assert.equal(reloaded?.status, "PLAN_APPROVED");
  assert.equal(reloaded?.approvedAt, approved.approvedAt);
});

test("Blocker 2 - Test 9: concurrent approval attempts → deterministic safe result", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);

  // Launch 5 concurrent approval attempts
  const results = await Promise.allSettled([
    store.approvePlan(saved.planId),
    store.approvePlan(saved.planId),
    store.approvePlan(saved.planId),
    store.approvePlan(saved.planId),
    store.approvePlan(saved.planId)
  ]);

  // All must either succeed with PLAN_APPROVED or reject safely
  const fulfilled = results.filter((r): r is PromiseFulfilledResult<FrozenProductPlan> => r.status === "fulfilled");
  assert.ok(fulfilled.length >= 1, "At least one concurrent approval must succeed");
  for (const f of fulfilled) {
    assert.equal(f.value.status, "PLAN_APPROVED");
    assert.equal(f.value.productId, plan.productId);
  }

  const finalPlan = await store.getPlan(saved.planId);
  assert.equal(finalPlan?.status, "PLAN_APPROVED", "Deterministic final state must be PLAN_APPROVED");
});

test("Blocker 2 - Test 10: no partial PLAN_APPROVAL_PENDING residue after rollback", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);

  await assert.rejects(
    async () => store.approvePlan(saved.planId, { injectedFailure: "SHA_MISMATCH" }),
    (err: Error) => err.message.includes("SHA_MISMATCH")
  );

  const after = await store.getPlan(saved.planId);
  assert.notEqual(after?.status, "PLAN_APPROVAL_PENDING", "NO partial PLAN_APPROVAL_PENDING residue after rollback");
  assert.notEqual(after?.status, "PLAN_APPROVED", "NO partial PLAN_APPROVED residue after rollback");
  assert.equal(after?.status, "DRAFT", "Must be rolled back cleanly to previous status DRAFT");
});


// =============================================================
// SECTION 6: BLOCKER 3 — NARROW LEGACY POLICY TESTS
// =============================================================

test("Policy 40: PDT-CS-001 (canonical alias) → legacy exempt", () => {
  assert.equal(isProductPlanRequired("PDT-CS-001"), false);
});

test("Policy 41: PDT-CSCH-001 → legacy exempt", () => {
  assert.equal(isProductPlanRequired("PDT-CSCH-001"), false);
  assert.ok(LEGACY_EXEMPT_PRODUCTS.includes("PDT-CSCH-001" as any));
});

test("Policy 42: PDT-PCL-002 → legacy exempt", () => {
  assert.equal(isProductPlanRequired("PDT-PCL-002"), false);
});

test("Policy 43: PDT-CPR-003 → legacy exempt", () => {
  assert.equal(isProductPlanRequired("PDT-CPR-003"), false);
});

test("Policy 44: PDT-BIPC-003 → legacy exempt (evidence: Release Lock exists)", () => {
  // PDT-BIPC-003 was published before the plan gate was introduced
  assert.equal(isProductPlanRequired("PDT-BIPC-003"), false);
  assert.ok(LEGACY_EXEMPT_PRODUCTS.includes("PDT-BIPC-003" as any));
});

test("Policy 45: PDT-CBEO-004 → plan REQUIRED (BLOCKER 3: removed from exempt list)", () => {
  // Product 04: not a legacy historical product — must have an approved plan
  assert.equal(isProductPlanRequired("PDT-CBEO-004"), true);
  // Must NOT be in the exempt list
  assert.ok(!(LEGACY_EXEMPT_PRODUCTS as readonly string[]).includes("PDT-CBEO-004"),
    "PDT-CBEO-004 must not be in LEGACY_EXEMPT_PRODUCTS");
});

test("Policy 46: NEW-PRODUCT-001 → plan REQUIRED (BLOCKER 3: removed from exempt list)", () => {
  // Generic placeholder ID: must require a plan
  assert.equal(isProductPlanRequired("NEW-PRODUCT-001"), true);
  assert.ok(!(LEGACY_EXEMPT_PRODUCTS as readonly string[]).includes("NEW-PRODUCT-001" as any),
    "NEW-PRODUCT-001 must not be in LEGACY_EXEMPT_PRODUCTS");
});

test("Policy 47: PDT-CBP-004 → plan required", () => {
  assert.equal(isProductPlanRequired("PDT-CBP-004"), true);
});

test("Policy 48: arbitrary unknown ID → plan required (default policy)", () => {
  assert.equal(isProductPlanRequired("PDT-XYZ-999"), true);
  assert.equal(isProductPlanRequired("UNKNOWN-PRODUCT"), true);
  assert.equal(isProductPlanRequired("PDT-CMK-015"), true);
});

test("Policy 49: explicit planRequired=true override wins over any exemption", () => {
  // Even a legacy-exempt product must respect the override
  assert.equal(isProductPlanRequired("PDT-CPR-003", { planRequired: true }), true);
});

test("Policy 50: explicit planRequired=false override grants exemption for non-exempt products", () => {
  // Caller can explicitly grant exemption (e.g. for isolated test fixtures)
  assert.equal(isProductPlanRequired("PDT-CBP-004", { planRequired: false }), false);
});

// =============================================================
// SECTION 7: BLOCKER 1 — GLOBAL ENFORCEMENT AUDIT PROOF TESTS
// =============================================================

test("Global Enforcement 51: PDT-CBEO-004 is BLOCKED without approved plan (no longer legacy-exempt)", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);

  const result = await verifyBuildPrerequisites({
    productId: "PDT-CBEO-004",
    builder: "GLOBAL_ENFORCEMENT_AUDIT",
    store
  });

  assert.equal(result.allowed, false);
  assert.equal(result.status, "BUILD_BLOCKED");
  assert.ok((result as any).reason?.includes("NO_APPROVED_PLAN_FOUND"),
    "Must block with NO_APPROVED_PLAN_FOUND reason for PDT-CBEO-004");
});

test("Global Enforcement 52: NEW-PRODUCT-001 is BLOCKED without approved plan (not in exempt list)", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);

  const result = await verifyBuildPrerequisites({
    productId: "NEW-PRODUCT-001",
    builder: "GLOBAL_ENFORCEMENT_AUDIT",
    store
  });

  assert.equal(result.allowed, false);
  assert.equal(result.status, "BUILD_BLOCKED");
});

test("Global Enforcement 53: legacy product PDT-BIPC-003 still passes gate as LEGACY_EXEMPT", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);

  const result = await verifyBuildPrerequisites({
    productId: "PDT-BIPC-003",
    builder: "GLOBAL_ENFORCEMENT_AUDIT",
    store
  });

  assert.equal(result.allowed, true);
  assert.equal(result.status, "LEGACY_EXEMPT");
});

test("Global Enforcement 54: PDT-CBEO-004 passes gate only after plan is saved and approved", async () => {
  const repo = new MemoryProductCreationPlanRepository();
  const store = new DurableProductPlanStore(repo);

  // No plan yet → blocked
  const blocked = await verifyBuildPrerequisites({
    productId: "PDT-CBEO-004",
    builder: "GLOBAL_ENFORCEMENT_AUDIT",
    store
  });
  assert.equal(blocked.allowed, false);

  // Save and approve a plan for CBEO-004
  const plan = { ...createValidBasePlan(), productId: "PDT-CBEO-004" };
  const saved = await store.savePlan(plan);
  await store.approvePlan(saved.planId);

  // Now should be BUILD_PERMITTED
  const permitted = await verifyBuildPrerequisites({
    productId: "PDT-CBEO-004",
    builder: "GLOBAL_ENFORCEMENT_AUDIT",
    store
  });
  assert.equal(permitted.allowed, true);
  assert.equal(permitted.status, "BUILD_PERMITTED");
});

test("Global Enforcement 55: prepareNewProductCandidateWithGate blocks non-legacy product without plan", async () => {
  const { prepareNewProductCandidateWithGate } = await import("../lib/post-reset-platform");
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());

  const manifest = {
    productId: "NEW-PRODUCT-001",
    version: "V1",
    productName: "New Product",
    canonicalDriveFileId: "drive-file-001",
    buyerFiles: ["buyer.xlsx"],
    galleryFiles: ["01.png"],
    title: "New Product Spreadsheet",
    description: "Verified new product prepared after catalog reset.",
    tags: Array.from({ length: 13 }, (_, i) => `tag ${i + 1}`),
    priceUsd: 9.99,
    productTruthVerified: true,
    testerPass: true,
    finalQcPass: true
  };

  // Direct orchestrator call without approved plan → throws BUILD_BLOCKED
  await assert.rejects(
    async () => prepareNewProductCandidateWithGate(manifest, { store }),
    (err: Error) => err.message.includes("BUILD_BLOCKED")
  );

  // Once plan is created and approved → orchestrator succeeds
  const plan = { ...createValidBasePlan(), productId: "NEW-PRODUCT-001" };
  const saved = await store.savePlan(plan);
  await store.approvePlan(saved.planId);

  const candidate = await prepareNewProductCandidateWithGate(manifest, { store });
  assert.equal(candidate.status, "PREPARED");
  assert.equal(candidate.productId, "NEW-PRODUCT-001");
  assert.equal(candidate.EtsyWriteCount, 0);
});

test("Global Enforcement 56: buildGatedPublishPlan blocks non-legacy product without plan", async () => {
  const { buildGatedPublishPlan } = await import("../lib/publisher");
  const store = new DurableProductPlanStore(new MemoryProductCreationPlanRepository());

  const pack = {
    productId: "PDT-CBEO-004",
    title: "Cleaning Business Workbook",
    description: "Commercial cleaning operations spreadsheet",
    priceUsd: 14.99,
    files: ["clean.xlsx"],
    channels: ["etsy" as const],
    productTruthVerified: true,
    tags: Array.from({ length: 13 }, (_, i) => `tag ${i + 1}`),
    etsy: {
      taxonomyId: 1001,
      quantity: 10,
      whoMade: "i_did" as const,
      whenMade: "2020_2026",
      release: {
        productionBuildFrozen: true,
        testerPass: true,
        finalQcPass: true,
        productionAuthorized: true
      }
    }
  };

  // Direct orchestrator call without plan → throws BUILD_BLOCKED
  await assert.rejects(
    async () => buildGatedPublishPlan(pack, { store }),
    (err: Error) => err.message.includes("BUILD_BLOCKED")
  );

  // After approval → succeeds
  const plan = { ...createValidBasePlan(), productId: "PDT-CBEO-004" };
  const saved = await store.savePlan(plan);
  await store.approvePlan(saved.planId);

  const publishPlan = await buildGatedPublishPlan(pack, { store });
  assert.equal(publishPlan.productId, "PDT-CBEO-004");
  assert.equal(publishPlan.status, "READY");
});

test("Global Enforcement 57: POST /api/products/prepare route integration blocks unapproved non-legacy candidate", async () => {
  const { POST: prepareRoute } = await import("../app/api/products/prepare/route");

  const unapprovedReq = new Request("https://autodigitalpublisher.vercel.app/api/products/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productId: "PDT-CBEO-004",
      version: "V1",
      productName: "Cleaning Business Expansion Operations",
      canonicalDriveFileId: "drive-file-004",
      buyerFiles: ["buyer.xlsx"],
      galleryFiles: ["01.png"],
      title: "New Product Spreadsheet",
      description: "Verified new product prepared after catalog reset.",
      tags: Array.from({ length: 13 }, (_, i) => `tag ${i + 1}`),
      priceUsd: 9.99,
      productTruthVerified: true,
      testerPass: true,
      finalQcPass: true
    })
  });

  const res = await prepareRoute(unapprovedReq);
  assert.equal(res.status, 409, "Must return HTTP 409 when plan gate fails");
  const data = await res.json();
  assert.equal(data.status, "BUILD_BLOCKED");
  assert.equal(data.EtsyWriteCount, 0);
});


