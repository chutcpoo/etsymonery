import assert from "node:assert/strict";
import test from "node:test";
import {
  PDT_RPT_003_R02,
  createPdtRpt003R02MetadataPatch
} from "../lib/pdt-rpt-003-r02";

test("R02 metadata PATCH mutates only fields that actually change", () => {
  const body = createPdtRpt003R02MetadataPatch();

  assert.deepEqual([...body.keys()].sort(), ["description", "tags", "title"]);
  assert.equal(body.get("title"), PDT_RPT_003_R02.title);
  assert.equal(body.get("description"), PDT_RPT_003_R02.description);
  assert.equal(body.get("tags"), PDT_RPT_003_R02.tags.join(","));

  for (const protectedKey of [
    "price",
    "quantity",
    "taxonomy_id",
    "who_made",
    "when_made",
    "is_supply",
    "type",
    "state"
  ]) {
    assert.equal(body.has(protectedKey), false);
  }
});
