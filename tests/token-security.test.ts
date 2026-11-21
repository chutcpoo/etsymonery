import test from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret } from "../lib/token-crypto";
import { fetchEtsyReadWithRetry } from "../lib/etsy-http";

test("token encryption uses a fresh nonce and authenticates ciphertext, envelope and key", () => {
  process.env.TOKEN_ENCRYPTION_KEY = "test-only-storage-key-fixture-0000000001";
  const fixture = "synthetic-oauth-value";
  const saved = encryptSecret(fixture);
  assert.notEqual(saved, encryptSecret(fixture));
  assert.ok(!saved.includes(fixture));
  assert.equal(decryptSecret(saved), fixture);
  const fields = saved.split(":");
  const bytes = Buffer.from(fields[3], "base64url");
  bytes[0] ^= 1;
  fields[3] = bytes.toString("base64url");
  assert.throws(() => decryptSecret(fields.join(":")));
  assert.throws(() => decryptSecret(saved + ":extra"));
  process.env.TOKEN_ENCRYPTION_KEY = "test-only-storage-key-fixture-0000000002";
  assert.throws(() => decryptSecret(saved));
  delete process.env.TOKEN_ENCRYPTION_KEY;
  assert.throws(() => encryptSecret(fixture));
});

test("read retry guard checks the effective method of a Request object", async () => {
  let calls = 0;
  await assert.rejects(fetchEtsyReadWithRetry(async () => { calls++; return new Response(); },
    new Request("https://fixture.test", { method: "POST" })), /WRITE_FORBIDDEN/);
  assert.equal(calls, 0);
});
