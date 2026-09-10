import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("durable authorized Etsy ingress uses GitHub OIDC and keeps Etsy write secret server-side", async () => {
  const route = await readFile(
    new URL("../app/api/internal/etsy/authorized-operation/route.ts", import.meta.url),
    "utf8"
  );
  const workflow = await readFile(
    new URL("../.github/workflows/execute-authorized-etsy-operation.yml", import.meta.url),
    "utf8"
  );

  assert.match(route, /token\.actions\.githubusercontent\.com/);
  assert.match(route, /GITHUB_REPOSITORY = "chutcpoo\/etsymonery"/);
  assert.match(route, /GITHUB_REF = "refs\/heads\/main"/);
  assert.match(route, /GITHUB_EVENT = "workflow_dispatch"/);
  assert.match(route, /execute-authorized-etsy-operation\.yml@refs\/heads\/main/);
  assert.match(route, /crypto\.subtle\.importKey/);
  assert.match(route, /crypto\.subtle\.verify/);
  assert.match(route, /process\.env\.ETSY_B01_WRITE_TOKEN/);
  assert.match(route, /operationId !== confirmation/);
  assert.match(route, /operationId !== PD_STOCK_005_B01\.operationId/);
  assert.match(route, /operationId !== PD_REST_003_A02\.operationId/);
  assert.match(route, /operationId !== PDT_BOBA_001_C03_GALLERY_REPAIR\.operationId/);
  assert.match(route, /operationId !== PDT_PCSO_001_C03\.operationId/);
  assert.match(route, /handlePdStock005B01TitleTags\(exactBody, delegated\)/);
  assert.match(route, /handlePdRest003A02TitleTagsImage1\(exactPdRest003A02Body\(\), delegated\)/);
  assert.match(route, /handlePdtBoba001C03GalleryRepair\(exactPdtBoba001C03GalleryRepairBody\(\), delegated\)/);
  assert.match(route, /handlePdtPcso001C03TitleTagsDescription\(exactPdtPcso001C03Body\(authorizationId\), delegated\)/);
  assert.match(route, /ETSY_PCSO_C03_AUTHORIZATION_ID/);
  assert.doesNotMatch(route, /AUTODIGITALPUBLISHER_GITHUB_TRIGGER_TOKEN/);
  assert.doesNotMatch(route, /api\.etsy\.com/);
  assert.doesNotMatch(route, /method:\s*"PATCH"/);

  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(workflow, /ACTIONS_ID_TOKEN_REQUEST_TOKEN/);
  assert.match(workflow, /authorization.*Bearer/);
  assert.match(workflow, /RECONCILIATION_REQUIRED_DO_NOT_RETRY/);
  assert.doesNotMatch(workflow, /AUTODIGITALPUBLISHER_GITHUB_TRIGGER_TOKEN/);
  assert.doesNotMatch(workflow, /ETSY_B01_WRITE_TOKEN/);
  assert.doesNotMatch(workflow, /api\.etsy\.com/);
});

test("authorized asset staging ingress supports exact A02 and Boba C03 assets with zero Etsy writes", async () => {
  const route = await readFile(new URL("../app/api/internal/etsy/authorized-operation/asset-chunk/route.ts", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/execute-authorized-etsy-operation.yml", import.meta.url), "utf8");

  assert.match(route, /execute-authorized-etsy-operation\.yml@refs\/heads\/main/);
  assert.match(route, /PD_REST_003_A02\.operationId/);
  assert.match(route, /PDT_BOBA_001_C03_GALLERY_REPAIR\.operationId/);
  assert.match(route, /PDT_BOBA_001_C03_GALLERY_REPAIR\.gallery\.find\(candidate=>candidate\.sha256===requestedAssetSha256\)/);
  assert.match(route, /AUTHORIZED_ETSY_ASSET_NOT_REGISTERED/);
  assert.match(route, /stageAuthorizedAssetChunk/);
  assert.match(route, /assetSha256:registeredAssetSha256/);
  assert.match(route, /ETSY_WRITE_COUNT:0/);
  assert.doesNotMatch(route, /api\.etsy\.com/);
  assert.doesNotMatch(route, /method:\s*"(PATCH|PUT|DELETE|POST)"/);

  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /asset_sha256/);
  assert.match(workflow, /ASSET_SHA256/);
  assert.match(workflow, /assetSha256: process\.env\.ASSET_SHA256 \|\| undefined/);
  assert.match(workflow, /PDT-BOBA-001-C03-GALLERY-MOBILE-SAFE-REPAIR-001/);
  assert.match(workflow, /Missing asset_sha256 for Boba C03/);
  assert.doesNotMatch(workflow, /ETSY_B01_WRITE_TOKEN/);
  assert.doesNotMatch(workflow, /api\.etsy\.com/);
});

test("Boba C03 OIDC ingress remains exact-contract and fail-closed", async () => {
  const executionRoute = await readFile(new URL("../app/api/internal/etsy/authorized-operation/route.ts", import.meta.url), "utf8");
  const stageRoute = await readFile(new URL("../app/api/internal/etsy/authorized-operation/asset-chunk/route.ts", import.meta.url), "utf8");

  assert.match(executionRoute, /exactPdtBoba001C03GalleryRepairBody/);
  assert.match(executionRoute, /PDT_BOBA_001_C03_GALLERY_REPAIR\.operationId/);
  assert.match(executionRoute, /x-autodigitalpublisher-write-token/);
  assert.match(stageRoute, /confirmation!==operationId/);
  assert.match(stageRoute, /AUTHORIZED_ETSY_CONFIRMATION_MISMATCH/);
  assert.match(stageRoute, /AUTHORIZED_ETSY_OPERATION_NOT_REGISTERED/);
  assert.match(stageRoute, /AUTHORIZED_ETSY_ASSET_NOT_REGISTERED/);
  assert.doesNotMatch(stageRoute, /ETSY_B01_WRITE_TOKEN/);
  assert.doesNotMatch(stageRoute, /x-autodigitalpublisher-write-token/);
});
