import assert from "node:assert/strict";
import test from "node:test";
import { verifyAnonymousFactory } from "./factory-auth-probe.mjs";

const origin = "https://publisher.example.test";
const loginPath = "/login?next=%2Ffactory";
const privateHeaders = { "cache-control": "private, no-store, max-age=0" };

function navigation(location = loginPath, headers = privateHeaders, body = null) {
  return new Response(body, { status: 307, headers: { ...headers, location } });
}

function denied(status = 401, fields = {}) {
  return Response.json({
    status: "BLOCKED",
    error: "ETSY_OPERATOR_UNAUTHORIZED",
    ETSY_WRITE_COUNT: 0,
    ...fields
  }, { status, headers: privateHeaders });
}

function fixture({ redirect = navigation(), factory = denied(), workflow = denied(),
  login = new Response('<input id="factory-password">', { headers: privateHeaders }) } = {}) {
  const expected = [
    ["/factory", "text/html", redirect],
    ["/factory", "application/json", factory],
    ["/api/factory/workflow", "application/json", workflow],
    [loginPath, "text/html", login]
  ];
  return async (url, options) => {
    const call = expected.shift();
    assert.ok(call, "Unexpected request");
    assert.equal(url.href, origin + call[0]);
    assert.deepEqual(options.headers, { accept: call[1] });
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "manual");
    assert.equal(options.credentials, "omit");
    return call[2];
  };
}

test("accepts only the intended login redirect with explicit anonymous data denial", async () => {
  assert.equal(await verifyAnonymousFactory(origin, fixture()), origin + loginPath);
  assert.equal(await verifyAnonymousFactory(origin, fixture({ redirect: navigation(origin + loginPath, privateHeaders, origin + loginPath) })), origin + loginPath);
});

test("rejects destinations outside the exact login contract without following them", async () => {
  for (const location of [
    "https://other.example.test" + loginPath, "//other.example.test" + loginPath,
    "http://publisher.example.test" + loginPath, origin + "/factory",
    "/login?next=https://other.example.test", loginPath + "&next=%2Fother",
    loginPath + "#unexpected", "/login", "http://[invalid"
  ]) {
    let calls = 0;
    await assert.rejects(verifyAnonymousFactory(origin, async () => {
      assert.equal(++calls, 1);
      return navigation(location);
    }), /expected same-origin/);
    assert.equal(calls, 1);
  }
});

test("rejects missing Location, cacheable redirects, Basic challenges and redirect bodies", async () => {
  await assert.rejects(verifyAnonymousFactory(origin, fixture({
    redirect: new Response(null, { status: 307, headers: privateHeaders })
  })), /missing Location/);
  await assert.rejects(verifyAnonymousFactory(origin, fixture({
    redirect: navigation(loginPath, { "cache-control": "public, max-age=60" })
  })), /non-cacheable/);
  await assert.rejects(verifyAnonymousFactory(origin, fixture({
    redirect: navigation(loginPath, { ...privateHeaders, "www-authenticate": 'Basic realm="Factory"' })
  })), /unexpected HTTP auth challenge/);
  await assert.rejects(verifyAnonymousFactory(origin, fixture({
    redirect: navigation(loginPath, privateHeaders, "Factory data")
  })), /unexpected redirect body/);
});

test("reports redirect metadata without exposing body or arbitrary Content-Type parameters", async () => {
  for (const [body, contentType, expectedType, expectedBytes] of [
    ["Redirecting...", "text/plain; charset=utf-8", "text/plain", 14],
    ['{"records":["fixture-private-value"]}', "application/json; tag=fixture-private-value", "application/json", 37],
    ["<h1>fixture-private-value</h1>", "text/html", "text/html", 30],
    ["\ufeff" + loginPath, "text/plain", "text/plain", 25],
    ["x", "application/x-fixture-private-value", "other", 1]
  ]) {
    await assert.rejects(
      verifyAnonymousFactory(origin, fixture({
        redirect: navigation(loginPath, { ...privateHeaders, "content-type": contentType }, body)
      })),
      error => {
        assert.equal(error.message,
          `/factory: unexpected redirect body (status=307, location=verified same-origin /login?next=%2Ffactory, content-type=${expectedType}, body-bytes=${expectedBytes})`);
        assert.doesNotMatch(error.message, /fixture-private-value/);
        return true;
      }
    );
  }
});

test("rejects misconfigured auth, exposed data and a missing login form", async () => {
  for (const response of [denied(503), denied(200), navigation()]) {
    await assert.rejects(verifyAnonymousFactory(origin, fixture({ workflow: response })), /expected configured auth/);
  }
  await assert.rejects(verifyAnonymousFactory(origin, fixture({
    factory: denied(401, { records: [{ productId: "M01" }] })
  })), /expected only the authorization error/);
  await assert.rejects(verifyAnonymousFactory(origin, fixture({
    login: new Response("Unexpected content", { headers: privateHeaders })
  })), /missing sign-in input/);
});
