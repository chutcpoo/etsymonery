import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { etsyApiHeaders } from "../../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../../../lib/etsy-seller-state-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_ID = 23582741;
const GATE = "[GATE_BIPC_DRAFT_EXECUTE]";
const NONCE_SHA256 = "53f510a498beb643022470cb5e7368446c3c9c7a81e93f61f8d7ea2d5a36991d";
const AUTHORIZATION_TEXT =
  "AUTHORIZE PDT-BIPC-003-V1-ETSY-DRAFT-R01-20260921 EXACT SCOPE ONLY" as const;
const OPERATION_ID = "PDT-BIPC-003-V1-ETSY-DRAFT-R01" as const;
const CANDIDATE_FINGERPRINT =
  "b9cd5785eba3323328789d646843d11ef0e9dbbb271423176b5bc579ab3bfe1a" as const;
const LISTING_FINGERPRINT =
  "0b61dcef05fb6e49c308d538a89487060dbc875bdd87eda5a55d912fabe1bc55" as const;

const EXISTING = Object.freeze([
  {
    listingId: 4578945050,
    title:
      "Invoice Payment Tracker Excel | Accounts Receivable Aging & Follow-Up Spreadsheet for Small Business"
  },
  {
    listingId: 4579068925,
    title:
      "Restaurant Food Cost Calculator | Recipe & Menu Pricing Excel Template"
  }
] as const);

const DESCRIPTION = [
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
  "The SAMPLE workbook uses fictional data only to demonstrate how the workflow and formulas work."
].join("\n");

const TAGS = Object.freeze([
  "liquor inventory",
  "bar inventory",
  "pour cost tracker",
  "bar par sheet",
  "liquor stock sheet",
  "beverage inventory",
  "bar reorder tracker",
  "inventory sheet",
  "bar inventory excel",
  "liquor spreadsheet",
  "pour cost sheet",
  "bar cost tracker",
  "restaurant bar tool"
] as const);

const LISTING = Object.freeze({
  title: "Bar Inventory Spreadsheet | Liquor Stock & Pour Cost Tracker",
  description: DESCRIPTION,
  priceUsd: 11.99,
  quantity: 999,
  whoMade: "i_did",
  whenMade: "2020_2026",
  taxonomyId: 12476,
  listingType: "download",
  tags: TAGS
});

const IMAGES = Object.freeze([
  { param:"asset01", rank:1, driveId:"17CHl93N_AOXLNsYGHnDEudPC2DImu-Ja", fileName:"PDT-BIPC-003_01_hero.png", size:240007, sha256:"8eca08ce59f31ebe76a6ac6d1d240fdac351f018bd52805379febd42ee865653", altText:"Bar Inventory & Pour Cost Tracker Excel workbook with actual sample dashboard preview, showing stock, reorder, usage and variance-review workflow." },
  { param:"asset02", rank:2, driveId:"1w_27crMHp-24zX0G2Pw4c84-JRR74bfl", fileName:"PDT-BIPC-003_02_dashboard.png", size:333135, sha256:"c6fa7b086801df16353b4e542f741e58a7460cd24d20720c478a98fb01725b8c", altText:"Actual SAMPLE dashboard from Bar Inventory & Pour Cost Tracker showing fictional on-hand value, reorder cost, usage cost and review lists." },
  { param:"asset03", rank:3, driveId:"1PEiO08eLVRj7BpuDb7VXc-t0Jbbk-DMy", fileName:"PDT-BIPC-003_03_count_usage.png", size:114789, sha256:"f276215cd22e46e7303f4133dd2e51a2f9700af50ce527794d7b78020b520cd9", altText:"Infographic showing Opening Count plus Purchases minus Closing Count equals Actual Usage, with blank and zero handling." },
  { param:"asset04", rank:4, driveId:"1VQhKxaqssVtl9uFIsFkPTATgfnPHCF7C", fileName:"PDT-BIPC-003_04_reorder.png", size:109156, sha256:"c3bfd29199b69513466c733e8d1bbb8614d6997be6ad734a0d50bc88eec03bac", altText:"Par and reorder workflow showing current on-hand, buyer-entered par level, reorder quantity and estimated reorder cost." },
  { param:"asset05", rank:5, driveId:"1apSdzk1FnpsCanzZIjS4Bo6raB8rPK3p", fileName:"PDT-BIPC-003_05_pour_cost.png", size:119185, sha256:"8eb3a61a3b17c6161cc7424d74aa0247f85ca101464f91279ea96e0dbe84d74d", altText:"Pour cost workflow showing package cost to unit cost, cost per mL, cost per serving and pour cost percentage." },
  { param:"asset06", rank:6, driveId:"1dST3b_A4mbBIii29zdm995nij0591Q0J", fileName:"PDT-BIPC-003_06_variance.png", size:113754, sha256:"7c34987b68ed4c87dec17e0c0323aea91e4a9ee2c903972b09d71d22ec341c6a", altText:"Variance review infographic comparing actual usage and theoretical usage, stating variance is a review signal and not a cause." },
  { param:"asset07", rank:7, driveId:"1bWsNw_sApn3hLnI2-iXBV97JshyeY7--", fileName:"PDT-BIPC-003_07_partial_counts.png", size:74094, sha256:"2e055d470e5d6cc77bdd839ae676b925a7287c96676d3da3e3027ecf128944b5", altText:"Partial bottle count illustration showing decimal container counts such as 0.25, 0.50, 0.75 and 1.00." },
  { param:"asset08", rank:8, driveId:"1L4nW_E3KgmeIy1R5W1U1M1H7WQX2apCK", fileName:"PDT-BIPC-003_08_tabs.png", size:97125, sha256:"1b42942d2896cdae47b79014667a9c133397cea060403693f403ddfbe8f57ee5", altText:"Eight-tab Excel workflow: Start Here, Settings, Beverage Items, Purchases, Count & Usage, Par & Reorder, Pour Cost & Variance, Dashboard." },
  { param:"asset09", rank:9, driveId:"1kz3LhbMCnHpmqw-StImAsE6DvfXOkfNj", fileName:"PDT-BIPC-003_09_what_you_get.png", size:99047, sha256:"3d1c8d8640b3bdab11a517cb99528939a55937f0c4f0519a297ff05ac23ca602", altText:"Two Excel files included: SAMPLE workbook with fictional data and CLEAN START workbook for buyer data." },
  { param:"asset10", rank:10, driveId:"1WnLRMV5g0pdnweSa2yNuppLKHwz3QilW", fileName:"PDT-BIPC-003_10_boundaries.png", size:152997, sha256:"4edecea18cd33d3f9b1a0ffd6789ca17783346d1495ddbd84444decc647a8ed5", altText:"Included and not included summary for Bar Inventory & Pour Cost Tracker, including no POS integration, supplier sync or Google Sheets V1." }
] as const);

const BUYER_FILES = Object.freeze([
  { param:"buyerFile01", rank:1, driveId:"1dTJW7IzcKIBcj43KGqkeW7yUOlFJ3RWK", fileName:"PDT-BIPC-003_V1_Bar_Inventory_Pour_Cost_Tracker_SAMPLE.xlsx", size:126257, sha256:"5c36d25ce98e35e729c3449fdbb555a4f84762e2195d7735ecae3c12980cf1b8", mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { param:"buyerFile02", rank:2, driveId:"1jV6Xus2iAqdoLOCALWAtVj-Lg5VRh3w9", fileName:"PDT-BIPC-003_V1_Bar_Inventory_Pour_Cost_Tracker_CLEAN_START.xlsx", size:123515, sha256:"aba1eba1fa26f907edcd4e039104c164ea20c58d73842013a12ac95e752fa8ef", mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
] as const);

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}
function records(value: unknown, code: string) {
  if (!isRec(value) || !Array.isArray(value.results)) throw new Error(code);
  return value.results.filter(isRec);
}
function intField(row: Rec, key: string) {
  const value = row[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}
function textField(row: Rec, key: string) {
  const value = row[key];
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}
function comparableText(value: string) {
  let out = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  for (let i = 0; i < 2; i += 1) {
    out = out
      .replace(/&quot;|&#34;|&#x22;/gi, '"')
      .replace(/&apos;|&#39;|&#x27;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&");
  }
  return out;
}
function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function nonceOk(value: string) {
  const actual = createHash("sha256").update(value, "utf8").digest("hex");
  return secureEqual(actual, NONCE_SHA256);
}
function gateEnabled() {
  return process.env.VERCEL_ENV === "production" &&
    (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").includes(GATE);
}
function multipartHeaders(token: string) {
  const headers = etsyApiHeaders(token);
  delete headers["content-type"];
  return headers;
}
function allowedAssetUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("ASSET_URL_PROTOCOL");
  if (!/^sdmntpr[a-z0-9-]*\.oaiusercontent\.com$/i.test(url.hostname)) {
    throw new Error("ASSET_URL_HOST");
  }
  return url.toString();
}
async function fetchAsset(url: string, size: number, sha256: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("ASSET_FETCH_HTTP_" + String(response.status));
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== size) throw new Error("ASSET_SIZE_MISMATCH");
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (!secureEqual(actual, sha256)) throw new Error("ASSET_SHA256_MISMATCH");
  return bytes;
}
function exactPriceUsd(price: unknown) {
  if (!isRec(price)) return false;
  const amount = Number(price.amount);
  const divisor = Number(price.divisor);
  return Number.isFinite(amount) && Number.isFinite(divisor) && divisor > 0 &&
    Number((amount / divisor).toFixed(2)) === LISTING.priceUsd &&
    textField(price, "currency_code").toUpperCase() === "USD";
}
function sameStringArray(value: unknown, expected: readonly string[]) {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((v, i) => typeof v === "string" && v.normalize("NFC").trim() === expected[i]);
}
async function getRecord(token: string, url: string, code: string) {
  const response = await fetch(url, { method:"GET", headers:etsyApiHeaders(token), cache:"no-store" });
  if (!response.ok) throw new Error(code + "_HTTP_" + String(response.status));
  const value = await parseJson(response);
  if (!isRec(value)) throw new Error(code + "_INVALID");
  return value;
}
function baselineMatches(state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>) {
  if (
    state.total !== 2 ||
    state.counts.active !== 2 ||
    state.counts.draft !== 0 ||
    state.counts.inactive !== 0 ||
    state.counts.sold_out !== 0 ||
    state.counts.expired !== 0 ||
    state.listings.length !== 2
  ) return false;
  for (const expected of EXISTING) {
    const row = state.listings.find(x => x.listingId === expected.listingId);
    if (!row || row.state !== "active" || row.title !== expected.title) return false;
  }
  return !state.listings.some(x => x.title === LISTING.title);
}
function protectedFingerprint(state: Awaited<ReturnType<typeof getEtsySellerStateSnapshot>>) {
  const payload = JSON.stringify({
    operationId: OPERATION_ID,
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    counts: state.counts,
    listingIds: state.listings.map(x => x.listingId).sort((a,b)=>a-b),
    states: state.listings
      .map(x => ({ listingId:x.listingId, state:x.state, title:x.title }))
      .sort((a,b)=>a.listingId-b.listingId)
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
async function createDraft(token: string) {
  const body = new URLSearchParams({
    quantity: String(LISTING.quantity),
    title: LISTING.title,
    description: LISTING.description,
    price: LISTING.priceUsd.toFixed(2),
    who_made: LISTING.whoMade,
    when_made: LISTING.whenMade,
    taxonomy_id: String(LISTING.taxonomyId),
    type: LISTING.listingType,
    tags: LISTING.tags.join(",")
  });
  const response = await fetch(
    "https://api.etsy.com/v3/application/shops/" + SHOP_ID + "/listings",
    {
      method:"POST",
      headers:{ ...etsyApiHeaders(token), "content-type":"application/x-www-form-urlencoded" },
      body,
      cache:"no-store"
    }
  );
  if (response.status >= 500) throw new Error("DRAFT_CREATE_AMBIGUOUS_" + String(response.status));
  if (!response.ok) throw new Error("DRAFT_CREATE_REJECTED_" + String(response.status));
  const value = await parseJson(response);
  const id = isRec(value) ? intField(value, "listing_id") : null;
  if (!id || id <= 0) throw new Error("DRAFT_CREATE_RECEIPT_INVALID");
  return id;
}
async function uploadImage(token: string, listingId: number, spec: typeof IMAGES[number], bytes: Buffer) {
  const body = new FormData();
  body.append("image", new File([new Uint8Array(bytes)], spec.fileName, { type:"image/png" }), spec.fileName);
  body.append("rank", String(spec.rank));
  body.append("alt_text", spec.altText);
  const response = await fetch(
    "https://api.etsy.com/v3/application/shops/" + SHOP_ID + "/listings/" + listingId + "/images",
    { method:"POST", headers:multipartHeaders(token), body, cache:"no-store" }
  );
  if (!response.ok) throw new Error("IMAGE_UPLOAD_HTTP_" + spec.rank + "_" + response.status);
}
async function uploadBuyerFile(token: string, listingId: number, spec: typeof BUYER_FILES[number], bytes: Buffer) {
  const body = new FormData();
  body.append("file", new File([new Uint8Array(bytes)], spec.fileName, { type:spec.mimeType }), spec.fileName);
  body.append("name", spec.fileName);
  body.append("rank", String(spec.rank));
  const response = await fetch(
    "https://api.etsy.com/v3/application/shops/" + SHOP_ID + "/listings/" + listingId + "/files",
    { method:"POST", headers:multipartHeaders(token), body, cache:"no-store" }
  );
  if (!response.ok) throw new Error("FILE_UPLOAD_HTTP_" + spec.rank + "_" + response.status);
}
async function verifyPersistence(token: string, listingId: number) {
  const [listing, imagesPayload, filesPayload, seller] = await Promise.all([
    getRecord(token, "https://api.etsy.com/v3/application/listings/" + listingId, "LISTING"),
    getRecord(token, "https://api.etsy.com/v3/application/listings/" + listingId + "/images", "IMAGES"),
    getRecord(token, "https://api.etsy.com/v3/application/shops/" + SHOP_ID + "/listings/" + listingId + "/files", "FILES"),
    getEtsySellerStateSnapshot({ shopId:SHOP_ID, accessToken:token })
  ]);
  const images = records(imagesPayload, "IMAGES_INVALID");
  const files = records(filesPayload, "FILES_INVALID");
  if (
    textField(listing,"title") !== LISTING.title ||
    comparableText(textField(listing,"description")) !== comparableText(LISTING.description) ||
    !exactPriceUsd(listing.price) ||
    Number(listing.quantity) !== LISTING.quantity ||
    textField(listing,"who_made") !== LISTING.whoMade ||
    textField(listing,"when_made") !== LISTING.whenMade ||
    Number(listing.taxonomy_id) !== LISTING.taxonomyId ||
    ![textField(listing,"listing_type"), textField(listing,"type")].includes(LISTING.listingType) ||
    textField(listing,"state") !== "draft" ||
    !sameStringArray(listing.tags, LISTING.tags)
  ) throw new Error("FINAL_LISTING_IDENTITY_MISMATCH");

  const orderedImages=[...images].sort((a,b)=>(intField(a,"rank")??0)-(intField(b,"rank")??0));
  if (orderedImages.length !== IMAGES.length) throw new Error("FINAL_GALLERY_COUNT_MISMATCH");
  for (let i=0;i<IMAGES.length;i+=1) {
    if (intField(orderedImages[i],"rank") !== IMAGES[i].rank ||
        textField(orderedImages[i],"alt_text") !== IMAGES[i].altText) {
      throw new Error("FINAL_GALLERY_MISMATCH_" + String(i+1));
    }
  }
  const orderedFiles=[...files].sort((a,b)=>(intField(a,"rank")??0)-(intField(b,"rank")??0));
  if (orderedFiles.length !== BUYER_FILES.length) throw new Error("FINAL_FILE_COUNT_MISMATCH");
  for (let i=0;i<BUYER_FILES.length;i+=1) {
    if (textField(orderedFiles[i],"filename") !== BUYER_FILES[i].fileName ||
        Number(orderedFiles[i].size_bytes) !== BUYER_FILES[i].size) {
      throw new Error("FINAL_FILE_MISMATCH_" + String(i+1));
    }
  }
  if (
    seller.total !== 3 ||
    seller.counts.active !== 2 ||
    seller.counts.draft !== 1 ||
    seller.counts.inactive !== 0 ||
    seller.counts.sold_out !== 0 ||
    seller.counts.expired !== 0
  ) throw new Error("FINAL_SELLER_COUNTS_MISMATCH");
  for (const expected of EXISTING) {
    const row=seller.listings.find(x=>x.listingId===expected.listingId);
    if (!row || row.state!=="active" || row.title!==expected.title) {
      throw new Error("PROTECTED_LISTING_DRIFT_" + expected.listingId);
    }
  }
  const created=seller.listings.find(x=>x.listingId===listingId);
  if (!created || created.state!=="draft" || created.title!==LISTING.title) {
    throw new Error("FINAL_DRAFT_STATE_MISMATCH");
  }
  return {
    sellerCounts:seller.counts,
    total:seller.total,
    imageCount:orderedImages.length,
    buyerFileCount:orderedFiles.length,
    buyerFiles:orderedFiles.map(x=>({rank:intField(x,"rank"),filename:textField(x,"filename"),sizeBytes:Number(x.size_bytes)}))
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("action") !== "execute_relay") {
    try {
      const token=await getValidEtsyAccessToken();
      const seller=await getEtsySellerStateSnapshot({shopId:SHOP_ID,accessToken:token});
      return NextResponse.json({
        status:"PLAN_ONLY",
        mode:"PDT_BIPC_003_DRAFT_R01",
        operationId:OPERATION_ID,
        candidateFingerprint:CANDIDATE_FINGERPRINT,
        listingFingerprint:LISTING_FINGERPRINT,
        baselineMatches:baselineMatches(seller),
        protectedStateFingerprint:protectedFingerprint(seller),
        sellerCounts:seller.counts,
        total:seller.total,
        listingIds:seller.listings.map(x=>x.listingId),
        imageCount:IMAGES.length,
        buyerFileCount:BUYER_FILES.length,
        priceUsd:LISTING.priceUsd,
        publishAuthorized:false,
        authorizationRequired:AUTHORIZATION_TEXT,
        ETSY_WRITE_COUNT:0
      }, { headers:{"cache-control":"no-store"} });
    } catch (error) {
      return NextResponse.json({
        status:"PLAN_BLOCKED",
        error:error instanceof Error ? error.message : "UNKNOWN",
        ETSY_WRITE_COUNT:0
      }, { status:409, headers:{"cache-control":"no-store"} });
    }
  }

  let writes=0;
  let draftListingId:number|null=null;
  try {
    if (!gateEnabled()) {
      return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"BIPC_DRAFT_GATE_DISABLED",ETSY_WRITE_COUNT:0},{status:403});
    }
    const authorizationText=url.searchParams.get("authorizationText")?.normalize("NFC").trim() ?? "";
    if (!secureEqual(authorizationText, AUTHORIZATION_TEXT)) {
      return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"BIPC_DRAFT_AUTHORIZATION_INVALID",ETSY_WRITE_COUNT:0},{status:401});
    }
    const nonce=url.searchParams.get("nonce")?.trim() ?? "";
    if (!nonce || !nonceOk(nonce)) {
      return NextResponse.json({status:"BLOCKED_FAIL_CLOSED",error:"BIPC_DRAFT_NONCE_INVALID",ETSY_WRITE_COUNT:0},{status:401});
    }

    const token=await getValidEtsyAccessToken();
    const before=await getEtsySellerStateSnapshot({shopId:SHOP_ID,accessToken:token});
    if (!baselineMatches(before)) {
      return NextResponse.json({
        status:"BLOCKED_FAIL_CLOSED",
        error:"BIPC_DRAFT_BASELINE_MISMATCH",
        sellerCounts:before.counts,
        total:before.total,
        listingIds:before.listings.map(x=>x.listingId),
        ETSY_WRITE_COUNT:0
      },{status:409});
    }

    const imageBytes=new Map<number,Buffer>();
    for (const spec of IMAGES) {
      imageBytes.set(spec.rank,await fetchAsset(
        allowedAssetUrl(url.searchParams.get(spec.param) ?? ""),
        spec.size,
        spec.sha256
      ));
    }
    const fileBytes=new Map<number,Buffer>();
    for (const spec of BUYER_FILES) {
      fileBytes.set(spec.rank,await fetchAsset(
        allowedAssetUrl(url.searchParams.get(spec.param) ?? ""),
        spec.size,
        spec.sha256
      ));
    }

    draftListingId=await createDraft(token);
    writes+=1;

    for (const spec of IMAGES) {
      const bytes=imageBytes.get(spec.rank);
      if (!bytes) throw new Error("STAGED_IMAGE_MISSING_" + spec.rank);
      await uploadImage(token,draftListingId,spec,bytes);
      writes+=1;
    }
    for (const spec of BUYER_FILES) {
      const bytes=fileBytes.get(spec.rank);
      if (!bytes) throw new Error("STAGED_FILE_MISSING_" + spec.rank);
      await uploadBuyerFile(token,draftListingId,spec,bytes);
      writes+=1;
    }

    const verified=await verifyPersistence(token,draftListingId);
    return NextResponse.json({
      status:"DRAFT_CREATED_AND_PERSISTENCE_VERIFIED",
      mode:"PDT_BIPC_003_DRAFT_R01",
      operationId:OPERATION_ID,
      draftListingId,
      candidateFingerprint:CANDIDATE_FINGERPRINT,
      listingFingerprint:LISTING_FINGERPRINT,
      publishPerformed:false,
      verified,
      ETSY_WRITE_COUNT:writes
    },{headers:{"cache-control":"no-store"}});
  } catch (error) {
    return NextResponse.json({
      status:draftListingId ? "RECONCILIATION_REQUIRED" : "BLOCKED_FAIL_CLOSED",
      error:error instanceof Error ? error.message : "UNKNOWN",
      draftListingId,
      publishPerformed:false,
      ETSY_WRITE_COUNT:writes
    },{status:draftListingId ? 202 : 400,headers:{"cache-control":"no-store"}});
  }
}
