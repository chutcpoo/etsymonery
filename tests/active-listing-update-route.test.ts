import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/etsy/active-listing-update/route";

test("dedicated active-listing route rejects invalid JSON", async () => {
  const response = await POST(new Request("https://example.test/api/etsy/active-listing-update", {
    method: "POST",
    body: "not-json"
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "INVALID_JSON" });
});

test("dedicated active-listing route rejects non-object bodies", async () => {
  const response = await POST(new Request("https://example.test/api/etsy/active-listing-update", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "[]"
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "INVALID_BODY" });
});
