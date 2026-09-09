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
  assert.match(route, /handlePdStock005B01TitleTags\(exactBody, delegated\)/);
  assert.match(route, /handlePdRest003A02TitleTagsImage1\(exactPdRest003A02Body\(\), delegated\)/);
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


test("A02 asset staging ingress is OIDC-only and performs zero Etsy writes", async () => {
  const route = await readFile(new URL("../app/api/internal/etsy/authorized-operation/asset-chunk/route.ts", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/execute-authorized-etsy-operation.yml", import.meta.url), "utf8");
  assert.match(route, /execute-authorized-etsy-operation\.yml@refs\/heads\/main/);
  assert.match(route, /PD_REST_003_A02\.operationId/);
  assert.match(route, /stageAuthorizedAssetChunk/);
  assert.match(route, /ETSY_WRITE_COUNT:0/);
  assert.doesNotMatch(route, /api\.etsy\.com/);
  assert.doesNotMatch(route, /method:\s*"(PATCH|PUT|DELETE)"/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /asset-chunk/);
  assert.doesNotMatch(workflow, /ETSY_B01_WRITE_TOKEN/);
  assert.doesNotMatch(workflow, /api\.etsy\.com/);
});
