import type {
  ProductCreationPlan,
  PlanQCResult,
  PlanQCIssue,
  PlanScoreBreakdown,
  ProductFamily
} from "./types";

const TBD_REGEX = /\b(tbd|todo|tba|placeholder|n\/a)\b/i;

function hasTbd(val: unknown): boolean {
  if (typeof val === "string") {
    return TBD_REGEX.test(val);
  }
  return false;
}

const FAMILY_LAYOUT_MAPPING: Record<ProductFamily, string[]> = {
  SPREADSHEET_SCHEDULE: ["SPREADSHEET", "GRID", "SCHEDULE", "DASHBOARD"],
  PRINTABLE_CHECKLIST: ["PRINTABLE", "CHECKLIST", "PORTRAIT"],
  PROPOSAL_DOCUMENT: ["PROPOSAL", "DOCUMENT", "MULTI_PAGE", "PRESENTATION"],
  CALCULATOR: ["CALCULATOR", "FINANCIAL", "SPREADSHEET", "GRID"],
  TRACKER: ["TRACKER", "SPREADSHEET", "GRID", "DASHBOARD"],
  PLANNER: ["PLANNER", "SPREADSHEET", "PORTRAIT", "GRID"]
};

export function evaluateProductCreationPlanQC(plan: ProductCreationPlan): PlanQCResult {
  const issues: PlanQCIssue[] = [];

  // ==========================================
  // 1. Mandatory Fields & Scope Lock Check
  // ==========================================
  const mandatoryStringFields: Array<{ key: keyof ProductCreationPlan; label: string }> = [
    { key: "productId", label: "Product ID" },
    { key: "productName", label: "Product Name" },
    { key: "productType", label: "Product Type" },
    { key: "targetBuyer", label: "Target Buyer Persona" },
    { key: "buyerProblem", label: "Buyer Problem" },
    { key: "coreOutcome", label: "Core Outcome" },
    { key: "primaryUseCase", label: "Primary Use Case" },
    { key: "whyBuyReason", label: "Why Buy Reason" },
    { key: "differentiation", label: "Product Differentiation" },
    { key: "scopeClarity", label: "Scope Clarity" }
  ];

  for (const { key, label } of mandatoryStringFields) {
    const val = plan[key];
    if (typeof val !== "string" || val.trim().length === 0) {
      issues.push({
        rule: "MANDATORY_FIELD_MISSING",
        severity: "BLOCKING",
        message: `${label} (${key}) is required and cannot be empty.`
      });
    } else if (hasTbd(val)) {
      issues.push({
        rule: "SCOPE_LOCK_TBD_FORBIDDEN",
        severity: "BLOCKING",
        message: `${label} (${key}) contains unresolved placeholder/TBD: "${val}".`
      });
    }
  }

  if (!plan.priceTargetUsd || plan.priceTargetUsd <= 0) {
    issues.push({
      rule: "PRICE_TARGET_REQUIRED",
      severity: "BLOCKING",
      message: "Target price in USD must be a positive number."
    });
  }

  if (!Array.isArray(plan.compatibility) || plan.compatibility.length === 0) {
    issues.push({
      rule: "COMPATIBILITY_REQUIRED",
      severity: "BLOCKING",
      message: "Compatibility specifications must be declared."
    });
  }

  if (!Array.isArray(plan.limitations) || plan.limitations.length === 0) {
    issues.push({
      rule: "LIMITATIONS_REQUIRED",
      severity: "BLOCKING",
      message: "Product limitations must be explicitly declared."
    });
  }

  if (!plan.automationStatus || !["MANUAL", "AUTOMATED", "HYBRID"].includes(plan.automationStatus)) {
    issues.push({
      rule: "AUTOMATION_STATUS_INVALID",
      severity: "BLOCKING",
      message: "Automation status must be explicitly declared as MANUAL, AUTOMATED, or HYBRID."
    });
  }

  // ==========================================
  // 2. Product Idea Clarity QC
  // ==========================================
  const ideaFields: Array<{ key: keyof ProductCreationPlan; label: string; minLen: number }> = [
    { key: "targetBuyer", label: "Target Buyer", minLen: 15 },
    { key: "buyerProblem", label: "Buyer Problem", minLen: 20 },
    { key: "coreOutcome", label: "Core Outcome", minLen: 20 },
    { key: "primaryUseCase", label: "Primary Use Case", minLen: 20 },
    { key: "whyBuyReason", label: "Why Buy Reason", minLen: 20 },
    { key: "differentiation", label: "Differentiation", minLen: 20 },
    { key: "scopeClarity", label: "Scope Clarity", minLen: 20 }
  ];

  for (const { key, label, minLen } of ideaFields) {
    const val = typeof plan[key] === "string" ? (plan[key] as string).trim() : "";
    if (val.length > 0 && val.length < minLen) {
      issues.push({
        rule: "IDEA_CLARITY_VAGUE",
        severity: "REVIEW_REQUIRED",
        message: `${label} description is too brief (${val.length} chars, min ${minLen} chars required for clarity).`
      });
    }
  }

  // ==========================================
  // 3. Product Family & Shop DNA Profile Alignment
  // ==========================================
  const validFamilies: ProductFamily[] = [
    "SPREADSHEET_SCHEDULE",
    "PRINTABLE_CHECKLIST",
    "PROPOSAL_DOCUMENT",
    "CALCULATOR",
    "TRACKER",
    "PLANNER"
  ];
  if (!validFamilies.includes(plan.productType)) {
    issues.push({
      rule: "UNKNOWN_PRODUCT_FAMILY",
      severity: "BLOCKING",
      message: `Invalid product family: ${plan.productType}. Must be one of: ${validFamilies.join(", ")}`
    });
  }

  if (plan.shopDnaProfile) {
    const allowedLayouts = FAMILY_LAYOUT_MAPPING[plan.productType] ?? [];
    const layout = (plan.shopDnaProfile.layoutFamily ?? "").toUpperCase();
    const matchesLayout = allowedLayouts.some(al => layout.includes(al));
    if (!matchesLayout) {
      issues.push({
        rule: "SHOP_DNA_FAMILY_MISMATCH",
        severity: "REVIEW_REQUIRED",
        message: `Shop DNA layout family "${plan.shopDnaProfile.layoutFamily}" does not align with product family "${plan.productType}". Recommended layouts: ${allowedLayouts.join(", ")}.`
      });
    }

    if (!plan.shopDnaProfile.typography || plan.shopDnaProfile.typography.trim() === "") {
      issues.push({
        rule: "SHOP_DNA_TYPOGRAPHY_REQUIRED",
        severity: "BLOCKING",
        message: "Shop DNA profile typography is required."
      });
    }
    if (!plan.shopDnaProfile.safeMargins || plan.shopDnaProfile.safeMargins.trim() === "") {
      issues.push({
        rule: "SHOP_DNA_SAFE_MARGINS_REQUIRED",
        severity: "BLOCKING",
        message: "Shop DNA profile safe margins must be defined."
      });
    }
    if (!plan.shopDnaProfile.mobileOverlaySafeZones || plan.shopDnaProfile.mobileOverlaySafeZones.trim() === "") {
      issues.push({
        rule: "SHOP_DNA_MOBILE_SAFE_ZONES_REQUIRED",
        severity: "BLOCKING",
        message: "Shop DNA profile mobile overlay safe zones must be defined."
      });
    }
  } else {
    issues.push({
      rule: "SHOP_DNA_PROFILE_REQUIRED",
      severity: "BLOCKING",
      message: "Shop DNA Profile plan must be specified before build."
    });
  }

  // ==========================================
  // 4. Buyer Package Plan (Frozen Files)
  // ==========================================
  if (!Array.isArray(plan.buyerFiles) || plan.buyerFiles.length === 0) {
    issues.push({
      rule: "BUYER_FILES_REQUIRED",
      severity: "BLOCKING",
      message: "Buyer files package must contain at least 1 declared file."
    });
  } else {
    const ranks = new Set<number>();
    for (let i = 0; i < plan.buyerFiles.length; i++) {
      const file = plan.buyerFiles[i];
      if (!file.filename || file.filename.trim() === "" || hasTbd(file.filename)) {
        issues.push({
          rule: "BUYER_FILE_FILENAME_INVALID",
          severity: "BLOCKING",
          message: `Buyer file at index ${i} has invalid or placeholder filename: "${file.filename}".`
        });
      }
      if (!file.purpose || file.purpose.trim() === "") {
        issues.push({
          rule: "BUYER_FILE_PURPOSE_REQUIRED",
          severity: "BLOCKING",
          message: `Buyer file "${file.filename}" must have an explicit purpose.`
        });
      }
      if (ranks.has(file.rank)) {
        issues.push({
          rule: "BUYER_FILE_DUPLICATE_RANK",
          severity: "BLOCKING",
          message: `Duplicate buyer file rank detected: ${file.rank}.`
        });
      }
      ranks.add(file.rank);
    }
  }

  // ==========================================
  // 5. Workbook Plan QC (if applicable)
  // ==========================================
  const hasXlsxFile = Array.isArray(plan.buyerFiles) && plan.buyerFiles.some(f => f.filename.endsWith(".xlsx") || f.type.includes("spreadsheetml"));
  const requiresWorkbook = plan.productType === "SPREADSHEET_SCHEDULE" || plan.productType === "CALCULATOR" || plan.productType === "TRACKER" || hasXlsxFile;

  if (requiresWorkbook && !plan.workbookPlan) {
    issues.push({
      rule: "WORKBOOK_PLAN_REQUIRED",
      severity: "BLOCKING",
      message: `Product family ${plan.productType} or XLSX buyer files require a detailed workbook plan.`
    });
  }

  if (plan.workbookPlan) {
    const { sheetCount, sheets } = plan.workbookPlan;
    if (!Number.isSafeInteger(sheetCount) || sheetCount <= 0) {
      issues.push({
        rule: "WORKBOOK_SHEET_COUNT_INVALID",
        severity: "BLOCKING",
        message: "Workbook plan sheetCount must be a positive integer."
      });
    } else if (sheets.length !== sheetCount) {
      issues.push({
        rule: "WORKBOOK_SHEET_COUNT_MISMATCH",
        severity: "BLOCKING",
        message: `Workbook plan declared sheetCount ${sheetCount} but provides ${sheets.length} sheet specs.`
      });
    }

    const sheetPurposes = new Set<string>();
    const sheetNames = new Set<string>();
    for (const sheet of sheets) {
      if (!sheet.name || sheet.name.trim() === "") {
        issues.push({
          rule: "WORKBOOK_SHEET_NAME_REQUIRED",
          severity: "BLOCKING",
          message: "Every worksheet in workbook plan must have a name."
        });
      } else if (sheetNames.has(sheet.name.toLowerCase())) {
        issues.push({
          rule: "WORKBOOK_SHEET_NAME_DUPLICATE",
          severity: "BLOCKING",
          message: `Duplicate worksheet name detected: "${sheet.name}".`
        });
      }
      sheetNames.add(sheet.name.toLowerCase());

      if (!sheet.purpose || sheet.purpose.trim() === "") {
        issues.push({
          rule: "WORKBOOK_SHEET_PURPOSE_REQUIRED",
          severity: "BLOCKING",
          message: `Worksheet "${sheet.name}" must have a defined purpose.`
        });
      } else if (sheetPurposes.has(sheet.purpose.toLowerCase())) {
        issues.push({
          rule: "WORKBOOK_SHEET_PURPOSE_DUPLICATE",
          severity: "BLOCKING",
          message: `Duplicate worksheet purpose detected for "${sheet.name}": "${sheet.purpose}". Each sheet must serve a distinct purpose.`
        });
      }
      sheetPurposes.add(sheet.purpose.toLowerCase());
    }
  }

  // ==========================================
  // 6. PDF Plan QC (if applicable)
  // ==========================================
  const hasPdfFile = Array.isArray(plan.buyerFiles) && plan.buyerFiles.some(f => f.filename.endsWith(".pdf") || f.type === "application/pdf");
  const requiresPdf = plan.productType === "PRINTABLE_CHECKLIST" || plan.productType === "PROPOSAL_DOCUMENT" || hasPdfFile;

  if (requiresPdf && !plan.pdfPlan) {
    issues.push({
      rule: "PDF_PLAN_REQUIRED",
      severity: "BLOCKING",
      message: `Product family ${plan.productType} or PDF buyer files require a detailed PDF plan.`
    });
  }

  if (plan.pdfPlan) {
    const { pageCountTarget, pages, orientation } = plan.pdfPlan;
    if (!Number.isSafeInteger(pageCountTarget) || pageCountTarget <= 0) {
      issues.push({
        rule: "PDF_PAGE_COUNT_INVALID",
        severity: "BLOCKING",
        message: "PDF plan pageCountTarget must be a positive integer."
      });
    } else if (pages.length !== pageCountTarget) {
      issues.push({
        rule: "PDF_PAGE_COUNT_MISMATCH",
        severity: "BLOCKING",
        message: `PDF plan declared pageCountTarget ${pageCountTarget} but defined ${pages.length} page specs.`
      });
    }

    if (plan.productType === "PRINTABLE_CHECKLIST" && orientation !== "portrait") {
      issues.push({
        rule: "CHECKLIST_ORIENTATION_PORTRAIT_REQUIRED",
        severity: "REVIEW_REQUIRED",
        message: "Printable checklists should standardly use portrait orientation for print ergonomics."
      });
    }

    if (plan.productType === "PROPOSAL_DOCUMENT" && pageCountTarget < 4) {
      issues.push({
        rule: "PROPOSAL_DOCUMENT_PAGES_INSUFFICIENT",
        severity: "BLOCKING",
        message: "Commercial proposal documents require at least 4 structured pages (Cover, Scope, Pricing, Terms)."
      });
    }
  }

  // ==========================================
  // 7. Listing Image Plan & Hero Plan QC
  // ==========================================
  if (!Array.isArray(plan.listingImagePlan) || plan.listingImagePlan.length !== 10) {
    issues.push({
      rule: "LISTING_IMAGES_EXACTLY_10_REQUIRED",
      severity: "BLOCKING",
      message: `Listing image storyboard must define exactly 10 images (currently has ${plan.listingImagePlan?.length ?? 0}).`
    });
  } else {
    for (let i = 0; i < 10; i++) {
      const img = plan.listingImagePlan[i];
      const rank = i + 1;
      if (img.rank !== rank) {
        issues.push({
          rule: "LISTING_IMAGE_RANK_INVALID",
          severity: "BLOCKING",
          message: `Listing image storyboard item ${i} has rank ${img.rank}, expected rank ${rank}.`
        });
      }
      if (!img.objective || img.objective.trim() === "") {
        issues.push({
          rule: "LISTING_IMAGE_OBJECTIVE_REQUIRED",
          severity: "BLOCKING",
          message: `Image ${rank} is missing an objective.`
        });
      }
      if (!img.headline || img.headline.trim() === "") {
        issues.push({
          rule: "LISTING_IMAGE_HEADLINE_REQUIRED",
          severity: "BLOCKING",
          message: `Image ${rank} is missing a headline.`
        });
      }
      if (!img.buyerQuestionAnswered || img.buyerQuestionAnswered.trim() === "") {
        issues.push({
          rule: "LISTING_IMAGE_BUYER_QUESTION_REQUIRED",
          severity: "BLOCKING",
          message: `Image ${rank} must specify the buyer question it answers.`
        });
      }

      // Hero Plan QC (Image 01)
      if (rank === 1) {
        if (img.headline.length > 60) {
          issues.push({
            rule: "HERO_HEADLINE_TOO_LONG",
            severity: "REVIEW_REQUIRED",
            message: `Hero headline is too long (${img.headline.length} chars). Keep under 60 chars for 2-3s comprehension.`
          });
        }
        if (!img.mobileSafeZone) {
          issues.push({
            rule: "HERO_MOBILE_SAFE_ZONE_REQUIRED",
            severity: "BLOCKING",
            message: "Image 01 (Hero) must declare mobileSafeZone: true."
          });
        }
        if (/\b(ship|shipping|delivery to door|box|package in mail)\b/i.test(img.headline + " " + img.keyClaim)) {
          issues.push({
            rule: "HERO_PHYSICAL_CLAIM_FORBIDDEN",
            severity: "BLOCKING",
            message: "Hero image cannot imply physical delivery or shipping."
          });
        }
      }
    }
  }

  // ==========================================
  // 8. Video Plan QC
  // ==========================================
  const videoRequired = plan.acceptanceCriteria?.videoRequired || plan.videoPlan?.required;
  if (videoRequired) {
    if (!plan.videoPlan) {
      issues.push({
        rule: "VIDEO_PLAN_REQUIRED",
        severity: "BLOCKING",
        message: "Video is marked as required in acceptance criteria, but videoPlan is missing."
      });
    } else {
      const dur = plan.videoPlan.durationTarget;
      if (!dur || dur < 5 || dur > 15) {
        issues.push({
          rule: "VIDEO_DURATION_INVALID",
          severity: "BLOCKING",
          message: `Video durationTarget must be between 5 and 15 seconds for Etsy video compliance (currently: ${dur}).`
        });
      }
      if (!Array.isArray(plan.videoPlan.scenes) || plan.videoPlan.scenes.length < 2) {
        issues.push({
          rule: "VIDEO_SCENES_REQUIRED",
          severity: "BLOCKING",
          message: "Video plan must specify at least 2 structured scenes."
        });
      } else {
        for (let sIdx = 0; sIdx < plan.videoPlan.scenes.length; sIdx++) {
          const scene = plan.videoPlan.scenes[sIdx];
          if (!scene.sourceAsset || scene.sourceAsset.trim() === "") {
            issues.push({
              rule: "VIDEO_SCENE_SOURCE_REQUIRED",
              severity: "BLOCKING",
              message: `Video scene ${sIdx + 1} must reference a source asset.`
            });
          }
          if (!scene.claim || scene.claim.trim() === "") {
            issues.push({
              rule: "VIDEO_SCENE_CLAIM_REQUIRED",
              severity: "BLOCKING",
              message: `Video scene ${sIdx + 1} must state the claim and evidence shown.`
            });
          }
        }
      }
    }
  }

  // ==========================================
  // 9. Claim Plan & Prohibited Claims QC
  // ==========================================
  if (!Array.isArray(plan.supportedClaims) || plan.supportedClaims.length === 0) {
    issues.push({
      rule: "SUPPORTED_CLAIMS_REQUIRED",
      severity: "BLOCKING",
      message: "Supported claims list must be defined."
    });
  }

  if (!Array.isArray(plan.prohibitedClaims) || plan.prohibitedClaims.length === 0) {
    issues.push({
      rule: "PROHIBITED_CLAIMS_REQUIRED",
      severity: "BLOCKING",
      message: "Prohibited claims list must be explicitly specified."
    });
  }

  const prohibitedLower = new Set((plan.prohibitedClaims ?? []).map(c => c.toLowerCase().trim()));
  for (const item of plan.supportedClaims ?? []) {
    const claimLower = item.claim.toLowerCase().trim();
    if (prohibitedLower.has(claimLower)) {
      issues.push({
        rule: "SUPPORTED_CLAIM_IN_PROHIBITED_LIST",
        severity: "BLOCKING",
        message: `Claim "${item.claim}" is listed in prohibitedClaims but marked as supported!`
      });
    }

    // Automation claim check on manual products
    if (plan.automationStatus === "MANUAL") {
      const isNegative = /\b(macro-free|no macros?|without macros?|zero macros?|no automation|non-automated)\b/i.test(item.claim);
      if (!isNegative && /\b(automated|automation|auto-pilot|autopilot|vba|macros?)\b/i.test(item.claim)) {
        issues.push({
          rule: "MANUAL_PRODUCT_AUTOMATION_CLAIM_FORBIDDEN",
          severity: "BLOCKING",
          message: `Product is MANUAL, but claim "${item.claim}" asserts automation/macro capability.`
        });
      }
    }
  }

  // ==========================================
  // 10. Buyer Expectation Plan QC
  // ==========================================
  if (!plan.buyerExpectations) {
    issues.push({
      rule: "BUYER_EXPECTATIONS_REQUIRED",
      severity: "BLOCKING",
      message: "Buyer expectations plan is required."
    });
  } else {
    if (!plan.buyerExpectations.isDigitalDownload) {
      issues.push({
        rule: "BUYER_EXPECTATION_DIGITAL_DOWNLOAD_REQUIRED",
        severity: "BLOCKING",
        message: "Buyer expectations must confirm isDigitalDownload: true."
      });
    }
    if (!plan.buyerExpectations.noPhysicalItem) {
      issues.push({
        rule: "BUYER_EXPECTATION_NO_PHYSICAL_ITEM_REQUIRED",
        severity: "BLOCKING",
        message: "Buyer expectations must confirm noPhysicalItem: true."
      });
    }
    if (plan.buyerExpectations.expectedFileCount !== (plan.buyerFiles?.length ?? 0)) {
      issues.push({
        rule: "BUYER_EXPECTATION_FILE_COUNT_MISMATCH",
        severity: "BLOCKING",
        message: `Buyer expectations expectedFileCount (${plan.buyerExpectations.expectedFileCount}) does not match buyerFiles count (${plan.buyerFiles?.length ?? 0}).`
      });
    }
    if (!plan.buyerExpectations.primarySoftware || plan.buyerExpectations.primarySoftware.trim() === "") {
      issues.push({
        rule: "BUYER_EXPECTATION_PRIMARY_SOFTWARE_REQUIRED",
        severity: "BLOCKING",
        message: "Buyer expectations must declare primary software environment."
      });
    }
  }

  // ==========================================
  // 11. Etsy Plan QC
  // ==========================================
  if (!plan.etsyPlan) {
    issues.push({
      rule: "ETSY_PLAN_REQUIRED",
      severity: "BLOCKING",
      message: "Etsy SEO & Listing Plan is required."
    });
  } else {
    if (!plan.etsyPlan.taxonomyId || plan.etsyPlan.taxonomyId <= 0) {
      issues.push({
        rule: "ETSY_TAXONOMY_ID_REQUIRED",
        severity: "BLOCKING",
        message: "Valid Etsy taxonomyId is required."
      });
    }
    if (!plan.etsyPlan.titleStrategy || plan.etsyPlan.titleStrategy.trim() === "") {
      issues.push({
        rule: "ETSY_TITLE_STRATEGY_REQUIRED",
        severity: "BLOCKING",
        message: "Etsy title strategy must be documented."
      });
    }
    if (!Array.isArray(plan.etsyPlan.thirteenTags) || plan.etsyPlan.thirteenTags.length !== 13) {
      issues.push({
        rule: "ETSY_13_TAGS_EXACTLY_REQUIRED",
        severity: "BLOCKING",
        message: `Etsy plan must specify exactly 13 tags (currently: ${plan.etsyPlan.thirteenTags?.length ?? 0}).`
      });
    } else {
      const tagSet = new Set<string>();
      for (const tag of plan.etsyPlan.thirteenTags) {
        if (!tag || tag.trim().length === 0) {
          issues.push({
            rule: "ETSY_TAG_EMPTY",
            severity: "BLOCKING",
            message: "Etsy tags cannot be empty."
          });
        }
        if (tag.length > 20) {
          issues.push({
            rule: "ETSY_TAG_EXCEEDS_20_CHARS",
            severity: "BLOCKING",
            message: `Etsy tag "${tag}" exceeds 20 characters (${tag.length} chars). Etsy strictly enforces a 20-character maximum per tag.`
          });
        }
        if (tagSet.has(tag.toLowerCase())) {
          issues.push({
            rule: "ETSY_TAG_DUPLICATE",
            severity: "BLOCKING",
            message: `Duplicate Etsy tag detected: "${tag}".`
          });
        }
        tagSet.add(tag.toLowerCase());
      }
    }
  }

  // ==========================================
  // 12. Acceptance Criteria QC
  // ==========================================
  if (!plan.acceptanceCriteria) {
    issues.push({
      rule: "ACCEPTANCE_CRITERIA_REQUIRED",
      severity: "BLOCKING",
      message: "Acceptance criteria (Definition of Done) must be specified."
    });
  } else {
    const ac = plan.acceptanceCriteria;
    if (ac.buyerFilesExactly !== (plan.buyerFiles?.length ?? 0)) {
      issues.push({
        rule: "ACCEPTANCE_BUYER_FILES_MISMATCH",
        severity: "BLOCKING",
        message: `Acceptance criteria buyerFilesExactly (${ac.buyerFilesExactly}) does not match buyerFiles count (${plan.buyerFiles?.length ?? 0}).`
      });
    }
    if (ac.listingImagesExactly !== 10) {
      issues.push({
        rule: "ACCEPTANCE_IMAGES_NOT_10",
        severity: "BLOCKING",
        message: "Acceptance criteria listingImagesExactly must be 10."
      });
    }
    if (ac.brokenFormulasAllowed !== 0) {
      issues.push({
        rule: "ACCEPTANCE_ZERO_TOLERANCE_VIOLATED",
        severity: "BLOCKING",
        message: "brokenFormulasAllowed must be 0."
      });
    }
    if (ac.missingFilesAllowed !== 0) {
      issues.push({
        rule: "ACCEPTANCE_ZERO_TOLERANCE_VIOLATED",
        severity: "BLOCKING",
        message: "missingFilesAllowed must be 0."
      });
    }
    if (ac.claimMismatchAllowed !== 0) {
      issues.push({
        rule: "ACCEPTANCE_ZERO_TOLERANCE_VIOLATED",
        severity: "BLOCKING",
        message: "claimMismatchAllowed must be 0."
      });
    }
    if (ac.policyCriticalIssuesAllowed !== 0) {
      issues.push({
        rule: "ACCEPTANCE_ZERO_TOLERANCE_VIOLATED",
        severity: "BLOCKING",
        message: "policyCriticalIssuesAllowed must be 0."
      });
    }
  }

  // ==========================================
  // 13. Plan Risk Review QC
  // ==========================================
  if (Array.isArray(plan.planRisks)) {
    for (const risk of plan.planRisks) {
      if ((risk.severity === "CRITICAL" || risk.severity === "HIGH") && !risk.resolved) {
        issues.push({
          rule: "UNRESOLVED_CRITICAL_HIGH_RISK",
          severity: "BLOCKING",
          message: `Unresolved ${risk.severity} risk in [${risk.category}]: "${risk.description}". Must be resolved before plan approval.`
        });
      }
      if (risk.category === "BUYER_CONFUSION" && !risk.resolved) {
        issues.push({
          rule: "BUYER_CONFUSION_RISK_UNRESOLVED",
          severity: "BLOCKING",
          message: `Unresolved buyer confusion risk: "${risk.description}".`
        });
      }
    }
  }

  // ==========================================
  // 14. Plan Scoring Breakdown
  // ==========================================
  const scores: PlanScoreBreakdown = {
    productClarity: calculateScore(issues, ["MANDATORY_FIELD_MISSING", "IDEA_CLARITY_VAGUE"]),
    buyerValue: calculateScore(issues, ["BUYER_PROBLEM", "CORE_OUTCOME"]),
    productArchitecture: calculateScore(issues, ["UNKNOWN_PRODUCT_FAMILY", "AUTOMATION_STATUS"]),
    filePlan: calculateScore(issues, ["BUYER_FILES_REQUIRED", "BUYER_FILE_FILENAME_INVALID", "BUYER_FILE_PURPOSE_REQUIRED"]),
    workbookPdfPlan: calculateScore(issues, ["WORKBOOK_PLAN_REQUIRED", "PDF_PLAN_REQUIRED", "WORKBOOK_SHEET", "PDF_PAGE"]),
    listingImagePlan: calculateScore(issues, ["LISTING_IMAGES_EXACTLY_10_REQUIRED", "HERO_"]),
    videoPlan: calculateScore(issues, ["VIDEO_PLAN_REQUIRED", "VIDEO_DURATION_INVALID", "VIDEO_SCENES_REQUIRED"]),
    shopDnaFit: calculateScore(issues, ["SHOP_DNA_FAMILY_MISMATCH", "SHOP_DNA_PROFILE_REQUIRED"]),
    policyFit: calculateScore(issues, ["PROHIBITED_CLAIMS", "UNRESOLVED_CRITICAL_HIGH_RISK", "POLICY"]),
    buyerExpectationClarity: calculateScore(issues, ["BUYER_EXPECTATIONS_REQUIRED", "BUYER_EXPECTATION_"]),
    buildFeasibility: calculateScore(issues, ["ACCEPTANCE_CRITERIA_REQUIRED", "SCOPE_LOCK_TBD_FORBIDDEN"]),
    overallScore: 0
  };

  const scoreValues = [
    scores.productClarity,
    scores.buyerValue,
    scores.productArchitecture,
    scores.filePlan,
    scores.workbookPdfPlan,
    scores.listingImagePlan,
    scores.videoPlan,
    scores.shopDnaFit,
    scores.policyFit,
    scores.buyerExpectationClarity,
    scores.buildFeasibility
  ];
  scores.overallScore = Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length);

  // Determine final status
  const hasBlocking = issues.some(i => i.severity === "BLOCKING");
  const hasReviewRequired = issues.some(i => i.severity === "REVIEW_REQUIRED");

  let status: PlanQCResult["status"] = "PLAN_APPROVED";
  if (hasBlocking) {
    status = "PLAN_BLOCKED";
  } else if (hasReviewRequired || scores.overallScore < 75) {
    status = "PLAN_REVIEW_REQUIRED";
  }

  return {
    status,
    passed: status === "PLAN_APPROVED",
    issues,
    scores,
    evaluatedAt: new Date().toISOString()
  };
}

function calculateScore(issues: PlanQCIssue[], rulePrefixes: string[]): number {
  let deductions = 0;
  for (const issue of issues) {
    if (rulePrefixes.some(prefix => issue.rule.startsWith(prefix))) {
      if (issue.severity === "BLOCKING") {
        deductions += 40;
      } else if (issue.severity === "REVIEW_REQUIRED") {
        deductions += 15;
      } else {
        deductions += 5;
      }
    }
  }
  return Math.max(0, 100 - deductions);
}
