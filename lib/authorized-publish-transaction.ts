import { beginOperation, recordOperationResult, type OperationLedgerRepository } from "./operation-ledger";
import { assertPublishAuthorizationUsable, consumePublishAuthorization, type PublishAuthorizationGrant } from "./publish-authorization";
import { verifyEtsyReadBackIdentity, type EtsyReadBackObservation } from "./etsy-readback-normalizer";

export const AUTHORIZED_PUBLISH_TRANSACTION_VERSION = "1.0.0" as const;
export class PublishAmbiguousResultError extends Error { constructor(){super("PUBLISH_AMBIGUOUS_RESULT");this.name="PublishAmbiguousResultError";} }
export type PublishedReceipt = { listingId:string; state:string; providerReceipt?:Record<string,unknown> };
export interface AuthorizedPublishProvider {
  readDraft(draftListingId:string):Promise<EtsyReadBackObservation>;
  publish(draftListingId:string):Promise<PublishedReceipt>;
  readPublished(draftListingId:string):Promise<PublishedReceipt|null>;
}
export type AuthorizedPublishInput = {
  operationId:string; authorization:PublishAuthorizationGrant; candidateId:string; candidateFingerprint:string; expectedListingFingerprint:string; shopId:string; draftListingId:string; channel:string; now:string;
};
function normalizedReceipt(r:PublishedReceipt){const listingId=r.listingId.normalize("NFC").trim();const state=r.state.normalize("NFC").trim().toLowerCase();if(!listingId)throw new Error("INVALID_PUBLISHED_LISTING_ID");if(state!=="active"&&state!=="published")throw new Error("PUBLISHED_STATE_NOT_CONFIRMED");return {listingId,state,...(r.providerReceipt?{providerReceipt:structuredClone(r.providerReceipt)}:{})};}
function authRequest(i:AuthorizedPublishInput){return{authorizationId:i.authorization.authorization.authorizationId,candidateId:i.candidateId,candidateFingerprint:i.candidateFingerprint,shopId:i.shopId,draftListingId:i.draftListingId,channel:i.channel,now:i.now};}
export async function executeAuthorizedPublishTransaction(repo:OperationLedgerRepository,provider:AuthorizedPublishProvider,input:AuthorizedPublishInput){
  const opPayload={type:"AUTHORIZED_PUBLISH",authorizationId:input.authorization.authorization.authorizationId,candidateId:input.candidateId,candidateFingerprint:input.candidateFingerprint,expectedListingFingerprint:input.expectedListingFingerprint,shopId:input.shopId,draftListingId:input.draftListingId,channel:input.channel};
  const begun=await beginOperation(repo,input.operationId,opPayload,input.now);
  if(begun.status==="REPLAY"&&begun.record.status==="SUCCEEDED"&&begun.record.receipt)return{status:"REPLAY" as const,receipt:begun.record.receipt,authorization:input.authorization};
  if(begun.status==="REPLAY"&&begun.record.status==="RECONCILIATION_REQUIRED"){const found=await provider.readPublished(input.draftListingId);if(!found)return{status:"RECONCILIATION_REQUIRED" as const,authorization:input.authorization};const r=normalizedReceipt(found);await recordOperationResult(repo,input.operationId,begun.record.requestHash,"SUCCEEDED",input.now,{receipt:r});return{status:"RECONCILED" as const,receipt:r,authorization:input.authorization};}
  const preRead=await provider.readDraft(input.draftListingId);const identity=verifyEtsyReadBackIdentity(input.expectedListingFingerprint,preRead);
  if(identity.status!=="MATCH"){await recordOperationResult(repo,input.operationId,begun.record.requestHash,"FAILED",input.now,{recoveryPoint:"IDENTITY_MISMATCH_STOP"});return{status:"IDENTITY_MISMATCH" as const,action:"STOP" as const,identity,authorization:input.authorization};}
  assertPublishAuthorizationUsable(input.authorization,authRequest(input));const consumed=consumePublishAuthorization(input.authorization,authRequest(input));
  try{const receipt=normalizedReceipt(await provider.publish(input.draftListingId));const post=normalizedReceipt((await provider.readPublished(input.draftListingId))??receipt);await recordOperationResult(repo,input.operationId,begun.record.requestHash,"SUCCEEDED",input.now,{receipt:post});return{status:"PUBLISHED" as const,receipt:post,authorization:consumed};}
  catch(error){if(error instanceof PublishAmbiguousResultError){const found=await provider.readPublished(input.draftListingId);if(found){const r=normalizedReceipt(found);await recordOperationResult(repo,input.operationId,begun.record.requestHash,"SUCCEEDED",input.now,{receipt:r});return{status:"RECONCILED" as const,receipt:r,authorization:consumed};}await recordOperationResult(repo,input.operationId,begun.record.requestHash,"RECONCILIATION_REQUIRED",input.now,{recoveryPoint:"POST_PUBLISH_READ_BACK"});return{status:"RECONCILIATION_REQUIRED" as const,authorization:consumed};}await recordOperationResult(repo,input.operationId,begun.record.requestHash,"FAILED",input.now,{recoveryPoint:"PUBLISH_FAILED"});throw error;}
}
