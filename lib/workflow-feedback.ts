import type { WorkflowStage } from "./local-factory-workflow";

const messages: Record<string, string> = {
  RESEARCH_EVIDENCE_REQUIRED: "Cannot advance to Blueprint: Research evidence URL is required.",
  BUILD_EVIDENCE_REQUIRED: "Cannot advance to QA: Build evidence URL is required.",
  QA_EVIDENCE_AND_PASS_REQUIRED: "QA checkbox is not release approval.",
  QA_RELEASE_EVIDENCE_REQUIRED: "Cannot advance to Ready without a fully verified release QA record.",
  READY_EVIDENCE_LOCKED: "Ready release evidence is frozen. Create a new candidate to change it.",
  MANUAL_PUBLISH_EVIDENCE_REQUIRED: "Cannot record Published: a manually published Etsy Listing ID and evidence URL are required.",
  WORKFLOW_REVISION_CONFLICT: "This project was updated elsewhere. Refresh the page before trying again.",
  INVALID_EVIDENCE_URL: "Evidence URL must be a valid https:// link.",
  INVALID_LISTING_ID: "Etsy Listing ID must be a positive whole number.",
  INVALID_WORKFLOW_INPUT: "Product name, specific buyer, or notes are missing or invalid.",
  PUBLISHED_RECORD_LOCKED: "Published records are locked against further edits.",
  FACTORY_OWNER_SESSION_REQUIRED: "Factory owner session has expired. Unlock Factory editing again.",
  FACTORY_ORIGIN_DENIED: "Request origin was rejected. Reload the Factory page and try again.",
  FACTORY_WORKFLOW_STORE_UNAVAILABLE: "Factory could not save this change. Try again later; no stage change was confirmed.",
};
export function workflowErrorMessage(code: string, stage?: WorkflowStage): string {
  if (messages[code]) return messages[code];
  if (code.startsWith("RELEASE_EVIDENCE_BLOCKED__")) return `Release blocked: ${code.slice("RELEASE_EVIDENCE_BLOCKED__".length).replaceAll("__", ", ")}. Check actual buyer, platform and delivery evidence.`;
  if (code === "INVALID_STAGE_TRANSITION") return `Cannot advance from ${stage ?? "this stage"}: no further transition is available.`;
  return `Workflow request failed (${code}). No stage change was confirmed.`;
}
