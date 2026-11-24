"use client";
import { useEffect, useState } from "react";
import { dna, visualRoles, visualWeights, emptyVisual, evaluateVisual, driveLink, importGalleryEvidence, verifyGalleryBytes, type VisualImage, type VisualCheck } from "../../lib/mosselorastudio-visual-dna";
import type { ProductReleaseCandidate } from "../../lib/product-release-evidence";
const labels=["Product name + main benefit","Pain and solution","Verified numerical or operational result","Key function A","Key function B","Input → output → action","Three steps","Files and formats","Limits and manual steps"];
function Screenshot({image}:{image:VisualImage}){
 const [url,setUrl]=useState("");
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
 return <><div style={{background:dna.brand.palette.cream,color:dna.brand.palette.deepPlum,aspectRatio:"1",padding:"6%",display:"flex",flexDirection:"column",gap:"4%",overflow:"hidden",fontFamily:"Inter, Arial, sans-serif"}}>
 <small>MOSSELORA STUDIO</small><strong style={{fontSize:"clamp(14px,2vw,24px)"}}>{image.headline||image.role}</strong><span>{image.benefit||"Customer benefit required"}</span>
 <div style={{flex:1,minHeight:0,background:"white",display:"grid",placeItems:"center",overflow:"hidden"}}>{url?<img src={url} alt="Locally selected product screenshot, not verified" style={{width:"100%",height:"100%",objectFit:"contain"}}/>:<span>Actual screenshot required</span>}</div>
 </div><label>Local screenshot preview (not uploaded or verified)<input type="file" accept="image/png,image/jpeg" onChange={e=>{const f=e.target.files?.[0];setUrl(f?URL.createObjectURL(f):"");}}/></label></>;
}
export default function VisualStudio({candidate,onChange,disabled}:{candidate:ProductReleaseCandidate;onChange:(p:Partial<ProductReleaseCandidate>)=>void;disabled:boolean}){
 const v=candidate.visualEvidence??emptyVisual(candidate.fingerprint);
 const verdict=evaluateVisual(candidate);
 const [galleryFiles,setGalleryFiles]=useState<Record<string,{file:File;url:string;hash:string}>>({});
 const [notice,setNotice]=useState("");
 useEffect(()=>()=>{Object.values(galleryFiles).forEach(x=>URL.revokeObjectURL(x.url));},[galleryFiles]);
 const download=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const importEvidence=async(file:File)=>{try{if(file.size>150000)throw Error("GALLERY_TOO_LARGE");const evidence=importGalleryEvidence(JSON.parse(await file.text()),candidate.fingerprint);onChange({visualEvidence:evidence});setGalleryFiles({});setNotice("Gallery evidence staged; save record to persist. Reviews reset.");}catch(e){setNotice(String(e));}};
 const importImages=async(files:File[])=>{const next:typeof galleryFiles={};try{
  if(files.length!==visualRoles.length||v.images.some(i=>!i.asset))throw Error("Select all nine manifest JPG files");
  for(const i of v.images){const a=i.asset!;const file=files.find(f=>f.name===a.filename);
   if(!file||!await verifyGalleryBytes(await file.arrayBuffer(),a))throw Error("Hash or JPG mismatch: "+a.filename);
   const bmp=await createImageBitmap(file);const valid=bmp.width===2400&&bmp.height===2400;bmp.close();if(!valid)throw Error("Invalid dimensions: "+a.filename);
   next[i.role]={file,url:URL.createObjectURL(file),hash:a.sha256};
  }setGalleryFiles(next);setNotice("9/9 exact JPG files verified for this browser session. Files remain local; evidence links persist on save.");
 }catch(e){Object.values(next).forEach(x=>URL.revokeObjectURL(x.url));setNotice(String(e));}};

 const patchImage=(role:string,patch:Partial<VisualImage>)=>onChange({visualEvidence:{...v,images:v.images.map(i=>i.role===role?{...i,...patch}:i)}});
 const patchCheck=(key:string,patch:Partial<VisualCheck>)=>onChange({visualEvidence:{...v,checks:{...v.checks,[key]:{...v.checks[key],...patch}}}});
 return <section className="listingCard"><h3>MosseloraStudio Listing Image Studio · DNA {dna.version}</h3>
 <p>Show the product, problem, solution and proven outcome. Private Drive links are stored with the owner evidence, not in GitHub. Link access and screenshot accuracy require independent review.</p>
 <label>Shop identity <select disabled={disabled} value={candidate.shop??""} onChange={e=>onChange({shop:e.target.value})}><option value="">Unassigned</option><option>MosseloraStudio</option><option>PoonthaiDigital</option></select></label>
 {candidate.shop==="MosseloraStudio"&&<>
 <p>Visual QC {verdict.score}/100 · {verdict.passed?"Evidence fields complete; independent review required":"BLOCKED"} · {dna.visual.canvasPx.join(" × ")} px</p>
 <p>{verdict.blockers.join(" · ")}</p>
 <button type="button" disabled={disabled} onClick={()=>onChange({visualEvidence:emptyVisual(candidate.fingerprint)})}>Reset visual evidence to current build (clears reviews)</button>
 <fieldset disabled={disabled}><legend>Gallery import / export (local files, no Etsy writes)</legend>
 <label>Import gallery evidence JSON<input type="file" accept=".json,application/json" onChange={e=>{const f=e.target.files?.[0];if(f)void importEvidence(f);e.target.value="";}}/></label>
 <button type="button" onClick={()=>download(new Blob([JSON.stringify(v,null,2)],{type:"application/json"}),candidate.productId+"-gallery-evidence.json")}>Export gallery evidence JSON</button>
 <label>Verify and preview nine original JPGs<input type="file" multiple accept=".jpg,image/jpeg" onChange={e=>{void importImages(Array.from(e.target.files??[]));e.target.value="";}}/></label>
 <p role="status">{notice}</p></fieldset>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}>
 {visualRoles.map((role,index)=>{const i=v.images.find(x=>x.role===role)??emptyVisual(candidate.fingerprint).images[index];return <article className="listingCard" key={role}>
 <h4>{index+1}. {role}</h4><p>{labels[index]}</p>{i.asset&&galleryFiles[role]?.hash===i.asset.sha256?<><img src={galleryFiles[role].url} alt={i.headline} style={{width:"100%",height:"auto"}}/><button type="button" onClick={()=>download(galleryFiles[role].file,i.asset!.filename)}>Export exact JPG</button></>:<Screenshot image={i}/>}
 {i.asset&&<p><a href={i.asset.listingUrl} target="_blank" rel="noreferrer">Open original listing JPG in Drive</a> · {i.asset.filename}</p>}
 <fieldset disabled={disabled} className="workflowForm">
 {(["headline","benefit","input","output","action","screenshotUrl"] as const).map(key=><label key={key}>{key}<input className="workflowInput" value={i[key]} onChange={e=>patchImage(role,{[key]:e.target.value,result:"NOT_VERIFIED"})}/></label>)}
 {driveLink(i.screenshotUrl)&&<a href={i.screenshotUrl} target="_blank" rel="noreferrer">Open Drive screenshot for review</a>}
 <label>Requirement<select value={i.requirementId} onChange={e=>patchImage(role,{requirementId:e.target.value,testId:"",result:"NOT_VERIFIED"})}><option value="">Select</option>{candidate.requirements.map(r=><option key={r.id}>{r.id}</option>)}</select></label>
 <label>Functional test<select value={i.testId} onChange={e=>patchImage(role,{testId:e.target.value,result:"NOT_VERIFIED"})}><option value="">Select</option>{candidate.qaCases.filter(t=>t.requirementId===i.requirementId&&t.scope==="FUNCTIONAL").map(t=><option key={t.id}>{t.id}</option>)}</select></label>
 <label>Independent image review<select value={i.result} onChange={e=>patchImage(role,{result:e.target.value as VisualImage["result"]})}>{["NOT_VERIFIED","PASS","FAIL"].map(r=><option key={r}>{r}</option>)}</select></label>
 </fieldset></article>;})}</div>
 <h4>Visual QC — evidence for each category</h4>
 {Object.entries(visualWeights).map(([key,max])=>{const q=v.checks[key];return <fieldset className="workflowForm" disabled={disabled} key={key}><legend>{key} / {max}</legend>
 {(["expected","actual","evidenceUrl","tester","testedAt"] as const).map(k=><label key={k}>{k}<input className="workflowInput" value={q[k]} onChange={e=>patchCheck(key,{[k]:e.target.value,result:"NOT_VERIFIED"})}/></label>)}
 <label>Score<input type="number" min={0} max={max} value={q.score} onChange={e=>patchCheck(key,{score:Number(e.target.value),result:"NOT_VERIFIED"})}/></label>
 <label>Result<select value={q.result} onChange={e=>patchCheck(key,{result:e.target.value as VisualCheck["result"]})}>{["NOT_VERIFIED","PASS","FAIL"].map(r=><option key={r}>{r}</option>)}</select></label></fieldset>;})}
 </>}
 </section>;
}
