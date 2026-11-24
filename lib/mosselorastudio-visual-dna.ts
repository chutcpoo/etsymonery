import dna from "../standards/mosselorastudio/product-visual-dna.json";
export { dna };
export const visualRoles = dna.visual.roles;
export const visualWeights = dna.qc.weights;
export type VisualCheck = { expected:string; actual:string; result:"PASS"|"FAIL"|"NOT_VERIFIED"; evidenceUrl:string; tester:string; testedAt:string; score:number };
export type GalleryAsset = { filename:string; sha256:string; listingUrl:string };
export type VisualImage = { asset?:GalleryAsset; role:string; headline:string; benefit:string; screenshotUrl:string; requirementId:string; testId:string; input:string; output:string; action:string; result:"PASS"|"FAIL"|"NOT_VERIFIED" };
export type VisualEvidence = { dnaVersion:string; fingerprint:string; images:VisualImage[]; checks:Record<string,VisualCheck> };
type Candidate = { productId:string; fingerprint:string; requirements:readonly {id:string}[]; qaCases:readonly {id:string; requirementId?:string; scope:string; result:string; testedFingerprint:string; evidenceUrl:string}[]; visualEvidence?:VisualEvidence; shop?:string };
export const needsVisualDNA = (c:Candidate) => c.shop === dna.shop || (!c.shop && /^M\d{2,}$/i.test(c.productId.trim()));
const text = (v:unknown):v is string => typeof v==="string" && !!v.trim();
export function driveLink(v:unknown):boolean {
  if (!text(v)) return false;
  try { const u=new URL(v); return u.protocol==="https:" && !u.username && !u.password && !u.port && ["drive.google.com","docs.google.com"].includes(u.hostname) && /\/(?:file\/d|document\/d|spreadsheets\/d|drive\/folders)\/[A-Za-z0-9_-]+/.test(u.pathname); } catch {return false;}
}
export function emptyVisual(fingerprint:string):VisualEvidence {
 return {dnaVersion:dna.version,fingerprint,images:visualRoles.map(role=>({role,headline:"",benefit:"",screenshotUrl:"",requirementId:"",testId:"",input:"",output:"",action:"",result:"NOT_VERIFIED"})),checks:Object.fromEntries(Object.keys(visualWeights).map(k=>[k,{expected:"",actual:"",result:"NOT_VERIFIED",evidenceUrl:"",tester:"",testedAt:"",score:0}]))};
}
export function parseVisual(input:unknown):VisualEvidence {
 if (!input || typeof input!=="object" || Array.isArray(input)) throw Error("INVALID_VISUAL_EVIDENCE");
 const x=input as Record<string,unknown>;
 const str=(v:unknown)=>{if(typeof v!=="string"||v.length>2000)throw Error("INVALID_VISUAL_EVIDENCE");return v;};
 const obj=(v:unknown)=>{if(!v||typeof v!=="object"||Array.isArray(v))throw Error("INVALID_VISUAL_EVIDENCE");return v as Record<string,unknown>;};
 const result=(v:unknown):VisualCheck["result"]=>{if(v!=="PASS"&&v!=="FAIL"&&v!=="NOT_VERIFIED")throw Error("INVALID_VISUAL_EVIDENCE");return v;};
 if(!Array.isArray(x.images)||x.images.length>10)throw Error("INVALID_VISUAL_EVIDENCE");
 const images=x.images.map(v=>{const i=obj(v);const a=i.asset===undefined?undefined:obj(i.asset);const asset=a?{filename:str(a.filename),sha256:str(a.sha256),listingUrl:str(a.listingUrl)}:undefined;if(asset&&(!/^[A-Za-z0-9_-]{1,100}\.jpg$/i.test(asset.filename)||! /^[a-f0-9]{64}$/i.test(asset.sha256)||!driveLink(asset.listingUrl)))throw Error("INVALID_GALLERY_ASSET");return {...(asset?{asset}:{}),role:str(i.role),headline:str(i.headline),benefit:str(i.benefit),screenshotUrl:str(i.screenshotUrl),requirementId:str(i.requirementId),testId:str(i.testId),input:str(i.input),output:str(i.output),action:str(i.action),result:result(i.result)};});
 const raw=obj(x.checks);const checks:Record<string,VisualCheck>={};
 for(const [key,max] of Object.entries(visualWeights)){const v=obj(raw[key]);if(!Number.isInteger(v.score)||Number(v.score)<0||Number(v.score)>max)throw Error("INVALID_VISUAL_SCORE");checks[key]={expected:str(v.expected),actual:str(v.actual),result:result(v.result),evidenceUrl:str(v.evidenceUrl),tester:str(v.tester),testedAt:str(v.testedAt),score:Number(v.score)};}
 return {dnaVersion:str(x.dnaVersion),fingerprint:str(x.fingerprint),images,checks};
}
export function evaluateVisual(c:Candidate){
 const blockers:string[]=[];let score=0;
 if(!needsVisualDNA(c))return {required:false,score,blockers,passed:true};
 if(c.shop!==dna.shop)blockers.push("VISUAL_SHOP_IDENTITY_REQUIRED");
 const v=c.visualEvidence;
 if(!v)return {required:true,score,blockers:[...blockers,"VISUAL_EVIDENCE_REQUIRED"],passed:false};
 if(v.dnaVersion!==dna.version||v.fingerprint!==c.fingerprint||! /^[a-f0-9]{64}$/i.test(c.fingerprint))blockers.push("VISUAL_STALE_VERSION");
 if(v.images.length!==visualRoles.length||new Set(v.images.map(i=>i.role)).size!==visualRoles.length||v.images.some((i,n)=>i.role!==visualRoles[n]))blockers.push("VISUAL_ROLE_COVERAGE");
 for(const i of v.images){
 const validTest=c.qaCases.some(t=>t.id===i.testId&&t.requirementId===i.requirementId&&t.scope==="FUNCTIONAL"&&t.result==="PASS"&&t.testedFingerprint===c.fingerprint&&text(t.evidenceUrl));
 if(i.result!=="PASS"||![i.headline,i.benefit,i.input,i.output,i.action].every(text)||!driveLink(i.screenshotUrl)||!c.requirements.some(r=>r.id===i.requirementId)||!validTest)blockers.push("VISUAL_IMAGE_"+i.role);
 }
 for(const [key,max] of Object.entries(visualWeights)){const q=v.checks[key];if(!q||q.result!=="PASS"||!text(q.expected)||!text(q.actual)||!driveLink(q.evidenceUrl)||!text(q.tester)||!Number.isFinite(Date.parse(q.testedAt))||!Number.isInteger(q.score)||q.score<0||q.score>max){blockers.push("VISUAL_QC_"+key);continue;}score+=q.score;}
 if(score<dna.qc.minimumScore)blockers.push("VISUAL_SCORE_BELOW_90");
 return {required:true,score,blockers,passed:blockers.length===0};
}

// Import is staging only: reset every review rather than accepting imported PASS labels.
export function importGalleryEvidence(raw:unknown, fingerprint:string):VisualEvidence {
 const v=parseVisual(raw);
 if(v.dnaVersion!==dna.version||v.fingerprint!==fingerprint||v.images.length!==visualRoles.length||v.images.some((i,n)=>i.role!==visualRoles[n]||!i.asset))throw Error("GALLERY_VERSION_OR_ROLE_MISMATCH");
 if(new Set(v.images.map(i=>i.asset!.filename)).size!==v.images.length)throw Error("DUPLICATE_GALLERY_FILENAME");
 return {...v,images:v.images.map(i=>({...i,result:"NOT_VERIFIED"})),checks:Object.fromEntries(Object.entries(v.checks).map(([k,q])=>[k,{...q,result:"NOT_VERIFIED",score:0}]))};
}
export async function verifyGalleryBytes(bytes:ArrayBuffer,asset:GalleryAsset):Promise<boolean>{
 if(bytes.byteLength>1000000||bytes.byteLength<4)return false;
 const b=new Uint8Array(bytes);
 if(b[0]!==255||b[1]!==216||b[b.length-2]!==255||b[b.length-1]!==217)return false;
 const h=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),x=>x.toString(16).padStart(2,"0")).join("");
 return h===asset.sha256.toLowerCase();
}
