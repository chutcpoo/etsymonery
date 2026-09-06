import { NextResponse } from "next/server";
import { POST as executeRepairUpdate } from "../repair-update/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAYLOAD = {
  operation: "UPDATE_ACTIVE_LISTING",
  operationId: "B01-UPDATE-002",
  buildId: "ETSY-RESET-V1-PDT-BOBA-001-BUILD-20260906-B01",
  buildFreezeSha256: "9b9b0b070d01cb272bad5463dc91592cbd6304794c6ad125f0b9ddfce22d5038",
  acceptanceCriteriaSha256: "2933a096363420086b941cd24dcf3d04285deaa0ffd40beffabcf4598233b66e",
  candidateFingerprint: "e478bf31dc1a4c92ed0be9318d076db047c17afbd38b58cad0e7f2557eb40041",
  expectedBeforeListingFingerprint: "1b4e59247a5353836a31b99a969d53d05eb5c87af98583f810f866b39dc4f0a5",
  expectedAfterListingFingerprint: "ff3d9806881fa11b3dcf178e4732142fe2df19e5fbe4c75b60f4600f478b3a5d",
  shopId: "23582741",
  listingId: "4560696421",
  patch: {
    title: "Boba Shop Operations Toolkit | Opening, Closing, Prep, Cleaning & Stock Tracker",
    description: "Run your boba or bubble tea shop with one practical daily operations toolkit instead of scattered checklists.\n\nThis digital download includes a 9-tab editable workbook plus print-ready PDFs for the core routines your team repeats every day: opening, closing, prep, cleaning, stock & waste, cash and shift handoff.\n\nWHAT YOU GET\n• 9-tab Excel workbook: Start Here, Opening, Closing, Prep Log, Cleaning, Stock & Waste, Cash & Handoff, Blank Checklist, Setup Assistant\n• A4 printable checklist PDF — 8 pages\n• US Letter printable checklist PDF — 8 pages\n• Quick Start PDF — 2 pages\n• Read Me / License PDF — 2 pages\n• Google Sheets compatible workflow\n\nBEST FOR\nBoba shops, bubble tea shops, drink shops, owners, managers and teams that want a repeatable daily shop routine.\n\nUSE IT FOR\n• Opening and closing routines\n• Prep tracking\n• Cleaning routines\n• Stock and waste logging\n• Cash and shift handoff\n• Creating your own reusable checklist with the blank tab\n\nHOW IT WORKS\n1. Purchase and download the digital files.\n2. Open the Quick Start guide.\n3. Open the workbook in Excel or use the compatible Google Sheets workflow.\n4. Customize the editable fields for your shop.\n5. Use the workbook digitally or print the included A4 / US Letter PDFs.\n\nIMPORTANT\nThis is a digital download. No physical item will be shipped.\nThe toolkit is for internal shop organization and workflow support. It does not provide legal, food-safety, accounting, tax, payroll, POS, or compliance certification advice.\nLicense and usage instructions are included.\n\nProduct: PDT-BOBA-001 V1.",
    priceUsd: 12.9,
    tags: ["boba shop toolkit","bubble tea template","boba operations","opening checklist","closing checklist","prep log template","cleaning checklist","stock waste tracker","cash handoff log","shift handoff","cafe operations","excel template","printable checklist"],
    quantity: 999,
    whoMade: "i_did",
    whenMade: "2020_2026",
    taxonomyId: 12476,
    isSupply: false
  }
} as const;

export async function GET() {
  if (process.env.ETSY_B01_EXECUTE_002 !== "true") {
    return NextResponse.json({ status: "DISABLED", operationId: PAYLOAD.operationId }, { status: 403 });
  }
  const token = process.env.ETSY_B01_WRITE_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ status: "BLOCKED", error: "ETSY_B01_WRITE_AUTH_NOT_CONFIGURED" }, { status: 503 });
  }
  const request = new Request("https://autodigitalpublisher.vercel.app/api/etsy/b01/repair-update", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-autodigitalpublisher-b01-token": token
    },
    body: JSON.stringify(PAYLOAD)
  });
  return executeRepairUpdate(request);
}
