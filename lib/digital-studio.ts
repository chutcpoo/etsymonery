/**
 * Digital Products Studio: manually verified, read-only inventory snapshot.
 * Not the canonical commerce catalog. Never use these records as publisher intake.
 * The canonical product truth remains DIGITAL_PRODUCT_CATALOG_MASTER.xlsx.
 */
export type StudioAsset = {
  fileName: string;
  kind: "PNG" | "PDF";
  driveFileId: string;
};

export type StudioImage = {
  code: string;
  name: string;
  description: string;
  styleApproved: boolean;
  printTestPassed: boolean;
  assets: StudioAsset[];
};

export type StudioProject = {
  id: string;
  name: string;
  namespace: "STUDIO_ONLY";
  catalogProductId: string | null;
  etsyListingId: string | null;
  driveFolderId: string;
  registryFileId: string;
  snapshotVerifiedOn: string;
  standard: string;
  status: "STYLE_PROTOTYPE_APPROVED" | "IN_PROGRESS" | "QC_PASSED";
  listingCopyApproved: boolean;
  buyerFilesPackaged: boolean;
  testerPass: boolean;
  independentQcPass: boolean;
  productionAuthorization: boolean;
  images: StudioImage[];
};

export const STUDIO_DRIVE_ROOT_ID = "1pAm6Mhr7jQtuzfP0RTDo1scKQzis-bAy";
export const NEW_PRODUCT_TEMPLATE_ID = "1Eo0a_65Nx5jw8Q8I-Xcj5x2DKF_ONDW3";
export const STUDIO_GITHUB_REPO = "https://github.com/chutcpoo/etsymonery";
export const STUDIO_VERCEL_PROJECT = "https://vercel.com/shopee-affiliate-ai/autodigitalpublisher";
export const STUDIO_ETSY_CONNECTION = "/connect/etsy";

export const studioProjects: StudioProject[] = [
  {
    id: "STUDIO-P001",
    name: "Rainy Reading Nooks",
    namespace: "STUDIO_ONLY",
    catalogProductId: null,
    etsyListingId: null,
    driveFolderId: "13bj3f6f8tz0uw9t-AyzOn3NJqFsQRKBe",
    registryFileId: "11GZL7bl29qelXXcNaZNYrmcBx6VRQVaM",
    snapshotVerifiedOn: "2026-10-29",
    standard: "v1.0 · B&W line art · A4 nominal 300 DPI",
    status: "STYLE_PROTOTYPE_APPROVED",
    listingCopyApproved: false,
    buyerFilesPackaged: false,
    testerPass: false,
    independentQcPass: false,
    productionAuthorization: false,
    images: [
      {
        code: "01",
        name: "Armchair Reading Nook",
        description: "Armchair, rainy window, bookshelves, sleeping cat.",
        styleApproved: true,
        printTestPassed: false,
        assets: [
          { fileName: "Rainy_Reading_Nook_01_A4_300DPI_Cleaned.png", kind: "PNG", driveFileId: "1AWnGEVV6eiM9gadslPN8f8rMCBH9qVs0" },
          { fileName: "Rainy_Reading_Nook_01_A4_300DPI_Cleaned.pdf", kind: "PDF", driveFileId: "1g3wb8JiVEXC_LuTS974ibMkmLtLuZect" }
        ]
      },
      {
        code: "02",
        name: "Window Seat Reading Nook",
        description: "Built-in window seat, rainy window, books, sleeping dog.",
        styleApproved: true,
        printTestPassed: false,
        assets: [
          { fileName: "Rainy_Reading_Nook_02_A4_300DPI_Cleaned.png", kind: "PNG", driveFileId: "19Lx7MLdGz_s7Vn2S9YDkIVgC-gpL-id6" },
          { fileName: "Rainy_Reading_Nook_02_A4_300DPI_Cleaned.pdf", kind: "PDF", driveFileId: "1shibUjeYs3_nrpTny3eexUm3dJHGwBnL" }
        ]
      }
    ]
  }
];

/** Never infer ready-to-publish from a file name, nominal DPI, or style approval. */
export function getStudioReleaseBlockers(project: StudioProject): string[] {
  const blockers: string[] = [];
  if (!project.catalogProductId) blockers.push("Not registered and verified in canonical Product Truth");
  if (project.images.length === 0) blockers.push("No approved images");
  if (project.images.some(image => !image.styleApproved)) blockers.push("Style approval missing");
  if (project.images.some(image => !image.printTestPassed)) blockers.push("Physical print tests not passed");
  if (!project.buyerFilesPackaged) blockers.push("Buyer delivery package not approved");
  if (!project.listingCopyApproved) blockers.push("Listing content and media not approved");
  if (!project.testerPass) blockers.push("Tester PASS missing");
  if (!project.independentQcPass) blockers.push("Independent final QC PASS missing");
  if (!project.productionAuthorization) blockers.push("Production authorization missing");
  return blockers;
}

export function getStudioProjectSummary() {
  return studioProjects.map(project => ({
    id: project.id,
    name: project.name,
    images: project.images.length,
    savedFiles: project.images.reduce((sum, image) => sum + image.assets.length, 0),
    styleApproved: project.images.filter(image => image.styleApproved).length,
    releaseBlockers: getStudioReleaseBlockers(project).length,
    productionAuthorized: getStudioReleaseBlockers(project).length === 0
  }));
}

export function driveFolderLink(id: string): string {
  return "https://drive.google.com/drive/folders/" + encodeURIComponent(id);
}
export function driveFileLink(id: string): string {
  return "https://drive.google.com/file/d/" + encodeURIComponent(id) + "/view";
}
