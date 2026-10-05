import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateProductCreationPlanQC,
  type ProductCreationPlan,
  MemoryAndDiskPlanStore,
  verifyBuildPrerequisites,
  computePlanSha256
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

// -------------------------------------------------------------
// Test 1: Incomplete plan → BLOCK
// -------------------------------------------------------------
test("QC Gate: 1. incomplete plan → BLOCK", () => {
  const plan = createValidBasePlan();
  // Remove mandatory field
  (plan as Partial<ProductCreationPlan>).productName = "";
  const result = evaluateProductCreationPlanQC(plan);

  assert.equal(result.status, "PLAN_BLOCKED");
  assert.equal(result.passed, false);
  assert.ok(result.issues.some(i => i.rule === "MANDATORY_FIELD_MISSING"));
});

// -------------------------------------------------------------
// Test 2: Missing or vague buyer persona → REVIEW_REQUIRED
// -------------------------------------------------------------
test("QC Gate: 2. missing/vague buyer persona → REVIEW_REQUIRED", () => {
  const plan = createValidBasePlan();
  plan.targetBuyer = "Cleaners"; // Too brief (< 15 chars)
  const result = evaluateProductCreationPlanQC(plan);

  assert.equal(result.status, "PLAN_REVIEW_REQUIRED");
  assert.equal(result.passed, false);
  assert.ok(result.issues.some(i => i.rule === "IDEA_CLARITY_VAGUE"));
});

// -------------------------------------------------------------
// Test 3: Unknown file count or TBD in key scope fields → BLOCK
// -------------------------------------------------------------
test("QC Gate: 3. unknown file count or TBD in scope → BLOCK", () => {
  const plan = createValidBasePlan();
  plan.buyerProblem = "To be determined later by TBD analysis";
  const result = evaluateProductCreationPlanQC(plan);

  assert.equal(result.status, "PLAN_BLOCKED");
  assert.ok(result.issues.some(i => i.rule === "SCOPE_LOCK_TBD_FORBIDDEN"));
});

// -------------------------------------------------------------
// Test 4: No acceptance criteria → BLOCK
// -------------------------------------------------------------
test("QC Gate: 4. no acceptance criteria → BLOCK", () => {
  const plan = createValidBasePlan();
  delete (plan as Partial<ProductCreationPlan>).acceptanceCriteria;
  const result = evaluateProductCreationPlanQC(plan);

  assert.equal(result.status, "PLAN_BLOCKED");
  assert.ok(result.issues.some(i => i.rule === "ACCEPTANCE_CRITERIA_REQUIRED"));
});

// -------------------------------------------------------------
// Test 5: Unsupported or prohibited claim → BLOCK
// -------------------------------------------------------------
test("QC Gate: 5. unsupported / prohibited claim → BLOCK", () => {
  const plan = createValidBasePlan();
  // Manual product asserts automated accounting
  plan.supportedClaims.push({
    claim: "Fully automated accounting software engine",
    status: "VERIFIED"
  });
  const result = evaluateProductCreationPlanQC(plan);

  assert.equal(result.status, "PLAN_BLOCKED");
  assert.ok(result.issues.some(i => i.rule === "MANUAL_PRODUCT_AUTOMATION_CLAIM_FORBIDDEN"));
});

// -------------------------------------------------------------
// Test 6: High policy risk / unresolved critical risk → BLOCK
// -------------------------------------------------------------
test("QC Gate: 6. high policy risk (unresolved CRITICAL/HIGH risk) → BLOCK", () => {
  const plan = createValidBasePlan();
  plan.planRisks?.push({
    category: "POLICY",
    description: "Contains medical sanitization claim without EPA registration disclaimer",
    severity: "HIGH",
    resolved: false
  });
  const result = evaluateProductCreationPlanQC(plan);

  assert.equal(result.status, "PLAN_BLOCKED");
  assert.ok(result.issues.some(i => i.rule === "UNRESOLVED_CRITICAL_HIGH_RISK"));
});

// -------------------------------------------------------------
// Test 7: Image storyboard missing or count != 10 → BLOCK
// -------------------------------------------------------------
test("QC Gate: 7. image storyboard missing / count != 10 → BLOCK", () => {
  const plan = createValidBasePlan();
  plan.listingImagePlan = plan.listingImagePlan.slice(0, 9); // Only 9 images
  const result = evaluateProductCreationPlanQC(plan);

  assert.equal(result.status, "PLAN_BLOCKED");
  assert.ok(result.issues.some(i => i.rule === "LISTING_IMAGES_EXACTLY_10_REQUIRED"));
});

// -------------------------------------------------------------
// Test 8: Video required but no storyboard → BLOCK
// -------------------------------------------------------------
test("QC Gate: 8. video required but no storyboard → BLOCK", () => {
  const plan = createValidBasePlan();
  plan.acceptanceCriteria.videoRequired = true;
  delete plan.videoPlan;
  const result = evaluateProductCreationPlanQC(plan);

  assert.equal(result.status, "PLAN_BLOCKED");
  assert.ok(result.issues.some(i => i.rule === "VIDEO_PLAN_REQUIRED"));
});

// -------------------------------------------------------------
// Test 9: Approved valid plan → PASS (PLAN_APPROVED)
// -------------------------------------------------------------
test("QC Gate: 9. approved valid plan → PASS (PLAN_APPROVED)", () => {
  const plan = createValidBasePlan();
  const result = evaluateProductCreationPlanQC(plan);

  assert.equal(result.status, "PLAN_APPROVED");
  assert.equal(result.passed, true);
  assert.equal(result.issues.length, 0);
  assert.ok(result.scores.overallScore >= 90);
});

// -------------------------------------------------------------
// Test 10: Modified approved plan → PLAN_STALE
// -------------------------------------------------------------
test("QC Gate: 10. modified approved plan → PLAN_STALE", async () => {
  const store = new MemoryAndDiskPlanStore(false);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);
  await store.approvePlan(saved.planId);

  // Check initial staleness (not stale)
  const initialCheck = await store.checkStaleness(saved.planId, plan);
  assert.equal(initialCheck.isStale, false);
  assert.equal(initialCheck.status, "PLAN_APPROVED");

  // Tamper with plan content
  const modifiedPlan = structuredClone(plan);
  modifiedPlan.priceTargetUsd = 14.99; // Modified!

  const modifiedCheck = await store.checkStaleness(saved.planId, modifiedPlan);
  assert.equal(modifiedCheck.isStale, true);
  assert.equal(modifiedCheck.status, "PLAN_STALE");
});

// -------------------------------------------------------------
// Test 11: Build without approved plan → BLOCK
// -------------------------------------------------------------
test("Build Gate: 11. build without approved plan → BLOCK", async () => {
  const store = new MemoryAndDiskPlanStore(false);
  // Attempt build on non-existent plan
  const result = await verifyBuildPrerequisites({
    productId: "PDT-CBP-004",
    store
  });

  assert.equal(result.allowed, false);
  assert.equal(result.status, "BUILD_BLOCKED");
  assert.ok(result.reason.includes("NO_APPROVED_PLAN_FOUND"));
});

// -------------------------------------------------------------
// Test 12: Build with matching plan hash → ALLOW
// -------------------------------------------------------------
test("Build Gate: 12. build with matching plan hash → ALLOW", async () => {
  const store = new MemoryAndDiskPlanStore(false);
  const plan = createValidBasePlan();
  const saved = await store.savePlan(plan);
  const approved = await store.approvePlan(saved.planId);

  const result = await verifyBuildPrerequisites({
    productId: "PDT-CBP-004",
    planId: approved.planId,
    planSha256: approved.planSha256,
    store
  });

  assert.equal(result.allowed, true);
  assert.equal(result.status, "BUILD_PERMITTED");
  if (result.allowed) {
    assert.equal(result.productId, "PDT-CBP-004");
    assert.equal(result.planSha256, approved.planSha256);
  }
});

// -------------------------------------------------------------
// Test 13: Wrong product family / DNA mismatch → REVIEW_REQUIRED
// -------------------------------------------------------------
test("QC Gate: 13. wrong product family/DNA layout mismatch → REVIEW_REQUIRED", () => {
  const plan = createValidBasePlan();
  // SPREADSHEET_SCHEDULE paired with PRINTABLE portrait layout
  plan.shopDnaProfile.layoutFamily = "PRINTABLE_CHECKLIST_PORTRAIT";
  const result = evaluateProductCreationPlanQC(plan);

  assert.equal(result.status, "PLAN_REVIEW_REQUIRED");
  assert.ok(result.issues.some(i => i.rule === "SHOP_DNA_FAMILY_MISMATCH"));
});

// -------------------------------------------------------------
// Test 14: High buyer confusion risk → BLOCK
// -------------------------------------------------------------
test("QC Gate: 14. high buyer confusion risk → BLOCK", () => {
  const plan = createValidBasePlan();
  plan.planRisks?.push({
    category: "BUYER_CONFUSION",
    description: "Buyer might assume automated API integration with local MLS",
    severity: "MEDIUM",
    resolved: false // Unresolved!
  });
  const result = evaluateProductCreationPlanQC(plan);

  assert.equal(result.status, "PLAN_BLOCKED");
  assert.ok(result.issues.some(i => i.rule === "BUYER_CONFUSION_RISK_UNRESOLVED"));
});

// -------------------------------------------------------------
// Test 15: API Routes Lifecycle (create -> get -> qc -> approve -> build)
// -------------------------------------------------------------
import { POST as createPlanRoute } from "../app/api/product-plans/create/route";
import { GET as getPlanRoute } from "../app/api/product-plans/[planId]/route";
import { POST as runPlanQCRoute } from "../app/api/product-plans/[planId]/qc/route";
import { POST as approvePlanRoute } from "../app/api/product-plans/[planId]/approve/route";
import { POST as buildProductRoute } from "../app/api/products/[productId]/build/route";

test("API Routes: full creation, QC, approval, and build authorization lifecycle", async () => {
  const plan = createValidBasePlan();
  plan.productId = "PDT-CBP-004-TEST";

  // 1. POST /api/product-plans/create
  const createReq = new Request("http://localhost/api/product-plans/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan })
  });
  const createRes = await createPlanRoute(createReq);
  assert.equal(createRes.status, 201);
  const createdJson = await createRes.json() as { planId: string; qcStatus: string; qcPassed: boolean };
  assert.equal(createdJson.qcStatus, "PLAN_APPROVED");
  assert.equal(createdJson.qcPassed, true);
  const planId = createdJson.planId;

  // 2. GET /api/product-plans/[planId]
  const getReq = new Request(`http://localhost/api/product-plans/${planId}`);
  const getRes = await getPlanRoute(getReq, { params: Promise.resolve({ planId }) });
  assert.equal(getRes.status, 200);
  const getJson = await getRes.json() as { planId: string; status: string };
  assert.equal(getJson.planId, planId);

  // 3. POST /api/product-plans/[planId]/qc
  const qcReq = new Request(`http://localhost/api/product-plans/${planId}/qc`, { method: "POST" });
  const qcRes = await runPlanQCRoute(qcReq, { params: Promise.resolve({ planId }) });
  assert.equal(qcRes.status, 200);
  const qcJson = await qcRes.json() as { status: string; passed: boolean };
  assert.equal(qcJson.status, "PLAN_APPROVED");
  assert.equal(qcJson.passed, true);

  // 4. Attempt Build before approval -> should be 409 blocked
  const prematureBuildReq = new Request(`http://localhost/api/products/${plan.productId}/build`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planId })
  });
  const prematureBuildRes = await buildProductRoute(prematureBuildReq, {
    params: Promise.resolve({ productId: plan.productId })
  });
  assert.equal(prematureBuildRes.status, 409);
  const prematureJson = await prematureBuildRes.json() as { status: string };
  assert.equal(prematureJson.status, "BUILD_BLOCKED");

  // 5. POST /api/product-plans/[planId]/approve
  const approveReq = new Request(`http://localhost/api/product-plans/${planId}/approve`, { method: "POST" });
  const approveRes = await approvePlanRoute(approveReq, { params: Promise.resolve({ planId }) });
  assert.equal(approveRes.status, 200);
  const approveJson = await approveRes.json() as { status: string; planSha256: string };
  assert.equal(approveJson.status, "PLAN_APPROVED");
  const planSha256 = approveJson.planSha256;

  // 6. POST /api/products/[productId]/build with valid approved plan & matching hash -> 200 permitted
  const validBuildReq = new Request(`http://localhost/api/products/${plan.productId}/build`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planId, planSha256 })
  });
  const validBuildRes = await buildProductRoute(validBuildReq, {
    params: Promise.resolve({ productId: plan.productId })
  });
  assert.equal(validBuildRes.status, 200);
  const validBuildJson = await validBuildRes.json() as { status: string; productId: string };
  assert.equal(validBuildJson.status, "BUILD_PERMITTED");
  assert.equal(validBuildJson.productId, plan.productId);

  // 7. POST /api/products/[productId]/build with WRONG hash -> 409 blocked
  const badHashBuildReq = new Request(`http://localhost/api/products/${plan.productId}/build`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planId, planSha256: "0000000000000000000000000000000000000000000000000000000000000000" })
  });
  const badHashBuildRes = await buildProductRoute(badHashBuildReq, {
    params: Promise.resolve({ productId: plan.productId })
  });
  assert.equal(badHashBuildRes.status, 409);
  const badHashJson = await badHashBuildRes.json() as { status: string; reason: string };
  assert.equal(badHashJson.status, "BUILD_BLOCKED");
  assert.ok(badHashJson.reason.includes("PLAN_HASH_MISMATCH"));
});

