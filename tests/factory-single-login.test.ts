import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { GET, POST, DELETE } from "../app/api/auth/session/route";
import { hasOwnerSession, hasReaderSession, OWNER_COOKIE, READER_COOKIE } from "../lib/factory-owner-session";

const OWNER = "test-only-owner-token-d83e791a969d463190ed";
const READER = "test-only-reader-token-4c44f3ea168b456ca4ec";
const ROOT = "https://publisher.example.test";

function request(path: string, options: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(ROOT + path, options);
}

function post(mode: "owner" | "reader", password: string, origin = ROOT) {
  return request("/api/auth/session", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ mode, password })
  });
}

async function withTokens(run: () => Promise<void>) {
  const names = ["ETSY_OPERATOR_READ_TOKEN", "ETSY_PLAN_EDITOR_TOKEN"];
  const original = names.map(name => process.env[name]);
  process.env.ETSY_OPERATOR_READ_TOKEN = READER;
  process.env.ETSY_PLAN_EDITOR_TOKEN = OWNER;
  try { await run(); }
  finally { names.forEach((name, i) => {
    if (original[i] === undefined) delete process.env[name];
    else process.env[name] = original[i];
  }); }
}

test("login page and session handler remain reachable without a browser Basic challenge", async () => {
  await withTokens(async () => {
    for (const path of ["/login", "/api/auth/session"]) {
      const response = await middleware(request(path, { headers: { accept: "text/html" } }));
      assert.equal(response.headers.get("x-middleware-next"), "1");
    }
    const response = await middleware(request("/factory?tab=qa", { headers: { accept: "text/html" } }));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), ROOT + "/login?next=%2Ffactory%3Ftab%3Dqa");
    assert.equal(response.headers.get("www-authenticate"), null);
    const api = await middleware(request("/api/etsy/status"));
    assert.equal(api.status, 401);
    assert.equal(api.headers.get("www-authenticate"), null);
  });
});

test("one Owner login grants read access and Factory editing without a second password", async () => {
  await withTokens(async () => {
    assert.equal((await GET(request("/api/auth/session"))).status, 200);
    const response = await POST(post("owner", OWNER));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).role, "owner");
    const value = response.cookies.get(OWNER_COOKIE)?.value;
    assert.ok(value?.startsWith("factory-owner.v1."));
    assert.equal(response.cookies.get(READER_COOKIE)?.maxAge, 0);
    const cookie = OWNER_COOKIE + "=" + value;
    assert.equal(await hasOwnerSession(request("/factory", { headers: { cookie } })), true);
    const session = await GET(request("/api/auth/session", { headers: { cookie } }));
    assert.equal((await session.json()).role, "owner");

    for (const path of ["/", "/factory", "/sales", "/api/factory/workflow", "/api/etsy/status"]) {
      const guard = await middleware(request(path, { headers: { cookie } }));
      assert.equal(guard.headers.get("x-middleware-next"), "1", path);
    }
    const write = await middleware(request("/api/factory/workflow", {
      method: "POST",
      headers: { cookie, origin: ROOT }
    }));
    assert.equal(write.headers.get("x-middleware-next"), "1");
    const crossSite = await middleware(request("/api/factory/workflow", {
      method: "POST", headers: { cookie, origin: "https://attacker.example" }
    }));
    assert.equal(crossSite.status, 403);
    // Owner session is not an Etsy seller / QC approval token.
    const seller = await middleware(request("/api/product-plans/x/approve", {
      method: "POST", headers: { cookie, origin: ROOT }
    }));
    assert.notEqual(seller.headers.get("x-middleware-next"), "1");
  });
});

test("Viewer login supports read-only navigation, not Factory edits", async () => {
  await withTokens(async () => {
    const response = await POST(post("reader", READER));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).role, "reader");
    const cookie = READER_COOKIE + "=" + response.cookies.get(READER_COOKIE)?.value;
    assert.equal(await hasReaderSession(request("/factory", { headers: { cookie } })), true);
    assert.equal(await hasOwnerSession(request("/factory", { headers: { cookie } })), false);
    const readerStatus = await GET(request("/api/auth/session", { headers: { cookie } }));
    assert.equal((await readerStatus.json()).role, "reader");
    assert.equal((await middleware(request("/factory", { headers: { cookie } }))).headers.get("x-middleware-next"), "1");
    const denied = await middleware(request("/api/factory/workflow", {
      method: "POST", headers: { cookie, origin: ROOT }
    }));
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error, "FACTORY_EDITOR_CREDENTIAL_INVALID");
  });
});

test("invalid credentials, invalid origin, and malformed input fail without challenge or cookie", async () => {
  await withTokens(async () => {
    for (const req of [
      post("owner", READER),
      post("reader", OWNER),
      post("owner", "wrong password"),
      post("owner", OWNER, "https://attacker.example")
    ]) {
      const response = await POST(req);
      assert.ok(response.status === 401 || response.status === 403);
      assert.equal(response.headers.get("www-authenticate"), null);
      assert.equal(response.cookies.get(OWNER_COOKIE), undefined);
    }
    const malformed = await POST(request("/api/auth/session", {
      method: "POST", headers: { origin: ROOT, "content-type": "text/plain" }, body: OWNER
    }));
    assert.equal(malformed.status, 415);
  });
});

test("signing out revokes both role cookies and requires same origin", async () => {
  await withTokens(async () => {
    const loggedIn = await POST(post("owner", OWNER));
    const value = loggedIn.cookies.get(OWNER_COOKIE)?.value;
    assert.ok(value);
    const denied = await DELETE(request("/api/auth/session", { method: "DELETE", headers: { origin: "https://attacker.example" } }));
    assert.equal(denied.status, 403);
    const response = await DELETE(request("/api/auth/session", { method: "DELETE", headers: { origin: ROOT, cookie: OWNER_COOKIE + "=" + value } }));
    assert.equal(response.status, 200);
    assert.equal(response.cookies.get(OWNER_COOKIE)?.maxAge, 0);
    assert.equal(response.cookies.get(READER_COOKIE)?.maxAge, 0);
  });
});
