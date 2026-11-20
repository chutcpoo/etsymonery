import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

function call(path: string, method: string, headers?: Record<string, string>) {
  return middleware(new NextRequest("https://publisher.example.test"+path,{method, headers}));
}
test("source-only authenticated preflight reaches its safe POST handler",async()=>{
  const r=await call("/api/etsy/chat-assets/source-preflight","POST");
  assert.equal(r.headers.get("x-middleware-next"),"1");
});
test("new guarded Draft and Release POST routes are exact allowlist entries",async()=>{
 for(const path of ["/api/etsy/chat-assets","/api/etsy/drafts","/api/etsy/release"]){
   const r=await call(path,"POST");
   assert.equal(r.headers.get("x-middleware-next"),"1",path);
 }
});
test("legacy endpoints, unknown routes and unsafe methods are still catalog-reset",async()=>{
 for(const [path,method]of[
  ["/api/etsy/draft-assets","POST"],
  ["/api/etsy/active-listing-update","POST"],
  ["/api/etsy/not-whitelisted","POST"],
  ["/api/etsy/chat-assets/source-preflight/other","POST"],
  ["/api/etsy/chat-assets/source-preflight","PATCH"],
  ["/api/etsy/drafts","DELETE"],
  ["/api/etsy/release","PUT"],
  ["/api/publish","POST"],
  ["/api/internal/etsy/deprecated-operation","POST"]
 ]){
   const r=await call(path,method);
   assert.equal(r.status,410,`${method} ${path}`);
   const data=await r.json();
   assert.equal(data.status,"CATALOG_RESET");
   assert.equal(data.ETSY_WRITE_COUNT,0);
 }
});
test("existing safe GET requires operator credentials",async()=>{
  const old = process.env.ETSY_OPERATOR_READ_TOKEN;
  process.env.ETSY_OPERATOR_READ_TOKEN = "unit-test-only-not-a-real-secret-1234567890";
  try {
    const denied = await call("/api/etsy/status","GET");
    assert.equal(denied.status,401);
    const allowed = await call("/api/etsy/status","GET",{
      authorization: "Bearer unit-test-only-not-a-real-secret-1234567890"
    });
    assert.equal(allowed.headers.get("x-middleware-next"),"1");
  } finally {
    if (old === undefined) delete process.env.ETSY_OPERATOR_READ_TOKEN;
    else process.env.ETSY_OPERATOR_READ_TOKEN = old;
  }
});
