import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("durable authorized Etsy ingress keeps Etsy write secret server-side", async () => {
  const route = await readFile(
    new URL("../app/api/internal/etsy/authorized-operation/route.ts", import.meta.url),
    "utf8"
  );
  const workflow = await readFile(
    new URL("../.github/workflows/execute-authorized-etsy-operation.yml", import.meta.url),
    "utf8"
  );

  assert.match(route, /AUTODIGITALPUBLISHER_GITHUB_TRIGGER_TOKEN/);
  assert.match(route, /process\.env\.ETSY_B01_WRITE_TOKEN/);
  assert.match(route, /operationId !== confirmation/);
  assert.match(route, /operationId !== PD_STOCK_005_B01\.operationId/);
  assert.match(route, /handlePdStock005B01TitleTags\(exactBody, delegated\)/);
  assert.doesNotMatch(route, /api\.etsy\.com/);
  assert.doesNotMatch(route, /method:\s*"PATCH"/);

  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /AUTODIGITALPUBLISHER_GITHUB_TRIGGER_TOKEN/);
  assert.match(workflow, /RECONCILIATION_REQUIRED_DO_NOT_RETRY/);
  assert.doesNotMatch(workflow, /ETSY_B01_WRITE_TOKEN/);
  assert.doesNotMatch(workflow, /api\.etsy\.com/);
});
