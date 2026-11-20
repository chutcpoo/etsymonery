import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const origin = "http://127.0.0.1:3147";
const read = "ci-fixture-read-0123456789-0123456789";
const editor = "ci-fixture-editor-0123456789-0123456789";
const seller = "ci-fixture-seller-0123456789-0123456789";
const proc = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3147"], {
  env: { PATH: process.env.PATH, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
    ETSY_OPERATOR_READ_TOKEN: read, ETSY_PLAN_EDITOR_TOKEN: editor, ETSY_SELLER_APPROVER_TOKEN: seller },
  stdio: "inherit"
});
const stopped = once(proc, "exit");
function send(path, method = "GET", token, body) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  return fetch(origin + path, { method, headers, body: body && JSON.stringify(body) });
}
try {
  let ready = false;
  for (let i = 0; i < 60 && proc.exitCode === null; i++) {
    try { if ((await send("/api/health")).ok) { ready = true; break; } } catch {}
    await delay(250);
  }
  assert.ok(ready);
  for (const path of ["/", "/api/platform/status", "/api/etsy/status", "/api/internal/etsy/reset-status",
    "/api/control-center/status", "/api/product-plans/example", "/p", "/factory", "/stats-evidence"])
    assert.equal((await send(path)).status, 401, path);
  for (const path of ["/api/etsy/release", "/api/etsy/drafts", "/api/internal/etsy/post-reset-v2/pdt-fcmp-002/publish-r01"]) {
    const denied = await send(path, "POST", read, { approved: true });
    assert.equal(denied.status, 403); assert.ok((await denied.json()).missing.includes("INDEPENDENT_QC"));
  }
  for (const path of ["/api/etsy/commerce", "/sales", "/api/etsy/oauth/callback", "/p"]) assert.equal((await send(path, "GET", read)).status, 403);
  const status = await send("/api/platform/status", "GET", read);
  assert.equal(status.status, 503); assert.equal((await status.json()).liveCatalogCount, null);
  assert.match(status.headers.get("cache-control"), /no-store/);
  const oauth = await send("/api/etsy/status", "GET", read);
  assert.equal(oauth.status, 200); assert.deepEqual((await oauth.json()).requestedScopes, ["listings_r"]);
  assert.equal((await send("/api/products/prepare", "POST", read, {})).status, 401);
  assert.equal((await send("/api/products/prepare", "POST", editor, {})).status, 503);
  assert.equal((await send("/api/products/fixture/build", "POST", editor, {})).status, 503);
  assert.equal((await send("/api/product-plans/fixture/approve", "POST", editor, {})).status, 401);
  assert.equal((await send("/api/product-plans/fixture/approve", "POST", seller, {})).status, 503);
  console.log("PASS authenticated operator smoke checks on loopback");
} finally {
  proc.kill(); await stopped;
}
