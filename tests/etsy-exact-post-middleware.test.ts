import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

const roles = {
  read: "ETSY_OPERATOR_READ_TOKEN", plan: "ETSY_PLAN_EDITOR_TOKEN",
  qc: "ETSY_QC_REVIEWER_TOKEN", seller: "ETSY_SELLER_APPROVER_TOKEN"
};
const token = (role: string) => "fixture-for-local-security-test-only-" + role;

test("every API file rejects anonymous calls and all non-allowlisted operations stay locked", async () => {
  for (const [role, key] of Object.entries(roles)) process.env[key] = token(role);
  try {
    for (const file of readdirSync("app/api", { recursive: true, encoding: "utf8" })) {
      if (!file.endsWith("/route.ts")) continue;
      const path = "/api/" + file.slice(0, -9).replace(/\[\w+\]/g, "fixture").replace("/factory/workflow/fixture", "/factory/workflow/00000000-0000-4000-8000-000000000001");
      if (path === "/api/health") continue;
      for (const method of ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]) {
        const call = (role?: string) => middleware(new NextRequest("https://example.test" + path, { method,
          headers: role ? { authorization: "Bearer " + token(role) } : {} }));
        assert.equal((await call()).status, 401, method + " " + path);
        const read = ["GET", "HEAD"].includes(method);
        const allowedRead = read && !(method === "HEAD" && path === "/api/factory/owner-session") && (["/api/etsy/status", "/api/etsy/seller-state", "/api/platform/status", "/api/product-plans/fixture", "/api/product-plans/create", "/api/factory/workflow", "/api/factory/owner-session", "/api/factory/workflow/00000000-0000-4000-8000-000000000001"].includes(path));
        const expected = method === "PATCH" && path === "/api/factory/workflow/00000000-0000-4000-8000-000000000001" ? "plan" : method === "POST" ? ({
          "/api/product-plans/create": "plan", "/api/product-plans/fixture/qc": "qc",
          "/api/product-plans/fixture/approve": "seller", "/api/products/fixture/build": "plan",
          "/api/products/prepare": "plan", "/api/factory/workflow": "plan", "/api/factory/owner-session": "plan"
        } as Record<string, string>)[path] : undefined;
        assert.equal((await call("read")).headers.has("x-middleware-next"), allowedRead, method + " " + path);
        if (expected) {
          assert.equal((await call(expected)).headers.has("x-middleware-next"), true);
          for (const other of Object.keys(roles).filter(role => role !== expected))
            assert.equal((await call(other)).status, 401);
        }
      }
    }
  } finally {
    for (const key of Object.values(roles)) delete process.env[key];
  }
});

test("owner read-only dashboard pages are accessible only to the read role", async () => {
  for (const [role, key] of Object.entries(roles)) process.env[key] = token(role);
  try {
    for (const path of ["/", "/factory", "/sales", "/commerce", "/events", "/stats-evidence", "/connect/etsy"]) {
      const anonymous = await middleware(new NextRequest("https://example.test" + path));
      assert.equal(anonymous.status, 401, path);
      const authorized = await middleware(new NextRequest("https://example.test" + path, {
        headers: { authorization: "Bearer " + token("read") }
      }));
      assert.equal(authorized.headers.has("x-middleware-next"), true, path);
      const write = await middleware(new NextRequest("https://example.test" + path, {
        method: "POST", headers: { authorization: "Bearer " + token("read") }
      }));
      assert.equal(write.status, 403, path);
    }
  } finally {
    for (const key of Object.values(roles)) delete process.env[key];
  }
});
