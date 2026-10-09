import { neon } from "@neondatabase/serverless";
import { ETSY_CHANNEL_INDEX } from "./catalog-channel-index";
import { getControlCenterV2Snapshot } from "./control-center-v2";

export const CONTROL_CENTER_V3_VERSION = "3.2.0" as const;

export type OperationAttentionState =
  | "COMPLETE"
  | "NEEDS_RECONCILIATION"
  | "FAILED"
  | "PENDING";
export type OperationScope = "CURRENT" | "HISTORICAL_SUPERSEDED";
export type OperationSummary = {
  operationId: string;
  status: string;
  attentionState: OperationAttentionState;
  scope: OperationScope;
  recoveryPoint: string | null;
  listingId: string | null;
  productId: string | null;
  authorizationState: string | null;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
export function classifyLedgerStatus(status: string): OperationAttentionState {
  if (status === "SUCCEEDED") return "COMPLETE";
  if (status === "RECONCILIATION_REQUIRED") return "NEEDS_RECONCILIATION";
  if (status === "FAILED") return "FAILED";
  return "PENDING";
}

function productIdFromOperationId(operationId: string) {
  return operationId.match(/^PDT-[A-Z0-9]+-\d+/)?.[0] ?? null;
}

export function classifyOperationScope(productId: string | null): OperationScope {
  if (
    productId &&
    ETSY_CHANNEL_INDEX.some((entry) => entry.productId === productId)
  ) {
    return "CURRENT";
  }
  return "HISTORICAL_SUPERSEDED";
}

async function readRecentOperations(limit = 30): Promise<OperationSummary[]> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return [];
  try {
    const sql = neon(databaseUrl);
    const rows = await sql`
      SELECT operation_id, status, receipt, recovery_point, updated_at
      FROM channel_operation_ledger
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => {
      const receipt = isRecord(row.receipt) ? row.receipt : {};
      const updated =
        row.updated_at instanceof Date
          ? row.updated_at
          : new Date(String(row.updated_at));
      const operationId = String(row.operation_id ?? "");
      const productId =
        asString(receipt.productId) ?? productIdFromOperationId(operationId);
      return {
        operationId,
        status: String(row.status ?? "UNKNOWN"),
        attentionState: classifyLedgerStatus(String(row.status ?? "UNKNOWN")),
        scope: classifyOperationScope(productId),
        recoveryPoint: asString(row.recovery_point),
        listingId:
          asString(receipt.listingId) ?? asString(receipt.providerResourceId),
        productId,
        authorizationState: asString(receipt.authorizationState),
        updatedAt: updated.toISOString()
      };
    });
  } catch {
    return [];
  }
}

export async function getControlCenterV3Snapshot() {
  const [base, operations] = await Promise.all([
    getControlCenterV2Snapshot(),
    readRecentOperations()
  ]);
  const needsAttention = operations.filter(
    (operation) =>
      operation.scope === "CURRENT" && operation.attentionState !== "COMPLETE"
  );
  const historical = operations.filter(
    (operation) => operation.scope === "HISTORICAL_SUPERSEDED"
  );
  return {
    version: CONTROL_CENTER_V3_VERSION,
    mode: "GATED_OPERATOR_CONTROL_PLANE",
    generatedAt: new Date().toISOString(),
    live: base.live,
    production: base.production,
    operations: { recent: operations, needsAttention, historical },
    capabilities: [
      {
        capability: "Product Truth",
        status: "HANDOFF_ONLY",
        owner: "Product Truth owner",
        uiWrite: false
      },
      {
        capability: "SEO Candidate",
        status: "HANDOFF_ONLY",
        owner: "SEO / Commerce owner",
        uiWrite: false
      },
      {
        capability:
          "Title / Tags / Description / Price / Quantity / Taxonomy",
        status: "AVAILABLE_WHEN_EXACT_OPERATION_AUTHORIZED",
        owner: "Channel Execution",
        uiWrite: false
      },
      {
        capability: "Gallery / Buyer Files / Video",
        status: "SCOPED_EXECUTORS_AVAILABLE",
        owner: "Channel Execution",
        uiWrite: false
      },
      {
        capability: "Publish",
        status: "READY_SECURE_GATED",
        owner: "Channel Execution",
        uiWrite: false
      },
      {
        capability: "Unpublish",
        status: "IMPLEMENTED_SECURE_GATED_DISABLED_BY_DEFAULT",
        owner: "Channel Execution",
        uiWrite: false
      },
      {
        capability: "Delete Listing",
        status: "IMPLEMENTED_SECURE_GATED_DISABLED_BY_DEFAULT",
        owner: "Channel Execution",
        uiWrite: false
      }
    ]
  };
}
