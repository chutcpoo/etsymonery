import { FACTORY_DOMAIN_SCHEMA_VERSION, validateAuditEvent, type AuditEvent } from "./factory-domain-schemas";
export const CORRELATION_TRACE_VERSION="1.0.0" as const;
export const CORRELATION_STAGES=["ROUTER","FACTORY","GATE","PUBLISHER","GROWTH"] as const;
export type CorrelationStage=(typeof CORRELATION_STAGES)[number];
export type CorrelationEventInput={eventId:string;aggregateId:string;eventType:string;occurredAt:string;evidenceIds?:readonly string[]};
export type CorrelationTrace={version:typeof CORRELATION_TRACE_VERSION;correlationId:string;events:AuditEvent[]};
function event(stage:CorrelationStage,correlationId:string,input:CorrelationEventInput,causationId?:string){return validateAuditEvent({schemaVersion:FACTORY_DOMAIN_SCHEMA_VERSION,eventId:input.eventId,aggregateType:stage,aggregateId:input.aggregateId,eventType:input.eventType,occurredAt:input.occurredAt,correlationId,...(causationId?{causationId}:{}),evidenceIds:input.evidenceIds??[]});}
export function startCorrelation(correlationId:string,input:CorrelationEventInput):AuditEvent{return event("ROUTER",correlationId,input);}
export function propagateCorrelation(previous:AuditEvent,stage:Exclude<CorrelationStage,"ROUTER">,input:CorrelationEventInput):AuditEvent{const parent=validateAuditEvent(previous);return event(stage,parent.correlationId,input,parent.eventId);}
export function validateCorrelationTrace(events:readonly AuditEvent[]):CorrelationTrace{
  if(events.length!==CORRELATION_STAGES.length)throw new Error("CORRELATION_TRACE_STAGE_COUNT_MISMATCH");
  const normalized=events.map(validateAuditEvent);const ids=new Set<string>();const correlationId=normalized[0].correlationId;
  normalized.forEach((item,index)=>{if(ids.has(item.eventId))throw new Error("DUPLICATE_CORRELATION_EVENT_ID");ids.add(item.eventId);if(item.aggregateType!==CORRELATION_STAGES[index])throw new Error(`CORRELATION_STAGE_ORDER_MISMATCH:${item.aggregateType}`);if(item.correlationId!==correlationId)throw new Error("CORRELATION_ID_MISMATCH");if(index===0&&item.causationId)throw new Error("ROUTER_CAUSATION_NOT_ALLOWED");if(index>0&&item.causationId!==normalized[index-1].eventId)throw new Error("CAUSATION_CHAIN_MISMATCH");if(index>0&&Date.parse(item.occurredAt)<Date.parse(normalized[index-1].occurredAt))throw new Error("CORRELATION_TIME_ORDER_MISMATCH");});
  return{version:CORRELATION_TRACE_VERSION,correlationId,events:normalized.map(item=>structuredClone(item))};
}
export function buildProofRunTrace(correlationId:string,inputs:Record<CorrelationStage,CorrelationEventInput>):CorrelationTrace{const router=startCorrelation(correlationId,inputs.ROUTER);const factory=propagateCorrelation(router,"FACTORY",inputs.FACTORY);const gate=propagateCorrelation(factory,"GATE",inputs.GATE);const publisher=propagateCorrelation(gate,"PUBLISHER",inputs.PUBLISHER);const growth=propagateCorrelation(publisher,"GROWTH",inputs.GROWTH);return validateCorrelationTrace([router,factory,gate,publisher,growth]);}
