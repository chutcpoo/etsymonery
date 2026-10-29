import assert from "node:assert/strict";
import test from "node:test";
import {
  studioProjects,
  getStudioReleaseBlockers,
  getStudioProjectSummary,
  driveFileLink,
  driveFolderLink
} from "../lib/digital-studio";

test("studio assets retain the verified Google Drive identity", () => {
  const project = studioProjects[0];
  assert.equal(project.id, "STUDIO-P001");
  assert.equal(project.namespace, "STUDIO_ONLY");
  assert.equal(project.catalogProductId, null);
  assert.equal(project.etsyListingId, null);
  assert.equal(project.images.length, 2);
  assert.deepEqual(project.images.map(image => image.assets.map(asset => asset.kind)), [["PNG","PDF"],["PNG","PDF"]]);
  assert.equal(getStudioProjectSummary()[0].savedFiles, 4);
  assert.ok(project.images.every(image => image.styleApproved && !image.printTestPassed));
});

test("unapproved studio record fails closed", () => {
  const base = studioProjects[0];
  const blockers = getStudioReleaseBlockers(base);
  assert.ok(blockers.length >= 7);
  assert.ok(blockers.some(message => message.includes("print")));
  assert.ok(blockers.some(message => message.includes("Product Truth")));
  assert.ok(blockers.some(message => message.includes("Production authorization")));
  assert.equal(getStudioProjectSummary()[0].productionAuthorized, false);
});

test("future products are not accidentally approved", () => {
  const project = structuredClone(studioProjects[0]);
  project.images = [];
  project.catalogProductId = "TEST";
  project.listingCopyApproved = true;
  project.buyerFilesPackaged = true;
  project.testerPass = true;
  project.independentQcPass = true;
  project.productionAuthorization = true;
  assert.ok(getStudioReleaseBlockers(project).includes("No approved images"));
});

test("Drive links are generated from known IDs only", () => {
  assert.ok(driveFileLink(studioProjects[0].registryFileId).startsWith("https://drive.google.com/file/d/"));
  assert.ok(driveFolderLink(studioProjects[0].driveFolderId).startsWith("https://drive.google.com/drive/folders/"));
});
