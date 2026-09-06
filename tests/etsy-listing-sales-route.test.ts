import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { GET } from "../app/api/etsy/listing-sales/route";

const previousToken = process.env.ETSY_SALES_READ_TOKEN;

before(() => {
  process.env.ETSY_SALES_READ_TOKEN = "sales-read-secret";
});

after(() => {
  if (previousToken === undefined) delete process.env.ETSY_SALES_READ_TOKEN;
  else process.env.ETSY_SALES_READ_TOKEN = previousToken;
});

test("exact listing sales route requires bearer authentication", async () => {
  const response = await GET(
    new Request("https://example.test/api/etsy/listing-sales?listingId=4560696421")
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
  assert.deepEqual(await response.json(), {
    status: "BLOCKED",
    mode: "READ_ONLY",
    error: "ETSY_SALES_READ_UNAUTHORIZED"
  });
});

test("exact listing sales route requires a positive integer listingId", async () => {
  for (const query of ["", "?listingId=", "?listingId=0", "?listingId=12.5", "?listingId=abc"]) {
    const response = await GET(
      new Request(`https://example.test/api/etsy/listing-sales${query}`, {
        headers: { authorization: "Bearer sales-read-secret" }
      })
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      status: "BLOCKED",
      mode: "READ_ONLY",
      error: "VALID_LISTING_ID_REQUIRED"
    });
  }
});
