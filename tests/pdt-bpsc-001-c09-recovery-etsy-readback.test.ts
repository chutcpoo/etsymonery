import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePdtBpsc001C09EtsyDescriptionTransport,
  pdtBpsc001C09RecoveryEtsyFetch
} from "../lib/pdt-bpsc-001-c09-recovery-etsy-readback";
import { PDT_BPSC_001_C09, PDT_BPSC_001_C09_LISTING_FINGERPRINT } from "../lib/pdt-bpsc-001-c09-new-listing";
import { verifyEtsyReadBackIdentity } from "../lib/etsy-readback-normalizer";

function observation(description: string) {
  return {
    title: PDT_BPSC_001_C09.title,
    description,
    price: { amount: 1290, divisor: 100, currency_code: "USD" },
    tags: [...PDT_BPSC_001_C09.tags],
    quantity: PDT_BPSC_001_C09.quantity,
    who_made: PDT_BPSC_001_C09.whoMade,
    when_made: PDT_BPSC_001_C09.whenMade,
    taxonomy_id: PDT_BPSC_001_C09.taxonomyId,
    type: "download",
    state: "draft"
  };
}

test("recovery-only normalizer decodes only observed Etsy apostrophe entities", () => {
  assert.equal(normalizePdtBpsc001C09EtsyDescriptionTransport("WHAT&#39;S INCLUDED"), "WHAT'S INCLUDED");
  assert.equal(normalizePdtBpsc001C09EtsyDescriptionTransport("WHAT&#x27;S INCLUDED"), "WHAT'S INCLUDED");
  assert.equal(normalizePdtBpsc001C09EtsyDescriptionTransport("WHAT&apos;S INCLUDED"), "WHAT'S INCLUDED");
  assert.equal(normalizePdtBpsc001C09EtsyDescriptionTransport("A &amp; B"), "A &amp; B");
});

test("observed Etsy apostrophe transport normalizes back to exact C09 fingerprint", () => {
  const encoded = PDT_BPSC_001_C09.description.replace("WHAT'S INCLUDED", "WHAT&#39;S INCLUDED");
  const normalized = normalizePdtBpsc001C09EtsyDescriptionTransport(encoded);
  assert.equal(typeof normalized, "string");
  const result = verifyEtsyReadBackIdentity(PDT_BPSC_001_C09_LISTING_FINGERPRINT, observation(normalized as string));
  assert.equal(result.status, "MATCH");
});

test("material description drift remains blocked after transport normalization", () => {
  const changed = PDT_BPSC_001_C09.description.replace("Manual planning / decision-support tool", "Automatic planning tool");
  const normalized = normalizePdtBpsc001C09EtsyDescriptionTransport(changed);
  const result = verifyEtsyReadBackIdentity(PDT_BPSC_001_C09_LISTING_FINGERPRINT, observation(normalized as string));
  assert.equal(result.status, "IDENTITY_MISMATCH");
});

test("fetch wrapper normalizes exact draft core GET only", async () => {
  const encoded = PDT_BPSC_001_C09.description.replace("WHAT'S INCLUDED", "WHAT&#39;S INCLUDED");
  const baseFetch = (async (input: string | URL | Request) => {
    return new Response(JSON.stringify({ listing_id: 4573789186, description: encoded, requestUrl: String(input) }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
  const wrapped = pdtBpsc001C09RecoveryEtsyFetch(baseFetch);
  const response = await wrapped("https://api.etsy.com/v3/application/listings/4573789186", { method: "GET" });
  const payload = await response.json();
  assert.equal(payload.description, PDT_BPSC_001_C09.description);

  const unrelated = await wrapped("https://api.etsy.com/v3/application/listings/999", { method: "GET" });
  const unrelatedPayload = await unrelated.json();
  assert.equal(unrelatedPayload.description, encoded);
});
