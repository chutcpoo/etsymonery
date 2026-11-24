"use client";
import { useEffect, useState } from "react";
import type { WorkflowItem } from "../../lib/local-factory-workflow";
import { workflowErrorMessage } from "../../lib/workflow-feedback";
import type { ProductReleaseCandidate } from "../../lib/product-release-evidence";
import ReleaseEvidenceEditor from "./release-evidence-editor";

export default function WorkflowBoard({ initialItems, loadError }: { initialItems: WorkflowItem[]; loadError: string | null }) {
  const [items, setItems] = useState(initialItems);
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => { void fetch("/api/factory/owner-session", { cache: "no-store" })
    .then(r => r.json()).then(x => setAuthenticated(x.authenticated === true))
    .catch(() => setMessage("Could not verify Factory owner session"))
    .finally(() => setChecking(false)); }, []);
  async function login() {
    setBusy(true); setMessage("");
    try { const r = await fetch("/api/factory/owner-session", { method: "POST", headers: { authorization: `Bearer ${password}`, "content-type": "application/json" }, credentials: "same-origin" });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        if (data.error === "FACTORY_EDITOR_AUTH_NOT_CONFIGURED") throw Error("Factory Editor is not configured correctly in Production. Check the Vercel environment variable and redeploy.");
        throw Error("Factory Editor credential was not accepted. Check the Production value in Vercel; do not use the website operator password.");
      }
      setAuthenticated(true); setPassword(""); setMessage("Factory owner session active for up to four hours.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Login failed"); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { const r = await fetch("/api/factory/owner-session", { method: "DELETE", credentials: "same-origin" });
      if (!r.ok) throw Error("Sign out failed"); setAuthenticated(false); setMessage("Factory owner session ended.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Sign out failed"); }
    finally { setBusy(false); }
  }
  const [title, setTitle] = useState("");
  const [buyer, setBuyer] = useState("");
  const [message, setMessage] = useState(loadError ?? "");
  const [busy, setBusy] = useState(false);
  async function send(path: string, method: "POST" | "PATCH", data: object): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!authenticated) { const error = "Sign in as Factory owner before editing."; setMessage(error); return { ok: false, error }; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path, { method, headers: { "content-type": "application/json" }, credentials: "same-origin", cache: "no-store", body: JSON.stringify(data) });
      const body = await response.json();
      if (!response.ok) throw Error(workflowErrorMessage(typeof body.error === "string" ? body.error : `HTTP_${response.status}`));
      const item = body.item as WorkflowItem;
      setItems(previous => [item, ...previous.filter(x => x.id !== item.id)]);
      if (method === "POST") { setTitle(""); setBuyer(""); }
      setMessage(`${item.title}: ${item.stage} saved locally. No Etsy changes.`);
      return { ok: true };
    } catch (error) { const message = error instanceof Error ? error.message : "Workflow update failed"; setMessage(message); return { ok: false, error: message }; }
    finally { setBusy(false); }
  }
  return <section className="listingStack">
    <div><h2>Local production workflow</h2><p>Create and advance internal digital-product tasks. Etsy listing data above is read-only and independent. Stages: Research → Blueprint → Build → QA → Ready → Published (manual evidence only).</p></div>
    <article className="listingCard">
      {checking ? <p>Checking Factory owner session…</p> : authenticated ?
        <div className="workflowActions"><p>Owner session active · Local workflow editing enabled</p><button className="connectButton buttonReset" disabled={busy} type="button" onClick={() => void logout()}>Sign out of Factory</button></div> :
        <form className="workflowForm" onSubmit={e => { e.preventDefault(); void login(); }}>
          <label className="workflowLabel">Verify Factory owner (one-time editor credential; not stored in browser storage)
            <input className="workflowInput" type="password" autoComplete="off" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Owner verification" />
          </label>
          <button className="connectButton buttonReset" disabled={busy || !password} type="submit">Unlock Factory editing</button>
        </form> }
      <form className="workflowForm" onSubmit={event => { event.preventDefault(); void send("/api/factory/workflow", "POST", { title, buyer, notes: "" }); }}>
        <label className="workflowLabel">Product name<input className="workflowInput" required maxLength={180} value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label className="workflowLabel">Specific buyer<input className="workflowInput" required maxLength={120} value={buyer} onChange={event => setBuyer(event.target.value)} /></label>
        <button className="connectButton buttonReset" disabled={busy || !authenticated || !title.trim() || !buyer.trim()} type="submit">Create local product</button>
      </form>
      {message && <p role="status">{message}</p>}
    </article>
    {items.length === 0 && <article className="listingCard"><p>No local workflow items yet. Create the first one above.</p></article>}
    {items.map(item => <WorkflowItemEditor key={item.id} item={item} busy={busy || !authenticated} send={send} />)}
  </section>;
}
function WorkflowItemEditor({ item, busy, send }: { item: WorkflowItem; busy: boolean; send: (path: string, method: "PATCH", data: object) => Promise<{ ok: true } | { ok: false; error: string }> }) {
  const [localFeedback, setLocalFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [notes, setNotes] = useState(item.notes);
  const [evidenceUrl, setEvidenceUrl] = useState(item.evidenceUrl ?? "");
    const [listingId, setListingId] = useState(item.listingId?.toString() ?? "");
  const [title, setTitle] = useState(item.title);
  const [buyer, setBuyer] = useState(item.buyer);
  const path = `/api/factory/workflow/${item.id}`;
  const fields = { revision: item.revision, title, buyer, notes, evidenceUrl, listingId };
  async function submit(action: "update" | "advance", releaseEvidence?: ProductReleaseCandidate) {
    setLocalFeedback(null);
    const result = await send(path, "PATCH", { ...fields, action, ...(releaseEvidence === undefined ? {} : { releaseEvidence }) });
    setLocalFeedback(result.ok
      ? { ok: true, text: action === "advance" ? `Advanced successfully. Refresh to verify the saved stage.` : "Project changes saved." }
      : { ok: false, text: result.error });
    return result.ok;
  }
  return <article className="listingCard">
    <p className="eyebrow">{item.stage} · REVISION {item.revision}</p>
    <div className="workflowForm">
      <label className="workflowLabel">Product<input className="workflowInput" maxLength={180} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label className="workflowLabel">Buyer<input className="workflowInput" maxLength={120} value={buyer} onChange={e => setBuyer(e.target.value)} /></label>
      <label className="workflowLabel">Notes<textarea className="workflowInput" maxLength={2000} rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <label className="workflowLabel">Evidence URL (https)<input className="workflowInput" type="url" maxLength={500} value={evidenceUrl} onChange={e => setEvidenceUrl(e.target.value)} /></label>
      <label className="workflowLabel">Etsy Listing ID (only after manual publishing)<input className="workflowInput" inputMode="numeric" value={listingId} onChange={e => setListingId(e.target.value)} /></label>
      <p>QA status (read-only): {item.qaPassed ? "Evidence gate passed on saved candidate" : "NOT VERIFIED / BLOCKED"}. A manual checkbox cannot authorize Ready.</p>
    </div>
    <div className="workflowActions">
      <button className="connectButton buttonReset" disabled={busy || item.stage === "PUBLISHED"} onClick={() => void submit("update")}>Save notes / evidence</button>
      <button className="connectButton buttonReset" disabled={busy || item.stage === "PUBLISHED"} onClick={() => void submit("advance")}>Advance one stage</button>
    </div>
    <ReleaseEvidenceEditor buyer={buyer} initial={item.releaseEvidence} disabled={busy}
      onSave={(record) => submit("update", record)} />
    {localFeedback && <p role={localFeedback.ok ? "status" : "alert"} aria-live="polite" style={{ color: localFeedback.ok ? "inherit" : "#ffb4a2", fontWeight: 600 }}>{localFeedback.text}</p>}
    <p>Publishing is never triggered here. Moving Ready → Published records a manual Etsy Listing ID and evidence only.</p>
  </article>;
}
