import test from "node:test";
import assert from "node:assert/strict";
import { emptyVisual, evaluateVisual, parseVisual, visualWeights } from "../lib/mosselorastudio-visual-dna";
const fingerprint="a".repeat(64);
const url="https://drive.google.com/file/d/synthetic-only/view";
function candidate(){
 const v=emptyVisual(fingerprint);
 v.images=v.images.map(i=>({...i,headline:"Synthetic",benefit:"Synthetic",input:"Input",output:"Output",action:"Action",screenshotUrl:url,requirementId:"R1",testId:"T1",result:"PASS"}));
 for(const [key,max] of Object.entries(visualWeights)) v.checks[key]={expected:"Expected",actual:"Actual",result:"PASS",evidenceUrl:url,tester:"Synthetic",testedAt:"2026-11-24",score:max};
 return {productId:"M09",shop:"MosseloraStudio",fingerprint,requirements:[{id:"R1"}],qaCases:[{id:"T1",requirementId:"R1",scope:"FUNCTIONAL",result:"PASS",testedFingerprint:fingerprint,evidenceUrl:url}],visualEvidence:v};
}
test("synthetic full visual contract passes",()=>assert.equal(evaluateVisual(candidate()).passed,true));
test("M09 without images and identity is blocked",()=>{const c=candidate();assert.equal(evaluateVisual({...c,shop:undefined,visualEvidence:undefined}).passed,false);});
test("stale build cannot pass",()=>assert.equal(evaluateVisual({...candidate(),fingerprint:"b".repeat(64)}).passed,false));
test("missing role cannot pass",()=>{const c=candidate();c.visualEvidence.images.pop();assert.equal(evaluateVisual(c).passed,false);});
test("mobile NOT VERIFIED blocks even with other evidence",()=>{const c=candidate();c.visualEvidence.checks.mobileReadability.result="NOT_VERIFIED";assert.equal(evaluateVisual(c).passed,false);});
test("score below 90 blocks",()=>{const c=candidate();c.visualEvidence.checks.brand.score=0;assert.equal(evaluateVisual(c).passed,false);});
test("missing functional proof blocks",()=>assert.equal(evaluateVisual({...candidate(),qaCases:[]}).passed,false));
test("arbitrary URL cannot be Drive evidence",()=>{const c=candidate();c.visualEvidence.images[0].screenshotUrl="https://example.com/fake";assert.equal(evaluateVisual(c).passed,false);});
test("other shop unaffected",()=>assert.equal(evaluateVisual({...candidate(),productId:"P01",shop:"PoonthaiDigital",visualEvidence:undefined}).required,false));
test("parser rejects score overflow",()=>{const c=candidate();c.visualEvidence.checks.brand.score=16;assert.throws(()=>parseVisual(c.visualEvidence));});
