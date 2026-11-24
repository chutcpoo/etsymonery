"use client";
import { useState } from "react";
import VisualStudio from "./visual-studio";
import {
  evaluateProductReleaseEvidence,
  type ProductPlatform, type ProductQaCase, type ProductReleaseCandidate,
  type QaScope
} from "../../lib/product-release-evidence";

type Props = {
  buyer: string;
  initial: ProductReleaseCandidate | null;
  disabled: boolean;
  onSave: (value: ProductReleaseCandidate) => Promise<boolean>;
};

const nowDraft = () => ({
  id: "", requirementId: "", claimId: "", scope: "FUNCTIONAL" as QaScope,
  platform: "EXCEL" as ProductPlatform | "ALL", expected: "", actual: "",
  result: "NOT_VERIFIED" as const, evidenceUrl: "", testedAt: ""
});

function initialValue(buyer: string): ProductReleaseCandidate {
  return {
    productId: "", targetBuyer: buyer, customerProblem: "", promisedDecision: "",
    researchEvidenceUrl: "", supportedPlatforms: ["EXCEL", "GOOGLE_SHEETS"],
    fingerprint: "", requirements: [], claims: [], qaCases: [], openCriticalDefects: 0
  };
}

export default function ReleaseEvidenceEditor({ buyer, initial, disabled, onSave }: Props) {
  const [value, setValue] = useState<ProductReleaseCandidate>(() => initial ?? initialValue(buyer));
  const [reqId, setReqId] = useState("");
  const [reqScenario, setReqScenario] = useState("");
  const [reqOutcome, setReqOutcome] = useState("");
  const [claimId, setClaimId] = useState("");
  const [claimRequirementId, setClaimRequirementId] = useState("");
  const [claimText, setClaimText] = useState("");
  const [newTest, setNewTest] = useState(nowDraft);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const verdict = evaluateProductReleaseEvidence(value);
  const edit = (patch: Partial<ProductReleaseCandidate>) => setValue(v => ({ ...v, ...patch }));
  const addRequirement = () => {
    if (!reqId.trim() || !reqScenario.trim() || !reqOutcome.trim() ||
        value.requirements.some(r => r.id === reqId.trim())) return;
    edit({ requirements: [...value.requirements, {
      id: reqId.trim(), buyerScenario: reqScenario.trim(), expectedOutcome: reqOutcome.trim(),
      platforms: [...value.supportedPlatforms]
    }] });
    setReqId(""); setReqScenario(""); setReqOutcome("");
  };
  const addClaim = () => {
    if (!claimId.trim() || !claimRequirementId || !claimText.trim() ||
        value.claims.some(c => c.id === claimId.trim())) return;
    edit({ claims: [...value.claims, {
      id: claimId.trim(), requirementId: claimRequirementId, text: claimText.trim()
    }] });
    setClaimId(""); setClaimText("");
  };
  const addTest = () => {
    if (!newTest.id.trim() || value.qaCases.some(t => t.id === newTest.id.trim())) return;
    const item: ProductQaCase = {
      id: newTest.id.trim(), scope: newTest.scope, platform: newTest.platform,
      ...(newTest.requirementId ? { requirementId: newTest.requirementId } : {}),
      ...(newTest.claimId ? { claimId: newTest.claimId } : {}),
      expected: newTest.expected, actual: newTest.actual, result: "NOT_VERIFIED",
      evidenceUrl: newTest.evidenceUrl, testedAt: newTest.testedAt,
      testedFingerprint: value.fingerprint
    };
    edit({ qaCases: [...value.qaCases, item] }); setNewTest(nowDraft());
  };
  const updateCase = (id: string, patch: Partial<ProductQaCase>) =>
    edit({ qaCases: value.qaCases.map(t => t.id === id ? { ...t, ...patch } : t) });
  const save = async () => {
    setSaving(true); setNotice("");
    try { setNotice((await onSave(value)) ? "Release QA record saved. A PASS label is not independent QA verification." : "Save failed; verify the error above."); }
    catch { setNotice("Could not save the release QA record."); }
    finally { setSaving(false); }
  };
  return <details className="listingCard">
    <summary><strong>Buyer outcome, platform QA & release evidence</strong> — {verdict.blockers.length} blocker(s)</summary>
    <p>Records actual tested outcomes; do not choose PASS without testing the exact file in that platform. All timestamps and URLs must be evidence, not example values.</p>
    <div className="workflowForm">
      <label className="workflowLabel">SKU / Product ID
        <input className="workflowInput" value={value.productId} onChange={e => edit({ productId: e.target.value })}/></label>
      <label className="workflowLabel">Target buyer
        <input className="workflowInput" value={value.targetBuyer} onChange={e => edit({ targetBuyer: e.target.value })}/></label>
      <label className="workflowLabel">Recurring buyer problem
        <textarea className="workflowInput" value={value.customerProblem} onChange={e => edit({ customerProblem: e.target.value })}/></label>
      <label className="workflowLabel">Decision the customer can make
        <textarea className="workflowInput" value={value.promisedDecision} onChange={e => edit({ promisedDecision: e.target.value })}/></label>
      <label className="workflowLabel">Etsy research evidence (https URL)
        <input className="workflowInput" value={value.researchEvidenceUrl} onChange={e => edit({ researchEvidenceUrl: e.target.value })}/></label>
      <label className="workflowLabel">SHA-256 of EXACT customer release candidate (64 hex chars)
        <input className="workflowInput" value={value.fingerprint} onChange={e => edit({ fingerprint: e.target.value.toLowerCase() })}/></label>
      <div><strong>Advertised delivery platforms</strong>
        <div className="workflowActions">
          {(["EXCEL","GOOGLE_SHEETS","WORD_DOCS"] as const).map(p =>
            <label key={p}><input type="checkbox" checked={value.supportedPlatforms.includes(p)}
              onChange={e => edit({ supportedPlatforms: e.target.checked
                ? [...value.supportedPlatforms, p] : value.supportedPlatforms.filter(x=>x!==p) })}/>
              {p}</label>)}
        </div>
      </div>
    </div>
    <h3>1. Buyer scenarios and expected outcomes</h3>
    <div className="workflowForm">
      <label className="workflowLabel">Requirement ID<input className="workflowInput" value={reqId} onChange={e=>setReqId(e.target.value)}/></label>
      <label className="workflowLabel">Scenario<input className="workflowInput" value={reqScenario} onChange={e=>setReqScenario(e.target.value)}/></label>
      <label className="workflowLabel">Expected outcome<input className="workflowInput" value={reqOutcome} onChange={e=>setReqOutcome(e.target.value)}/></label>
      <button className="connectButton buttonReset" type="button" disabled={disabled} onClick={addRequirement}>Add buyer requirement</button>
    </div>
    {value.requirements.map(r=><p key={r.id}><strong>{r.id}</strong> — {r.buyerScenario}: {r.expectedOutcome} ({r.platforms.join(", ")})
      <button type="button" disabled={disabled} onClick={()=>edit({ requirements: value.requirements.filter(x=>x.id!==r.id) })}>Remove</button></p>)}
    <h3>2. Claims advertised to the buyer</h3>
    <div className="workflowForm">
      <label className="workflowLabel">Claim ID<input className="workflowInput" value={claimId} onChange={e=>setClaimId(e.target.value)}/></label>
      <label className="workflowLabel">Requirement<select className="workflowInput" value={claimRequirementId} onChange={e=>setClaimRequirementId(e.target.value)}>
        <option value="">Select</option>{value.requirements.map(r=><option key={r.id} value={r.id}>{r.id}</option>)}</select></label>
      <label className="workflowLabel">Exact claim<input className="workflowInput" value={claimText} onChange={e=>setClaimText(e.target.value)}/></label>
      <button className="connectButton buttonReset" type="button" disabled={disabled} onClick={addClaim}>Add listing claim</button>
    </div>
    {value.claims.map(c=><p key={c.id}>{c.id} → {c.requirementId}: {c.text}
      <button type="button" disabled={disabled} onClick={()=>edit({ claims: value.claims.filter(x=>x.id!==c.id) })}>Remove</button></p>)}
    <h3>3. Platform-specific test evidence</h3>
    <div className="workflowForm">
      <label className="workflowLabel">Test ID<input className="workflowInput" value={newTest.id} onChange={e=>setNewTest(v=>({...v,id:e.target.value}))}/></label>
      <label className="workflowLabel">Scope<select className="workflowInput" value={newTest.scope}
        onChange={e=>setNewTest(v=>({...v,scope:e.target.value as QaScope}))}>
        {(["FUNCTIONAL","NEGATIVE","BUYER_ACCESS","DELIVERY","LISTING_CLAIM"] as const).map(s=><option key={s}>{s}</option>)}</select></label>
      <label className="workflowLabel">Platform<select className="workflowInput" value={newTest.platform}
        onChange={e=>setNewTest(v=>({...v,platform:e.target.value as ProductPlatform|"ALL"}))}>
        {(["EXCEL","GOOGLE_SHEETS","WORD_DOCS","ALL"] as const).map(p=><option key={p}>{p}</option>)}</select></label>
      <label className="workflowLabel">Requirement<select className="workflowInput" value={newTest.requirementId}
        onChange={e=>setNewTest(v=>({...v,requirementId:e.target.value}))}>
        <option value="">N/A</option>{value.requirements.map(r=><option key={r.id}>{r.id}</option>)}</select></label>
      <label className="workflowLabel">Claim ID (listing checks only)<select className="workflowInput" value={newTest.claimId}
        onChange={e=>setNewTest(v=>({...v,claimId:e.target.value}))}>
        <option value="">N/A</option>{value.claims.map(c=><option key={c.id}>{c.id}</option>)}</select></label>
      <button className="connectButton buttonReset" type="button" disabled={disabled} onClick={addTest}>Add NOT VERIFIED test</button>
    </div>
    {value.qaCases.map(t=><div className="listingCard" key={t.id}>
      <strong>{t.id}</strong> · {t.scope} / {t.platform}
      <div className="workflowForm">
        <label className="workflowLabel">Expected<input className="workflowInput" value={t.expected}
          onChange={e=>updateCase(t.id,{expected:e.target.value})}/></label>
        <label className="workflowLabel">Actual<input className="workflowInput" value={t.actual}
          onChange={e=>updateCase(t.id,{actual:e.target.value})}/></label>
        <label className="workflowLabel">Result<select className="workflowInput" value={t.result}
          onChange={e=>updateCase(t.id,{result:e.target.value as ProductQaCase["result"]})}>
          {(["NOT_VERIFIED","PASS","FAIL","BLOCKED"] as const).map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="workflowLabel">Evidence URL<input className="workflowInput" value={t.evidenceUrl}
          onChange={e=>updateCase(t.id,{evidenceUrl:e.target.value})}/></label>
        <label className="workflowLabel">Actual test date/time (ISO 8601)<input className="workflowInput" value={t.testedAt}
          onChange={e=>updateCase(t.id,{testedAt:e.target.value})}/></label>
        <label className="workflowLabel">Tested file fingerprint<input className="workflowInput" value={t.testedFingerprint}
          onChange={e=>updateCase(t.id,{testedFingerprint:e.target.value})}/></label>
        <button type="button" disabled={disabled} onClick={()=>edit({qaCases:value.qaCases.filter(x=>x.id!==t.id)})}>Remove test</button>
      </div></div>)}
    <VisualStudio candidate={value} onChange={edit} disabled={disabled}/>
    <h3>4. Blockers and owner sign-off</h3>
    <div className="workflowForm">
      <label className="workflowLabel">Critical defects still open<input className="workflowInput" type="number" min={0}
        value={value.openCriticalDefects} onChange={e=>edit({openCriticalDefects:Number(e.target.value)})}/></label>
      <label className="workflowLabel">Release approved by (only after independent QA)
        <input className="workflowInput" value={value.approval?.approvedBy??""}
          onChange={e=>edit({approval:{approvedBy:e.target.value,approvedAt:value.approval?.approvedAt??"",
            fingerprint:value.approval?.fingerprint??""}})}/></label>
      <label className="workflowLabel">Approval at (ISO 8601)
        <input className="workflowInput" value={value.approval?.approvedAt??""}
          onChange={e=>edit({approval:{approvedBy:value.approval?.approvedBy??"",approvedAt:e.target.value,
            fingerprint:value.approval?.fingerprint??""}})}/></label>
      <label className="workflowLabel">Fingerprint approved
        <input className="workflowInput" value={value.approval?.fingerprint??""}
          onChange={e=>edit({approval:{approvedBy:value.approval?.approvedBy??"",approvedAt:value.approval?.approvedAt??"",
            fingerprint:e.target.value}})}/></label>
    </div>
    <div role="status">
      <strong>Release: {verdict.readyForOwnerRelease ? "Evidence fields complete (manual verification still required)" : "BLOCKED"}</strong>
      <p>{verdict.blockers.length ? verdict.blockers.slice(0,20).join(", ") : "All evidence fields are present. Confirm test evidence independently before any approval."}</p>
    </div>
    <button className="connectButton buttonReset" type="button" disabled={saving||disabled} onClick={()=>void save()}>
      {saving?"Saving…":"Save buyer outcome and QA evidence"}
    </button>
    {notice&&<p role="status">{notice}</p>}
  </details>;
}
