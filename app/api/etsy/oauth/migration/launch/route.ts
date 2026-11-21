import { NextRequest, NextResponse } from "next/server";
import { privateHeaders } from "../../../../../../lib/etsy-operator-auth";
import { authorizeSellerOAuthBrowserGet } from "../../../../../../lib/etsy-oauth-browser-session";

export const dynamic = "force-dynamic";

// This is an inert, authenticated entry page: no OAuth state, token, or
// durable session is created until the owner clicks the same-origin link.
const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>เชื่อมต่อ Etsy — Read-only</title>
</head>
<body>
<main>
<h1>เชื่อมต่อ Etsy แบบอ่านอย่างเดียว</h1>
<p>ระบบจะขอสิทธิ์ <strong>listings_r</strong> สำหรับอ่านรายการสินค้าของร้านเท่านั้น
และยังไม่เปลี่ยน Token ที่ใช้งานอยู่หรือเปิดการเขียนสินค้า</p>
<p>กดปุ่มด้านล่างเพื่อเริ่มการยืนยันตัวตนกับ Etsy</p>
<p><a href="/api/etsy/oauth/start">เริ่มเชื่อมต่อ Etsy</a></p>
</main>
</body>
</html>`;

export async function GET(request: NextRequest) {
  if (process.env.ETSY_OAUTH_MIGRATION_ENABLED !== "true")
    return NextResponse.json({ status: "BLOCKED", error: "OAUTH_GRANT_CHANGE_REQUIRES_OWNER" },
      { status: 403, headers: privateHeaders });
  const denied = await authorizeSellerOAuthBrowserGet(request);
  if (denied) return denied;
  return new NextResponse(html, {
    status: 200,
    headers: {
      ...privateHeaders,
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "x-frame-options": "DENY"
    }
  });
}
