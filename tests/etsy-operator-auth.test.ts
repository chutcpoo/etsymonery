import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import {
  authorizeEtsyOperatorRequest,
  isEtsyOperatorProtectedPath
} from "../lib/etsy-operator-auth";

const AUTH_TOKEN = "test-only-operator-secret-1234567890-abcdefghij";

async function withOperatorToken<T>(
  token: string | undefined,
  run: () => Promise<T>
): Promise<T> {
  const original = process.env.ETSY_OPERATOR_READ_TOKEN;
  if (token === undefined) delete process.env.ETSY_OPERATOR_READ_TOKEN;
  else process.env.ETSY_OPERATOR_READ_TOKEN = token;
  try { return await run(); }
  finally {
    if (original === undefined) delete process.env.ETSY_OPERATOR_READ_TOKEN;
    else process.env.ETSY_OPERATOR_READ_TOKEN = original;
  }
}

function request(path: string, headers?: Record<string, string>, method = "GET") {
  return new NextRequest("https://publisher.example.test" + path, { headers, method });
}

test("private Etsy and control-center endpoints and pages are protected", () => {
  const protectedPaths = [
    "/", "/commerce", "/sales", "/events", "/factory",
    "/stats-evidence", "/connect/etsy", "/connect/etsy/",
    "/api/etsy/status", "/api/etsy/oauth/start",
    "/api/etsy/seller-state", "/api/etsy/control-center",
    "/api/etsy/commerce", "/api/etsy/events", "/api/etsy/drive-assets",
    "/api/etsy/drafts", "/api/etsy/listings/123/detail",
    "/api/etsy/listings/123/videos", "/api/control-center/status",
    "/api/control-center/v3/status"
  ];
  for (const path of protectedPaths) {
    assert.equal(isEtsyOperatorProtectedPath(path), true, path);
  }
});

test("OAuth PKCE callback and separately Bearer-protected read routes stay reachable", () => {
  for (const path of [
    "/api/health", "/api/platform/status", "/api/etsy/oauth/callback",
    "/api/etsy/listing-sales", "/api/etsy/reconcile-listings",
    "/p/offer", "/products/sample"
  ]) {
    assert.equal(isEtsyOperatorProtectedPath(path), false, path);
  }
});

test("missing/short server-side operator secret fails closed before route logic", async () => {
  for (const token of [undefined, "short"]) {
    await withOperatorToken(token, async () => {
      const response = await middleware(request("/api/etsy/commerce"));
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error, "ETSY_OPERATOR_AUTH_NOT_CONFIGURED");
      assert.equal(response.headers.get("cache-control")?.includes("no-store"), true);
    });
  }
});

test("anonymous, wrong, query-string and malformed credentials are rejected", async () => {
  await withOperatorToken(AUTH_TOKEN, async () => {
    const invalid = [
      request("/api/etsy/commerce"),
      request("/api/etsy/commerce", { authorization: "Bearer wrong" }),
      request("/api/etsy/commerce?token=" + AUTH_TOKEN),
      request("/api/etsy/commerce", { authorization: "Basic nonsense" }),
      request("/api/etsy/commerce", { authorization: "Bearer " + AUTH_TOKEN + " extra" }),
      request("/api/etsy/commerce", { authorization: "Basic " + Buffer.from("wrong:" + AUTH_TOKEN).toString("base64") })
    ];
    for (const req of invalid) {
      const response = await middleware(req);
      assert.equal(response.status, 401, req.url);
      assert.equal((await response.json()).error, "ETSY_OPERATOR_UNAUTHORIZED");
      assert.match(response.headers.get("www-authenticate") ?? "", /^Basic /);
    }
  });
});

test("valid Bearer and browser Basic credentials pass middleware", async () => {
  await withOperatorToken(AUTH_TOKEN, async () => {
    for (const path of ["/api/etsy/commerce", "/api/etsy/oauth/start", "/commerce", "/api/control-center/status"]) {
      for (const authorization of [
        "Bearer " + AUTH_TOKEN,
        "Basic " + Buffer.from("operator:" + AUTH_TOKEN).toString("base64")
      ]) {
        const response = await middleware(request(path, { authorization }));
        assert.equal(response.headers.get("x-middleware-next"), "1", path);
      }
    }
  });
});

test("HEAD is protected; legacy POST safety gate is unchanged", async () => {
  await withOperatorToken(AUTH_TOKEN, async () => {
    assert.equal((await middleware(request("/api/etsy/status", undefined, "HEAD"))).status, 401);
    assert.equal((await middleware(request("/api/etsy/commerce", undefined, "POST"))).status, 410);
    assert.equal((await middleware(request("/api/etsy/oauth/callback"))).headers.get("x-middleware-next"), "1");
    assert.equal((await middleware(request("/api/health"))).headers.get("x-middleware-next"), "1");
  });
});

test("the guard performs no network calls, has no write method and never echoes tokens", async () => {
  await withOperatorToken(AUTH_TOKEN, async () => {
    const response = await authorizeEtsyOperatorRequest(
      request("/api/etsy/seller-state", { authorization: "Bearer wrong" })
    );
    assert.equal(response?.status, 401);
    assert.doesNotMatch(await response!.text(), new RegExp(AUTH_TOKEN));
  });
});
