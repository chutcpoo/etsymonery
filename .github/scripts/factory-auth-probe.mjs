import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { isDeepStrictEqual } from "node:util";

function assertPrivate(response, path) {
  const directives = (response.headers.get("cache-control") ?? "").toLowerCase().split(",").map(value => value.trim());
  assert.ok(directives.includes("private") && directives.includes("no-store") && !directives.includes("public"),
    `${path}: expected private, non-cacheable response`);
  assert.equal(response.headers.has("www-authenticate"), false, `${path}: unexpected HTTP auth challenge`);
}

function redirectContentType(response) {
  const type = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (!type) return "absent";
  return ["text/plain", "text/html", "application/json", "application/octet-stream"].includes(type)
    ? type : "other";
}

export async function verifyAnonymousFactory(origin, transport = fetch) {
  const factoryUrl = new URL("/factory", origin);
  const request = (url, accept) => transport(url, {
    method: "GET",
    headers: { accept },
    redirect: "manual",
    credentials: "omit",
    signal: globalThis.AbortSignal.timeout(15_000)
  });

  const navigation = await request(factoryUrl, "text/html");
  assert.equal(navigation.status, 307, "/factory (HTML): expected login redirect");
  assertPrivate(navigation, "/factory (HTML)");
  const location = navigation.headers.get("location");
  assert.ok(location, "/factory: missing Location");
  const loginUrl = new URL("/login?next=%2Ffactory", factoryUrl);
  assert.ok(URL.canParse(location, factoryUrl) && new URL(location, factoryUrl).href === loginUrl.href,
    "/factory: expected same-origin /login with exactly next=/factory");
  const redirectBody = Buffer.from(await navigation.arrayBuffer());
  assert.ok(redirectBody.length === 0 || redirectBody.equals(Buffer.from(location)),
    `/factory: unexpected redirect body (status=${navigation.status}, location=verified same-origin /login?next=%2Ffactory, content-type=${redirectContentType(navigation)}, body-bytes=${redirectBody.length})`);

  for (const path of ["/factory", "/api/factory/workflow"]) {
    const response = await request(new URL(path, origin), "application/json");
    assert.equal(response.status, 401, `${path} (JSON): expected configured auth to deny anonymous access`);
    assert.equal(response.headers.has("location"), false, `${path} (JSON): unexpected redirect`);
    assertPrivate(response, path);
    const payload = await response.json().catch(() => null);
    assert.ok(isDeepStrictEqual(payload, {
      status: "BLOCKED",
      error: "ETSY_OPERATOR_UNAUTHORIZED",
      ETSY_WRITE_COUNT: 0
    }), `${path} (JSON): expected only the authorization error`);
  }

  const login = await request(loginUrl, "text/html");
  assert.equal(login.status, 200, "/login: expected the login page");
  assertPrivate(login, "/login");
  assert.ok(/<input\b[^>]*\bid="factory-password"/.test(await login.text()), "/login: missing sign-in input");
  return loginUrl.href;
}
