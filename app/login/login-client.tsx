"use client";

import { useEffect, useState, type FormEvent } from "react";

type Mode = "owner" | "reader";
type SessionResponse = { authenticated?: boolean; role?: Mode | null; error?: string };

export default function LoginClient({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("owner");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState<Mode | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" })
      .then(r => r.json() as Promise<SessionResponse>)
      .then(data => { if (active && data.authenticated) setExisting(data.role ?? null); })
      .catch(() => { /* Login page remains usable when session checking fails. */ });
    return () => { active = false; };
  }, []);

  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !password.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, password })
      });
      const data = await response.json() as SessionResponse;
      if (!response.ok) {
        if (data.error === "LOGIN_NOT_CONFIGURED") {
          setError("ยังไม่ได้ตั้งค่ารหัสสำหรับสิทธิ์นี้ใน Vercel Preview กรุณาตรวจ Environment Variables");
        } else if (data.error === "LOGIN_ORIGIN_DENIED") {
          setError("คำขอเข้าสู่ระบบไม่ตรงกับเว็บไซต์นี้ กรุณาเปิดหน้า Login ใหม่");
        } else {
          setError("รหัสผ่านไม่ถูกต้อง กรุณาตรวจว่าคุณเลือก Owner หรือ Viewer ตรงกับรหัสที่มี");
        }
        return;
      }
      setPassword("");
      window.location.assign(next);
    } catch {
      setError("เชื่อมต่อระบบเข้าสู่ระบบไม่ได้ กรุณาลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authPage">
      <div className="authGlow authGlowA" aria-hidden="true" />
      <div className="authGlow authGlowB" aria-hidden="true" />
      <header className="authHeader">
        <a className="authBrand" href="/login" aria-label="Mosselora Product Factory">
          <span className="authBrandMark">M</span>
          <span className="authBrandText"><strong>MOSSELORA</strong><small>PRODUCT FACTORY</small></span>
        </a>
        <span className="authHeaderLabel"><span className="authStatusDot" /> PRIVATE WORKSPACE</span>
      </header>

      <main className="authMain">
        <section className="authStory" aria-label="Product Factory overview">
          <div className="authEyebrow"><span className="authEyebrowDash" /> YOUR WORKSPACE, SIMPLIFIED</div>
          <h1>Build with clarity.<br /><span>Ship with confidence.</span></h1>
          <p className="authStoryLead">พื้นที่ทำงานสำหรับจัดการผลิตภัณฑ์ดิจิทัล ตั้งแต่การวิเคราะห์ตลาด จนถึงการตรวจรับคุณภาพก่อนเผยแพร่</p>
          <div className="authWorkflowGraphic" aria-label="Research, Build, Quality Assurance, Release">
            <div className="authStep"><span className="authStepIndex">01</span><div><strong>Research</strong><small>Demand & buyer needs</small></div><span className="authStepSymbol">↗</span></div>
            <div className="authStep"><span className="authStepIndex">02</span><div><strong>Build</strong><small>Product architecture</small></div><span className="authStepSymbol">↗</span></div>
            <div className="authStep"><span className="authStepIndex">03</span><div><strong>Quality assurance</strong><small>Evidence before release</small></div><span className="authStepSymbol">↗</span></div>
          </div>
          <div className="authStoryFoot"><span className="authFootLine" /> ONE SIGN-IN · ONE SECURE SESSION</div>
        </section>

        <section className="authCard" aria-labelledby="auth-title">
          <div className="authCardTop">
            <div className="authLockSymbol" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
                <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5M12 14.5v2.3" />
              </svg>
            </div>
            <span className="authSessionBadge">SECURE ACCESS</span>
          </div>
          <h2 id="auth-title">เข้าสู่ระบบ</h2>
          <p className="authCardSubtitle">ลงชื่อเข้าใช้เพียงครั้งเดียวเพื่อเข้าสู่ Product Factory ไม่ต้องกรอกรหัสซ้ำเมื่อเปลี่ยนหน้า</p>
          {existing ? (
            <div className="authExisting" role="status">
              <span className="authExistingIcon">✓</span>
              <div><strong>คุณเข้าสู่ระบบอยู่แล้ว</strong><p>สิทธิ์ปัจจุบัน: {existing === "owner" ? "Factory Owner" : "Viewer"}</p></div>
              <a className="authContinue" href={next}>เข้าสู่ Factory <span aria-hidden="true">→</span></a>
              <button type="button" className="authSwitch" onClick={() => setExisting(null)}>ใช้รหัสอื่น</button>
            </div>
          ) : (
            <form onSubmit={onLogin} className="authForm">
              <fieldset className="authModeFieldset">
                <legend>ประเภทการเข้าใช้งาน</legend>
                <div className="authModeSelector" role="group" aria-label="ประเภทการเข้าใช้งาน">
                  <button type="button" className={mode === "owner" ? "authMode active" : "authMode"}
                    aria-pressed={mode === "owner"} onClick={() => { setMode("owner"); setError(""); }}>
                    <span>Owner</span><small>ดูและจัดการ Factory</small>
                  </button>
                  <button type="button" className={mode === "reader" ? "authMode active" : "authMode"}
                    aria-pressed={mode === "reader"} onClick={() => { setMode("reader"); setError(""); }}>
                    <span>Viewer</span><small>ดูข้อมูลอย่างเดียว</small>
                  </button>
                </div>
              </fieldset>
              <label className="authPasswordLabel" htmlFor="factory-password">รหัสผ่าน {mode === "owner" ? "Factory Owner" : "Viewer"}</label>
              <div className="authPasswordWrap">
                <input id="factory-password" type={showPassword ? "text" : "password"} autoComplete="current-password"
                  required minLength={32} maxLength={512} autoFocus value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="กรอกรหัสผ่านของคุณ"
                  aria-invalid={!!error} aria-describedby={error ? "auth-error" : "auth-hint"} />
                <button className="authReveal" type="button" aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  onClick={() => setShowPassword(v => !v)}>{showPassword ? "ซ่อน" : "แสดง"}</button>
              </div>
              <p className="authPasswordHint" id="auth-hint">รหัส {mode === "owner" ? "Factory Owner" : "Viewer"} กำหนดใน Vercel และไม่ถูกเก็บใน Local Storage</p>
              {error && <p className="authError" id="auth-error" role="alert">{error}</p>}
              <button className="authSubmit" type="submit" disabled={busy || password.length < 32}>
                <span>{busy ? "กำลังตรวจสอบ…" : "เข้าสู่ Product Factory"}</span>
                <span aria-hidden="true">→</span>
              </button>
            </form>
          )}
          <div className="authCardDivider" />
          <p className="authSecurityText"><span aria-hidden="true">●</span> เซสชันเข้ารหัสลงลายเซ็น · ใช้ได้สูงสุด 12 ชั่วโมง · ออกจากระบบได้ทุกเมื่อ</p>
        </section>
      </main>
      <footer className="authFooter"><span>© MOSSELORA STUDIO</span><span>PRODUCT OPERATIONS · PRIVATE PREVIEW</span></footer>
    </div>
  );
}
