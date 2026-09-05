import { freezeCandidateManifest, type CandidateManifestInput, type FrozenCandidateManifest } from "./candidate-freeze";
import { invalidationForChange, type GateType } from "./gate-invalidation-engine";

export const PATCH_WORKFLOW_VERSION = "1.0.0" as const;
export type PatchChangeScope = "LISTING_ONLY" | "PRODUCT_CHANGE";
export type PatchWorkflowRecord = {
  schemaVersion: typeof PATCH_WORKFLOW_VERSION; changeScope: PatchChangeScope; sourceCandidateId:string; sourceFingerprint:string;
  patchCandidate: FrozenCandidateManifest; affectedStage:"LISTING_INTELLIGENCE"|"PRODUCT_FACTORY"; nextGate:GateType; mandatoryGateReplay:readonly GateType[]; requiresNewAuthorization:true; liveMutationAllowed:false;
};
function material(m:FrozenCandidateManifest){return JSON.stringify({artifactIds:m.candidate.artifactIds,canonicalPayload:m.canonicalPayload});}
export function createPatchCandidateWorkflow(source:FrozenCandidateManifest,patchInput:CandidateManifestInput,changeScope:PatchChangeScope):PatchWorkflowRecord{
  if(patchInput.candidateType!=="PATCH")throw new Error("PATCH_CANDIDATE_TYPE_REQUIRED");
  if(patchInput.productId.normalize("NFC").trim()!==source.candidate.productId)throw new Error("PATCH_PRODUCT_ID_MISMATCH");
  if(patchInput.candidateId.normalize("NFC").trim()===source.candidate.candidateId)throw new Error("PATCH_NEW_CANDIDATE_ID_REQUIRED");
  const patch=freezeCandidateManifest(patchInput);if(material(patch)===material(source))throw new Error("PATCH_HAS_NO_MATERIAL_CHANGE");
  const impact=invalidationForChange(changeScope==="LISTING_ONLY"?"LISTING":"PRODUCT_OR_ARTIFACT");const gates=impact.invalidatedTargets.filter((x):x is GateType=>x!=="AUTHORIZATION");
  return Object.freeze({schemaVersion:PATCH_WORKFLOW_VERSION,changeScope,sourceCandidateId:source.candidate.candidateId,sourceFingerprint:source.candidate.fingerprint,patchCandidate:patch,affectedStage:changeScope==="LISTING_ONLY"?"LISTING_INTELLIGENCE":"PRODUCT_FACTORY",nextGate:changeScope==="LISTING_ONLY"?"LISTING_TEST":"PRODUCT_TEST",mandatoryGateReplay:Object.freeze(gates),requiresNewAuthorization:true as const,liveMutationAllowed:false as const});
}
