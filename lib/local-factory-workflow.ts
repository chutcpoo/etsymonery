import { neon } from "@neondatabase/serverless";
import { evaluateProductReleaseEvidence, parseProductReleaseEvidence, type ProductReleaseCandidate } from "./product-release-evidence";

export const WORKFLOW_STAGES = ["RESEARCH", "BLUEPRINT", "BUILD", "QA", "READY", "PUBLISHED"] as const;
export type WorkflowStage = typeof WORKFLOW_STAGES[number];
export type WorkflowItem = {
  id: string; title: string; buyer: string; stage: WorkflowStage; notes: string;
  evidenceUrl: string | null; qaPassed: boolean; listingId: number | null;
  releaseEvidence: ProductReleaseCandidate | null;
  revision: number; createdAt: string; updatedAt: string;
};
export type WorkflowAction = "advance" | "update";

export function validateWorkflowInput(input: unknown): { title: string; buyer: string; notes: string; evidenceUrl: string | null } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("INVALID_WORKFLOW_INPUT");
  const x = input as Record<string, unknown>;
  const str = (value: unknown, max: number) => typeof value === "string" && value.trim().length <= max ? value.trim() : null;
  const title = str(x.title, 180), buyer = str(x.buyer, 120), notes = str(x.notes ?? "", 2000);
  const evidence = str(x.evidenceUrl ?? "", 500);
  if (!title || !buyer || notes === null || evidence === null) throw Error("INVALID_WORKFLOW_INPUT");
  if (evidence && (!/^https:\/\//.test(evidence) || !URL.canParse(evidence))) throw Error("INVALID_EVIDENCE_URL");
  return { title, buyer, notes, evidenceUrl: evidence || null };
}

export function nextStage(current: WorkflowStage, input: { evidenceUrl: string | null; qaPassed: boolean; listingId: number | null; releaseGatePassed?: boolean }) {
  const index = WORKFLOW_STAGES.indexOf(current);
  if (index < 0 || index === WORKFLOW_STAGES.length - 1) throw Error("INVALID_STAGE_TRANSITION");
  if (current === "RESEARCH" && !input.evidenceUrl) throw Error("RESEARCH_EVIDENCE_REQUIRED");
  if (current === "BUILD" && !input.evidenceUrl) throw Error("BUILD_EVIDENCE_REQUIRED");
  if (current === "QA" && input.releaseGatePassed !== true) throw Error("QA_RELEASE_EVIDENCE_REQUIRED");
  if (current === "READY" && (!input.listingId || !input.evidenceUrl)) throw Error("MANUAL_PUBLISH_EVIDENCE_REQUIRED");
  return WORKFLOW_STAGES[index + 1];
}

function sql() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw Error("DATABASE_URL_NOT_CONFIGURED");
  return neon(url);
}
function mapRow(row: Record<string, unknown>): WorkflowItem {
  return { id: String(row.id), title: String(row.title), buyer: String(row.buyer),
    stage: row.stage as WorkflowStage, notes: String(row.notes ?? ""),
    evidenceUrl: row.evidence_url ? String(row.evidence_url) : null,
    qaPassed: row.qa_passed === true, listingId: row.listing_id === null ? null : Number(row.listing_id),
    releaseEvidence: row.release_evidence && typeof row.release_evidence === "object"
      ? parseProductReleaseEvidence(row.release_evidence) : null,
    revision: Number(row.revision), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
export async function listWorkflowItems(): Promise<WorkflowItem[]> {
  const rows = await sql()`SELECT * FROM local_factory_workflow ORDER BY updated_at DESC, id DESC LIMIT 250`;
  return rows.map(row => mapRow(row as Record<string, unknown>));
}
export async function createWorkflowItem(input: unknown): Promise<WorkflowItem> {
  const x = validateWorkflowInput(input);
  const rows = await sql()`INSERT INTO local_factory_workflow(title,buyer,notes,evidence_url)
    VALUES (${x.title},${x.buyer},${x.notes},${x.evidenceUrl}) RETURNING *`;
  return mapRow(rows[0] as Record<string, unknown>);
}
export async function updateWorkflowItem(id: string, body: unknown): Promise<WorkflowItem | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !body || typeof body !== "object") throw Error("INVALID_WORKFLOW_UPDATE");
  const x = body as Record<string, unknown>;
  const revision = x.revision;
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw Error("INVALID_WORKFLOW_REVISION");
  const action = x.action;
  if (action !== "update" && action !== "advance") throw Error("INVALID_WORKFLOW_ACTION");
  const db = sql();
  const rows = await db`SELECT * FROM local_factory_workflow WHERE id = ${id} LIMIT 1`;
  if (!rows.length) return null;
  const current = mapRow(rows[0] as Record<string, unknown>);
  if (current.revision !== revision) throw Error("WORKFLOW_REVISION_CONFLICT");
  const fields = validateWorkflowInput({ title: x.title ?? current.title, buyer: x.buyer ?? current.buyer,
    notes: x.notes ?? current.notes, evidenceUrl: x.evidenceUrl ?? current.evidenceUrl ?? "" });
  // Manual checkbox is not a release gate. Evaluate evidence tied to the exact build.
  const releaseEvidence = x.releaseEvidence === undefined ? current.releaseEvidence
    : x.releaseEvidence === null ? null : parseProductReleaseEvidence(x.releaseEvidence);
  if (current.stage === "READY" && x.releaseEvidence !== undefined) throw Error("READY_EVIDENCE_LOCKED");
  const verdict = releaseEvidence ? evaluateProductReleaseEvidence(releaseEvidence) : null;
  // Binding ensures evidence collected for one buyer cannot be pasted into another workflow.
  const buyerBound = releaseEvidence?.targetBuyer.trim() === fields.buyer.trim();
  const releaseGatePassed = verdict?.readyForOwnerRelease === true && buyerBound;
  const qaPassed = releaseGatePassed;
  const listingId = x.listingId === null || x.listingId === undefined || x.listingId === "" ? current.listingId : Number(x.listingId);
  if (listingId !== null && (!Number.isSafeInteger(listingId) || listingId <= 0)) throw Error("INVALID_LISTING_ID");
  if (action === "advance" && current.stage === "QA" && !releaseGatePassed) {
    const blockers = verdict?.blockers ?? ["RELEASE_EVIDENCE_MISSING"];
    if (!buyerBound && releaseEvidence) blockers.push("BUYER_MISMATCH");
    throw Error("RELEASE_EVIDENCE_BLOCKED__" + blockers.slice(0, 8).join("__"));
  }
  const stage = action === "advance" ? nextStage(current.stage, {
    evidenceUrl: fields.evidenceUrl, qaPassed, listingId, releaseGatePassed
  }) : current.stage;
  if (action === "update" && current.stage === "PUBLISHED") throw Error("PUBLISHED_RECORD_LOCKED");
  const result = await db`UPDATE local_factory_workflow SET title=${fields.title},buyer=${fields.buyer},notes=${fields.notes},
    evidence_url=${fields.evidenceUrl},qa_passed=${qaPassed},listing_id=${listingId},stage=${stage},
    release_evidence=${releaseEvidence ? JSON.stringify(releaseEvidence) : null}::jsonb,
    revision=revision+1,updated_at=NOW() WHERE id=${id} AND revision=${revision} RETURNING *`;
  if (!result.length) throw Error("WORKFLOW_REVISION_CONFLICT");
  return mapRow(result[0] as Record<string, unknown>);
}
