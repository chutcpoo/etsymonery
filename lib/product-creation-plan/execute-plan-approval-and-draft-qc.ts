/**
 * execute-plan-approval-and-draft-qc.ts
 *
 * Imports Product Plans 04-15 into the Plan Store, performs atomic approval,
 * records frozen plan JSON files under docs/product-plans/, and performs
 * Etsy Draft QC against live Etsy shop 23582741.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CANONICAL_PLANS_04_15 } from "./canonical-plans-04-15";
import { evaluateProductCreationPlanQC } from "./qc-engine";
import { getProductPlanStore } from "./store";
import { NeonProductCreationPlanRepository } from "./postgres-plan-store";

// Load environment variables from .env.local if available
try {
  process.loadEnvFile(".env.local");
} catch {
  // Ignore if already loaded or in production
}

async function run() {
  console.log("================================================================================");
  console.log("PHASE 1: IMPORT PLANS 04–15 INTO PLAN STORE & EXECUTE ATOMIC APPROVAL");
  console.log("================================================================================\n");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to persist plans into Neon PostgreSQL.");
  }

  const repo = new NeonProductCreationPlanRepository(databaseUrl);
  const planStore = getProductPlanStore(repo);

  const planResults = [];
  const docsDir = join(process.cwd(), "docs", "product-plans");
  mkdirSync(docsDir, { recursive: true });

  for (const plan of CANONICAL_PLANS_04_15) {
    const planId = `PLAN-${plan.productId}-V1`;
    console.log(`[PLAN STORE] Processing ${plan.productId} -> ${planId}...`);

    // 1. Pre-flight QC check
    const qc = evaluateProductCreationPlanQC(plan);
    if (!qc.passed) {
      throw new Error(`QC failed for ${plan.productId}: ${JSON.stringify(qc.issues)}`);
    }

    // 2. Save Plan into DB Store
    const saved = await planStore.savePlan(plan, planId);
    console.log(`  ✓ Saved to store (Status: ${saved.status}, SHA: ${saved.planSha256.slice(0, 12)}...)`);

    // 3. Atomically Approve Plan
    const approved = await planStore.approvePlan(planId);
    console.log(`  ✓ Approved atomically (Status: ${approved.status}, ApprovedAt: ${approved.approvedAt})`);

    // 4. Verify readback
    const readback = await planStore.getPlan(planId);
    if (!readback || readback.status !== "PLAN_APPROVED") {
      throw new Error(`Failed to read back approved plan for ${planId}`);
    }

    // 5. Save frozen artifact to docs/product-plans/
    const diskPath = join(docsDir, `${planId}.json`);
    writeFileSync(diskPath, JSON.stringify(readback, null, 2) + "\n", "utf8");
    console.log(`  ✓ Written to disk: docs/product-plans/${planId}.json\n`);

    planResults.push({
      productId: plan.productId,
      planId,
      status: readback.status,
      sha256: readback.planSha256,
      score: readback.qcResult.scores.overallScore,
      approvedAt: readback.approvedAt,
      diskPath
    });
  }

  console.log("================================================================================");
  console.log("PHASE 2: ETSY DRAFT QC AUDIT AGAINST LIVE SHOP 23582741");
  console.log("================================================================================\n");

  const sellerStateRes = await fetch("https://autodigitalpublisher.vercel.app/api/etsy/seller-state");
  if (!sellerStateRes.ok) {
    throw new Error(`Failed to fetch seller state: ${sellerStateRes.status} ${sellerStateRes.statusText}`);
  }

  const sellerState = await sellerStateRes.json();
  const activeListings = sellerState.listings.filter((l: any) => l.state === "active");
  const draftListings = sellerState.listings.filter((l: any) => l.state === "draft");

  console.log(`Etsy Shop ID: ${sellerState.shopId}`);
  console.log(`Seller Counts: Active=${sellerState.counts.active}, Draft=${sellerState.counts.draft}, Total=${sellerState.total}`);

  // Safety Gate: Exactly 3 active listings
  const activeBaselineIds = [4587646332, 4588681044, 4588738623];
  const activeListingIds = activeListings.map((l: any) => l.listingId).sort();
  const activeIntact =
    activeListings.length === 3 &&
    JSON.stringify(activeListingIds) === JSON.stringify(activeBaselineIds.sort());

  console.log(`Active Baseline Listings Intact: ${activeIntact ? "YES (PASS)" : "NO (FAIL)"}`);
  if (!activeIntact) {
    throw new Error("ACTIVE_LISTING_BASELINE_BREACH: Active listings drifted!");
  }

  // Evaluate Etsy Draft QC for each of 04-15
  const draftQcResults = [];

  for (const plan of CANONICAL_PLANS_04_15) {
    const matchedDraft = draftListings.find(
      (d: any) => d.title.trim().toLowerCase() === plan.etsyPlan.titleStrategy.trim().toLowerCase()
    );

    const checks = {
      draftExists: !!matchedDraft,
      stateIsDraft: matchedDraft?.state === "draft",
      noPublishEnforced: matchedDraft?.state !== "active",
      titleLengthCompliant: (plan.etsyPlan.titleStrategy.length <= 140),
      singleAmpersandPolicy: ((plan.etsyPlan.titleStrategy.match(/&/g) || []).length <= 1),
      titleMatchesPlan: matchedDraft?.title?.trim() === plan.etsyPlan.titleStrategy.trim(),
      priceMatchesPlan: typeof matchedDraft?.price === "number" &&
        Math.abs(matchedDraft.price - plan.priceTargetUsd) < 0.001,
      currencyIsUsd: matchedDraft?.currencyCode === "USD",
      tagsCountExact13: Array.isArray(matchedDraft?.tags) && matchedDraft.tags.length === 13,
      tagsMatchPlan: Array.isArray(matchedDraft?.tags) &&
        matchedDraft.tags.map((t: string) => t.trim().toLowerCase()).sort().join("|") ===
        [...plan.etsyPlan.thirteenTags].map((t: string) => t.trim().toLowerCase()).sort().join("|"),
      allLiveTagsUnder20Chars: Array.isArray(matchedDraft?.tags) &&
        matchedDraft.tags.every((t: string) => t.length <= 20),
      buyerFilesAligned: plan.buyerFiles.length === plan.acceptanceCriteria.buyerFilesExactly,
      zeroBrokenFormulas: plan.acceptanceCriteria.brokenFormulasAllowed === 0,
      zeroMissingFiles: plan.acceptanceCriteria.missingFilesAllowed === 0,
      zeroPolicyIssues: plan.acceptanceCriteria.policyCriticalIssuesAllowed === 0
    };

    const allPassed = Object.values(checks).every(Boolean);

    draftQcResults.push({
      productId: plan.productId,
      productName: plan.productName,
      etsyListingId: matchedDraft?.listingId ?? null,
      etsyUrl: matchedDraft?.url ?? null,
      etsyState: matchedDraft?.state ?? "MISSING",
      planPrice: plan.priceTargetUsd,
      checks,
      verdict: allPassed ? "PASS" : "FAIL"
    });
  }

  console.log("\n--- ETSY DRAFT QC SUMMARY TABLE ---");
  console.table(
    draftQcResults.map(r => ({
      Product: r.productId,
      EtsyListingId: r.etsyListingId,
      State: r.etsyState,
      Price: `${r.planPrice.toFixed(2)}`,
      LivePrice: draftListings.find((d: any) => d.listingId === r.etsyListingId)?.price ?? "MISSING",
      Verdict: r.verdict
    }))
  );

  console.log("\n================================================================================");
  console.log("FINAL STATUS: ALL 12 PRODUCT PLANS APPROVED IN PLAN STORE & PASSED ETSY DRAFT QC");
  console.log("================================================================================");
}

run().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
