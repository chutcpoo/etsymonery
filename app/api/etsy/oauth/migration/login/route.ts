import { NextRequest, NextResponse } from "next/server";
import { authorizeEtsyOperatorRequest, privateHeaders } from "../../../../../../lib/etsy-operator-auth";
import { createSellerBrowserSession, SELLER_SESSION_COOKIE } from "../../../../../../lib/etsy-oauth-browser-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginHeaders = {
  ...privateHeaders,
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "x-frame-options": "DENY"
};

function page(message = "", status = 200) {
  // No third-party scripts, tracking, links, or password echo.
  const notice = message ? "<p role=\"alert\">" + message + "</p>" : "";
  return new NextResponse(`<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>เข้าสู่ระบบเพื่อเชื่อม Etsy</title></head>
<body><main>
<h1>เข้าสู่ระบบเพื่อเชื่อม Etsy</h1>
<p>ใช้รหัส Seller Approver ที่บันทึกไว้ใน Keychain บน Mac
ชื่อรายการ: AutoDigitalPublisher Production - ETSY_SELLER_APPROVER_TOKEN</p>
${notice}
<form method="post" action="/api/etsy/oauth/migration/login">
<label for="password">รหัส Seller Approver</label>
<input id="password" name="password" type="password" required autocomplete="off">
<button type="submit">เข้าสู่ระบบ</button>
</form>
<p>การเชื่อมต่อจะขอสิทธิ์ listings_r (อ่านรายการสินค้า) เท่านั้น
และยังไม่เปิดการเขียนสินค้าหรือสลับ Token เดิม</p>
</main></body></html>`, { status, headers: loginHeaders });
}

function disabled() {
  return NextResponse.json(
    { status: "BLOCKED", error: "OAUTH_GRANT_CHANGE_REQUIRES_OWNER" },
    { status: 403, headers: privateHeaders }
  );
}

export async function GET() {
  if (process.env.ETSY_OAUTH_MIGRATION_ENABLED !== "true") return disabled();
  return page();
}

export async function POST(request: NextRequest) {
  if (process.env.ETSY_OAUTH_MIGRATION_ENABLED !== "true") return disabled();
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin ||
      request.headers.get("sec-fetch-site") === "cross-site")
    return NextResponse.json({ error: "CROSS_SITE_LOGIN_FORBIDDEN" },
      { status: 403, headers: privateHeaders });
  if (!(request.headers.get("content-type") ?? "").startsWith("application/x-www-form-urlencoded"))
    return NextResponse.json({ error: "FORM_REQUIRED" },
      { status: 415, headers: privateHeaders });
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length > 2048)
    return NextResponse.json({ error: "FORM_TOO_LARGE" },
      { status: 413, headers: privateHeaders });
  let password: FormDataEntryValue | null = null;
  try {
    const data = await request.formData();
    if (data.getAll("password").length !== 1) return page("กรอกรหัส Seller Approver", 400);
    password = data.get("password");
  } catch { return page("ไม่สามารถอ่านข้อมูลได้", 400); }
  if (typeof password !== "string" || password.length < 32 || password.length > 512)
    return page("รหัสไม่ถูกต้อง", 401);
  const denied = await authorizeEtsyOperatorRequest({
    headers: new Headers({ authorization: "Bearer " + password })
  }, "seller", false);
  if (denied) return denied.status === 503
    ? denied : page("รหัสไม่ถูกต้อง", 401);
  const response = NextResponse.redirect(
    new URL("/api/etsy/oauth/migration/launch", request.url),
    { status: 303, headers: privateHeaders }
  );
  response.cookies.set(SELLER_SESSION_COOKIE, await createSellerBrowserSession(), {
    httpOnly: true, secure: true, sameSite: "lax",
    path: "/api/etsy/oauth", maxAge: 600
  });
  return response;
}
