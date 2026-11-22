import test from "node:test";
import assert from "node:assert/strict";
import { hasOwnerSession, issueOwnerSession, OWNER_COOKIE, validSameOrigin, authorizeFactoryMutation } from "../lib/factory-owner-session";
const secret = "fixture-owner-session-secret-0123456789-abcdef";
test("owner session is signed, expires, and cannot be forged", async () => {
  process.env.ETSY_PLAN_EDITOR_TOKEN = secret;
  try {
    const session = await issueOwnerSession();
    const request = (value: string) => new Request("https://publisher.example/api/factory/workflow", { headers: { cookie: `${OWNER_COOKIE}=${value}`, origin: "https://publisher.example" } });
    assert.equal(await hasOwnerSession(request(session.value)), true);
    assert.equal(await hasOwnerSession(request(session.value.replace(/.$/, "0"))), false);
    assert.equal(await hasOwnerSession(request("fake")), false);
    assert.equal(await authorizeFactoryMutation(request(session.value)), null);
    assert.equal(await authorizeFactoryMutation(new Request("https://publisher.example/api/factory/workflow", { headers: { cookie: `${OWNER_COOKIE}=${session.value}`, origin: "https://evil.example" } })), "FACTORY_ORIGIN_DENIED");
    assert.equal(validSameOrigin(request(session.value)), true);
  } finally { delete process.env.ETSY_PLAN_EDITOR_TOKEN; }
});
test("anonymous and cross-origin workflow mutations are blocked", async () => {
  const req = new Request("https://publisher.example/api/factory/workflow", { method: "POST", headers: { origin: "https://evil.example" } });
  assert.equal(await authorizeFactoryMutation(req), "FACTORY_OWNER_SESSION_REQUIRED");
  assert.equal(validSameOrigin(req), false);
});
