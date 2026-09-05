import { beginOperation, recordOperationResult, type OperationLedgerRecord, type OperationLedgerRepository } from "./operation-ledger";
import { assertPublishAuthorizationUsable, consumePublishAuthorization, type PublishAuthorizationGrant } from "./publish-authorization";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "./etsy-readback-normalizer";

export const AUTHORIZED_PUBLISH_TRANSACTION_VERSION = "1.0.1" as const;
export class PublishAmbiguousResultError extends Error { constructor(){super("PUBLISH_AMBIGUOUS_RESULT");this.name="PublishAmbiguousResultError";} }
export type PublishedReceipt = { listingId:string; state:string; observation?:EtsyReadBackObservation; providerReceipt?:Record<string,unknown> };
export interface AuthorizedPublishProvider {
  readDraft(draftListingId:string):Promise<EtsyReadBackObservation>;
  publish(draftListingId:string):Promise<PublishedReceipt>;
  readPublished(draftListingId:string):Promise<PublishedReceipt|null>;
}
export type AuthorizedPublishInput = {
  operationId:string; authorization:PublishAuthorizationGrant; candidateId:string; candidateFingerprint:string; expectedListingFingerprint:string; shopId:string; draftListingId:string; channel:string; now:string;
};
type VerifiedPublishedReadBack={receipt:{listingId:string;state:"active"|"published";providerReceipt?:Record<string,unknown>};identity:ReturnType<typeof verifyEtsyReadBackIdentity>};
function normalizedReceipt(r:PublishedReceipt){const listingId=r.listingId.normalize("NFC").trim();const state=r.state.normalize("NFC").trim().toLowerCase();if(!listingId)throw new Error("INVALID_PUBLISHED_LISTING_ID");if(state!=="active"&&state!=="published")throw new Error("PUBLISHED_STATE_NOT_CONFIRMED");return {listingId,state:state as "active"|"published",...(r.providerReceipt?{providerReceipt:structuredClone(r.providerReceipt)}:{})};}
function authRequest(i:AuthorizedPublishInput){return{authorizationId:i.authorization.authorization.authorizationId,candidateId:i.candidateId,candidateFingerprint:i.candidateFingerprint,shopId:i.shopId,draftListingId:i.draftListingId,channel:i.channel,now:i.now};}
function opPayload(i:AuthorizedPublishInput){return{type:"AUTHORIZED_PUBLISH",authorizationId:i.authorization.authorization.authorizationId,candidateId:i.candidateId,candidateFingerprint:i.candidateFingerprint,expectedListingFingerprint:i.expectedListingFingerprint,shopId:i.shopId,draftListingId:i.draftListingId,channel:i.channel};}
function verifyPublishedReadBack(i:AuthorizedPublishInput,p:PublishedReceipt):VerifiedPublishedReadBack{const receipt=normalizedReceipt(p);if(receipt.listingId!==i.draftListingId.normalize("NFC").trim())throw new Error("PUBLISHED_LISTING_ID_MISMATCH");if(!p.observation)throw new Error("POST_PUBLISH_IDENTITY_NOT_AVAILABLE");const identity=verifyEtsyReadBackIdentity(i.expectedListingFingerprint,{...p.observation,state:"draft"});if(identity.status!=="MATCH")throw new Error("POST_PUBLISH_IDENTITY_MISMATCH");return{receipt,identity};}
function consumedAt(record:OperationLedgerRecord,authorization:PublishAuthorizationGrant,now:string){const prior=record.receipt?.authorizationConsumedAt;return authorization.authorization.consumedAt??(typeof prior==="string"?prior:now);}
function receiptFor(verified:VerifiedPublishedReadBack,i:AuthorizedPublishInput,record:OperationLedgerRecord,authorization:PublishAuthorizationGrant){return{...verified.receipt,authorizationId:i.authorization.authorization.authorizationId,authorizationState:"CONSUMED",authorizationConsumedAt:consumedAt(record,authorization,i.now),expectedListingFingerprint:verified.identity.expectedFingerprint,actualListingFingerprint:verified.identity.actualFingerprint};}
async function readOnlyReconcile(repo:OperationLedgerRepository,provider:AuthorizedPublishProvider,i:AuthorizedPublishInput,record:OperationLedgerRecord,authorization:PublishAuthorizationGrant,successStatus:"PUBLISHED"|"RECONCILED"){
  let found:PublishedReceipt|null=null;try{found=await provider.readPublished(i.draftListingId);}catch{found=null;}
  if(found){let verified:VerifiedPublishedReadBack|null=null;try{verified=verifyPublishedReadBack(i,found);}catch{verified=null;}if(verified){const receipt=receiptFor(verified,i,record,authorization);await recordOperationResult(repo,i.operationId,record.requestHash,"SUCCEEDED",i.now,{receipt});return{status:successStatus,receipt,postPublishIdentity:verified.identity,authorization};}}
  const auditReceipt=authorization.authorization.state==="CONSUMED"?{authorizationId:i.authorization.authorization.authorizationId,authorizationState:"CONSUMED",authorizationConsumedAt:consumedAt(record,authorization,i.now)}:undefined;
  await recordOperationResult(repo,i.operationId,record.requestHash,"RECONCILIATION_REQUIRED",i.now,{...(auditReceipt?{receipt:auditReceipt}:{}),recoveryPoint:"POST_PUBLISH_READ_BACK"});return{status:"RECONCILIATION_REQUIRED" as const,authorization};
}
export async function executeAuthorizedPublishTransaction(repo:OperationLedgerRepository,provider:AuthorizedPublishProvider,input:AuthorizedPublishInput){
  const begun=await beginOperation(repo,input.operationId,opPayload(input),input.now);
  if(begun.status==="REPLAY"&&begun.record.status==="SUCCEEDED"&&begun.record.receipt)return{status:"REPLAY" as const,receipt:begun.record.receipt,authorization:input.authorization};
  if(begun.status==="REPLAY"&&begun.record.status==="FAILED")return{status:"FAILED_REPLAY" as const,action:"STOP" as const,authorization:input.authorization};
  if(begun.status==="REPLAY")return readOnlyReconcile(repo,provider,input,begun.record,input.authorization,"RECONCILED");
  const preRead=await provider.readDraft(input.draftListingId);const identity=verifyEtsyReadBackIdentity(input.expectedListingFingerprint,preRead);
  if(identity.status!=="MATCH"){await recordOperationResult(repo,input.operationId,begun.record.requestHash,"FAILED",input.now,{recoveryPoint:"IDENTITY_MISMATCH_STOP"});return{status:"IDENTITY_MISMATCH" as const,action:"STOP" as const,identity,authorization:input.authorization};}
  try{assertPublishAuthorizationUsable(input.authorization,authRequest(input));}catch(error){await recordOperationResult(repo,input.operationId,begun.record.requestHash,"FAILED",input.now,{recoveryPoint:"AUTHORIZATION_REJECTED"});throw error;}
  const consumed=consumePublishAuthorization(input.authorization,authRequest(input));
  try{await provider.publish(input.draftListingId);}catch(error){if(error instanceof PublishAmbiguousResultError)return readOnlyReconcile(repo,provider,input,begun.record,consumed,"RECONCILED");await recordOperationResult(repo,input.operationId,begun.record.requestHash,"FAILED",input.now,{recoveryPoint:"PUBLISH_FAILED"});throw error;}
  return readOnlyReconcile(repo,provider,input,begun.record,consumed,"PUBLISHED");
}
